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
          listenerRef.current?.('SIGNED_OUT', null);
          return Promise.resolve({ error: null });
        },
      },
    };
  }

  beforeEach(async () => {
    signOutCalls = 0;
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
    expect(text).toContain('in_progress');
    expect(text).toContain('implementer');
    expect(text).toContain('waiting on X');
  }));

  it('renders a lifecycle track for every status the harness can report', fakeAsync(() => {
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
      ],
    });

    const rows = Array.from(host.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(5);

    const expectations: Array<[string, string]> = [
      ['pending', 'text-status-pending'],
      ['in_progress', 'text-status-in-progress'],
      ['blocked', 'text-status-blocked'],
      ['done', 'text-status-done'],
      ['spec_ready', 'text-status-spec-ready'],
    ];

    expectations.forEach(([status, labelClass], index) => {
      const track = rows[index].querySelector('app-lifecycle-track') as HTMLElement;
      expect(track).withContext(status).toBeTruthy();
      expect(track.textContent?.trim()).toBe(status);

      const label = Array.from(track.querySelectorAll('span')).find((el) =>
        el.classList.contains('font-mono'),
      );
      expect(label?.textContent?.trim()).withContext(status).toBe(status);
      expect(label?.classList.contains(labelClass)).withContext(status).toBe(true);
    });

    // The old solid colour-pill badge is gone.
    expect(host.querySelector('app-status-badge')).toBeNull();
    // Exactly one beacon: the in_progress row. The topbar is idle in this state.
    expect(host.querySelectorAll('[data-beacon]').length).toBe(1);
  }));

  it('shows a live agent indicator with a beacon while a session is open', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const header = host.querySelector('header') as HTMLElement;

    expect(header.textContent).toContain('1 agent active');
    expect(header.querySelectorAll('[data-beacon]').length).toBe(1);
    // One in the topbar, one on the in_progress row — the only two live things on screen.
    expect(host.querySelectorAll('[data-beacon]').length).toBe(2);
  }));

  it('shows an idle indicator with no beacon when no session is open', fakeAsync(() => {
    const host = renderWith({
      ...SEEDED_STATE,
      openSession: null,
      features: [{ featureNumber: 2, name: 'second', title: 'Second', status: 'done', sdd: false }],
    });
    const header = host.querySelector('header') as HTMLElement;

    expect(header.textContent).toContain('idle');
    expect(header.textContent).not.toContain('agent active');
    expect(host.querySelectorAll('[data-beacon]').length).toBe(0);
  }));

  it('renders the open session as a mono terminal block ending in a blinking caret', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const card = host.querySelector('app-open-session-card') as HTMLElement;

    const block = card.querySelector('.font-mono') as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.className).toContain('bg-ink');
    expect(block.textContent).toContain('implementer');
    expect(block.textContent).toContain('2026-08-27T00:00:00Z');
    expect(block.textContent).toContain('T1 next');

    const caret = card.querySelector('[data-caret]') as HTMLElement;
    expect(caret).toBeTruthy();
    expect(caret.className).toContain('animate-caret');
    expect(block.lastElementChild).toBe(caret);
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

  it('signs out and returns to the login page', fakeAsync(() => {
    const host = renderWith(SEEDED_STATE);
    const router = TestBed.inject(Router);

    const logoutButton = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Log out'),
    ) as HTMLButtonElement;
    expect(logoutButton).toBeTruthy();

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
    expect(errorBanner?.className).toContain('border-status-blocked');
  }));
});
