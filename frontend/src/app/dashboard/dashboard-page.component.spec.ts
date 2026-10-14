import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';

import { DashboardPageComponent, LAST_PROJECT_STORAGE_KEY } from './dashboard-page.component';
import { routes } from '../app.routes';
import { AuthService, LOCAL_SESSION_STORAGE_KEY } from '../auth/auth.service';
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

interface ProjectSummaryPayload {
  slug: string;
  description: string;
  counts: { total: number; done: number; inProgress: number; blocked: number };
}

const PROJECTS: ProjectSummaryPayload[] = [
  {
    slug: 'demo-project',
    description: 'demo',
    counts: { total: 2, done: 1, inProgress: 1, blocked: 0 },
  },
  {
    slug: 'other-project',
    description: 'second project',
    counts: { total: 4, done: 1, inProgress: 0, blocked: 2 },
  },
];

const PROJECTS_URL = `${environment.apiBaseUrl}/api/harness/projects`;
const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;

function stateUrl(slug: string): string {
  return `${environment.apiBaseUrl}/api/harness/projects/${slug}/state`;
}

const TEST_ROUTES: Routes = routes.map((r) => {
  if (r.path === 'login') return { path: 'login', component: LoginPageComponent };
  if (r.path === '' && r.loadComponent) {
    return { ...r, loadComponent: undefined, component: DashboardPageComponent };
  }
  return r;
});

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
  let supabaseFactoryCalls: number;

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
    supabaseFactoryCalls = 0;
    localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideRouter(TEST_ROUTES),
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: SUPABASE_CLIENT,
          useFactory: () => {
            supabaseFactoryCalls += 1;
            return buildSupabaseStub() as unknown as Supabase;
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
    localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  });

  function boot(url: string, mode: 'supabase' | 'local' = 'supabase'): RouterTestingHarness {
    const auth = TestBed.inject(AuthService);
    void auth.init();
    httpTesting.expectOne(MODE_URL).flush({ mode });
    flushMicrotasks();

    let harness: RouterTestingHarness | null = null;
    void RouterTestingHarness.create().then((h) => (harness = h));
    flushMicrotasks();
    void harness!.navigateByUrl(url);
    tick();
    harness!.detectChanges();
    return harness!;
  }

  function settle(harness: RouterTestingHarness): void {
    harness.detectChanges();
    tick();
    harness.detectChanges();
  }

  function renderWith(state: HarnessStatePayload): HTMLElement {
    const harness = boot('/projects/demo-project');
    httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
    httpTesting.expectOne(stateUrl('demo-project')).flush(state);
    settle(harness);
    return harness.routeNativeElement as HTMLElement;
  }

  it('attaches the Supabase access token as Authorization: Bearer and renders the seeded data', fakeAsync(() => {
    const harness = boot('/projects/demo-project');

    const list = httpTesting.expectOne(PROJECTS_URL);
    expect(list.request.method).toBe('GET');
    expect(list.request.headers.get('Authorization')).toBe('Bearer real-access-token');
    list.flush(PROJECTS);

    const req = httpTesting.expectOne(stateUrl('demo-project'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer real-access-token');

    req.flush(SEEDED_STATE);
    settle(harness);

    const text = harness.routeNativeElement!.textContent as string;
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
    const harness = boot('/projects/demo-project');
    httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
    httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
    settle(harness);
    const fixture = harness.fixture;

    const host = harness.routeNativeElement as HTMLElement;
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

  it('in local mode, uses the stored token and email and logs out without Supabase (R11, R13, R17)', fakeAsync(() => {
    localStorage.setItem(
      LOCAL_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'local-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        email: 'zoe@example.com',
      }),
    );
    const harness = boot('/projects/demo-project', 'local');
    const list = httpTesting.expectOne(PROJECTS_URL);
    expect(list.request.headers.get('Authorization')).toBe('Bearer local-token');
    list.flush(PROJECTS);
    const state = httpTesting.expectOne(stateUrl('demo-project'));
    expect(state.request.headers.get('Authorization')).toBe('Bearer local-token');
    state.flush(SEEDED_STATE);
    settle(harness);

    const host = harness.routeNativeElement as HTMLElement;
    expect(host.querySelector('[data-user-initial]')?.textContent?.trim()).toBe('Z');

    (host.querySelector('[data-logout]') as HTMLButtonElement).click();
    flushMicrotasks();
    tick();

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
    expect(signOutCalls).toBe(0);
    expect(supabaseFactoryCalls).toBe(0);
  }));

  it('surfaces an inline [ERR] banner when the backend returns a non-2xx response', fakeAsync(() => {
    const harness = boot('/projects/demo-project');
    httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
    const req = httpTesting.expectOne(stateUrl('demo-project'));
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    settle(harness);

    const errorBanner = harness.routeNativeElement!.querySelector(
      '[role="alert"]',
    ) as HTMLElement | null;
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('[ERR]');
    expect(errorBanner?.className).toContain('border-status-blocked/35');
    expect(getComputedStyle(errorBanner as HTMLElement).borderLeftWidth).toBe('1px');
  }));

  function overlay(): HTMLElement {
    return document.querySelector('.cdk-overlay-container') as HTMLElement;
  }

  function trigger(host: HTMLElement): HTMLButtonElement {
    return host.querySelector('[data-selector-trigger]') as HTMLButtonElement;
  }

  function key(target: Element, name: string, keyCode: number): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, keyCode, bubbles: true }));
  }

  describe('project selector', () => {
    it('turns the top-bar slug into a listbox trigger listing every project with its counts', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      const button = trigger(host);
      const header = host.querySelector('header') as HTMLElement;

      expect(header.contains(button)).toBe(true);
      expect(button.getAttribute('aria-haspopup')).toBe('listbox');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(overlay()?.querySelector('[data-selector-panel]') ?? null).toBeNull();

      button.click();
      settle(harness);

      expect(button.getAttribute('aria-expanded')).toBe('true');
      const list = overlay().querySelector('[data-selector-list]') as HTMLElement;
      expect(list.getAttribute('role')).toBe('listbox');
      const options = Array.from(list.querySelectorAll<HTMLElement>('[data-project-option]'));
      expect(options.map((o) => o.getAttribute('role'))).toEqual(['option', 'option']);
      expect(
        options.map((o) => o.querySelector('[data-option-slug]')?.textContent?.trim()),
      ).toEqual(['demo-project', 'other-project']);
      for (const o of options) {
        const slug = o.querySelector('[data-option-slug]') as HTMLElement;
        expect(slug.className).toContain('font-mono');
        expect(getComputedStyle(slug).fontFamily).toContain('IBM Plex Mono');
      }
      expect(
        options.map((o) => o.querySelector('[data-option-ratio]')?.textContent?.trim()),
      ).toEqual(['1/2 done', '1/4 done']);
      expect(options[0].querySelector('[data-option-flags]')?.textContent).toContain(
        '1 in progress',
      );
      expect(options[1].querySelector('[data-option-flags]')?.textContent).toContain('2 blocked');
      const bar = options[1].querySelector('[data-option-bar]') as HTMLElement;
      expect(Array.from(bar.children).map((c) => (c as HTMLElement).style.width)).toEqual([
        '25%',
        '0%',
        '50%',
      ]);
      expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    }));

    it('is fully keyboard operable: arrow opens, arrows move, Enter navigates, focus returns to the trigger', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      const button = trigger(host);

      button.focus();
      key(button, 'ArrowDown', 40);
      settle(harness);
      flushMicrotasks();
      settle(harness);

      const list = overlay().querySelector('[data-selector-list]') as HTMLElement;
      const options = Array.from(list.querySelectorAll<HTMLElement>('[data-project-option]'));
      expect(list.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(options[0]);

      key(document.activeElement as Element, 'ArrowDown', 40);
      settle(harness);
      expect(document.activeElement).toBe(options[1]);
      expect(options[1].classList).toContain('cdk-option-active');

      key(document.activeElement as Element, 'Enter', 13);
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/other-project');
      httpTesting.expectOne(stateUrl('other-project')).flush({
        ...SEEDED_STATE,
        project: { slug: 'other-project', description: '' },
        features: [
          { featureNumber: 7, name: 'seventh', title: 'Seventh', status: 'done', sdd: false },
        ],
        openSession: null,
      });
      settle(harness);

      expect(overlay().querySelector('[data-selector-panel]')).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(host.querySelector('[data-project-slug]')?.textContent?.trim()).toBe('other-project');
      expect(host.querySelector('[data-feature-name]')?.textContent?.trim()).toBe('seventh');
      expect(localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBe('other-project');
    }));

    it('closes on Escape, or on Enter over the current project, without navigating', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      const button = trigger(harness.routeNativeElement as HTMLElement);

      button.click();
      settle(harness);
      flushMicrotasks();
      key(document.activeElement as Element, 'Escape', 27);
      settle(harness);

      expect(overlay().querySelector('[data-selector-panel]')).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(TestBed.inject(Router).url).toBe('/projects/demo-project');

      button.click();
      settle(harness);
      flushMicrotasks();
      key(document.activeElement as Element, 'Enter', 13);
      settle(harness);
      expect(overlay().querySelector('[data-selector-panel]')).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(TestBed.inject(Router).url).toBe('/projects/demo-project');
    }));

    it('navigates between projects by clicking an option and shows an inline loading state meanwhile', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;

      trigger(host).click();
      settle(harness);
      (overlay().querySelector('[data-project-option="other-project"]') as HTMLElement).click();
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/other-project');
      const loading = host.querySelector('[data-state-loading]') as HTMLElement;
      expect(loading.getAttribute('role')).toBe('status');
      expect(loading.textContent).toContain('other-project');
      expect(host.querySelector('[data-feature-row]')).toBeNull();

      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
      expect(host.querySelector('[data-state-loading]')).toBeNull();
      expect(host.querySelectorAll('[data-feature-row]').length).toBe(2);
    }));
  });

  describe('default route', () => {
    it('redirects / to the first project when nothing is remembered', fakeAsync(() => {
      const harness = boot('/');
      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('[data-state-loading]')?.textContent).toContain('Loading projects');

      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/demo-project');
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      expect(localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBe('demo-project');
    }));

    it('redirects / to the last selected project from localStorage', fakeAsync(() => {
      localStorage.setItem(LAST_PROJECT_STORAGE_KEY, 'other-project');
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/other-project');
      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
    }));

    it('redirects an in-app navigation back to / once the dashboard is already loaded', fakeAsync(() => {
      const harness = boot('/projects/other-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
      const router = TestBed.inject(Router);

      void router.navigateByUrl('/');
      settle(harness);

      expect(router.url).toBe('/projects/other-project');
      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('[data-project-slug]')?.textContent?.trim()).toBe('other-project');
      expect(host.querySelectorAll('[data-feature-row]').length).toBe(2);
    }));

    it('falls back to the first project when the remembered one no longer exists', fakeAsync(() => {
      localStorage.setItem(LAST_PROJECT_STORAGE_KEY, 'gone-project');
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/demo-project');
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
    }));

    it('shows an inline empty state when the mirror has no projects', fakeAsync(() => {
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush([]);
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;

      expect(TestBed.inject(Router).url).toBe('/');
      expect(host.querySelector('[data-no-projects]')?.textContent).toContain('No projects');

      trigger(host).click();
      settle(harness);
      expect(overlay().querySelector('[data-selector-empty]')).toBeTruthy();
    }));

    it('surfaces a project-list failure inline on the page and inside the selector', fakeAsync(() => {
      const harness = boot('/');
      httpTesting
        .expectOne(PROJECTS_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;

      expect(TestBed.inject(Router).url).toBe('/');
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('[ERR]');
      expect(host.querySelector('app-features-table')).toBeNull();
      expect(host.querySelector('aside')).toBeNull();
      expect(host.textContent).not.toContain('Nothing queued yet');
      expect(host.textContent).not.toContain('No agent session open.');
      expect(host.textContent).not.toContain('Nothing blocked.');

      trigger(host).click();
      settle(harness);
      const panelError = overlay().querySelector('[data-selector-error]') as HTMLElement;
      expect(panelError.getAttribute('role')).toBe('alert');
      expect(panelError.textContent).toContain('Could not load projects');
      const message = panelError.lastElementChild as HTMLElement;
      expect(message.className).toContain('min-w-0');
      expect(getComputedStyle(message).overflowWrap).toBe('break-word');
    }));
  });

  describe('unknown project', () => {
    it('shows an inline 404 with a way back to the selector, and does not remember the slug', fakeAsync(() => {
      const harness = boot('/projects/nope');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting
        .expectOne(stateUrl('nope'))
        .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;

      const banner = host.querySelector('[data-not-found]') as HTMLElement;
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.textContent).toContain('nope');
      expect(host.querySelector('app-features-table')).toBeNull();
      expect(host.querySelector('aside')).toBeNull();
      expect(localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBeNull();

      (banner.querySelector('[data-choose-project]') as HTMLButtonElement).click();
      settle(harness);
      flushMicrotasks();
      settle(harness);

      const list = overlay().querySelector('[data-selector-list]') as HTMLElement;
      expect(list).toBeTruthy();
      expect(list.contains(document.activeElement)).toBe(true);

      (list.querySelector('[data-project-option="demo-project"]') as HTMLElement).click();
      settle(harness);
      expect(TestBed.inject(Router).url).toBe('/projects/demo-project');
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      expect(host.querySelector('[data-not-found]')).toBeNull();
      expect(host.querySelectorAll('[data-feature-row]').length).toBe(2);
    }));
  });

  describe('phone width', () => {
    function mountAt360(nodes: HTMLElement[]): { doc: Document; remove: () => void } {
      const css = Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join('\n');
          } catch {
            return '';
          }
        })
        .join('\n');
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:360px;height:900px;border:0;position:absolute;left:0;top:0;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument as Document;
      doc.open();
      doc.write('<!doctype html><html><head><style></style></head><body></body></html>');
      doc.close();
      (doc.head.querySelector('style') as HTMLStyleElement).textContent = css;
      for (const node of nodes) doc.body.appendChild(doc.importNode(node, true));
      return { doc, remove: () => iframe.remove() };
    }

    it('renders the dashboard at 360px with no horizontal scroll', fakeAsync(() => {
      const slug = 'a-rather-long-harness-project-slug';
      const harness = boot(`/projects/${slug}`);
      httpTesting
        .expectOne(PROJECTS_URL)
        .flush([
          ...PROJECTS,
          { ...PROJECTS[1], slug, description: 'A long description '.repeat(10) },
        ]);
      httpTesting.expectOne(stateUrl(slug)).flush({
        ...SEEDED_STATE,
        features: [
          {
            featureNumber: 12,
            name: 'an_extremely_long_feature_identifier_name',
            title: 'A long feature title that keeps going '.repeat(5),
            status: 'in_progress',
            sdd: true,
          },
        ],
        openSession: {
          agent: 'leader -> implementer (Some Long Model Name)',
          feature: 'an_extremely_long_feature_identifier_name',
          startedAt: '2026-08-27T00:00:00Z',
          nextStep: 'a-very-long-unbroken-next-step-token-'.repeat(4),
        },
        blockedFeatures: [{ name: 'blocked_feature', note: 'waiting on '.repeat(20) }],
      });
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      const { doc, remove } = mountAt360([host]);
      try {
        expect(doc.documentElement.clientWidth).toBe(360);
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(360);

        const header = doc.querySelector('header') as HTMLElement;
        expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
        for (const el of Array.from(header.querySelectorAll<HTMLElement>('*'))) {
          if (el.closest('.sr-only')) continue;
          expect(el.getBoundingClientRect().right)
            .withContext(el.outerHTML.slice(0, 80))
            .toBeLessThanOrEqual(360);
        }
        const slugEl = header.querySelector('[data-project-slug]') as HTMLElement;
        expect(slugEl.getBoundingClientRect().width).toBeGreaterThan(40);

        for (const row of Array.from(doc.querySelectorAll<HTMLElement>('[data-feature-row]'))) {
          expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
          const track = row.querySelector('app-lifecycle-track') as HTMLElement;
          expect(track.getBoundingClientRect().right).toBeLessThanOrEqual(360);
        }
      } finally {
        remove();
      }
    }));
  });
});
