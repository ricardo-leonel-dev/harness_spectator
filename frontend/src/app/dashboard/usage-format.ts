const UNITS = [
  { size: 1_000_000_000, suffix: 'B' },
  { size: 1_000_000, suffix: 'M' },
  { size: 1_000, suffix: 'k' },
] as const;

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  let i = UNITS.findIndex((u) => n >= u.size);
  if (i < 0) i = UNITS.length - 1;
  let tenths = Math.round((n * 10) / UNITS[i].size);
  if (tenths >= 10_000 && i > 0) {
    i -= 1;
    tenths = Math.round((n * 10) / UNITS[i].size);
  }
  const whole = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return whole + UNITS[i].suffix;
}

export function formatExactTokens(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDuration(seconds: number): string {
  const r = Math.round(seconds);
  if (seconds > 0 && r === 0) return '<1s';
  if (r < 60) return `${r}s`;
  if (r < 3600) {
    const m = Math.floor(r / 60);
    const s = r % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatExactSeconds(seconds: number): string {
  return `${seconds} s`;
}
