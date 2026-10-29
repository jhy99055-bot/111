import { useCallback, useEffect, useState } from 'react';
import {
  START_BALANCE,
  advance,
  applyBet,
  applyCashOut,
  applyCredit,
  applyRefill,
  createInitialState,
  type EngineState,
} from '@/lib/crashEngine';
import { redeemPromoCode, type PromoResult } from '@/lib/promoCodes';

const BALANCE_KEY = 'moonshot.balance';
const TICK_MS = 100;

function loadBalance(): number {
  try {
    const raw = window.localStorage.getItem(BALANCE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : START_BALANCE;
  } catch {
    return START_BALANCE;
  }
}

function saveBalance(balance: number) {
  try {
    window.localStorage.setItem(BALANCE_KEY, String(balance));
  } catch {
    return;
  }
}

export function useCrashEngine() {
  const [state, setState] = useState<EngineState>(() => createInitialState(Date.now(), loadBalance()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((prev) => advance(prev, Date.now()));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveBalance(state.balance);
  }, [state.balance]);

  const placeBet = useCallback((amount: number) => {
    setState((prev) => applyBet(prev, amount, Date.now()));
  }, []);

  const cashOut = useCallback(() => {
    setState((prev) => applyCashOut(prev, Date.now()));
  }, []);

  const refill = useCallback(() => {
    setState((prev) => applyRefill(prev));
  }, []);

  const redeem = useCallback((code: string): PromoResult => {
    const result = redeemPromoCode(code);
    if (result.ok) {
      setState((prev) => applyCredit(prev, result.amount));
    }
    return result;
  }, []);

  return { state, placeBet, cashOut, refill, redeem };
}
