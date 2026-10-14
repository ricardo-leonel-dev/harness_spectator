import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, withDisabledInitialNavigation } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { Session } from '@supabase/supabase-js';

import { LoginPageComponent } from './login-page.component';
import {
  AuthService,
  INVALID_CREDENTIALS_MESSAGE,
  LOCAL_SESSION_STORAGE_KEY,
  LOCAL_SIGN_IN_FAILED_MESSAGE,
  MODE_UNAVAILABLE_MESSAGE,
} from './auth.service';
import { SUPABASE_CLIENT, Supabase } from './supabase-client';
import { authGuard } from './auth.guard';
import { authInterceptor } from '../core/auth.interceptor';
import { DashboardPageComponent } from '../dashboard/dashboard-page.component';
import { environment } from '../../environments/environment';

const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

type Mode = 'supabase' | 'local';

interface FakeSupabaseSessionResult {
  data: { session: Session | null };
  error: null;
}

interface FakeSupabaseAuthStateChangeResult {
  data: { subscription: { unsubscribe: () => void } };
}

interface FakeSupabaseBuilder {
  auth: {
    getSession: () => Promise<FakeSupabaseSessionResult>;
    onAuthStateChange: (
      _cb: (event: string, session: Session | null) => void,
    ) => FakeSupabaseAuthStateChangeResult;
    signInWithPassword: (creds: { email: string; password: string }) => Promise<{
      data: { user: unknown; session: Session | null };
      error: { message: string } | null;
    }>;
    signOut: () => Promise<{ error: null }>;
  };
}

