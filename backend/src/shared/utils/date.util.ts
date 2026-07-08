const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;

export function parseDurationToSeconds(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration string: ${duration}`);
  }

  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNIT_SECONDS[unit];
}
