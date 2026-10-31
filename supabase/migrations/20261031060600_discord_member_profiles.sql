/*
# Discord member profiles and sign-in sync

## Plain-English summary
Members sign in with their Discord account. Each Discord account maps to one
Supabase auth user, and that user id is the member's permanent id in the game.
This migration adds the member profile fields (Discord id, nickname, avatar,
role for future admins), a function the app calls right after sign-in to create
or refresh the member's profile and chip balance, and locks down direct table
access so the browser only reaches data through the game functions.

## 1. Modified tables
- `profiles`
  - New columns: `username` (Discord handle), `role` ('player' or 'admin', default 'player'),
    `last_login_at` (time of the most recent sign-in).
  - Unique index on `discord_id` so one Discord account maps to one member.

## 2. New functions
- `is_admin()`: returns true when the signed-in user has the 'admin' role.
  Used by policies so the future admin site can read every member.
- `ensure_member()`: called by the app after Discord sign-in. Reads the Discord id and
  profile info from the sign-in identity (not from editable fields), creates or refreshes
  the profile, and creates the game balance row with 1000 starting chips if it does not exist.

## 3. Security changes
- `profiles`: the browser can only SELECT its own row. Admins can SELECT all rows via `is_admin()`.
  No direct INSERT/UPDATE/DELETE from the browser; profile data is written only by `ensure_member()`.
- Direct table grants for the game tables (`game_players`, `game_rounds`, `game_bets`,
  `promo_codes`, `promo_redemptions`, `crash_rounds`, `crash_bets`) are removed from
  `anon` and `authenticated`. The game reads and writes these only through its functions.
- `is_admin()` and `ensure_member()` are only callable by signed-in users.

## 4. Notes
- Existing rows are kept. The test players from before sign-in was added are not linked
  to any Discord account and are left untouched.
- Idempotent: safe to re-run.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('player', 'admin'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_discord_id_key ON profiles (discord_id) WHERE discord_id IS NOT NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON profiles FROM anon, authenticated;
GRANT SELECT ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_select_profiles" ON profiles;
CREATE POLICY "admins_select_profiles" ON profiles FOR SELECT
TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.ensure_member()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_discord_id text;
  v_meta jsonb;
  v_username text;
  v_display text;
  v_avatar text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT i.provider_id, u.raw_user_meta_data
    INTO v_discord_id, v_meta
  FROM auth.identities i
  JOIN auth.users u ON u.id = i.user_id
  WHERE i.user_id = v_uid AND i.provider = 'discord'
  LIMIT 1;

  IF v_discord_id IS NULL THEN
    RAISE EXCEPTION '디스코드 계정으로 로그인해 주세요.';
  END IF;

  v_username := COALESCE(v_meta->>'name', v_meta->>'user_name', 'Player');
  v_display := COALESCE(v_meta->'custom_claims'->>'global_name', v_meta->>'full_name', v_username);
  v_avatar := v_meta->>'avatar_url';

  INSERT INTO profiles (id, display_name, username, avatar_url, discord_id, last_login_at)
  VALUES (v_uid, v_display, v_username, v_avatar, v_discord_id, now())
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    discord_id = EXCLUDED.discord_id,
    last_login_at = now();

  INSERT INTO game_players (id, nickname, chips)
  VALUES (v_uid, v_display, 1000)
  ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_member() TO authenticated;

REVOKE ALL ON game_players, game_rounds, game_bets, promo_codes, promo_redemptions, crash_rounds, crash_bets FROM anon, authenticated;
