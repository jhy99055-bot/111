import { useState, type FormEvent } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import type { RedeemResult } from '@/types/game';

interface PromoCodeFormProps {
  onRedeem: (code: string) => Promise<RedeemResult>;
}

export default function PromoCodeForm({ onRedeem }: PromoCodeFormProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !code.trim()) return;
    setSubmitting(true);
    const result = await onRedeem(code.trim());
    setSubmitting(false);
    if (result.ok) {
      setFeedback({ ok: true, text: '프로모션 코드가 적용되었습니다.' });
      setCode('');
    } else {
      setFeedback({ ok: false, text: result.message });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Gift className="h-4 w-4 text-teal-600" aria-hidden />
        프로모션 코드
      </div>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setFeedback(null);
          }}
          placeholder="코드를 입력하세요"
          aria-label="프로모션 코드"
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="submit"
          disabled={!code.trim() || submitting}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition duration-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          적용
        </button>
      </form>
      {feedback && (
        <p role="status" className={`mt-3 text-sm ${feedback.ok ? 'text-teal-700' : 'text-rose-600'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
