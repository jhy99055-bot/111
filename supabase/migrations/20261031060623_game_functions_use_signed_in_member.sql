/*
# Game functions use the signed-in member

## Plain-English summary
The game functions used to accept a player id from the browser, so anyone who knew
an id could bet or cash out as that player. They now read the player from the
signed-in session instead. Each function keeps the same game rules: betting window,
auto cash-out, promo codes, and bet history.

## 1. Changed functions (replaced)
- `game_state()` - was `game_state(p_player)`.
- `game_state_json()` - was `game_state_json(p_player)`; internal.
- `place_bet(p_amount, p_auto_cashout)` - was `place_bet(p_player, p_amount, p_auto_cashout)`.
- `cash_out()` - was `cash_out(p_player)`.
- `redeem_promo(p_code)` - was `redeem_promo(p_player, p_code)`.
- `game_bet_history()` - was `game_bet_history(p_player)`.
- Removed: `game_ensure_player(uuid)`. Member rows are now created by `ensure_member()`.

## 2. Security changes
- Game actions are callable only by signed-in users.
- Internal helpers (`game_tick`, `game_state_json`) are not callable by the browser.
- Legacy functions from the first login prototype (`refill_chips`, `cashout_crash`,
  `place_crash_bet`, `get_crash_state`, `crash_tick`, `handle_new_user`, and the crash point
  helpers) are no longer callable by anonymous or signed-in users. Their tables and
  data are kept.

## 3. Notes
- Idempotent: old signatures are dropped and replaced in the same migration.
*/

DROP FUNCTION IF EXISTS public.game_state(uuid);
DROP FUNCTION IF EXISTS public.game_state_json(uuid);
DROP FUNCTION IF EXISTS public.place_bet(uuid, bigint, numeric);
DROP FUNCTION IF EXISTS public.cash_out(uuid);
DROP FUNCTION IF EXISTS public.redeem_promo(uuid, text);
DROP FUNCTION IF EXISTS public.game_bet_history(uuid);
DROP FUNCTION IF EXISTS public.game_ensure_player(uuid);

CREATE OR REPLACE FUNCTION public.game_state_json()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_uid uuid := auth.uid();
cur game_rounds;
lastc game_rounds;
BEGIN
SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
SELECT * INTO lastc FROM game_rounds WHERE status = 'crashed' ORDER BY seq DESC LIMIT 1;

RETURN jsonb_build_object(
'server_now', now(),
'chips', (SELECT chips FROM game_players WHERE id = v_uid),
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
FROM game_bets b WHERE b.round_id = cur.id AND b.player_id = v_uid
),
'last_bet', (
SELECT jsonb_build_object('amount', b.amount, 'status', b.status,
'cashout_multiplier', b.cashout_multiplier, 'payout', b.payout,
'auto_cashout', b.auto_cashout)
FROM game_bets b WHERE b.round_id = lastc.id AND b.player_id = v_uid
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
'is_me', b.player_id = v_uid
) ORDER BY b.amount DESC), '[]'::jsonb)
FROM game_bets b JOIN game_players p ON p.id = b.player_id
WHERE b.round_id = cur.id
)
);
END;
$function$;

CREATE OR REPLACE FUNCTION public.game_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION '로그인이 필요합니다.';
END IF;
PERFORM game_tick();
RETURN game_state_json();
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_bet(p_amount bigint, p_auto_cashout numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_uid uuid := auth.uid();
cur game_rounds;
BEGIN
IF v_uid IS NULL THEN
RAISE EXCEPTION '로그인이 필요합니다.';
END IF;
IF p_amount IS NULL OR p_amount < 10 OR p_amount > 100000 THEN
RAISE EXCEPTION '배팅은 10 ~ 100,000 칩 사이로 입력해 주세요.';
END IF;
IF p_auto_cashout IS NOT NULL AND (p_auto_cashout < 1.01 OR p_auto_cashout > 1000) THEN
RAISE EXCEPTION '자동 캐시아웃 배수는 1.01 ~ 1000 사이로 입력해 주세요.';
END IF;

PERFORM game_tick();

SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
IF cur.status <> 'waiting' THEN
RAISE EXCEPTION '지금은 배팅 시간이 아닙니다.';
END IF;

IF EXISTS (SELECT 1 FROM game_bets WHERE round_id = cur.id AND player_id = v_uid) THEN
RAISE EXCEPTION '이번 라운드에는 이미 배팅했습니다.';
END IF;

UPDATE game_players SET chips = chips - p_amount WHERE id = v_uid AND chips >= p_amount;
IF NOT FOUND THEN
RAISE EXCEPTION '칩이 부족합니다.';
END IF;

INSERT INTO game_bets (round_id, player_id, amount, status, auto_cashout)
VALUES (cur.id, v_uid, p_amount, 'active', p_auto_cashout);

RETURN game_state_json();
END;
$function$;

CREATE OR REPLACE FUNCTION public.cash_out()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_uid uuid := auth.uid();
cur game_rounds;
b game_bets;
v_mult numeric;
v_payout bigint;
BEGIN
IF v_uid IS NULL THEN
RAISE EXCEPTION '로그인이 필요합니다.';
END IF;

PERFORM game_tick();

SELECT * INTO cur FROM game_rounds ORDER BY seq DESC LIMIT 1;
IF cur.status <> 'running' THEN
RAISE EXCEPTION '지금은 캐시아웃할 수 없습니다.';
END IF;

SELECT * INTO b FROM game_bets
WHERE round_id = cur.id AND player_id = v_uid AND status = 'active'
FOR UPDATE;
IF NOT FOUND THEN
RAISE EXCEPTION '캐시아웃할 배팅이 없습니다.';
END IF;

v_mult := floor(exp(0.08 * extract(epoch FROM (now() - cur.started_at))::float8) * 100) / 100;
v_payout := floor(b.amount * v_mult)::bigint;

UPDATE game_players SET chips = chips + v_payout WHERE id = v_uid;
UPDATE game_bets SET status = 'cashed', cashout_multiplier = v_mult, payout = v_payout WHERE id = b.id;

RETURN game_state_json();
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_promo(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_uid uuid := auth.uid();
promo promo_codes;
BEGIN
IF v_uid IS NULL THEN
RAISE EXCEPTION '로그인이 필요합니다.';
END IF;

SELECT * INTO promo FROM promo_codes
WHERE code = upper(trim(p_code)) AND active;
IF NOT FOUND THEN
RAISE EXCEPTION '존재하지 않는 코드입니다.';
END IF;

INSERT INTO promo_redemptions (code, player_id)
VALUES (promo.code, v_uid)
ON CONFLICT DO NOTHING;

UPDATE game_players SET chips = chips + promo.chips WHERE id = v_uid;

RETURN game_state_json();
END;
$function$;

CREATE OR REPLACE FUNCTION public.game_bet_history()
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
WHERE b.player_id = auth.uid()
AND b.status IN ('cashed', 'lost')
ORDER BY r.seq DESC
LIMIT 200
) h;
$function$;

REVOKE EXECUTE ON FUNCTION public.game_state() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.game_state_json() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_bet(bigint, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cash_out() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_promo(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.game_bet_history() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.game_tick() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.game_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet(bigint, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_out() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.game_bet_history() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.refill_chips() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refill_chips(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cashout_crash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_crash_bet(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_crash_state() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crash_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crash_new_crash_point() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.game_new_crash_point() FROM PUBLIC, anon, authenticated;
