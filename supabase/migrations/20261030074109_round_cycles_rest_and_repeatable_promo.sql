/*
# Round numbering with 1000-round cycles and 5-minute rest, and repeatable promo codes

1. Modified Tables
- `game_rounds`: new column `round_no` (1 to 1000 within a cycle). Rounds from before this change have no number.
- `game_rounds.status` now also accepts `resting`, the 5-minute break shown after round 1000.

2. Game Flow
- Round numbers count 1 to 1000. After round 1000 crashes and its 4-second result display ends, a 5-minute `resting` period starts for everyone.
- When the rest ends, round 1 begins with the usual 10-second betting window.
- Bets are rejected during rest, like any non-betting time.

3. Modified Functions
- `game_tick`: adds the rest period and round numbering. Otherwise unchanged.
- `game_state_json`: includes `round_no` in the current round.
- `redeem_promo`: the promo code can be redeemed again by the same player. This is for testing; the redemption is still recorded.

4. Security
- Function grants are unchanged. No rows are deleted or modified.
*/

ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS round_no integer;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'game_rounds'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%waiting%'
  LOOP
    EXECUTE format('ALTER TABLE game_rounds DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE game_rounds ADD CONSTRAINT game_rounds_status_check
  CHECK (status IN ('waiting', 'running', 'crashed', 'resting'));

CREATE OR REPLACE FUNCTION redeem_promo(p_player uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

UPDATE game_players SET chips = chips + promo.chips WHERE id = p_player;

RETURN game_state_json(p_player);
END;
$function$;

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
INSERT INTO game_rounds (status, crash_point, ends_at, round_no)
VALUES ('waiting', game_new_crash_point(), now() + make_interval(secs => 10), 1);
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
IF COALESCE(r.round_no, 0) >= 1000 THEN
INSERT INTO game_rounds (status, crash_point, ends_at, round_no)
VALUES ('resting', game_new_crash_point(), r.crashed_at + make_interval(secs => 304), NULL);
ELSE
INSERT INTO game_rounds (status, crash_point, ends_at, round_no)
VALUES ('waiting', game_new_crash_point(), r.crashed_at + make_interval(secs => 14), COALESCE(r.round_no, 0) + 1);
END IF;
CONTINUE;
END IF;

IF r.status = 'resting' AND now() >= r.ends_at THEN
INSERT INTO game_rounds (status, crash_point, ends_at, round_no)
VALUES ('waiting', game_new_crash_point(), r.ends_at + make_interval(secs => 10), 1);
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
'round_no', cur.round_no,
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
