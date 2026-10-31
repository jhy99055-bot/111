import { Coins, Crown, FlaskConical, MessagesSquare, ShieldCheck } from 'lucide-react';
import { GUEST_LOGIN_ENABLED } from '@/lib/authConfig';

interface LoginScreenProps {
  onSignIn: () => void;
  onGuestSignIn: () => void;
  errorMessage: string | null;
}

export default function LoginScreen({ onSignIn, onGuestSignIn, errorMessage }: LoginScreenProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm">
            <Crown className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-[0.14em] text-slate-900">ROYALTY GAME</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            디스코드 계정으로 바로 시작하세요.
            <br />
            처음 로그인하면 계정이 자동으로 만들어집니다.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-700"
          >
            <MessagesSquare className="h-4 w-4" aria-hidden />
            디스코드로 시작하기
          </button>

          {GUEST_LOGIN_ENABLED && (
            <button
              type="button"
              onClick={onGuestSignIn}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 transition duration-200 hover:border-teal-400 hover:text-teal-700"
            >
              <FlaskConical className="h-4 w-4" aria-hidden />
              게스트로 체험하기 (테스트용)
            </button>
          )}

          {errorMessage && (
            <p role="alert" className="mt-4 text-sm text-rose-600">
              {errorMessage}
            </p>
          )}

          <ul className="mt-8 grid gap-3 border-t border-slate-100 pt-6 text-left text-sm text-slate-600">
            <li className="flex items-center gap-3">
              <Coins className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              가입하면 1,000 칩이 지급됩니다
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
              디스코드 계정 정보만 사용하며 비밀번호는 저장하지 않습니다
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
