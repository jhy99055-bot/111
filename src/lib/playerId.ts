const PLAYER_ID_KEY = 'rocket.playerId';

export function getPlayerId(): string {
  const stored = window.localStorage.getItem(PLAYER_ID_KEY);
  if (stored) return stored;
  const created = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_ID_KEY, created);
  return created;
}
