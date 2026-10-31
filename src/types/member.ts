export interface MemberProfile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
}

export function isMemberProfile(value: unknown): value is MemberProfile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.display_name === 'string' &&
    (v.username === null || typeof v.username === 'string') &&
    (v.avatar_url === null || typeof v.avatar_url === 'string')
  );
}
