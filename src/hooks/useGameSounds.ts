import { useEffect, useRef } from 'react';
import { playSound, unlockAudio } from '@/lib/sound';
import type { GameState } from '@/types/game';

export function useGameSounds(state: GameState | null) {
  const previousRef = useRef<GameState | null>(null);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    if (!state) return;
    const before = previousRef.current;
    previousRef.current = state;
    if (!before) return;

    const sameRound = before.round.id === state.round.id;
    const myBefore = before.my_bet;
    const myNow = state.my_bet;

    if (sameRound && before.round.status === 'running' && state.round.status === 'crashed') {
      playSound('crash');
    }
    if (sameRound && !myBefore && myNow?.status === 'active') {
      playSound('bet');
    }
    if (sameRound && myBefore?.status === 'active' && myNow?.status === 'cashed') {
      playSound('cashOut');
    }
  }, [state]);
}
