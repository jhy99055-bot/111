import { CheckCircle2, Coins, RotateCcw } from 'lucide-react';
import { formatChips, formatMultiplier } from '@/lib/crashMath';
import { MAX_BET, MIN_BET, REFILL_THRESHOLD, payoutOf, type Bet, type LastResult, type Phase } from '@/lib/crashEngine';

interface BetPanelProps {
  balance: number;
  phase: Phase;
  bet: Bet | null;
  lastResult: LastResult | null;
  liveMultiplier: number;
  amount: number;
  onAmountChange: (amount: number) => void;
  onPlaceBet: () => void;
  onCashOut: () => void;
  onRefill: () => void;
}

const QUICK_AMOUNTS = [
  { label: '+10', apply: (v: number) => v + 10 },
  { label: '+100', apply: (v: number) => v + 100 },
  { label: '+1K', apply: (v: number) => v + 1000 },
  { label: '1/2', apply: (v: number) => v / 2 },
  { label: '최대', apply: (_v: number, max: number) => max },
];

export default function BetPanel({
  balance,
  phase,
  bet,
  lastResult,
  liveMultiplier,
  amount,
  onAmountChange,
  onPlaceBet,
  onCashOut,
  onRefill,
}: BetPanelProps) {
  const maxBet = Math.max(MIN_BET, Math.min(balance, MAX_BET));
  const amountValid = amount >= MIN_BET && amount <= MAX_BET && amount <= balance;
  const cashedOut = bet !== null && bet.cashoutMultiplier !== null;

  let label: string;
  let enabled: boolean;
  let onClick: () => void = () => {};
  let tone: 'emerald' | 'amber' | 'muted';

  if (phase === 'betting' && !bet) {
    label = `배팅하기 · ${formatChips(amount)} 칩`;
    enabled = amountValid;
    onClick = onPlaceBet;
    tone = 'emerald';
  } else if (phase === 'betting') {
    label = '배팅 완료';
    enabled = false;
    tone = 'muted';
  } else if (phase === 'running' && bet && !cashedOut) {
    const profit = Math.floor(bet.amount * liveMultiplier) - bet.amount;
    label = `캐시아웃 ${formatMultiplier(liveMultiplier)} · +${formatChips(profit)} 칩`;
    enabled = true;
    onClick = onCashOut;
    tone = 'amber';
  } else if (phase === 'running' && cashedOut) {
    label = `${formatMultiplier(bet?.cashoutMultiplier ?? 1)}에 캐시아웃 완료`;
    enabled = false;
    tone = 'muted';
  } else {
    label = '게임 진행 중';
    enabled = false;
    tone = 'muted';
  }

  const toneClass = enabled
    ? {
        emerald: 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300 hover:shadow-[0_0_28px_rgba(52,211,153,0.35)]',
        amber: 'bg-amber-300 text-zinc-950 hover:bg-amber-200 hover:shadow-[0_0_28px_rgba(252,211,77,0.35)]',
        muted: '',
      }[tone]
    : 'bg-zinc-800 text-zinc-500';

  const inputLocked = phase !== 'betting' || bet !== null;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-[0.12em] text-zinc-500">내 배팅</span>
        <span className="flex items-center gap-1.5 text-sm text-zinc-300">
          <Coins className="h-4 w-4 text-amber-300" aria-hidden />
          <span className="tabular-nums">{formatChips(balance)} 칩</span>
        </span>
      </div>

      <div className="mt-4 flex items-center rounded-xl border border-white/10 bg-black px-4">
        <input
          type="number"
          inputMode="numeric"
          min={MIN_BET}
          max={MAX_BET}
          value={amount}
          disabled={inputLocked}
          onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
          className="h-12 w-full bg-transparent text-2xl font-semibold tabular-nums text-zinc-100 outline-none disabled:opacity-50"
          aria-label="배팅 금액"
        />
        <span className="text-xs text-zinc-500">칩</span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {QUICK_AMOUNTS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={inputLocked}
            onClick={() => onAmountChange(Math.min(maxBet, Math.max(MIN_BET, Math.round(chip.apply(amount, maxBet)))))}
            className="h-9 rounded-lg border border-white/10 bg-zinc-900 text-xs font-medium text-zinc-300 transition duration-150 hover:border-emerald-400/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={!enabled}
        className={`mt-5 flex h-14 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed ${toneClass}`}
      >
        {label}
      </button>

      {bet && phase === 'betting' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          이번 라운드에 {formatChips(bet.amount)} 칩 배팅
        </p>
      )}

      {lastResult && phase !== 'running' && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm">
          <span className="text-zinc-500">지난 라운드: </span>
          {lastResult.bet === null ? (
            <span className="text-zinc-400">배팅하지 않음</span>
          ) : lastResult.bet.cashoutMultiplier !== null ? (
            <span className="font-medium text-emerald-300">
              {formatMultiplier(lastResult.bet.cashoutMultiplier)}에 캐시아웃, +
              {formatChips(payoutOf(lastResult.bet) - lastResult.bet.amount)} 칩
            </span>
          ) : (
            <span className="font-medium text-rose-300">{formatChips(lastResult.bet.amount)} 칩 손실</span>
          )}
        </div>
      )}

      {balance < REFILL_THRESHOLD && (
        <button
          type="button"
          onClick={onRefill}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/30 text-sm font-medium text-amber-300 transition duration-200 hover:bg-amber-300/10"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          1,000 칩으로 충전
        </button>
      )}
    </div>
  );
}
