/*
# Add auto cash-out (limit bets) and personal bet history

1. Modified Tables
- `game_bets`: new nullable column `auto_cashout` (numeric, 1.01 to 1000). When set, the server cashes the bet out automatically at that multiplier.

2. Modified Functions
- `place_bet`: now takes an optional auto cash-out multiplier. The old 2-argument version is replaced.
- `game_tick`: each tick cashes out active bets whose auto multiplier has been reached (never beyond the crash point), then handles crashes as before.
- `game_state_json`: `my_bet` now includes `auto_cashout`.

3. New Functions
- `game_bet_history(p_player)`: returns the player's finished bets (cashed or lost) with round number, crash point, amount, cash-out multiplier, payout, and auto setting, newest first (max 200).

4. Security
- New and replaced functions are revoked from PUBLIC and granted only to `anon` and `authenticated`, matching the existing public game functions.
- No existing rows are changed or removed.
*/

ALTER TABLE game_bets ADD COLUMN IF NOT EXISTS auto_cashout numeric(12,2);

ALTER TABLE game_bets DROP CONSTRAINT IF EXISTS game_bets_auto_cashout_range;
ALTER TABLE game_bets ADD CONSTRAINT game_bets_auto_cashout_range
  CHECK (auto_cashout IS NULL OR (auto_cashout >= 1.01 AND auto_cashout <= 1000));

DROP FUNCTION IF EXISTS place_bet(uuid, bigint);

CREATE OR REPLACE FUNCTION place_bet(p_player uuid, p_amount bigint, p_auto_cashout numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
cur game_rounds;
BEGIN
IF p_player IS NULL THEN
RAISE EXCEPTION '플레이어 정보가 없습니다.';
END IF;
IF p_amount IS NULL OR p_amount < 10 OR p_amount > 100000 THEN
RAISE EXCEPTION '배팅은 10 ~ 100,000 칩 사이로 입력해 주세요.';
END IF;
IF p_auto_cashout IS NOT NULL AND (p_auto_cashout < 1.01 OR p_auto_cashout > 1000) THEN
RAISE EXCEPTION '자동 캐시아웃 배수는 1.01 ~ 1000 사이로 입력해 주세요.';
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

INSERT INTO game_bets (round_id, player_id, amount, status, auto_cashout)
VALUES (cur.id, p_player, p_amount, 'active', p_auto_cashout);

RETURN game_state_json(p_player);
END;
$function$;

REVOKE ALL ON FUNCTION place_bet(uuid, bigint, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_bet(uuid, bigint, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION game_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
r game_rounds;
v_crash_at timestamptz;
v_is_crashed boolean;
v_current_mult float8;
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
v_is_crashed := now() >= v_crash_at;
v_current_mult := CASE
  WHEN v_is_crashed THEN r.crash_point::float8
  ELSE floor(exp(0.08 * extract(epoch FROM (now() - r.started_at))::float8) * 100) / 100
END;

WITH done AS (
  UPDATE game_bets
  SET status = 'cashed',
      cashout_multiplier = auto_cashout,
      payout = floor(amount * auto_cashout)::bigint
  WHERE round_id = r.id
    AND status = 'active'
    AND auto_cashout IS NOT NULL
    AND auto_cashout <= v_current_mult
  RETURNING player_id, payout
)
UPDATE game_players p
SET chips = p.chips + d.total
FROM (SELECT player_id, sum(payout) AS total FROM done GROUP BY player_id) d
WHERE p.id = d.player_id;

IF v_is_crashed THEN
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
$function$;

CREATE OR REPLACE FUNCTION game_state_json(p_player uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
'cashout_multiplier', b.cashout_multiplier, 'payout', b.payout,
'auto_cashout', b.auto_cashout)
FROM game_bets b WHERE b.round_id = cur.id AND b.player_id = p_player
),
'last_bet', (
SELECT jsonb_build_object('amount', b.amount, 'status', b.status,
'cashout_multiplier', b.cashout_multiplier, 'payout', b.payout,
'auto_cashout', b.auto_cashout)
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
$function$;

CREATE OR REPLACE FUNCTION game_bet_history(p_player uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(jsonb_agg(row_json ORDER BY seq DESC), '[]'::jsonb)
FROM (
SELECT r.seq, jsonb_build_object(
'round_no', r.seq,
'crash_point', r.crash_point,
'amount', b.amount,
'status', b.status,
'cashout_multiplier', b.cashout_multiplier,
'payout', b.payout,
'auto_cashout', b.auto_cashout,
'created_at', b.created_at
) AS row_json
FROM game_bets b
JOIN game_rounds r ON r.id = b.round_id
WHERE b.player_id = p_player
AND b.status IN ('cashed', 'lost')
ORDER BY r.seq DESC
LIMIT 200
) h;
$function$;

REVOKE ALL ON FUNCTION game_bet_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_bet_history(uuid) TO anon, authenticated;
