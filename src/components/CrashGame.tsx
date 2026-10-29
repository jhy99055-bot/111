import { useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import BetPanel from '@/components/BetPanel';
import CrashChart, { type ChartScene } from '@/components/CrashChart';
import CrashHistory from '@/components/CrashHistory';
import PromoCodeForm from '@/components/PromoCodeForm';
import { useCrashEngine } from '@/hooks/useCrashEngine';
import { useNow } from '@/hooks/useNow';
import { floorTo2 } from '@/lib/crashEngine';
import { formatChips, formatMultiplier, multiplierAt } from '@/lib/crashMath';

export default function CrashGame() {
  const { state, placeBet, cashOut, refill, redeem } = useCrashEngine();
  const [amount, setAmount] = useState(100);
  const running = state.phase === 'running';
  const now = useNow(running ? 50 : 250);

  const liveMultiplier = running ? floorTo2(multiplierAt((now - state.startedAt) / 1000)) : 1;
  const secondsLeft = Math.max(0, Math.ceil((state.bettingEndsAt - now) / 1000));
  const lastCrashPoint = state.history[0];

  const scene = useMemo<ChartScene>(() => {
    if (running) return { kind: 'live', startedAtMs: state.startedAt };
    if (lastCrashPoint !== undefined) return { kind: 'crashed', crashPoint: lastCrashPoint };
    return { kind: 'idle' };
  }, [running, state.startedAt, lastCrashPoint]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <Rocket className="h-4 w-4 text-emerald-400" aria-hidden />
            </div>
            <span className="text-sm font-semibold tracking-[0.12em]">로켓 배팅</span>
          </div>
          <span className="rounded-full border border-white/10 px-4 py-1.5 text-sm tabular-nums text-zinc-300">
            {formatChips(state.balance)} 칩
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <CrashHistory history={state.history} />
          <CrashChart scene={scene}>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {state.phase === 'running' && (
                <>
                  <span className="mb-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-emerald-300">
                    진행 중
                  </span>
                  <span className="text-6xl font-semibold tabular-nums text-emerald-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.45)] sm:text-7xl">
                    {formatMultiplier(liveMultiplier)}
                  </span>
                </>
              )}
              {state.phase === 'crashed' && (
                <>
                  <span className="text-xs font-semibold tracking-[0.25em] text-rose-400">크래시!</span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-rose-400 sm:text-7xl">
                    {formatMultiplier(state.lastResult?.crashPoint ?? 1)}
                  </span>
                  <span className="mt-3 text-sm text-zinc-500">잠시 후 새 게임이 시작됩니다</span>
                </>
              )}
              {state.phase === 'betting' && (
                <>
                  <span className="text-xs font-semibold tracking-[0.25em] text-zinc-400">
                    {state.bet ? '배팅 완료' : '배팅을 해주세요'}
                  </span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-zinc-100 sm:text-7xl">
                    {secondsLeft}초
                  </span>
                  {lastCrashPoint !== undefined && (
                    <span className="mt-3 text-sm tabular-nums text-zinc-500">
                      이전 크래시 {formatMultiplier(lastCrashPoint)}
                    </span>
                  )}
                </>
              )}
            </div>
          </CrashChart>
        </section>

        <aside className="flex flex-col gap-4">
          <BetPanel
            balance={state.balance}
            phase={state.phase}
            bet={state.bet}
            lastResult={state.lastResult}
            liveMultiplier={liveMultiplier}
            amount={amount}
            onAmountChange={setAmount}
            onPlaceBet={() => placeBet(amount)}
            onCashOut={cashOut}
            onRefill={refill}
          />
          <PromoCodeForm onRedeem={redeem} />
        </aside>
      </main>
    </div>
  );
}
