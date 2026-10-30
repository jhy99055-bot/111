import { formatMultiplier } from '@/lib/crashMath';

interface CrashHistoryProps {
  history: number[];
}

export default function CrashHistory({ history }: CrashHistoryProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      <span className="shrink-0 text-xs font-medium text-slate-500">최근 결과</span>
      {history.length === 0 && <span className="text-xs text-slate-400">아직 라운드 기록이 없습니다</span>}
      {history.map((point, index) => (
        <span
          key={`${index}-${point}`}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
            point < 2
              ? 'bg-rose-50 text-rose-600'
              : point < 10
                ? 'bg-teal-50 text-teal-700'
                : 'bg-amber-50 text-amber-700'
          }`}
        >
          {formatMultiplier(point)}
        </span>
      ))}
    </div>
  );
}