function makeFakeSupabase(initialSession: Session | null): {
  fake: FakeSupabaseBuilder;
  signInCalls: Array<{ email: string; password: string }>;
  failNextSignIn: (message: string) => void;
} {
  let listener: ((event: string, session: Session | null) => void) | null = null;
  let currentSession: Session | null = initialSession;
  const signInCalls: Array<{ email: string; password: string }> = [];
  let pendingError: string | null = null;

  const fake: FakeSupabaseBuilder = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession }, error: null }),
      onAuthStateChange: (cb) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signInWithPassword: (creds) => {
        signInCalls.push(creds);
        if (pendingError) {
          const msg = pendingError;
          pendingError = null;
          return Promise.resolve({
            data: { user: null, session: null },
            error: { message: msg },
          });
        }
        const session = {
          access_token: 'fake-token',
          refresh_token: 'r',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: 'u1',
            email: creds.email,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: '',
          },
        } as unknown as Session;
        currentSession = session;
        if (listener) listener('SIGNED_IN', session);
        return Promise.resolve({ data: { user: session.user, session }, error: null });
      },
      signOut: () => Promise.resolve({ error: null }),
    },
  };

  return {
    fake,
    signInCalls,
    failNextSignIn: (message: string) => {
      pendingError = message;
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('LoginPageComponent', () => {
  let fakeHolder: ReturnType<typeof makeFakeSupabase>;
  let factoryCalls: number;
  let httpTesting: HttpTestingController;

  async function configure(): Promise<void> {
    fakeHolder = makeFakeSupabase(null);
    factoryCalls = 0;
    await TestBed.configureTestingModule({
      imports: [LoginPageComponent, ReactiveFormsModule],
      providers: [
        provideRouter(
          [
            { path: 'login', component: LoginPageComponent },
            {
              path: '',
              canActivate: [authGuard],
              component: DashboardPageComponent,
            },
          ],
          withDisabledInitialNavigation(),
        ),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: SUPABASE_CLIENT,
          useFactory: () => {
            factoryCalls += 1;
            return fakeHolder.fake as unknown as Supabase;
          },
        },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  }

  beforeEach(async () => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    await configure();
  });

  afterEach(async () => {
    httpTesting.verify();
    const auth = TestBed.inject(AuthService);
    if (auth.mode() === 'local') await auth.logout(TestBed.inject(Router));
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  });

  async function initAuth(
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<void> {
    const ready = TestBed.inject(AuthService).init();
    respond(httpTesting.expectOne(MODE_URL));
    await ready;
  }

  async function renderLogin(mode: Mode | 'unavailable' = 'supabase'): Promise<{
    fixture: ReturnType<typeof TestBed.createComponent<LoginPageComponent>>;
    host: HTMLElement;
  }> {
    await initAuth((req) =>
      mode === 'unavailable'
        ? req.flush('down', { status: 503, statusText: 'Service Unavailable' })
        : req.flush({ mode }),
    );
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  function banner(host: HTMLElement): HTMLElement | null {
    return host.querySelector('[role="alert"]');
  }

  for (const mode of ['supabase', 'local'] as const) {
    describe(`appearance in ${mode} mode`, () => {
      it('renders the login page when there is no session and the dashboard route is not reachable', async () => {
        const { host } = await renderLogin(mode);
        expect(host.querySelector('form')).toBeTruthy();
        expect(host.querySelector('button[type="submit"]')).toBeTruthy();
        expect(host.querySelector('input#login-email')).toBeTruthy();
        expect(host.querySelector('input#login-password')).toBeTruthy();
        expect(banner(host)).toBeNull();

        const router = TestBed.inject(Router);
        await router.navigate(['/']);
        expect(router.url.startsWith('/login')).toBe(true);
      });

      it('renders a centred header: pulsing signal mark, sans "Sign in" h1 and a mono subtitle, no prose', async () => {
        const { host } = await renderLogin(mode);

        const header = host.querySelector('[data-login-header]') as HTMLElement;
        expect(header.className).toContain('flex-col');
        expect(header.className).toContain('items-center');

        const beacons = host.querySelectorAll('[data-beacon]');
        expect(beacons.length).toBe(1);
        expect(beacons[0].getAttribute('data-beacon')).toBe('login-mark');
        expect(header.contains(beacons[0])).toBe(true);
        const ping = beacons[0].querySelector('[data-beacon-ping]') as HTMLElement;
        expect(ping.className).toContain('bg-signal');
        expect(ping.className).toContain('animate-beacon');
        expect(ping.className).toContain('motion-reduce:animate-none');
        expect(ping.className).toContain('motion-reduce:hidden');

        expect(host.querySelector('svg.lucide-lock')).toBeNull();

        const h1 = host.querySelector('h1') as HTMLElement;
        expect(h1.textContent?.trim()).toBe('Sign in');
        expect(h1.className).toContain('font-sans');
        expect(h1.className).toContain('font-semibold');
        expect(getComputedStyle(h1).fontWeight).toBe('600');

        const subtitle = h1.nextElementSibling as HTMLElement;
        expect(subtitle.textContent?.trim()).toBe('harness · spectator');
        expect(subtitle.className).toContain('font-mono');
        expect(getComputedStyle(subtitle).textTransform).toBe('uppercase');

        expect(host.textContent).not.toContain('Sign in to watch the agents');
      });

      it('sits on an ink backdrop with a dotted grid, in a 368px card with 6px radius and a deep shadow', async () => {
        const { host } = await renderLogin(mode);

        const shell = host.firstElementChild as HTMLElement;
        expect(shell.className).toContain('bg-ink');
        const grid = shell.querySelector('[data-dot-grid]') as HTMLElement;
        expect(grid).toBeTruthy();
        expect(getComputedStyle(grid).backgroundImage).toContain('radial-gradient');
        expect(getComputedStyle(grid).backgroundSize).toBe('26px 26px');

        const form = host.querySelector('form') as HTMLFormElement;
        const style = getComputedStyle(form);
        expect(style.borderTopLeftRadius).toBe('6px');
        expect(style.boxShadow).toContain('70px');
        expect(style.maxWidth).toBe('368px');
      });

      it('labels fields in mono uppercase, shows the reference placeholders and keeps icons clear of the text', async () => {
        const { host } = await renderLogin(mode);

        const labels = Array.from(host.querySelectorAll('label'));
        expect(labels.length).toBe(2);
        for (const label of labels) {
          expect(label.className).toContain('font-mono');
          expect(label.className).toContain('text-label');
          expect(label.className).toContain('uppercase');
          expect(label.getAttribute('for')).toBeTruthy();
        }

        const email = host.querySelector('#login-email') as HTMLInputElement;
        const password = host.querySelector('#login-password') as HTMLInputElement;
        expect(email.placeholder).toBe('you@example.com');
        expect(password.placeholder).toBe('••••••••');

        const cases: Array<[HTMLInputElement, string]> = [
          [email, 'lucide-mail'],
          [password, 'lucide-key'],
        ];
        for (const [input, iconClass] of cases) {
          expect(input.className).toContain('font-mono');
          const svg = input.parentElement?.querySelector('svg') as SVGElement;
          expect(svg.getAttribute('class')).toContain(iconClass);

          const inputBox = input.getBoundingClientRect();
          const iconBox = svg.getBoundingClientRect();
          const textStart = inputBox.left + parseFloat(getComputedStyle(input).paddingLeft);
          expect(iconBox.left - inputBox.left)
            .withContext(`${iconClass} offset`)
            .toBeCloseTo(10, 0);
          expect(iconBox.width).withContext(`${iconClass} width`).toBeCloseTo(14, 0);
          expect(iconBox.right).withContext(`${iconClass} vs text`).toBeLessThan(textStart);
        }

        const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submit.className).toContain('bg-signal');
        expect(submit.className).toContain('text-ink');
      });

      it('shows a spinner beside "Signing in…" while the sign-in is in flight', async () => {
        const { fixture, host } = await renderLogin(mode);
        const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submit.querySelector('[data-spinner]')).toBeNull();

        fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
        const pending = fixture.componentInstance.onSubmit();
        fixture.detectChanges();

        const spinner = submit.querySelector('[data-spinner]') as HTMLElement;
        expect(spinner).toBeTruthy();
        expect(spinner.className).toContain('animate-spin-fast');
        expect(spinner.className).toContain('motion-reduce:animate-none');
        expect(submit.textContent?.trim()).toBe('Signing in…');
        expect(submit.disabled).toBe(true);

        if (mode === 'local') {
          httpTesting
            .expectOne(LOGIN_URL)
            .flush({ accessToken: 't', expiresAt: nowSeconds() + 3600 });
        }
        await pending;
      });

      it('closes with a mono uppercase "Made with [coffee] and [heart]" footer and a spoken equivalent (R22, R23)', async () => {
        const { host } = await renderLogin(mode);
        const footer = host.querySelector('footer') as HTMLElement;
        expect(footer.className).toContain('font-mono');
        expect(getComputedStyle(footer).textTransform).toBe('uppercase');
        expect(parseFloat(getComputedStyle(footer).letterSpacing)).toBeGreaterThan(0);
        expect(parseFloat(getComputedStyle(footer).fontSize)).toBeLessThan(10);
        expect(footer.textContent).not.toContain('Secured by');
        expect(footer.children.length).toBe(2);

        const visual = footer.querySelector('[data-footer-visual]') as HTMLElement;
        expect(visual.getAttribute('aria-hidden')).toBe('true');
        const parts = Array.from(visual.children) as HTMLElement[];
        expect(parts.length).toBe(4);
        expect(parts[0].tagName).toBe('SPAN');
        expect(parts[0].textContent?.trim()).toBe('Made with');
        expect(parts[1].matches('lucide-icon[name="coffee"]')).toBe(true);
        expect(parts[1].querySelector('svg.lucide-coffee')).toBeTruthy();
        expect(parts[2].tagName).toBe('SPAN');
        expect(parts[2].textContent?.trim()).toBe('and');
        expect(parts[3].matches('lucide-icon[name="heart"]')).toBe(true);
        expect(parts[3].querySelector('svg.lucide-heart')).toBeTruthy();
        expect(parts[3].className).toContain('text-signal');
        expect(getComputedStyle(parts[3]).color).toBe('rgb(232, 163, 61)');

        const spoken = footer.querySelector('.sr-only') as HTMLElement;
        expect(spoken.textContent).toBe('Made with coffee and love');
        expect(visual.contains(spoken)).toBe(false);
        expect(getComputedStyle(spoken).position).toBe('absolute');
        expect(getComputedStyle(spoken).width).toBe('1px');
      });

      it('blocks submission until the credentials are valid', async () => {
        const { fixture, host } = await renderLogin(mode);
        const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;

        expect(fixture.componentInstance.form.invalid).toBe(true);
        expect(submit.disabled).toBe(true);

        fixture.componentInstance.form.setValue({ email: 'not-an-email', password: 'pw' });
        fixture.detectChanges();
        expect(fixture.componentInstance.form.invalid).toBe(true);
        expect(submit.disabled).toBe(true);

        await fixture.componentInstance.onSubmit();
        expect(fakeHolder.signInCalls).toEqual([]);
        httpTesting.expectNone(LOGIN_URL);

        fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
        fixture.detectChanges();
        expect(fixture.componentInstance.form.valid).toBe(true);
        expect(submit.disabled).toBe(false);
      });
    });
  }

  it('renders an identical login form in supabase and local mode (R24)', async () => {
    const supabaseRender = await renderLogin('supabase');
    const supabaseHtml = (supabaseRender.host.querySelector('form') as HTMLFormElement).innerHTML;
    httpTesting.verify();

    TestBed.resetTestingModule();
    await configure();
    const localRender = await renderLogin('local');
    const localHtml = (localRender.host.querySelector('form') as HTMLFormElement).innerHTML;

    expect(localHtml).toContain('Made with coffee and love');
    expect(localHtml).toBe(supabaseHtml);
  });

  describe('supabase mode', () => {
    it('signs in with Supabase, never posts to the backend, and renders the dashboard (R3)', async () => {
      const { fixture } = await renderLogin('supabase');

      fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
      await fixture.componentInstance.onSubmit();

      const router = TestBed.inject(Router);
      expect(router.url).toBe('/');
      expect(fakeHolder.signInCalls).toEqual([{ email: 'a@b.c', password: 'pw' }]);
      httpTesting.expectNone(LOGIN_URL);
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
    });

    it('displays an inline [ERR] banner and does not navigate on a failed login', async () => {
      fakeHolder.failNextSignIn('Invalid login credentials');
      const { fixture } = await renderLogin('supabase');

      const router = TestBed.inject(Router);
      await router.navigate(['/login']);
      expect(router.url).toBe('/login');

      fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'wrong' });
      await fixture.componentInstance.onSubmit();

      fixture.detectChanges();
      const errorBanner = banner(fixture.nativeElement);
      expect(errorBanner).toBeTruthy();
      expect(errorBanner?.textContent ?? '').toContain('[ERR]');
      expect(errorBanner?.textContent ?? '').toContain('Invalid login credentials');
      expect(errorBanner?.className).toContain('border-status-blocked/35');
      expect(errorBanner?.className).not.toContain('border-l-2');
      const bannerStyle = getComputedStyle(errorBanner as HTMLElement);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        expect(bannerStyle.getPropertyValue(`border-${side.toLowerCase()}-width`)).toBe('1px');
      }
      const tag = errorBanner?.querySelector('.font-mono') as HTMLElement;
      expect(tag.textContent?.trim()).toBe('[ERR]');

      // A failed login must not navigate to the dashboard.
      expect(router.url).toBe('/login');
    });
  });

  describe('local mode', () => {
    async function submitLocal(
      email: string,
      password: string,
    ): Promise<{
      fixture: ReturnType<typeof TestBed.createComponent<LoginPageComponent>>;
      router: Router;
      request: ReturnType<HttpTestingController['expectOne']>;
      done: Promise<void>;
    }> {
      const { fixture } = await renderLogin('local');
      const router = TestBed.inject(Router);
      await router.navigate(['/login']);
      fixture.componentInstance.form.setValue({ email, password });
      const done = fixture.componentInstance.onSubmit();
      const request = httpTesting.expectOne(LOGIN_URL);
      return { fixture, router, request, done };
    }

    function expectBanner(
      fixture: ReturnType<typeof TestBed.createComponent<LoginPageComponent>>,
      text: string,
    ): void {
      fixture.detectChanges();
      const errorBanner = banner(fixture.nativeElement) as HTMLElement;
      expect(errorBanner.textContent).toContain('[ERR]');
      expect((errorBanner.lastElementChild as HTMLElement).textContent?.trim()).toBe(text);
      expect(errorBanner.className).toContain('border-status-blocked/35');
    }

    it('posts the credentials, stores the session and navigates to / without Supabase (R5, R6, R7, R8)', async () => {
      const expiresAt = nowSeconds() + 3600;
      const { router, request, done } = await submitLocal('me@example.com', 'secret');

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ email: 'me@example.com', password: 'secret' });
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ accessToken: 'local-token', expiresAt });
      await done;

      expect(JSON.parse(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY) as string)).toEqual({
        accessToken: 'local-token',
        expiresAt,
        email: 'me@example.com',
      });
      expect(router.url).toBe('/');
      expect(fakeHolder.signInCalls).toEqual([]);
      expect(factoryCalls).toBe(0);
    });

    it('shows "Invalid login credentials" on 401 and stays on /login (R9)', async () => {
      const { fixture, router, request, done } = await submitLocal('me@example.com', 'wrong');
      request.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      await done;

      expectBanner(fixture, INVALID_CREDENTIALS_MESSAGE);
      expect(router.url).toBe('/login');
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
    });

    const failures: Array<[string, (req: ReturnType<HttpTestingController['expectOne']>) => void]> =
      [
        ['a 500', (req) => req.flush({ error: 'boom' }, { status: 500, statusText: 'Error' })],
        ['a 404', (req) => req.flush(null, { status: 404, statusText: 'Not Found' })],
        ['a network error', (req) => req.error(new ProgressEvent('error'))],
        ['a 200 without accessToken', (req) => req.flush({ expiresAt: nowSeconds() + 3600 })],
        [
          'a 200 with an empty accessToken',
          (req) => req.flush({ accessToken: '', expiresAt: nowSeconds() + 3600 }),
        ],
        ['a 200 with a string expiresAt', (req) => req.flush({ accessToken: 't', expiresAt: '1' })],
        [
          'a 200 that is already expired',
          (req) => req.flush({ accessToken: 't', expiresAt: nowSeconds() - 1 }),
        ],
      ];
    for (const [label, respond] of failures) {
      it(`shows the generic sign-in failure and stores nothing on ${label} (R10)`, async () => {
        const { fixture, router, request, done } = await submitLocal('me@example.com', 'pw');
        respond(request);
        await done;

        expectBanner(fixture, LOCAL_SIGN_IN_FAILED_MESSAGE);
        expect(router.url).toBe('/login');
        expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
      });
    }
  });

  describe('mode unavailable', () => {
    it('shows the mode-unavailable [ERR] banner on the login page (R19)', async () => {
      const { host } = await renderLogin('unavailable');
      const errorBanner = banner(host) as HTMLElement;
      expect(errorBanner.textContent).toContain('[ERR]');
      expect((errorBanner.lastElementChild as HTMLElement).textContent?.trim()).toBe(
        MODE_UNAVAILABLE_MESSAGE,
      );
      expect(errorBanner.className).toContain('border-status-blocked/35');
      expect(errorBanner.className).toContain('text-err-text');
    });

    it('re-requests the mode on submit and signs in locally once it resolves (R21)', async () => {
      const { fixture } = await renderLogin('unavailable');
      fixture.componentInstance.form.setValue({ email: 'me@example.com', password: 'pw' });
      const done = fixture.componentInstance.onSubmit();

      httpTesting.expectOne(MODE_URL).flush({ mode: 'local' });
      await flushMicrotasks();
      httpTesting
        .expectOne(LOGIN_URL)
        .flush({ accessToken: 'local-token', expiresAt: nowSeconds() + 3600 });
      await done;

      fixture.detectChanges();
      expect(banner(fixture.nativeElement)).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/');
      expect(factoryCalls).toBe(0);
    });

    it('re-requests the mode on submit and signs in with Supabase once it resolves (R21)', async () => {
      const { fixture } = await renderLogin('unavailable');
      fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
      const done = fixture.componentInstance.onSubmit();

      httpTesting.expectOne(MODE_URL).flush({ mode: 'supabase' });
      await done;

      expect(fakeHolder.signInCalls).toEqual([{ email: 'a@b.c', password: 'pw' }]);
      httpTesting.expectNone(LOGIN_URL);
      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('keeps the mode-unavailable banner when the retry fails too (R19, R21)', async () => {
      const { fixture } = await renderLogin('unavailable');
      fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
      const done = fixture.componentInstance.onSubmit();

      httpTesting.expectOne(MODE_URL).error(new ProgressEvent('error'));
      await done;

      fixture.detectChanges();
      const errorBanner = banner(fixture.nativeElement) as HTMLElement;
      expect((errorBanner.lastElementChild as HTMLElement).textContent?.trim()).toBe(
        MODE_UNAVAILABLE_MESSAGE,
      );
      expect(factoryCalls).toBe(0);
    });
  });
});
