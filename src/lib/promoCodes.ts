export const PROMO_CODES: Record<string, number> = {
  '1000': 1000,
};

const REDEEMED_KEY = 'moonshot.redeemedCodes';

export type PromoResult = { ok: true; amount: number } | { ok: false; message: string };

function loadRedeemed(): string[] {
  try {
    const raw = window.localStorage.getItem(REDEEMED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function redeemPromoCode(input: string): PromoResult {
  const code = input.trim().toUpperCase();
  if (!code) return { ok: false, message: '코드를 입력해 주세요.' };

  const amount = PROMO_CODES[code];
  if (amount === undefined) return { ok: false, message: '존재하지 않는 코드입니다.' };

  const redeemed = loadRedeemed();
  if (redeemed.includes(code)) return { ok: false, message: '이미 사용한 코드입니다.' };

  try {
    window.localStorage.setItem(REDEEMED_KEY, JSON.stringify([...redeemed, code]));
  } catch {
    return { ok: false, message: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  return { ok: true, amount };
}
