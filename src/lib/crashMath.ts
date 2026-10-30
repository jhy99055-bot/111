// Must match the growth rate used by the server (crash_tick / cashout_crash).
export const GROWTH_RATE = 0.08;

export function multiplierAt(seconds: number): number {
  return Math.exp(GROWTH_RATE * Math.max(0, seconds));
}

export function secondsAtMultiplier(multiplier: number): number {
  return Math.log(multiplier) / GROWTH_RATE;
}

export function floorTo2(value: number): number {
  return Math.floor(value * 100) / 100;
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatChips(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
