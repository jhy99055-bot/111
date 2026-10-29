import { multiplierAt, secondsAtMultiplier } from '@/lib/crashMath';

export const MIN_BET = 10;
export const MAX_BET = 100000;
export const START_BALANCE = 1000;
export const REFILL_THRESHOLD = 10;
export const BETTING_MS = 10000;
export const CRASH_PAUSE_MS = 3000;
export const HISTORY_SIZE = 20;

export type Phase = 'betting' | 'running' | 'crashed';

export interface Bet {
  amount: number;
  cashoutMultiplier: number | null;
}

export interface LastResult {
  crashPoint: number;
  bet: Bet | null;
  net: number;
}

export interface EngineState {
  phase: Phase;
  bettingEndsAt: number;
  startedAt: number;
  crashAt: number;
  crashedAt: number;
  crashPoint: number;
  bet: Bet | null;
  lastResult: LastResult | null;
  history: number[];
  balance: number;
}

export function floorTo2(value: number): number {
  return Math.floor(value * 100) / 100;
}

export function payoutOf(bet: Bet): number {
  return bet.cashoutMultiplier === null ? 0 : Math.floor(bet.amount * bet.cashoutMultiplier);
}

const CRASH_SCALE = 0.9;
const CRASH_TAIL = 1.3;

function randomCrashPoint(): number {
  const u = 1 - Math.random();
  const raw = Math.floor(100 * Math.pow(CRASH_SCALE / u, 1 / CRASH_TAIL)) / 100;
  return Math.min(1000, Math.max(1, raw));
}

function startBetting(state: EngineState, now: number): EngineState {
  return {
    ...state,
    phase: 'betting',
    bettingEndsAt: now + BETTING_MS,
    startedAt: 0,
    crashAt: 0,
    crashedAt: 0,
    crashPoint: randomCrashPoint(),
    bet: null,
  };
}

function advanceOnce(state: EngineState, now: number): EngineState {
  if (state.phase === 'betting' && now >= state.bettingEndsAt) {
    return {
      ...state,
      phase: 'running',
      startedAt: state.bettingEndsAt,
      crashAt: state.bettingEndsAt + secondsAtMultiplier(state.crashPoint) * 1000,
    };
  }

  if (state.phase === 'running' && now >= state.crashAt) {
    const bet = state.bet;
    return {
      ...state,
      phase: 'crashed',
      crashedAt: state.crashAt,
      bet: null,
      lastResult: {
        crashPoint: state.crashPoint,
        bet,
        net: bet ? payoutOf(bet) - bet.amount : 0,
      },
      history: [state.crashPoint, ...state.history].slice(0, HISTORY_SIZE),
    };
  }

  if (state.phase === 'crashed' && now >= state.crashedAt + CRASH_PAUSE_MS) {
    return startBetting(state, now);
  }

  return state;
}

export function advance(state: EngineState, now: number): EngineState {
  let next = state;
  for (let i = 0; i < 5; i++) {
    const step = advanceOnce(next, now);
    if (step === next) break;
    next = step;
  }
  return next;
}

export function createInitialState(now: number, balance: number): EngineState {
  return startBetting(
    {
      phase: 'betting',
      bettingEndsAt: now,
      startedAt: 0,
      crashAt: 0,
      crashedAt: 0,
      crashPoint: 1,
      bet: null,
      lastResult: null,
      history: [],
      balance,
    },
    now,
  );
}

export function applyBet(state: EngineState, amount: number, now: number): EngineState {
  const current = advance(state, now);
  const valid =
    current.phase === 'betting' &&
    current.bet === null &&
    amount >= MIN_BET &&
    amount <= MAX_BET &&
    amount <= current.balance;
  if (!valid) return current;
  return { ...current, balance: current.balance - amount, bet: { amount, cashoutMultiplier: null } };
}

export function applyCashOut(state: EngineState, now: number): EngineState {
  const current = advance(state, now);
  if (current.phase !== 'running' || !current.bet || current.bet.cashoutMultiplier !== null) return current;
  const multiplier = floorTo2(multiplierAt((now - current.startedAt) / 1000));
  const bet: Bet = { ...current.bet, cashoutMultiplier: multiplier };
  return { ...current, bet, balance: current.balance + payoutOf(bet) };
}

export function applyCredit(state: EngineState, amount: number): EngineState {
  return { ...state, balance: state.balance + amount };
}

export function applyRefill(state: EngineState): EngineState {
  if (state.balance >= REFILL_THRESHOLD) return state;
  return { ...state, balance: START_BALANCE };
}
