import { CHART_COLORS, USAGE_CHART_COLORS, formatPercent } from './progress-format';

describe('formatPercent', () => {
  it('returns exactly two decimals for a whole number', () => {
    expect(formatPercent(100)).toBe('100.00');
  });

  it('returns exactly two decimals for a 1-decimal number', () => {
    expect(formatPercent(87.5)).toBe('87.50');
  });

  it('preserves the backend-supplied 2-decimal number', () => {
    expect(formatPercent(59.62)).toBe('59.62');
  });

  it('returns "0.00" for zero', () => {
    expect(formatPercent(0)).toBe('0.00');
  });
});

describe('CHART_COLORS', () => {
  it('pins every chart color to the matching Tailwind token', () => {
    expect(CHART_COLORS.pending).toBe('#46505f');
    expect(CHART_COLORS.specDrafting).toBe('#4fa3e0');
    expect(CHART_COLORS.specReady).toBe('#8b7fe8');
    expect(CHART_COLORS.inProgress).toBe('#e8a33d');
    expect(CHART_COLORS.blocked).toBe('#e5484d');
    expect(CHART_COLORS.done).toBe('#3ecf8e');
    expect(CHART_COLORS.remaining).toBe('#3a4452');
  });

  it('matches the Tailwind status.spec-drafting token at runtime (R38)', () => {
    const probe = document.createElement('div');
    probe.className = 'bg-status-spec-drafting';
    document.body.appendChild(probe);
    try {
      const computed = getComputedStyle(probe).backgroundColor;
      const [r, g, b] = (CHART_COLORS.specDrafting.match(/[0-9a-f]{2}/g) ?? []).map((h) =>
        parseInt(h, 16),
      );
      expect(computed).toBe(`rgb(${r}, ${g}, ${b})`);
    } finally {
      probe.remove();
    }
  });
});

describe('USAGE_CHART_COLORS', () => {
  it('pins ranking to the signal token and model to the dim token', () => {
    expect(USAGE_CHART_COLORS.ranking).toBe('#e8a33d');
    expect(USAGE_CHART_COLORS.model).toBe('#8b95a5');
  });

  it('matches the Tailwind signal and dim tokens at runtime', () => {
    for (const [token, expected] of [
      ['bg-signal', USAGE_CHART_COLORS.ranking],
      ['bg-dim', USAGE_CHART_COLORS.model],
    ] as const) {
      const probe = document.createElement('div');
      probe.className = token;
      document.body.appendChild(probe);
      try {
        const computed = getComputedStyle(probe).backgroundColor;
        const [r, g, b] = (expected.match(/[0-9a-f]{2}/g) ?? []).map((h) => parseInt(h, 16));
        expect(computed).toBe(`rgb(${r}, ${g}, ${b})`);
      } finally {
        probe.remove();
      }
    }
  });
});
