import {
  formatDuration,
  formatExactSeconds,
  formatExactTokens,
  formatTokens,
} from './usage-format';

describe('formatTokens', () => {
  const cases: Array<[number, string]> = [
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1150, '1.2k'],
    [1234, '1.2k'],
    [999949, '999.9k'],
    [999950, '1M'],
    [1234567, '1.2M'],
    [2500000000, '2.5B'],
    [1500000000000, '1500B'],
  ];

  for (const [input, expected] of cases) {
    it(`formats ${input} as ${expected}`, () => {
      expect(formatTokens(input)).toBe(expected);
    });
  }
});

describe('formatExactTokens', () => {
  const cases: Array<[number, string]> = [
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [1234, '1,234'],
    [1234567, '1,234,567'],
    [2500000000, '2,500,000,000'],
  ];

  for (const [input, expected] of cases) {
    it(`formats ${input} as ${expected}`, () => {
      expect(formatExactTokens(input)).toBe(expected);
    });
  }
});

describe('formatDuration', () => {
  const cases: Array<[number, string]> = [
    [0, '0s'],
    [0.4, '<1s'],
    [0.5, '1s'],
    [42.4, '42s'],
    [59.5, '1m 00s'],
    [245.3, '4m 05s'],
    [3599.4, '59m 59s'],
    [3725, '1h 02m'],
    [90061, '25h 01m'],
  ];

  for (const [input, expected] of cases) {
    it(`formats ${input}s as ${expected}`, () => {
      expect(formatDuration(input)).toBe(expected);
    });
  }
});

describe('formatExactSeconds', () => {
  it('appends the unit to raw seconds', () => {
    expect(formatExactSeconds(245.317)).toBe('245.317 s');
    expect(formatExactSeconds(100)).toBe('100 s');
    expect(formatExactSeconds(0)).toBe('0 s');
  });
});
