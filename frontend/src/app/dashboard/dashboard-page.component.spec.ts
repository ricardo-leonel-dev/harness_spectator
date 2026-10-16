import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Session } from '@supabase/supabase-js';

import { DashboardPageComponent } from './dashboard-page.component';
import { routes } from '../app.routes';
import { AuthService, LOCAL_SESSION_STORAGE_KEY } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { LoginPageComponent } from '../auth/login-page.component';
import { authInterceptor } from '../core/auth.interceptor';
import {
  AgentRunNode,
  AgentUsageResponse,
  DashboardResponse,
  FeatureLogResponse,
} from '../core/harness-api.service';
import { environment } from '../../environments/environment';

type AgentRunNodeFromUsage = AgentRunNode;

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
const DASHBOARD_URL = `${environment.apiBaseUrl}/api/harness/dashboard`;
const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;

function dashboardResponse(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    overall: {
      done: 31,
      total: 52,
      percentage: 59.62,
      byStatus: {
        pending: 12,
        specDrafting: 1,
        specReady: 2,
        inProgress: 3,
        blocked: 3,
        done: 31,
      },
    },
    topProjects: [{ slug: 'spectator_backend', done: 7, total: 8, percentage: 87.5 }],
    ...overrides,
  };
}

function stateUrl(slug: string): string {
  return `${environment.apiBaseUrl}/api/harness/projects/${slug}/state`;
}

function logUrl(slug: string, name: string): string {
  return `${environment.apiBaseUrl}/api/harness/projects/${slug}/features/${name}/log`;
}

function usageUrl(slug: string, name: string): string {
  return `${environment.apiBaseUrl}/api/harness/projects/${slug}/features/${name}/agent-usage`;
}

function emptyUsage(): AgentUsageResponse {
  return {
    runs: [],
    totals: {
      effortSeconds: 0,
      unionSeconds: 0,
      tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
    },
  };
}

function usageTreeWithRole(opts: {
  roleBase: string;
  labelBase: string;
  modelBase: string;
  externalIdBase: string;
}): AgentUsageResponse {
  const makeChildren = (
    level: number,
    parent: string | null,
    start: number,
    end: number,
  ): AgentRunNodeFromUsage => {
    const id = `${opts.externalIdBase}-${level}`;
    const node: AgentRunNodeFromUsage = {
      externalId: id,
      parentExternalId: parent,
      runtime: 'claude',
      role: `${opts.roleBase}-level-${level}`,
      label: `${opts.labelBase}-label-${level}`,
      model: `${opts.modelBase}-model-${level}`,
      spawnDepth: level,
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(end).toISOString(),
      durationSeconds: (end - start) / 1000,
      tokens: {
        input: 100,
        cacheRead: 0,
        cacheWrite: 0,
        output: 50,
        reasoning: null,
        total: 150,
      },
      children: [],
    };
    if (level < 3) {
      node.children.push(makeChildren(level + 1, id, start + 1000, end - 1000));
    }
    return node;
  };
  return {
    runs: [
      makeChildren(
        0,
        null,
        Date.parse('2026-01-01T00:00:00+00:00'),
        Date.parse('2026-01-01T00:01:00+00:00'),
      ),
    ],
    totals: {
      effortSeconds: 60,
      unionSeconds: 60,
      tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 50, reasoning: 0, total: 150 },
    },
  };
}

