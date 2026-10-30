export type RoundStatus = 'waiting' | 'running' | 'crashed';
export type BetStatus = 'active' | 'cashed' | 'lost';

export interface BetInfo {
  amount: number;
  status: BetStatus;
  cashout_multiplier: number | null;
  payout: number | null;
}

export interface PlayerBet extends BetInfo {
  nickname: string;
  is_me: boolean;
}

export interface GameState {
  server_now: string;
  chips: number;
  round: {
    id: string;
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

export function isGameState(value: unknown): value is GameState {
  return typeof value === 'object' && value !== null && 'round' in value && 'history' in value && 'players' in value;
}

export type RedeemResult = { ok: true } | { ok: false; message: string };
