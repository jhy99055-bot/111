/*
# Shared multiplayer rocket game: server-driven rounds, shared chips and promo codes

1. New Tables
- `game_players`: one row per browser player (random id stored on the device), nickname and chip balance. Starts with 1000 chips.
- `game_rounds`: the single shared timeline of rounds. Each round is waiting (betting window), running (multiplier rising), or crashed (result shown). The crash point is stored here and is only revealed to clients after the round crashes.
- `game_bets`: one bet per player per round, with outcome (active, cashed, lost), cash-out multiplier and payout.
- `promo_codes`: promo codes and the chips they grant. Code "1000" grants 1000 chips.
- `promo_redemptions`: which player has used which code (each code once per player).

2. Timing (all computed on the server, so every player sees the same timeline)
- Waiting (betting) window: 10 seconds.
- Crash result is shown for 4 seconds, then the next waiting window begins.
- Multiplier grows as exp(0.08 * seconds), the same formula the browser uses to draw the graph.

3. Functions (the only way clients touch data)
- `game_state(p_player)`: advances the timeline and returns the shared round, the player's bet and balance, live bets, recent crash history.
- `place_bet(p_player, p_amount)`: places a bet during the waiting window and deducts chips.
- `cash_out(p_player)`: cashes out the player's active bet at the current server time.
- `refill_chips(p_player)`: tops balance up to 1000 when below 10.
- `redeem_promo(p_player, p_code)`: credits chips for a valid, unused promo code.
- Internal helpers: `game_tick()`, `game_new_crash_point()`, `game_state_json()`, `game_ensure_player()`.

4. Security
- RLS is enabled on every table. No table grants are given to client roles, so clients cannot read or write tables directly and cannot see future crash points.
- Client roles (anon) can only execute the public game functions. Internal helpers are not executable by clients.
- Players are identified by a random id kept in the browser. Anyone holding that id can act as that player. This is suitable for a casual, virtual-chip game but is not a login system.

5. Notes
- A single advisory lock serializes timeline updates so concurrent visitors cannot create duplicate rounds.
- Older tables from the previous login-based prototype (profiles, crash_rounds, crash_bets) are not used by this game.
*/

