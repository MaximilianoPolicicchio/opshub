/**
 * Minimal duration parser for strings like "15m", "30d", "1h", "500ms".
 * Avoids pulling in the `ms` package as an extra dependency.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export default function ms(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration string: "${input}"`);
  const [, value, unit] = match;
  return Math.round(parseFloat(value) * UNIT_MS[unit]);
}
