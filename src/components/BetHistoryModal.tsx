import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { formatChips, formatMultiplier } from '@/lib/crashMath';
import type { BetHistoryRow } from '@/types/game';

interface BetHistoryModalProps {
  open: boolean;
  onClose: () => void;
  loadHistory: () => Promise<BetHistoryRow[]>;
}

export default function BetHistoryModal({ open, onClose, loadHistory }: BetHistoryModalProps) {
  const [rows, setRows] = useState<BetHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadHistory()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadHistory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const summary = useMemo(() => summarize(rows), [rows]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bet-history-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="bet-history-title" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <History className="h-4 w-4 text-emerald-400" aria-hidden />
            내 배팅 기록
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition duration-150 hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            불러오는 중입니다
          </div>
        )}

        {!loading && error && <p className="px-5 py-16 text-center text-sm text-rose-300">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="px-5 py-16 text-center text-sm text-zinc-500">아직 완료된 배팅이 없습니다</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-white/10 p-5 sm:grid-cols-4">
              <SummaryCard label="총 손익" value={`${signed(summary.totalProfit)} 칩`} tone={summary.totalProfit >= 0 ? 'gain' : 'loss'} />
              <SummaryCard label="배팅 횟수" value={`${summary.count}회`} />
              <SummaryCard label="승률" value={`${summary.winRate}%`} />
              <SummaryCard
                label="최고 배수"
                value={summary.bestMultiplier !== null ? formatMultiplier(summary.bestMultiplier) : '-'}
                tone="gain"
              />
            </div>

            <div className="overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950 text-xs text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">라운드</th>
                    <th className="px-3 py-3 font-medium">배팅</th>
                    <th className="px-3 py-3 font-medium">결과</th>
                    <th className="px-5 py-3 text-right font-medium">손익</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const profit = profitOf(row);
                    return (
                      <tr key={row.round_no} className="border-t border-white/5">
                        <td className="px-5 py-3 tabular-nums text-zinc-400">
                          #{row.round_no}
                          <span className="ml-2 text-xs text-zinc-600">크래시 {formatMultiplier(row.crash_point)}</span>
                        </td>
                        <td className="px-3 py-3 tabular-nums text-zinc-300">{formatChips(row.amount)}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.status === 'cashed' && row.cashout_multiplier !== null ? (
                            <span className="text-amber-200">
                              {formatMultiplier(row.cashout_multiplier)}
                              {row.auto_cashout !== null && <span className="ml-1.5 text-xs text-zinc-500">자동</span>}
                            </span>
                          ) : (
                            <span className="text-rose-300">터짐</span>
                          )}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-medium tabular-nums ${
                            profit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {signed(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function profitOf(row: BetHistoryRow): number {
  return row.status === 'cashed' && row.payout !== null ? row.payout - row.amount : -row.amount;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatChips(Math.abs(value))}`;
}

function summarize(rows: BetHistoryRow[]) {
  const totalProfit = rows.reduce((sum, row) => sum + profitOf(row), 0);
  const wins = rows.filter((row) => row.status === 'cashed').length;
  const multipliers = rows.map((row) => row.cashout_multiplier).filter((m): m is number => m !== null);
  return {
    totalProfit,
    count: rows.length,
    winRate: rows.length === 0 ? 0 : Math.round((wins / rows.length) * 100),
    bestMultiplier: multipliers.length > 0 ? Math.max(...multipliers) : null,
  };
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  const toneClass = tone === 'gain' ? 'text-emerald-300' : tone === 'loss' ? 'text-rose-300' : 'text-zinc-100';
  return (
    <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
