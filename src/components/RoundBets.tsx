import { Users } from 'lucide-react';
import { formatChips, formatMultiplier } from '@/lib/crashMath';
import type { PlayerBet, RoundStatus } from '@/types/game';

interface RoundBetsProps {
  players: PlayerBet[];
  phase: RoundStatus;
}

const MAX_ROWS = 8;

export default function RoundBets({ players, phase }: RoundBetsProps) {
  const visible = players.slice(0, MAX_ROWS);
  const hiddenCount = players.length - visible.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Users className="h-4 w-4 text-zinc-400" aria-hidden />
          이번 라운드 배팅
        </span>
        <span className="text-xs tabular-nums text-zinc-500">{players.length}명</span>
      </div>

      {players.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">아직 배팅한 사람이 없습니다</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {visible.map((player, index) => (
            <li
              key={`${player.nickname}-${index}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                player.is_me ? 'bg-emerald-400/10 ring-1 ring-emerald-400/30' : 'bg-black/60'
              }`}
            >
              <span className={player.is_me ? 'font-medium text-emerald-300' : 'text-zinc-300'}>
                {player.nickname}
                {player.is_me && <span className="ml-1.5 text-xs text-emerald-400/80">나</span>}
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="text-zinc-400">{formatChips(player.amount)}</span>
                <BetStatusLabel player={player} phase={phase} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && <p className="mt-3 text-xs text-zinc-600">외 {hiddenCount}명</p>}
    </div>
  );
}

function BetStatusLabel({ player, phase }: { player: PlayerBet; phase: RoundStatus }) {
  if (player.status === 'cashed' && player.cashout_multiplier !== null) {
    return <span className="w-16 text-right font-medium text-amber-300">{formatMultiplier(player.cashout_multiplier)}</span>;
  }
  if (player.status === 'lost') {
    return <span className="w-16 text-right font-medium text-rose-300">손실</span>;
  }
  return (
    <span className="w-16 text-right text-xs text-zinc-500">{phase === 'waiting' ? '대기' : '진행 중'}</span>
  );
}