function featureLog(
  name: string,
  overrides: Partial<FeatureLogResponse['feature']> = {},
): FeatureLogResponse {
  return {
    feature: {
      featureNumber: 2,
      name,
      title: 'Second',
      status: 'done',
      sdd: false,
      description: null,
      acceptance: [],
      ...overrides,
    },
    sessions: [
      {
        localId: 4,
        agent: 'implementer',
        startedAt: '2026-08-27T00:00:00Z',
        closedAt: '2026-08-27T01:00:00Z',
        pausedAt: null,
        plan: ['T1'],
        nextStep: null,
        changes: ['src/a.ts'],
        verification: 'green',
        closure: 'done',
        entries: [{ entry: 'did T1', createdAt: '2026-08-27T00:30:00Z' }],
      },
    ],
  };
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
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideRouter(TEST_ROUTES),
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
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
    expect(wordmark.tagName).toBe('A');
    expect(wordmark.getAttribute('href')).toBe('/');
    expect(wordmark.getAttribute('aria-label')).toBe('Overview');
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
    expect(getComputedStyle(grid).rowGap).toBe('16px');
    expect(host.querySelector('aside')?.className).toContain('gap-3.5');
  }));

  describe('overview at /', () => {
    it('renders the progress overview inside main when the URL is / (R3, R4)', fakeAsync(() => {
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(DASHBOARD_URL).flush(dashboardResponse());
      settle(harness);
      harness.detectChanges();
      tick();
      const host = harness.routeNativeElement as HTMLElement;
      const overview = host.querySelector('app-progress-overview') as HTMLElement;
      const main = host.querySelector('main') as HTMLElement;
      expect(overview).toBeTruthy('progress overview should be rendered at /');
      expect(main).toBeTruthy('main element should exist');
      expect(main.contains(overview)).toBe(true, 'main should contain the progress overview');
      expect(main.className ?? '').not.toContain('lg:grid-cols-[1.7fr_1fr]');
      expect(TestBed.inject(Router).url).toBe('/');
      httpTesting.expectNone(stateUrl('demo-project'));
    }));

    it('does not render the project table, aside, loading or empty "no projects" copy at / (R5)', fakeAsync(() => {
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(DASHBOARD_URL).flush(dashboardResponse());
      settle(harness);

      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('app-features-table')).toBeNull();
      expect(host.querySelector('aside')).toBeNull();
      expect(host.querySelector('[data-state-loading]')).toBeNull();
      expect(host.textContent).not.toContain('No projects in the mirror yet');
      expect(host.textContent).not.toContain('Loading projects');
    }));

    it('shows the project-list failure only inside the selector at /, with no page-level [ERR] (R6)', fakeAsync(() => {
      const harness = boot('/');
      httpTesting
        .expectOne(PROJECTS_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      httpTesting.expectOne(DASHBOARD_URL).flush(dashboardResponse());
      settle(harness);

      const host = harness.routeNativeElement as HTMLElement;
      const pageAlerts = Array.from(host.querySelectorAll('main [role="alert"]'));
      expect(pageAlerts).toEqual([]);
      trigger(host).click();
      settle(harness);
      const panelError = overlay().querySelector('[data-selector-error]') as HTMLElement;
      expect(panelError.getAttribute('role')).toBe('alert');
      expect(panelError.textContent).toContain('Could not load projects');
    }));

    it('does not render the overview or send /api/harness/dashboard on /projects/:slug (R7, R8)', fakeAsync(() => {
      const host = renderWith(SEEDED_STATE);
      expect(host.querySelector('app-progress-overview')).toBeNull();
      httpTesting.expectNone(DASHBOARD_URL);
    }));

    it('renders the top-bar wordmark as a link to / with the accessible name "Overview" (R10)', fakeAsync(() => {
      const host = renderWith(SEEDED_STATE);
      const wordmark = host.querySelector('a[data-wordmark]') as HTMLAnchorElement;
      expect(wordmark).toBeTruthy();
      expect(wordmark.getAttribute('href')).toBe('/');
      expect(wordmark.getAttribute('aria-label')).toBe('Overview');
      expect(host.querySelector('div[data-wordmark]')).toBeNull();
    }));

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

    it('renders a populated progress overview at 360px with no horizontal scroll (R40)', fakeAsync(() => {
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush([
        ...PROJECTS,
        {
          slug: 'spectator_long_project_slug_for_360',
          description: 'A long description '.repeat(10),
          counts: { total: 12, done: 4, inProgress: 3, blocked: 2 },
        },
      ]);
      httpTesting.expectOne(DASHBOARD_URL).flush(
        dashboardResponse({
          topProjects: [
            {
              slug: 'spectator_long_project_slug_for_360',
              done: 4,
              total: 12,
              percentage: 33.33,
            },
            { slug: 'demo-project', done: 7, total: 8, percentage: 87.5 },
            { slug: 'other-project', done: 1, total: 4, percentage: 25 },
          ],
        }),
      );
      settle(harness);

      const host = harness.routeNativeElement as HTMLElement;
      const overview = host.querySelector('app-progress-overview') as HTMLElement;
      expect(overview).toBeTruthy();
      const { doc, remove } = mountAt360([host]);
      try {
        expect(doc.documentElement.clientWidth).toBe(360);
        // The chart wrappers set their own internal width via ngx-charts's ResizeObserver;
        // what matters to the user is the page-level horizontal scroll, not the SVG's
        // default view (which overflows its wrapper but is clipped by overflow-hidden).
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(360);
      } finally {
        remove();
      }
    }));
  });

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
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
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
    it('renders the progress overview at / and never redirects to /projects/:slug', fakeAsync(() => {
      const harness = boot('/');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(DASHBOARD_URL).flush(dashboardResponse());
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/');
      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('app-progress-overview')).toBeTruthy();
      httpTesting.expectNone(stateUrl('demo-project'));
    }));

    it('navigating from / back to / after viewing a project does not re-trigger the state fetch', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      const router = TestBed.inject(Router);

      void router.navigateByUrl('/');
      settle(harness);

      expect(router.url).toBe('/');
      httpTesting.expectOne(DASHBOARD_URL).flush(dashboardResponse());
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('app-progress-overview')).toBeTruthy();
      httpTesting.expectNone(stateUrl('demo-project'));
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

  describe('process log', () => {
    function openWithFeature(feature: string | null): RouterTestingHarness {
      const harness = boot(`/projects/demo-project${feature ? `?feature=${feature}` : ''}`);
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      return harness;
    }

    function row(host: HTMLElement, name: string): HTMLElement {
      return Array.from(host.querySelectorAll<HTMLElement>('[data-feature-row]')).find(
        (r) => r.querySelector('[data-feature-name]')?.textContent?.trim() === name,
      ) as HTMLElement;
    }

    function card(host: HTMLElement): HTMLElement {
      return host.querySelector('app-process-log-card') as HTMLElement;
    }

    function stubMedia(wide: boolean, reduce: boolean): void {
      spyOn(window, 'matchMedia').and.callFake(
        (query: string) =>
          ({ matches: query.includes('reduce') ? reduce : wide, media: query }) as MediaQueryList,
      );
    }

    it('selecting a row writes ?feature= with replaceUrl, and activating it again clears it', fakeAsync(() => {
      stubMedia(true, false);
      const harness = openWithFeature(null);
      const host = harness.routeNativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate').and.callThrough();

      row(host, 'second').click();
      settle(harness);
      expect(navigate).toHaveBeenCalledWith(['/projects', 'demo-project'], {
        queryParams: { feature: 'second' },
        replaceUrl: true,
      });
      expect(router.url).toBe('/projects/demo-project?feature=second');
      httpTesting.expectOne(logUrl('demo-project', 'second')).flush(featureLog('second'));
      httpTesting.expectOne(usageUrl('demo-project', 'second')).flush(emptyUsage());
      settle(harness);
      expect(row(host, 'second').getAttribute('aria-pressed')).toBe('true');

      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      row(host, 'second').dispatchEvent(enter);
      settle(harness);
      expect(navigate).toHaveBeenCalledWith(['/projects', 'demo-project'], {
        queryParams: {},
        replaceUrl: true,
      });
      expect(router.url).toBe('/projects/demo-project');
      expect(row(host, 'second').getAttribute('aria-pressed')).toBe('false');
      expect(card(host).textContent).toContain('Select a feature to see its process log.');
    }));

    it('restores the selection from the URL on load and requests the log once', fakeAsync(() => {
      const harness = openWithFeature('second');
      const host = harness.routeNativeElement as HTMLElement;
      const requests = httpTesting.match(logUrl('demo-project', 'second'));
      expect(requests.length).toBe(1);
      expect(requests[0].request.headers.get('Authorization')).toBe('Bearer real-access-token');
      expect(card(host).querySelector('[role="status"]')?.textContent).toContain('second');
      requests[0].flush(featureLog('second'));
      httpTesting.expectOne(usageUrl('demo-project', 'second')).flush(emptyUsage());
      settle(harness);

      expect(row(host, 'second').getAttribute('aria-pressed')).toBe('true');
      expect(row(host, 'second').classList).toContain('border-signal');
      expect(row(host, 'first').getAttribute('aria-pressed')).toBe('false');
      expect(card(host).querySelector('[data-log-feature-name]')?.textContent?.trim()).toBe(
        'second',
      );
      expect(card(host).textContent).toContain('did T1');
      httpTesting.expectNone(logUrl('demo-project', 'second'));
    }));

    it('does not refetch state when only the feature changes, and cancels the previous log request', fakeAsync(() => {
      stubMedia(true, false);
      const harness = openWithFeature('first');
      const host = harness.routeNativeElement as HTMLElement;
      const pending = httpTesting.expectOne(logUrl('demo-project', 'first'));
      const pendingUsage = httpTesting.expectOne(usageUrl('demo-project', 'first'));

      row(host, 'second').click();
      settle(harness);

      expect(pending.cancelled).toBeTrue();
      expect(pendingUsage.cancelled).toBeTrue();
      httpTesting.expectNone(stateUrl('demo-project'));
      httpTesting.expectOne(logUrl('demo-project', 'second')).flush(featureLog('second'));
      httpTesting.expectOne(usageUrl('demo-project', 'second')).flush(emptyUsage());
      settle(harness);
      expect(card(host).querySelector('[data-log-feature-name]')?.textContent?.trim()).toBe(
        'second',
      );
      expect(host.querySelectorAll('[data-feature-row]').length).toBe(2);
    }));

    it('switching project drops the feature query param and cancels the pending log request', fakeAsync(() => {
      const harness = openWithFeature('first');
      const host = harness.routeNativeElement as HTMLElement;
      const pending = httpTesting.expectOne(logUrl('demo-project', 'first'));
      const pendingUsage = httpTesting.expectOne(usageUrl('demo-project', 'first'));

      trigger(host).click();
      settle(harness);
      (overlay().querySelector('[data-project-option="other-project"]') as HTMLElement).click();
      settle(harness);

      expect(TestBed.inject(Router).url).toBe('/projects/other-project');
      expect(pending.cancelled).toBeTrue();
      expect(pendingUsage.cancelled).toBeTrue();
      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
      httpTesting.expectNone((req) => req.url.includes('/features/'));
      expect(card(host).textContent).toContain('Select a feature to see its process log.');
      expect(
        Array.from(host.querySelectorAll('[data-feature-row]')).map((r) =>
          r.getAttribute('aria-pressed'),
        ),
      ).toEqual(['false', 'false']);
    }));

    it('places the process log card after the blocked card in the aside', fakeAsync(() => {
      const host = renderWith(SEEDED_STATE);
      const aside = host.querySelector('aside') as HTMLElement;
      const last = aside.lastElementChild as HTMLElement;
      expect(last.tagName.toLowerCase()).toBe('app-process-log-card');
      expect(last.previousElementSibling?.tagName.toLowerCase()).toBe('app-blocked-features-card');
      const title = last.querySelector('h2') as HTMLElement;
      expect(title.textContent?.trim()).toBe('Process log');
      expect(title.classList).toContain('font-mono');
      expect(title.classList).toContain('text-label');
      expect(title.classList).toContain('uppercase');
      expect(getComputedStyle(title).textTransform).toBe('uppercase');
      expect(getComputedStyle(title).fontFamily).toContain('IBM Plex Mono');
    }));

    it('requests the agent usage once for the selected feature and none without a selection (R3, R4, R6)', fakeAsync(() => {
      const harness = boot('/projects/demo-project');
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush(SEEDED_STATE);
      settle(harness);
      httpTesting.expectNone(usageUrl('demo-project', 'second'));
      httpTesting.expectNone(usageUrl('demo-project', 'first'));

      const host = harness.routeNativeElement as HTMLElement;
      row(host, 'second').click();
      settle(harness);
      const logReq = httpTesting.expectOne(logUrl('demo-project', 'second'));
      const usageReq = httpTesting.expectOne(usageUrl('demo-project', 'second'));
      logReq.flush(featureLog('second'));
      usageReq.flush(emptyUsage());
      settle(harness);
      httpTesting.expectNone(usageUrl('demo-project', 'second'));
    }));

    it('cancels the in-flight usage request when the feature or project changes (R5)', fakeAsync(() => {
      stubMedia(true, false);
      const harness = openWithFeature('first');
      const host = harness.routeNativeElement as HTMLElement;
      const pending = httpTesting.expectOne(usageUrl('demo-project', 'first'));
      httpTesting.expectOne(logUrl('demo-project', 'first'));

      row(host, 'second').click();
      settle(harness);
      expect(pending.cancelled).toBeTrue();
      const logSecond = httpTesting.expectOne(logUrl('demo-project', 'second'));
      const usageSecond = httpTesting.expectOne(usageUrl('demo-project', 'second'));
      logSecond.flush(featureLog('second'));
      usageSecond.flush(emptyUsage());
      settle(harness);

      trigger(host).click();
      settle(harness);
      (overlay().querySelector('[data-project-option="other-project"]') as HTMLElement).click();
      settle(harness);
      httpTesting.expectOne(stateUrl('other-project')).flush(SEEDED_STATE);
      settle(harness);
      httpTesting.expectNone((req) => req.url.includes('agent-usage'));
      httpTesting.expectNone((req) => req.url.includes('features/'));
    }));

    it('keeps rendering the sessions when the agent usage request fails (R7, R12)', fakeAsync(() => {
      stubMedia(true, false);
      const harness = openWithFeature('second');
      const host = harness.routeNativeElement as HTMLElement;
      httpTesting.expectOne(logUrl('demo-project', 'second')).flush(featureLog('second'));
      httpTesting
        .expectOne(usageUrl('demo-project', 'second'))
        .flush({ error: 'internal error' }, { status: 500, statusText: 'Internal Server Error' });
      settle(harness);

      const cardEl = card(host) as HTMLElement;
      expect(cardEl.querySelector('[role="alert"]')?.textContent).toContain('[ERR]');
      expect(cardEl.querySelector('[data-log-session]')).toBeTruthy();
      expect(cardEl.textContent).toContain('did T1');
    }));

    it('shows the not-found message for a 404 and [ERR] for a 500 inside the card', fakeAsync(() => {
      stubMedia(true, false);
      const harness = openWithFeature('ghost');
      const host = harness.routeNativeElement as HTMLElement;
      httpTesting
        .expectOne(logUrl('demo-project', 'ghost'))
        .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
      httpTesting.expectOne(usageUrl('demo-project', 'ghost')).flush(emptyUsage());
      settle(harness);

      let alert = card(host).querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('[404]');
      expect(alert.textContent?.replace(/\s+/g, ' ')).toContain(
        'No feature named ghost in demo-project.',
      );
      expect(host.querySelector('[data-not-found]')).toBeNull();

      row(host, 'first').click();
      settle(harness);
      httpTesting
        .expectOne(logUrl('demo-project', 'first'))
        .flush({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
      httpTesting.expectOne(usageUrl('demo-project', 'first')).flush(emptyUsage());
      settle(harness);

      alert = card(host).querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('[ERR]');
      expect(alert.textContent).toContain('500 Internal Server Error');
      expect(alert.textContent).not.toContain('[404]');
      expect(TestBed.inject(Router).url).toBe('/projects/demo-project?feature=first');
    }));

    it('scrolls the card into view on narrow viewports, honouring reduced motion', fakeAsync(() => {
      const harness = openWithFeature(null);
      const host = harness.routeNativeElement as HTMLElement;
      const scroll = spyOn(card(host), 'scrollIntoView');
      const media = spyOn(window, 'matchMedia');
      const useMedia = (wide: boolean, reduce: boolean): void => {
        media.and.callFake(
          (query: string) =>
            ({ matches: query.includes('reduce') ? reduce : wide, media: query }) as MediaQueryList,
        );
      };

      useMedia(true, false);
      row(host, 'second').click();
      settle(harness);
      httpTesting.expectOne(logUrl('demo-project', 'second')).flush(featureLog('second'));
      httpTesting.expectOne(usageUrl('demo-project', 'second')).flush(emptyUsage());
      settle(harness);
      expect(scroll).not.toHaveBeenCalled();

      useMedia(false, false);
      row(host, 'first').click();
      settle(harness);
      httpTesting.expectOne(logUrl('demo-project', 'first')).flush(featureLog('first'));
      httpTesting.expectOne(usageUrl('demo-project', 'first')).flush(emptyUsage());
      settle(harness);
      expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });

      scroll.calls.reset();
      useMedia(false, true);
      row(host, 'second').click();
      settle(harness);
      httpTesting.expectOne(logUrl('demo-project', 'second')).flush(featureLog('second'));
      httpTesting.expectOne(usageUrl('demo-project', 'second')).flush(emptyUsage());
      settle(harness);
      expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'auto', block: 'start' });
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
    it('renders a populated process log at 360px with no horizontal scroll', fakeAsync(() => {
      const name = 'an_extremely_long_feature_identifier_name';
      const longToken = 'unbroken-token-without-any-spaces-'.repeat(6);
      const harness = boot(`/projects/demo-project?feature=${name}`);
      httpTesting.expectOne(PROJECTS_URL).flush(PROJECTS);
      httpTesting.expectOne(stateUrl('demo-project')).flush({
        ...SEEDED_STATE,
        features: [
          {
            featureNumber: 12,
            name,
            title: 'A long feature title that keeps going '.repeat(5),
            status: 'in_progress',
            sdd: true,
          },
        ],
      });
      const base = featureLog(name, {
        featureNumber: 12,
        title: longToken,
        status: 'in_progress',
      });
      httpTesting.expectOne(logUrl('demo-project', name)).flush({
        ...base,
        sessions: [
          {
            ...base.sessions[0],
            agent: longToken,
            plan: [longToken],
            changes: [`src/${longToken}/file.ts`],
            verification: longToken,
            closure: longToken,
            entries: [{ entry: longToken, createdAt: '2026-08-27T00:30:00+00:00' }],
          },
        ],
      });
      const runToken = 'run-role-without-any-spaces-'.repeat(4);
      httpTesting.expectOne(usageUrl('demo-project', name)).flush(
        usageTreeWithRole({
          roleBase: runToken,
          labelBase: runToken,
          modelBase: runToken,
          externalIdBase: `${runToken}-`,
        }),
      );
      settle(harness);
      const host = harness.routeNativeElement as HTMLElement;
      expect(host.querySelector('app-process-log-card [data-log-session]')).toBeTruthy();
      const { doc, remove } = mountAt360([host]);
      try {
        expect(doc.documentElement.clientWidth).toBe(360);
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(360);
        const cardEl = doc.querySelector('app-process-log-card') as HTMLElement;
        expect(cardEl.getBoundingClientRect().right).toBeLessThanOrEqual(360);
        for (const el of Array.from(cardEl.querySelectorAll<HTMLElement>('*'))) {
          expect(el.getBoundingClientRect().right)
            .withContext(el.outerHTML.slice(0, 80))
            .toBeLessThanOrEqual(360);
        }
      } finally {
        remove();
      }
    }));
  });
});
