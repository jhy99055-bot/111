import { useMemo, useState } from 'react';
import { Rocket, WifiOff } from 'lucide-react';
import BetPanel from '@/components/BetPanel';
import CrashChart, { type ChartScene, type SellMarker } from '@/components/CrashChart';
import CrashHistory from '@/components/CrashHistory';
import PromoCodeForm from '@/components/PromoCodeForm';
import RoundBets from '@/components/RoundBets';
import { useGameServer } from '@/hooks/useGameServer';
import { useNow } from '@/hooks/useNow';
import { floorTo2, formatChips, formatMultiplier, multiplierAt } from '@/lib/crashMath';

export default function CrashGame() {
  const { state, serverOffsetMs, connectionError, actionError, pending, placeBet, cashOut, refill, redeem } =
    useGameServer();
  const [amount, setAmount] = useState(100);

  const phase = state?.round.status ?? 'waiting';
  const running = phase === 'running';
  const now = useNow(running ? 50 : 250);

  const startedAtLocal = state?.round.started_at ? Date.parse(state.round.started_at) - serverOffsetMs : null;
  const endsAtLocal = state ? Date.parse(state.round.ends_at) - serverOffsetMs : 0;
  const liveMultiplier =
    running && startedAtLocal !== null ? floorTo2(multiplierAt((now - startedAtLocal) / 1000)) : 1;
  const secondsLeft = Math.max(0, Math.ceil((endsAtLocal - now) / 1000));
  const lastCrashPoint = state?.history[0];
  const myBet = state?.my_bet ?? null;
  const sell: SellMarker | null =
    myBet?.status === 'cashed' && myBet.cashout_multiplier !== null
      ? { multiplier: myBet.cashout_multiplier }
      : null;

  const scene = useMemo<ChartScene>(() => {
    if (running && startedAtLocal !== null) return { kind: 'live', startedAtMs: startedAtLocal };
    if (lastCrashPoint !== undefined) return { kind: 'crashed', crashPoint: lastCrashPoint };
    return { kind: 'idle' };
  }, [running, startedAtLocal, lastCrashPoint]);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-sm text-zinc-400">
        {connectionError ?? '게임 서버에 연결하는 중입니다...'}
      </div>
    );
  }

  const sellProfit = sell && myBet ? (myBet.payout ?? 0) - myBet.amount : 0;

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
            {formatChips(state.chips)} 칩
          </span>
        </div>
      </header>

      {connectionError && (
        <div role="status" className="flex items-center justify-center gap-2 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          <WifiOff className="h-4 w-4" aria-hidden />
          {connectionError}
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <CrashHistory history={state.history} />
          <CrashChart scene={scene} sell={sell}>
            {sell && (
              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/80 px-3 py-1.5 text-xs font-semibold tabular-nums text-amber-200 sm:right-6 sm:top-6">
                <span>내 캐시아웃 {formatMultiplier(sell.multiplier)}</span>
                <span className="text-amber-300/70">+{formatChips(sellProfit)} 칩</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {phase === 'running' && (
                <>
                  <span className="mb-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-emerald-300">
                    진행 중
                  </span>
                  <span className="text-6xl font-semibold tabular-nums text-emerald-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.45)] sm:text-7xl">
                    {formatMultiplier(liveMultiplier)}
                  </span>
                </>
              )}
              {phase === 'crashed' && (
                <>
                  <span className="text-xs font-semibold tracking-[0.25em] text-rose-400">크래시!</span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-rose-400 sm:text-7xl">
                    {formatMultiplier(lastCrashPoint ?? 1)}
                  </span>
                  <span className="mt-3 text-sm text-zinc-400">잠시 후 새 라운드가 시작됩니다</span>
                </>
              )}
              {phase === 'waiting' && (
                <>
                  <span className="text-xs font-semibold tracking-[0.25em] text-zinc-400">
                    {myBet ? '배팅 완료' : '배팅을 해주세요'}
                  </span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-zinc-100 sm:text-7xl">
                    {secondsLeft}초
                  </span>
                  {lastCrashPoint !== undefined && (
                    <span className="mt-3 text-sm tabular-nums text-zinc-400">
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
            balance={state.chips}
            phase={phase}
            bet={myBet}
            lastBet={state.last_bet}
            liveMultiplier={liveMultiplier}
            amount={amount}
            pending={pending}
            actionError={actionError}
            onAmountChange={setAmount}
            onPlaceBet={() => placeBet(amount)}
            onCashOut={cashOut}
            onRefill={refill}
          />
          <RoundBets players={state.players} phase={phase} />
          <PromoCodeForm onRedeem={redeem} />
        </aside>
      </main>
    </div>
  );
}
