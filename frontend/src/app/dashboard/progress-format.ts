export function formatPercent(value: number): string {
  return value.toFixed(2);
}

export const CHART_COLORS = {
  pending: '#46505f',
  specDrafting: '#4fa3e0',
  specReady: '#8b7fe8',
  inProgress: '#e8a33d',
  blocked: '#e5484d',
  done: '#3ecf8e',
  remaining: '#3a4452',
} as const;

export const USAGE_CHART_COLORS = {
  ranking: '#e8a33d',
  model: '#8b95a5',
} as const;