CREATE TABLE IF NOT EXISTS game_players (
  id uuid PRIMARY KEY,
  nickname text NOT NULL,
  chips bigint NOT NULL DEFAULT 1000 CHECK (chips >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status text NOT NULL CHECK (status IN ('waiting', 'running', 'crashed')),
  crash_point numeric(12,2) NOT NULL,
  ends_at timestamptz NOT NULL,
  started_at timestamptz,
  crashed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS game_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('active', 'cashed', 'lost')),
  cashout_multiplier numeric(12,2),
  payout bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS game_bets_round_id_idx ON game_bets (round_id);

ALTER TABLE game_bets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS promo_codes (
  code text PRIMARY KEY,
  chips bigint NOT NULL CHECK (chips > 0),
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS promo_redemptions (
  code text NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, player_id)
);

ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

INSERT INTO promo_codes (code, chips) VALUES ('1000', 1000) ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION game_new_crash_point()
RETURNS numeric
LANGUAGE sql
VOLATILE
AS $$
  SELECT LEAST(1000.00, GREATEST(1.00, floor(100 * power(0.9 / (1 - random()), 1.0 / 1.3)) / 100))::numeric(12,2);
$$;

CREATE OR REPLACE FUNCTION game_ensure_player(p_player uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO game_players (id, nickname, chips)
  VALUES (p_player, '플레이어 ' || upper(left(p_player::text, 4)), 1000)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION game_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r game_rounds;
  v_crash_at timestamptz;
  i int;
BEGIN
  PERFORM pg_advisory_xact_lock(7337);

  FOR i IN 1..50 LOOP
    SELECT * INTO r FROM game_rounds ORDER BY seq DESC LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO game_rounds (status, crash_point, ends_at)
      VALUES ('waiting', game_new_crash_point(), now() + make_interval(secs => 10));
      CONTINUE;
    END IF;

    IF r.status = 'waiting' AND now() >= r.ends_at THEN
      UPDATE game_rounds SET status = 'running', started_at = r.ends_at WHERE id = r.id;
      CONTINUE;
    END IF;

    IF r.status = 'running' THEN
      v_crash_at := r.started_at + make_interval(secs => ln(r.crash_point::float8) / 0.08);
      IF now() >= v_crash_at THEN
        UPDATE game_rounds SET status = 'crashed', crashed_at = v_crash_at WHERE id = r.id;
        UPDATE game_bets SET status = 'lost' WHERE round_id = r.id AND status = 'active';
        CONTINUE;
      END IF;
      EXIT;
    END IF;

    IF r.status = 'crashed' AND now() >= r.crashed_at + make_interval(secs => 4) THEN
      INSERT INTO game_rounds (status, crash_point, ends_at)
      VALUES ('waiting', game_new_crash_point(), r.crashed_at + make_interval(secs => 14));
      CONTINUE;
    END IF;

    EXIT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION game_state_json(p_player uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur game_rounds;
  lastc game_rounds;
BEGIN
  SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
  SELECT * INTO lastc FROM game_rounds WHERE status = 'crashed' ORDER BY seq DESC LIMIT 1;

  RETURN jsonb_build_object(
    'server_now', now(),
    'chips', (SELECT chips FROM game_players WHERE id = p_player),
    'round', jsonb_build_object(
      'id', cur.id,
      'status', cur.status,
      'ends_at', cur.ends_at,
      'started_at', cur.started_at,
      'crashed_at', cur.crashed_at,
      'crash_point', CASE WHEN cur.status = 'crashed' THEN cur.crash_point END
    ),
    'my_bet', (
      SELECT jsonb_build_object('amount', b.amount, 'status', b.status,
        'cashout_multiplier', b.cashout_multiplier, 'payout', b.payout)
      FROM game_bets b WHERE b.round_id = cur.id AND b.player_id = p_player
    ),
    'last_bet', (
      SELECT jsonb_build_object('amount', b.amount, 'status', b.status,
        'cashout_multiplier', b.cashout_multiplier, 'payout', b.payout)
      FROM game_bets b WHERE b.round_id = lastc.id AND b.player_id = p_player
    ),
    'history', (
      SELECT COALESCE(jsonb_agg(h.crash_point ORDER BY h.seq DESC), '[]'::jsonb)
      FROM (SELECT crash_point, seq FROM game_rounds WHERE status = 'crashed' ORDER BY seq DESC LIMIT 20) h
    ),
    'players', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nickname', p.nickname,
        'amount', b.amount,
        'status', b.status,
        'cashout_multiplier', b.cashout_multiplier,
        'payout', b.payout,
        'is_me', b.player_id = p_player
      ) ORDER BY b.amount DESC), '[]'::jsonb)
      FROM game_bets b JOIN game_players p ON p.id = b.player_id
      WHERE b.round_id = cur.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION game_state(p_player uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION '플레이어 정보가 없습니다.';
  END IF;
  PERFORM game_ensure_player(p_player);
  PERFORM game_tick();
  RETURN game_state_json(p_player);
END;
$$;

CREATE OR REPLACE FUNCTION place_bet(p_player uuid, p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur game_rounds;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION '플레이어 정보가 없습니다.';
  END IF;
  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 100000 THEN
    RAISE EXCEPTION '배팅은 10 ~ 100,000 칩 사이로 입력해 주세요.';
  END IF;

  PERFORM game_ensure_player(p_player);
  PERFORM game_tick();

  SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
  IF cur.status <> 'waiting' THEN
    RAISE EXCEPTION '지금은 배팅 시간이 아닙니다.';
  END IF;

  IF EXISTS (SELECT 1 FROM game_bets WHERE round_id = cur.id AND player_id = p_player) THEN
    RAISE EXCEPTION '이번 라운드에는 이미 배팅했습니다.';
  END IF;

  UPDATE game_players SET chips = chips - p_amount WHERE id = p_player AND chips >= p_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION '칩이 부족합니다.';
  END IF;

  INSERT INTO game_bets (round_id, player_id, amount, status)
  VALUES (cur.id, p_player, p_amount, 'active');

  RETURN game_state_json(p_player);
END;
$$;

CREATE OR REPLACE FUNCTION cash_out(p_player uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur game_rounds;
  b game_bets;
  v_mult numeric;
  v_payout bigint;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION '플레이어 정보가 없습니다.';
  END IF;

  PERFORM game_ensure_player(p_player);
  PERFORM game_tick();

  SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
  IF cur.status <> 'running' THEN
    RAISE EXCEPTION '지금은 캐시아웃할 수 없습니다.';
  END IF;

  SELECT * INTO b FROM game_bets
  WHERE round_id = cur.id AND player_id = p_player AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '캐시아웃할 배팅이 없습니다.';
  END IF;

  v_mult := floor(exp(0.08 * extract(epoch FROM (now() - cur.started_at))::float8) * 100) / 100;
  v_payout := floor(b.amount * v_mult)::bigint;

  UPDATE game_players SET chips = chips + v_payout WHERE id = p_player;
  UPDATE game_bets SET status = 'cashed', cashout_multiplier = v_mult, payout = v_payout WHERE id = b.id;

  RETURN game_state_json(p_player);
END;
$$;

CREATE OR REPLACE FUNCTION refill_chips(p_player uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION '플레이어 정보가 없습니다.';
  END IF;

  PERFORM game_ensure_player(p_player);
  UPDATE game_players SET chips = 1000 WHERE id = p_player AND chips < 10;
  IF NOT FOUND THEN
    RAISE EXCEPTION '칩이 10 미만일 때만 충전할 수 있습니다.';
  END IF;

  RETURN game_state_json(p_player);
END;
$$;

CREATE OR REPLACE FUNCTION redeem_promo(p_player uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  promo promo_codes;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION '플레이어 정보가 없습니다.';
  END IF;

  PERFORM game_ensure_player(p_player);

  SELECT * INTO promo FROM promo_codes
  WHERE code = upper(trim(p_code)) AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 코드입니다.';
  END IF;

  INSERT INTO promo_redemptions (code, player_id)
  VALUES (promo.code, p_player)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION '이미 사용한 코드입니다.';
  END IF;

  UPDATE game_players SET chips = chips + promo.chips WHERE id = p_player;

  RETURN game_state_json(p_player);
END;
$$;

REVOKE EXECUTE ON FUNCTION game_new_crash_point() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION game_ensure_player(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION game_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION game_state_json(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION game_state(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION place_bet(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cash_out(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refill_chips(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION redeem_promo(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION game_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION place_bet(uuid, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cash_out(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION refill_chips(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_promo(uuid, text) TO anon, authenticated;
