import { CheckCircle2, Coins, Loader2, Zap } from 'lucide-react';
import { MAX_AUTO_CASHOUT, MAX_BET, MIN_AUTO_CASHOUT, MIN_BET } from '@/lib/gameRules';
import { formatChips, formatMultiplier } from '@/lib/crashMath';
import type { BetInfo, RoundStatus } from '@/types/game';

interface BetPanelProps {
  balance: number;
  phase: RoundStatus;
  bet: BetInfo | null;
  lastBet: BetInfo | null;
  liveMultiplier: number;
  amount: number;
  autoEnabled: boolean;
  autoMultiplier: number;
  pending: boolean;
  actionError: string | null;
  onAmountChange: (amount: number) => void;
  onAutoEnabledChange: (enabled: boolean) => void;
  onAutoMultiplierChange: (multiplier: number) => void;
  onPlaceBet: () => void;
  onCashOut: () => void;
}

const QUICK_AMOUNTS: { label: string; apply: (value: number) => number }[] = [
  { label: '+1,000', apply: (v: number) => v + 1000 },
  { label: '+5,000', apply: (v: number) => v + 5000 },
  { label: '+10,000', apply: (v: number) => v + 10000 },
  { label: '1/2', apply: (v: number) => v / 2 },
  { label: '1/4', apply: (v: number) => v / 4 },
];

const AUTO_PRESETS = [1.5, 2, 5, 10];

