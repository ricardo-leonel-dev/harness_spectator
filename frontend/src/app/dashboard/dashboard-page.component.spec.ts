import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';

import { DashboardPageComponent } from './dashboard-page.component';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { LoginPageComponent } from '../auth/login-page.component';
import { authInterceptor } from '../core/auth.interceptor';
import { environment } from '../../environments/environment';

interface HarnessStatePayload {
  project: { slug: string; description: string };
  features: Array<{
    featureNumber: number;
    name: string;
    title: string;
    status: string;
    sdd: boolean;
  }>;
  openSession: {
    agent: string;
    feature: string;
    startedAt: string;
    nextStep: string | null;
  } | null;
  blockedFeatures: Array<{ name: string; note: string }>;
}

const SEEDED_STATE: HarnessStatePayload = {
  project: { slug: 'demo-project', description: 'demo' },
  features: [
    { featureNumber: 1, name: 'first', title: 'First', status: 'in_progress', sdd: true },
    { featureNumber: 2, name: 'second', title: 'Second', status: 'done', sdd: false },
  ],
  openSession: {
    agent: 'implementer',
    feature: 'first',
    startedAt: '2026-08-27T00:00:00Z',
    nextStep: 'T1 next',
  },
  blockedFeatures: [{ name: 'first', note: 'waiting on X' }],
};

