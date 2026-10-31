import CrashGame from '@/components/CrashGame';
import LoginScreen from '@/components/LoginScreen';
import { useAuth } from '@/hooks/useAuth';

export default function App() {
  const { status, member, errorMessage, signInWithDiscord, signInAsGuest, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        불러오는 중입니다...
      </div>
    );
  }

  if (status === 'ready' && member) {
    return <CrashGame member={member} onSignOut={signOut} />;
  }

  return (
    <LoginScreen onSignIn={signInWithDiscord} onGuestSignIn={signInAsGuest} errorMessage={errorMessage} />
  );
}
