/*
# Guest sign-in for testing

## Plain-English summary
Adds a guest path to the member sync so the game can be tested before Discord
keys are connected. Guest accounts are anonymous Supabase sign-ins. They get a
profile named "게스트 XXXX" and the same 1000 starting chips. Discord members are
handled exactly as before.

## 1. Modified function
- `ensure_member()`: when the signed-in user is anonymous (guest), it skips the
  Discord identity lookup and creates or refreshes a guest profile. Discord
  sign-ins are unchanged.

## 2. Notes
- Guest accounts have no Discord id, so `discord_id` stays empty for them.
- Idempotent: replaces the function with the same signature.
- Turn guest sign-in off before launch by setting the guest flag in the app to false.
*/

CREATE OR REPLACE FUNCTION public.ensure_member()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_guest boolean := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_discord_id text;
  v_meta jsonb;
  v_username text;
  v_display text;
  v_avatar text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  IF v_is_guest THEN
    v_display := '게스트 ' || upper(left(v_uid::text, 4));
    v_username := NULL;
    v_avatar := NULL;
    v_discord_id := NULL;
  ELSE
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
  END IF;

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
