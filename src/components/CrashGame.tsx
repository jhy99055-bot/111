import { useMemo, useState } from 'react';
import { History, WifiOff } from 'lucide-react';
import BetHistoryModal from '@/components/BetHistoryModal';
import BetPanel from '@/components/BetPanel';
import CrashChart, { type ChartScene, type SellMarker } from '@/components/CrashChart';
import CrashHistory from '@/components/CrashHistory';
import PromoCodeForm from '@/components/PromoCodeForm';
import RoundBets from '@/components/RoundBets';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import UserMenu from '@/components/UserMenu';
import { useGameServer } from '@/hooks/useGameServer';
import { useGameSounds } from '@/hooks/useGameSounds';
import { useNow } from '@/hooks/useNow';
import { floorTo2, formatChips, formatMultiplier, multiplierAt } from '@/lib/crashMath';
import type { MemberProfile } from '@/types/member';

const ROUNDS_PER_CYCLE = 1000;

interface CrashGameProps {
  member: MemberProfile;
  onSignOut: () => void;
}

export default function CrashGame({ member, onSignOut }: CrashGameProps) {
  const { state, serverOffsetMs, connectionError, actionError, pending, placeBet, cashOut, redeem, loadBetHistory } =
    useGameServer();
  const [amount, setAmount] = useState(100);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoMultiplier, setAutoMultiplier] = useState(2);
  const [historyOpen, setHistoryOpen] = useState(false);
  useGameSounds(state);

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
  const roundNo = state?.round.round_no ?? null;

  const scene = useMemo<ChartScene>(() => {
    if (running && startedAtLocal !== null) return { kind: 'live', startedAtMs: startedAtLocal };
    if (lastCrashPoint !== undefined) return { kind: 'crashed', crashPoint: lastCrashPoint };
    return { kind: 'idle' };
  }, [running, startedAtLocal, lastCrashPoint]);

  const historyButton = (
    <button
      type="button"
      onClick={() => setHistoryOpen(true)}
      className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition duration-150 hover:border-teal-300 hover:text-teal-700"
    >
      <History className="h-4 w-4" aria-hidden />
      배팅 기록
    </button>
  );

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteHeader />
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-500">
          {connectionError ?? '게임 서버에 연결하는 중입니다...'}
        </div>
      </div>
    );
  }

  const sellProfit = sell && myBet ? (myBet.payout ?? 0) - myBet.amount : 0;
  const restLeft = formatRestTime(secondsLeft);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <SiteHeader
        actions={
          <>
            {historyButton}
            <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium tabular-nums text-slate-700">
              {formatChips(state.chips)} 칩
            </span>
            <UserMenu member={member} onSignOut={onSignOut} />
          </>
        }
      />

      {connectionError && (
        <div role="status" className="flex items-center justify-center gap-2 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <WifiOff className="h-4 w-4" aria-hidden />
          {connectionError}
        </div>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <CrashHistory history={state.history} />
          <CrashChart scene={scene} sell={sell}>
            {roundNo !== null && (
              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-600 sm:left-6 sm:top-6">
                라운드 {roundNo} / {ROUNDS_PER_CYCLE}
              </div>
            )}
            {sell && (
              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200 sm:right-6 sm:top-6">
                <span>내 캐시아웃 {formatMultiplier(sell.multiplier)}</span>
                <span className="text-amber-700">+{formatChips(sellProfit)} 칩</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              {phase === 'running' && (
                <>
                  <span className="mb-2 rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-teal-700">
                    진행 중
                  </span>
                  <span className="text-6xl font-semibold tabular-nums text-teal-700 sm:text-7xl">
                    {formatMultiplier(liveMultiplier)}
                  </span>
                </>
              )}
              {phase === 'crashed' && (
                <>
                  <span className="text-sm font-semibold tracking-wide text-rose-600">크래시</span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-rose-600 sm:text-7xl">
                    {formatMultiplier(lastCrashPoint ?? 1)}
                  </span>
                  <span className="mt-3 text-sm text-slate-500">잠시 후 새 라운드가 시작됩니다</span>
                </>
              )}
              {phase === 'waiting' && (
                <>
                  <span className="text-sm font-semibold tracking-wide text-slate-500">
                    {myBet ? '배팅 완료' : '배팅을 해주세요'}
                  </span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-slate-900 sm:text-7xl">
                    {secondsLeft}초
                  </span>
                  {lastCrashPoint !== undefined && (
                    <span className="mt-3 text-sm tabular-nums text-slate-500">
                      이전 크래시 {formatMultiplier(lastCrashPoint)}
                    </span>
                  )}
                </>
              )}
              {phase === 'resting' && (
                <>
                  <span className="text-sm font-semibold tracking-wide text-sky-700">쉬는 시간</span>
                  <span className="mt-2 text-6xl font-semibold tabular-nums text-sky-800 sm:text-7xl">{restLeft}</span>
                  <span className="mt-3 max-w-xs text-sm text-slate-500">
                    모든 플레이어가 함께 쉬고 있습니다. 끝나면 1라운드부터 다시 시작합니다
                  </span>
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
            autoEnabled={autoEnabled}
            autoMultiplier={autoMultiplier}
            pending={pending}
            actionError={actionError}
            onAmountChange={setAmount}
            onAutoEnabledChange={setAutoEnabled}
            onAutoMultiplierChange={setAutoMultiplier}
            onPlaceBet={() => placeBet(amount, autoEnabled ? autoMultiplier : null)}
            onCashOut={cashOut}
          />
          <RoundBets players={state.players} phase={phase} />
          <PromoCodeForm onRedeem={redeem} />
        </aside>
      </main>

      <SiteFooter />

      <BetHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} loadHistory={loadBetHistory} />
    </div>
  );
}

function formatRestTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