describe('DashboardPageComponent', () => {
  let httpTesting: HttpTestingController;
  let signOutCalls: number;
  let holdSignOut: boolean;
  let releaseSignOut: (() => void) | null;

  function buildSupabaseStub(): unknown {
    const session: Session = {
      access_token: 'real-access-token',
      refresh_token: 'r',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'u1',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '',
      },
    } as unknown as Session;
    const listenerRef: { current: ((event: string, s: Session | null) => void) | null } = {
      current: null,
    };
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session }, error: null }),
        onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
          listenerRef.current = cb;
          cb('INITIAL_SESSION', session);
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
        signInWithPassword: () =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
        signOut: () => {
          signOutCalls += 1;
          const finish = (): { error: null } => {
            listenerRef.current?.('SIGNED_OUT', null);
            return { error: null };
          };
          if (!holdSignOut) return Promise.resolve(finish());
          return new Promise((resolve) => {
            releaseSignOut = () => resolve(finish());
          });
        },
      },
    };
  }

  beforeEach(async () => {
    signOutCalls = 0;
    holdSignOut = false;
    releaseSignOut = null;
    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideRouter([{ path: 'login', component: LoginPageComponent }]),
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: buildSupabaseStub() as unknown as Supabase },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function renderWith(state: HarnessStatePayload): HTMLElement {
    const auth = TestBed.inject(AuthService);
    void auth.init();
    flushMicrotasks();

    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixture.detectChanges();
    tick();

    httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/state`).flush(state);

    fixture.detectChanges();
    tick();
    return fixture.nativeElement as HTMLElement;
  }

  it('attaches the Supabase access token as Authorization: Bearer and renders the seeded data', fakeAsync(() => {
    const auth = TestBed.inject(AuthService);
    void auth.init();
    flushMicrotasks();

    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixture.detectChanges();
    tick();

    const req = httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/state`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer real-access-token');

    req.flush(SEEDED_STATE);

    fixture.detectChanges();
    tick();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('demo-project');
    expect(text).toContain('first');
    expect(text).toContain('Second');
    expect(text).toContain('in progress');
    expect(text).toContain('implementer');
    expect(text).toContain('waiting on X');
  }));

  function beaconKinds(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('[data-beacon]')).map(
      (el) => el.getAttribute('data-beacon') ?? '',
    );
  }

  it('titles every section and card with a mono uppercase instrument label; the blocked card reads "Blocked"', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);

    const titles = [
      host.querySelector('main h1') as HTMLElement,
      host.querySelector('app-open-session-card h2') as HTMLElement,
      host.querySelector('app-blocked-features-card h2') as HTMLElement,
    ];
    expect(titles.map((t) => t.textContent?.trim())).toEqual([
      'Features',
      'Open session',
      'Blocked',
    ]);
    for (const title of titles) {
      expect(title.className)
        .withContext(title.textContent ?? '')
        .toContain('font-mono');
      expect(title.className).toContain('text-label');
      expect(getComputedStyle(title).textTransform).toBe('uppercase');
      expect(getComputedStyle(title).fontFamily).toContain('IBM Plex Mono');
    }
  }));

  it('lists features as reference rows: padded id, mono name, truncated sans title, right-aligned track', fakeAsync(() => {
    const longTitle = 'A very long feature title '.repeat(20);
    const host = renderWith({
      ...SEEDED_STATE,
      features: [
        { featureNumber: 1, name: 'first', title: longTitle, status: 'in_progress', sdd: true },
        { featureNumber: 12, name: 'second', title: 'Second', status: 'done', sdd: false },
      ],
    });

    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('thead, th')).toBeNull();
    expect(host.textContent).not.toContain('SDD');

    const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-feature-row]'));
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.querySelector('[data-feature-id]')?.textContent?.trim())).toEqual([
      '01',
      '12',
    ]);

    const [row] = rows;
    expect(row.className).toContain('hover:bg-row-hover');

    const name = row.querySelector('[data-feature-name]') as HTMLElement;
    expect(name.textContent?.trim()).toBe('first');
    expect(name.className).toContain('font-mono');

    const title = row.querySelector('[data-feature-title]') as HTMLElement;
    expect(title.className).toContain('font-sans');
    expect(title.className).toContain('text-dim');
    const titleStyle = getComputedStyle(title);
    expect(titleStyle.textOverflow).toBe('ellipsis');
    expect(titleStyle.whiteSpace).toBe('nowrap');
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);

    const track = row.lastElementChild as HTMLElement;
    expect(track.tagName.toLowerCase()).toBe('app-lifecycle-track');
    expect(row.getBoundingClientRect().right - track.getBoundingClientRect().right).toBeLessThan(
      20,
    );
  }));

  it('keeps the empty state when there are no features', fakeAsync(() => {
    const host = renderWith({ ...SEEDED_STATE, features: [], openSession: null });
    expect(host.querySelectorAll('[data-feature-row]').length).toBe(0);
    expect(host.querySelector('[data-features-empty]')?.textContent).toContain(
      'scripts/harness.sh add-feature',
    );
  }));

  it('renders a human-readable, status-coloured lifecycle label for every status', fakeAsync(() => {
    const host = renderWith({
      ...SEEDED_STATE,
      openSession: null,
      blockedFeatures: [],
      features: [
        { featureNumber: 1, name: 'queued_one', title: 'Queued', status: 'pending', sdd: false },
        { featureNumber: 2, name: 'live_one', title: 'Live', status: 'in_progress', sdd: true },
        { featureNumber: 3, name: 'stuck_one', title: 'Stuck', status: 'blocked', sdd: false },
        { featureNumber: 4, name: 'shipped_one', title: 'Shipped', status: 'done', sdd: true },
        { featureNumber: 5, name: 'spec_one', title: 'Spec', status: 'spec_ready', sdd: true },
        { featureNumber: 6, name: 'odd_one', title: 'Odd', status: 'archived', sdd: false },
      ],
    });

    const labels = Array.from(host.querySelectorAll<HTMLElement>('[data-track-label]'));
    expect(labels.map((l) => l.textContent?.trim())).toEqual([
      'pending',
      'in progress',
      'blocked',
      'done',
      'spec ready',
      'archived',
    ]);
    expect(
      labels.map((l) =>
        Array.from(l.classList).find(
          (c) => c.startsWith('text-') && c !== 'text-right' && c !== 'text-micro',
        ),
      ),
    ).toEqual([
      'text-muted',
      'text-signal',
      'text-status-blocked',
      'text-status-done',
      'text-status-spec-ready',
      'text-muted',
    ]);
    expect(host.querySelector('[data-track-label]')?.closest('[data-feature-row]')).toBeTruthy();
  }));

  it('renders the open session as a $-prefixed terminal block with the caret inline after the next step', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const card = host.querySelector('app-open-session-card') as HTMLElement;
    const block = card.querySelector('[data-terminal]') as HTMLElement;

    expect(block.className).toContain('font-mono');
    expect(block.className).toContain('bg-ink');

    const lines = Array.from(block.querySelectorAll<HTMLElement>('[data-terminal-line]'));
    expect(lines.map((l) => l.querySelector('[data-key]')?.textContent?.trim())).toEqual([
      'agent',
      'feature',
      'started',
      'next',
    ]);
    expect(lines.map((l) => l.querySelector('[data-value]')?.textContent?.trim())).toEqual([
      'implementer',
      'first',
      '2026-08-27T00:00:00Z',
      'T1 next',
    ]);
    for (const line of lines) {
      const prompt = line.firstElementChild as HTMLElement;
      expect(prompt.textContent).toBe('$');
      expect(prompt.className).toContain('text-faint');
    }

    const carets = block.querySelectorAll('[data-caret]');
    expect(carets.length).toBe(1);
    const caret = carets[0] as HTMLElement;
    expect(caret.parentElement).toBe(lines[3]);
    expect(caret.previousElementSibling?.textContent?.trim()).toBe('T1 next');
    expect(caret.className).toContain('animate-caret');
    expect(caret.className).toContain('motion-reduce:animate-none');

    expect(block.querySelector('svg.lucide-clock')).toBeNull();
  }));

  it('renders the topbar: panel background, beacon + HARNESS wordmark, separator, slug, initial circle, log-out icon', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const header = host.querySelector('header') as HTMLElement;

    expect(header.className).toContain('bg-panel');
    expect(header.className).not.toContain('bg-panel-raised');

    const wordmark = header.querySelector('[data-wordmark]') as HTMLElement;
    expect(wordmark.querySelector('[data-beacon="wordmark"]')).toBeTruthy();
    const word = wordmark.lastElementChild as HTMLElement;
    expect(word.className).toContain('font-mono');
    expect(getComputedStyle(word).textTransform).toBe('uppercase');
    expect(word.textContent?.trim().toUpperCase()).toBe('HARNESS');

    expect(wordmark.nextElementSibling?.textContent?.trim()).toBe('·');
    const slug = header.querySelector('[data-project-slug]') as HTMLElement;
    expect(slug.textContent?.trim()).toBe('demo-project');
    expect(slug.className).toContain('font-mono');

    const indicator = header.querySelector('[data-agent-indicator]') as HTMLElement;
    expect(indicator.textContent?.trim()).toBe('1 agent active');

    const initial = header.querySelector('[data-user-initial]') as HTMLElement;
    expect(initial.textContent?.trim()).toBe('U');
    expect(initial.className).toContain('rounded-full');

    const logout = header.querySelector('[data-logout]') as HTMLButtonElement;
    expect(logout.textContent?.trim()).toBe('Log out');
    expect(logout.querySelector('svg.lucide-log-out')).toBeTruthy();
  }));

  it('places exactly four beacon kinds: login mark, wordmark, agent indicator (when active), in_progress node', fakeAsync(() => {
    const live = renderWith(SEEDED_STATE);
    expect(beaconKinds(live).sort()).toEqual(['agent', 'lifecycle', 'wordmark']);
    for (const ping of Array.from(live.querySelectorAll<HTMLElement>('[data-beacon-ping]'))) {
      expect(ping.className).toContain('motion-reduce:animate-none');
      expect(ping.className).toContain('motion-reduce:hidden');
    }

    const login = TestBed.createComponent(LoginPageComponent);
    login.detectChanges();
    expect(beaconKinds(login.nativeElement as HTMLElement)).toEqual(['login-mark']);

    const all = new Set([...beaconKinds(live), ...beaconKinds(login.nativeElement)]);
    expect(all.size).toBe(4);
  }));

  it('keeps only the wordmark beacon and an idle indicator when no session is open', fakeAsync(() => {
    const host = renderWith({
      ...SEEDED_STATE,
      openSession: null,
      features: [{ featureNumber: 2, name: 'second', title: 'Second', status: 'done', sdd: false }],
    });
    const indicator = host.querySelector('[data-agent-indicator]') as HTMLElement;

    expect(indicator.textContent?.trim()).toBe('idle');
    expect(indicator.className).toContain('text-faint');
    expect(beaconKinds(host)).toEqual(['wordmark']);
  }));

  it('renders blocked features with a left rule and no caret when nothing is running', fakeAsync(() => {
    const host = renderWith({ ...SEEDED_STATE, openSession: null });
    const card = host.querySelector('app-blocked-features-card') as HTMLElement;

    const items = Array.from(card.querySelectorAll('[data-blocked-item]'));
    expect(items.length).toBe(1);
    expect(items[0].className).toContain('border-l-2');
    expect(items[0].className).toContain('border-status-blocked');
    expect(items[0].textContent).toContain('waiting on X');

    expect(host.querySelector('app-open-session-card')?.textContent).toContain(
      'No agent session open.',
    );
    expect(host.querySelector('[data-caret]')).toBeNull();
  }));

  it('lays out a 1.7fr / 1fr grid on large screens and a single column below', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const grid = host.querySelector('[data-grid]') as HTMLElement;

    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-[1.7fr_1fr]');
    expect(grid.className).toContain('gap-4');
    expect(grid.className).toContain('lg:p-5');
    expect(getComputedStyle(grid).rowGap).toBe('16px');
    expect(host.querySelector('aside')?.className).toContain('gap-3.5');
  }));

  it('shows a redirecting overlay and a disabled "Logging out…" button until navigation completes', fakeAsync(() => {
    holdSignOut = true;
    const auth = TestBed.inject(AuthService);
    void auth.init();
    flushMicrotasks();
    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixture.detectChanges();
    tick();
    httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/state`).flush(SEEDED_STATE);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const logout = host.querySelector('[data-logout]') as HTMLButtonElement;
    expect(host.querySelector('[data-logout-overlay]')).toBeNull();

    logout.click();
    flushMicrotasks();
    fixture.detectChanges();

    const overlay = host.querySelector('[data-logout-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain('bg-ink/[0.88]');
    expect(getComputedStyle(overlay).position).toBe('fixed');
    expect(getComputedStyle(overlay).backgroundColor).toBe('rgba(10, 13, 18, 0.88)');
    const spinner = overlay.querySelector('[data-spinner]') as HTMLElement;
    expect(spinner.className).toContain('border-signal');
    expect(spinner.className).toContain('motion-reduce:animate-none');
    const message = overlay.querySelector('.font-mono') as HTMLElement;
    expect(message.textContent?.trim()).toBe('redirecting to sign in…');

    expect(logout.disabled).toBe(true);
    expect(logout.textContent?.trim()).toBe('Logging out…');
    logout.click();
    flushMicrotasks();
    expect(signOutCalls).toBe(1);
    expect(router.url).not.toBe('/login');

    releaseSignOut?.();
    flushMicrotasks();
    tick();

    expect(router.url).toBe('/login');
  }));

  it('signs out and returns to the login page', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const router = TestBed.inject(Router);

    const logoutButton = host.querySelector('[data-logout]') as HTMLButtonElement;
    logoutButton.click();
    flushMicrotasks();
    tick();

    expect(signOutCalls).toBe(1);
    expect(router.url).toBe('/login');
  }));

  it('surfaces an inline [ERR] banner when the backend returns a non-2xx response', fakeAsync(() => {
    const auth = TestBed.inject(AuthService);
    void auth.init();
    flushMicrotasks();

    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixture.detectChanges();
    tick();

    const req = httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/state`);
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    fixture.detectChanges();
    tick();

    const errorBanner = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('[ERR]');
    expect(errorBanner?.className).toContain('border-status-blocked/35');
    expect(getComputedStyle(errorBanner as HTMLElement).borderLeftWidth).toBe('1px');
  }));
});