export default function BetPanel({
  balance,
  phase,
  bet,
  lastBet,
  liveMultiplier,
  amount,
  autoEnabled,
  autoMultiplier,
  pending,
  actionError,
  onAmountChange,
  onAutoEnabledChange,
  onAutoMultiplierChange,
  onPlaceBet,
  onCashOut,
}: BetPanelProps) {
  const maxBet = Math.max(MIN_BET, Math.min(balance, MAX_BET));
  const allInAmount = Math.min(balance, MAX_BET);
  const allInAvailable = allInAmount >= MIN_BET;
  const amountValid = amount >= MIN_BET && amount <= MAX_BET && amount <= balance;
  const autoValid =
    !autoEnabled || (autoMultiplier >= MIN_AUTO_CASHOUT && autoMultiplier <= MAX_AUTO_CASHOUT);
  const inputLocked = phase !== 'waiting' || bet !== null || pending;

  let label: string;
  let enabled = false;
  let onClick: () => void = () => {};
  let tone: 'primary' | 'accent' | 'muted';

  if (phase === 'waiting' && !bet) {
    label = `배팅하기 · ${formatChips(amount)} 칩`;
    enabled = amountValid && autoValid && !pending;
    onClick = onPlaceBet;
    tone = 'primary';
  } else if (phase === 'waiting') {
    label = '배팅 완료';
    tone = 'muted';
  } else if (phase === 'running' && bet?.status === 'active') {
    const profit = Math.floor(bet.amount * liveMultiplier) - bet.amount;
    label = `캐시아웃 ${formatMultiplier(liveMultiplier)} · +${formatChips(profit)} 칩`;
    enabled = !pending;
    onClick = onCashOut;
    tone = 'accent';
  } else if (phase === 'running' && bet?.status === 'cashed') {
    label = `${formatMultiplier(bet.cashout_multiplier ?? 1)}에 캐시아웃 완료`;
    tone = 'muted';
  } else if (phase === 'running') {
    label = '게임 진행 중';
    tone = 'muted';
  } else if (phase === 'resting') {
    label = '쉬는 시간';
    tone = 'muted';
  } else {
    label = '다음 라운드 준비 중';
    tone = 'muted';
  }

  const toneClass = enabled
    ? {
        primary: 'bg-teal-600 text-white shadow-sm hover:bg-teal-700 hover:shadow-md',
        accent: 'bg-amber-400 text-slate-900 shadow-sm hover:bg-amber-300 hover:shadow-md',
        muted: '',
      }[tone]
    : 'bg-slate-100 text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">내 배팅</span>
        <span className="flex items-center gap-1.5 text-sm text-slate-600">
          <Coins className="h-4 w-4 text-amber-500" aria-hidden />
          <span className="font-medium tabular-nums text-slate-900">{formatChips(balance)} 칩</span>
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-teal-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100">
          <input
            type="number"
            inputMode="numeric"
            min={MIN_BET}
            max={MAX_BET}
            value={amount}
            disabled={inputLocked}
            onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
            className="h-12 w-full bg-transparent text-2xl font-semibold tabular-nums text-slate-900 outline-none disabled:text-slate-400"
            aria-label="배팅 금액"
          />
          <span className="text-xs text-slate-500">칩</span>
        </div>
        <button
          type="button"
          disabled={inputLocked || !allInAvailable}
          onClick={() => onAmountChange(allInAmount)}
          className="h-12 shrink-0 rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-teal-700 transition duration-150 hover:border-teal-400 hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          전액
        </button>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {QUICK_AMOUNTS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={inputLocked}
            onClick={() => onAmountChange(Math.min(maxBet, Math.max(MIN_BET, Math.round(chip.apply(amount)))))}
            className="h-9 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition duration-150 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <Zap className="h-4 w-4 text-amber-500" aria-hidden />
            자동 캐시아웃
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoEnabled}
            disabled={inputLocked}
            onClick={() => onAutoEnabledChange(!autoEnabled)}
            className={`relative h-6 w-11 rounded-full transition duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
              autoEnabled ? 'bg-teal-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition duration-200 ${
                autoEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {autoEnabled && (
          <>
            <div className="mt-3 flex items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={MIN_AUTO_CASHOUT}
                max={MAX_AUTO_CASHOUT}
                value={autoMultiplier}
                disabled={inputLocked}
                onChange={(e) => onAutoMultiplierChange(Number(e.target.value) || 0)}
                className="h-10 w-full bg-transparent text-lg font-semibold tabular-nums text-slate-900 outline-none disabled:text-slate-400"
                aria-label="자동 캐시아웃 배수"
              />
              <span className="text-xs text-slate-500">배</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AUTO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={inputLocked}
                  onClick={() => onAutoMultiplierChange(preset)}
                  className="h-8 rounded-lg border border-slate-200 bg-white text-xs font-medium tabular-nums text-slate-600 transition duration-150 hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {formatMultiplier(preset)}
                </button>
              ))}
            </div>
            {!autoValid && (
              <p className="mt-2 text-xs text-rose-600">
                {formatMultiplier(MIN_AUTO_CASHOUT)} ~ {formatMultiplier(MAX_AUTO_CASHOUT)} 사이로 입력해 주세요.
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={!enabled}
        className={`mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed ${toneClass}`}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {label}
      </button>

      {actionError && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {actionError}
        </p>
      )}

      {bet && phase === 'waiting' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          이번 라운드에 {formatChips(bet.amount)} 칩 배팅
          {bet.auto_cashout !== null && ` · ${formatMultiplier(bet.auto_cashout)}에 자동 캐시아웃`}
        </p>
      )}

      {bet?.status === 'active' && bet.auto_cashout !== null && phase === 'running' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
          <Zap className="h-4 w-4" aria-hidden />
          {formatMultiplier(bet.auto_cashout)}에 자동으로 캐시아웃됩니다
        </p>
      )}

      {lastBet && phase !== 'running' && (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-500">지난 라운드: </span>
          {lastBet.status === 'cashed' && lastBet.cashout_multiplier !== null && lastBet.payout !== null ? (
            <span className="font-medium text-teal-700">
              {formatMultiplier(lastBet.cashout_multiplier)}에 캐시아웃, +{formatChips(lastBet.payout - lastBet.amount)} 칩
            </span>
          ) : lastBet.status === 'lost' ? (
            <span className="font-medium text-rose-600">{formatChips(lastBet.amount)} 칩 손실</span>
          ) : (
            <span className="text-slate-500">배팅하지 않음</span>
          )}
        </div>
      )}
    </div>
  );
}
