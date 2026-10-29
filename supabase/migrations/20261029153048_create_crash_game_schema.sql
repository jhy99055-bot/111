/*
# Crash betting game: profiles, rounds, bets and server-side game logic

1. New Tables
- `profiles`: one row per signed-in Discord user. Holds display name, avatar, Discord id and a virtual chip balance (starts at 1000).
- `crash_rounds`: every game round. Stores the secret crash point, round status (betting, running, crashed) and timing. Private: no direct client access.
- `crash_bets`: every bet placed in a round, with its outcome (active, cashed, lost), cash-out multiplier and payout. Private: read through functions only.

2. Functions (all run on the server with the rights of the owner)
- `get_crash_state()`: advances the game clock and returns the current round, live bets, recent history and the player's balance.
- `place_crash_bet(p_amount)`: places a bet during the betting window and deducts chips.
- `cashout_crash()`: cashes out the player's active bet at the current multiplier.
- `refill_chips()`: tops the balance back up to 1000 when it is below 10.
- Internal helpers: `crash_tick()` (moves rounds between phases), `crash_new_crash_point()` (random crash point), `handle_new_user()` (creates a profile when someone signs in).

3. Security
- RLS enabled on all three tables.
- `profiles`: authenticated users may read only their own row.
- `crash_rounds` and `crash_bets`: no grants to client roles, so secret crash points are never exposed.
- Game functions are callable only by signed-in users. Internal helpers are not callable by clients.

4. Important notes
- The crash point is generated and stored on the server, so players cannot see it before a round crashes.
- Multiplier grows as exp(0.08 * seconds), shared by the client display and the server cash-out calculation.
- Existing auth users are backfilled into profiles.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Player',
  avatar_url text,
  discord_id text,
  chips bigint NOT NULL DEFAULT 1000 CHECK (chips >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS crash_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('betting', 'running', 'crashed')),
  crash_point numeric(12,2) NOT NULL,
  betting_ends_at timestamptz NOT NULL,
  started_at timestamptz,
  crashed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crash_rounds_created_at_idx ON crash_rounds (created_at DESC);

ALTER TABLE crash_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS crash_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES crash_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('active', 'cashed', 'lost')),
  cashout_multiplier numeric(12,2),
  payout bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS crash_bets_round_id_idx ON crash_bets (round_id);

ALTER TABLE crash_bets ENABLE ROW LEVEL SECURITY;

INSERT INTO profiles (id, display_name, avatar_url, discord_id)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Player'),
  u.raw_user_meta_data->>'avatar_url',
  u.raw_user_meta_data->>'provider_id'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url, discord_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Player'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'provider_id'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION crash_new_crash_point()
RETURNS numeric
LANGUAGE sql
VOLATILE
AS $$
  SELECT GREATEST(1.00, LEAST(1000.00, floor(100 * 0.99 / (1 - random())) / 100));
$$;

REVOKE EXECUTE ON FUNCTION crash_new_crash_point() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION crash_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r crash_rounds;
  v_crash_at timestamptz;
BEGIN
  SELECT * INTO r FROM crash_rounds ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO crash_rounds (status, crash_point, betting_ends_at)
    VALUES ('betting', crash_new_crash_point(), now() + interval '8 seconds');
    RETURN;
  END IF;

  IF r.status = 'betting' AND now() >= r.betting_ends_at THEN
    UPDATE crash_rounds SET status = 'running', started_at = now() WHERE id = r.id;
    r.status := 'running';
    r.started_at := now();
  END IF;

  IF r.status = 'running' THEN
    v_crash_at := r.started_at + make_interval(secs => ln(r.crash_point::float8) / 0.08);
    IF now() >= v_crash_at THEN
      UPDATE crash_rounds SET status = 'crashed', crashed_at = v_crash_at WHERE id = r.id;
      UPDATE crash_bets SET status = 'lost' WHERE round_id = r.id AND status = 'active';
      INSERT INTO crash_rounds (status, crash_point, betting_ends_at)
      VALUES ('betting', crash_new_crash_point(), v_crash_at + interval '8 seconds');
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION crash_tick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_crash_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur crash_rounds;
  v_prev crash_rounds;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in with Discord first';
  END IF;

  PERFORM crash_tick();

  SELECT * INTO v_cur FROM crash_rounds ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_prev FROM crash_rounds WHERE status = 'crashed' ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'server_now', now(),
    'chips', (SELECT chips FROM profiles WHERE id = v_uid),
    'round', jsonb_build_object(
      'id', v_cur.id,
      'status', v_cur.status,
      'betting_ends_at', v_cur.betting_ends_at,
      'started_at', v_cur.started_at
    ),
    'last_crash', CASE WHEN v_prev.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_prev.id,
      'crash_point', v_prev.crash_point,
      'crashed_at', v_prev.crashed_at,
      'my_bet', (
        SELECT jsonb_build_object(
          'amount', b.amount,
          'status', b.status,
          'cashout_multiplier', b.cashout_multiplier,
          'payout', b.payout
        )
        FROM crash_bets b
        WHERE b.round_id = v_prev.id AND b.user_id = v_uid
      )
    ) END,
    'history', (
      SELECT COALESCE(jsonb_agg(h.crash_point ORDER BY h.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT crash_point, created_at
        FROM crash_rounds
        WHERE status = 'crashed'
        ORDER BY created_at DESC
        LIMIT 20
      ) h
    ),
    'bets', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'display_name', p.display_name,
          'avatar_url', p.avatar_url,
          'amount', b.amount,
          'status', b.status,
          'cashout_multiplier', b.cashout_multiplier,
          'payout', b.payout,
          'is_me', b.user_id = v_uid
        ) ORDER BY b.amount DESC
      ), '[]'::jsonb)
      FROM crash_bets b
      JOIN profiles p ON p.id = b.user_id
      WHERE b.round_id = v_cur.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION place_crash_bet(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur crash_rounds;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in with Discord first';
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Bet must be between 10 and 100000 chips';
  END IF;

  PERFORM crash_tick();

  SELECT * INTO v_cur FROM crash_rounds ORDER BY created_at DESC LIMIT 1;

  IF v_cur.status <> 'betting' THEN
    RAISE EXCEPTION 'Betting is closed for this round';
  END IF;

  IF EXISTS (SELECT 1 FROM crash_bets WHERE round_id = v_cur.id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You already placed a bet this round';
  END IF;

  UPDATE profiles SET chips = chips - p_amount WHERE id = v_uid AND chips >= p_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not enough chips for this bet';
  END IF;

  INSERT INTO crash_bets (round_id, user_id, amount, status)
  VALUES (v_cur.id, v_uid, p_amount, 'active');

  RETURN get_crash_state();
END;
$$;

CREATE OR REPLACE FUNCTION cashout_crash()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur crash_rounds;
  v_bet crash_bets;
  v_mult numeric;
  v_payout bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in with Discord first';
  END IF;

  PERFORM crash_tick();

  SELECT * INTO v_cur FROM crash_rounds ORDER BY created_at DESC LIMIT 1;

  IF v_cur.status <> 'running' THEN
    RAISE EXCEPTION 'The round is not running';
  END IF;

  SELECT * INTO v_bet FROM crash_bets
  WHERE round_id = v_cur.id AND user_id = v_uid AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You have no active bet to cash out';
  END IF;

  v_mult := floor(exp(0.08 * extract(epoch FROM (now() - v_cur.started_at))::float8) * 100) / 100;
  v_payout := floor(v_bet.amount * v_mult)::bigint;

  UPDATE profiles SET chips = chips + v_payout WHERE id = v_uid;
  UPDATE crash_bets
  SET status = 'cashed', cashout_multiplier = v_mult, payout = v_payout
  WHERE id = v_bet.id;

  RETURN get_crash_state();
END;
$$;

CREATE OR REPLACE FUNCTION refill_chips()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in with Discord first';
  END IF;

  UPDATE profiles SET chips = 1000 WHERE id = v_uid AND chips < 10;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only refill when you have less than 10 chips';
  END IF;

  RETURN get_crash_state();
END;
$$;

REVOKE EXECUTE ON FUNCTION get_crash_state() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION place_crash_bet(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cashout_crash() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION refill_chips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_crash_state() TO authenticated;
GRANT EXECUTE ON FUNCTION place_crash_bet(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION cashout_crash() TO authenticated;
GRANT EXECUTE ON FUNCTION refill_chips() TO authenticated;
