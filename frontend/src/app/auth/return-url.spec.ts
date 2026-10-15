import { DEFAULT_RETURN_URL, safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  const accept: Array<[string, string]> = [
    ['root with no extras', '/'],
    ['/projects/demo', '/projects/demo'],
    ['/projects/demo with query and fragment', '/projects/demo?x=1#log'],
    ['/loginx (a different path)', '/loginx'],
  ];

  for (const [label, raw] of accept) {
    it(`accepts ${label}`, () => {
      expect(safeReturnUrl(raw)).toBe(raw);
    });
  }

  const reject: Array<[string, string | null | undefined]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['absolute URL', 'https://evil.example'],
    ['protocol-relative', '//evil.example'],
    ['back-slash host', '/\\evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['missing leading slash', 'projects/demo'],
    ['plain /login', '/login'],
    ['/login with query', '/login?returnUrl=%2F'],
    ['/login with trailing slash', '/login/'],
  ];

  for (const [label, raw] of reject) {
    it(`rejects ${label} and falls back to ${DEFAULT_RETURN_URL}`, () => {
      expect(safeReturnUrl(raw)).toBe(DEFAULT_RETURN_URL);
    });
  }
});
