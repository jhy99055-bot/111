import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getPlayerId } from '@/lib/playerId';
import {
  isBetHistory,
  isGameState,
  type BetHistoryRow,
  type GameState,
  type RedeemResult,
} from '@/types/game';

const POLL_INTERVAL_MS = 500;
const CONNECTION_ERROR = '서버와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function useGameServer() {
  const [playerId] = useState(getPlayerId);
  const [state, setState] = useState<GameState | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyState = useCallback((data: unknown, requestedAt: number, respondedAt: number) => {
    if (!mountedRef.current || !isGameState(data)) return false;
    const serverTime = new Date(data.server_now).getTime();
    setServerOffsetMs(serverTime - (requestedAt + respondedAt) / 2);
    setState(data);
    return true;
  }, []);

  const poll = useCallback(async () => {
    const requestedAt = Date.now();
    const { data, error } = await supabase.rpc('game_state', { p_player: playerId });
    if (!mountedRef.current) return;
    if (error || !applyState(data, requestedAt, Date.now())) {
      setConnectionError(CONNECTION_ERROR);
      return;
    }
    setConnectionError(null);
  }, [applyState, playerId]);

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  const runAction = useCallback(
    async (fnName: 'place_bet' | 'cash_out', args: Record<string, unknown> = {}) => {
      setPending(true);
      setActionError(null);
      const requestedAt = Date.now();
      const { data, error } = await supabase.rpc(fnName, { p_player: playerId, ...args });
      if (!mountedRef.current) return;
      setPending(false);
      if (error) {
        setActionError(error.message || CONNECTION_ERROR);
        return;
      }
      if (!applyState(data, requestedAt, Date.now())) setActionError(CONNECTION_ERROR);
    },
    [applyState, playerId],
  );

  const placeBet = useCallback(
    (amount: number, autoCashout: number | null) =>
      runAction('place_bet', { p_amount: amount, p_auto_cashout: autoCashout }),
    [runAction],
  );
  const cashOut = useCallback(() => runAction('cash_out'), [runAction]);

  const redeem = useCallback(
    async (code: string): Promise<RedeemResult> => {
      const requestedAt = Date.now();
      const { data, error } = await supabase.rpc('redeem_promo', { p_player: playerId, p_code: code });
      if (!mountedRef.current) return { ok: false, message: CONNECTION_ERROR };
      if (error) return { ok: false, message: error.message || CONNECTION_ERROR };
      if (!applyState(data, requestedAt, Date.now())) return { ok: false, message: CONNECTION_ERROR };
      return { ok: true };
    },
    [applyState, playerId],
  );

  const loadBetHistory = useCallback(async (): Promise<BetHistoryRow[]> => {
    const { data, error } = await supabase.rpc('game_bet_history', { p_player: playerId });
    if (error) throw new Error(error.message || CONNECTION_ERROR);
    if (!isBetHistory(data)) throw new Error(CONNECTION_ERROR);
    return data;
  }, [playerId]);

  return {
    state,
    serverOffsetMs,
    connectionError,
    actionError,
    pending,
    placeBet,
    cashOut,
    redeem,
    loadBetHistory,
  };
}
