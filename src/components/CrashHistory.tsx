import { formatMultiplier } from '@/lib/crashMath';

interface CrashHistoryProps {
  history: number[];
}

export default function CrashHistory({ history }: CrashHistoryProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {history.length === 0 && <span className="text-xs text-zinc-600">아직 라운드 기록이 없습니다</span>}
      {history.map((point, index) => (
        <span
          key={`${index}-${point}`}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium tabular-nums ring-1 ${
            point < 2
              ? 'bg-rose-500/10 text-rose-300 ring-rose-400/25'
              : point < 10
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
                : 'bg-amber-300/10 text-amber-200 ring-amber-300/30'
          }`}
        >
          {formatMultiplier(point)}
        </span>
      ))}
    </div>
  );
}
