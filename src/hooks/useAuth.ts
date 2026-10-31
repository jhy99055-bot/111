import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isMemberProfile, type MemberProfile } from '@/types/member';

export type AuthStatus = 'loading' | 'signed-out' | 'ready' | 'error';

const LOAD_ERROR = '회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
const LOGIN_ERROR = '디스코드 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const GUEST_ERROR = '게스트 로그인을 하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMember = useCallback(async (session: Session) => {
    const { error: syncError } = await supabase.rpc('ensure_member');
    if (syncError) {
      setErrorMessage(syncError.message || LOAD_ERROR);
      setStatus('error');
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error || !isMemberProfile(data)) {
      setErrorMessage(LOAD_ERROR);
      setStatus('error');
      return;
    }
    setMember(data);
    setErrorMessage(null);
    setStatus('ready');
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      (async () => {
        if (!session) {
          setMember(null);
          setErrorMessage(null);
          setStatus('signed-out');
          return;
        }
        setStatus('loading');
        await loadMember(session);
      })();
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadMember]);

  const signInWithDiscord = useCallback(async () => {
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    });
    if (error) setErrorMessage(LOGIN_ERROR);
  }, []);

  const signInAsGuest = useCallback(async () => {
    setErrorMessage(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setErrorMessage(GUEST_ERROR);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setErrorMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');
  }, []);

  return { status, member, errorMessage, signInWithDiscord, signInAsGuest, signOut };
}
