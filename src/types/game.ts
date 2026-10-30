export type RoundStatus = 'waiting' | 'running' | 'crashed' | 'resting';
export type BetStatus = 'active' | 'cashed' | 'lost';

export interface BetInfo {
  amount: number;
  status: BetStatus;
  cashout_multiplier: number | null;
  payout: number | null;
  auto_cashout: number | null;
}

export interface PlayerBet {
  nickname: string;
  amount: number;
  status: BetStatus;
  cashout_multiplier: number | null;
  payout: number | null;
  is_me: boolean;
}

export interface GameState {
  server_now: string;
  chips: number;
  round: {
    id: string;
    round_no: number | null;
    status: RoundStatus;
    ends_at: string;
    started_at: string | null;
    crashed_at: string | null;
    crash_point: number | null;
  };
  my_bet: BetInfo | null;
  last_bet: BetInfo | null;
  history: number[];
  players: PlayerBet[];
}

export interface BetHistoryRow {
  round_no: number;
  crash_point: number;
  amount: number;
  status: 'cashed' | 'lost';
  cashout_multiplier: number | null;
  payout: number | null;
  auto_cashout: number | null;
  created_at: string;
}

export function isGameState(value: unknown): value is GameState {
  return typeof value === 'object' && value !== null && 'round' in value && 'history' in value && 'players' in value;
}

export function isBetHistory(value: unknown): value is BetHistoryRow[] {
  return Array.isArray(value);
}

export type RedeemResult = { ok: true } | { ok: false; message: string };
