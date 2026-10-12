import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withDisabledInitialNavigation } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { Session } from '@supabase/supabase-js';

import { LoginPageComponent } from './login-page.component';
import { AuthService } from './auth.service';
import { SUPABASE_CLIENT, Supabase } from './supabase-client';
import { authGuard } from './auth.guard';
import { DashboardPageComponent } from '../dashboard/dashboard-page.component';

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

describe('LoginPageComponent', () => {
  let fakeHolder: ReturnType<typeof makeFakeSupabase>;

  beforeEach(async () => {
    fakeHolder = makeFakeSupabase(null);
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
        { provide: SUPABASE_CLIENT, useValue: fakeHolder.fake as unknown as Supabase },
      ],
    }).compileComponents();
  });

  it('renders the login page when there is no session and the dashboard route is not reachable', async () => {
    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();

    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('form')).toBeTruthy();
    expect(host.querySelector('button[type="submit"]')).toBeTruthy();
    expect(host.querySelector('input#login-email')).toBeTruthy();
    expect(host.querySelector('input#login-password')).toBeTruthy();

    const router = TestBed.inject(Router);
    await router.navigate(['/']);
    expect(router.url.startsWith('/login')).toBe(true);
  });

  async function renderLogin(): Promise<{
    fixture: ReturnType<typeof TestBed.createComponent<LoginPageComponent>>;
    host: HTMLElement;
  }> {
    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('renders a centred header: pulsing signal mark, sans "Sign in" h1 and a mono subtitle, no prose', async () => {
    const { host } = await renderLogin();

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
    const { host } = await renderLogin();

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
    const { host } = await renderLogin();

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
    const { fixture, host } = await renderLogin();
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

    await pending;
  });

  it('closes with a mono uppercase "Secured by Supabase Auth" footer', async () => {
    const { host } = await renderLogin();
    const footer = host.querySelector('footer') as HTMLElement;
    expect(footer.textContent?.trim()).toBe('Secured by Supabase Auth');
    expect(footer.className).toContain('font-mono');
    expect(getComputedStyle(footer).textTransform).toBe('uppercase');
    expect(parseFloat(getComputedStyle(footer).letterSpacing)).toBeGreaterThan(0);
    expect(parseFloat(getComputedStyle(footer).fontSize)).toBeLessThan(10);
  });

  it('blocks submission until the credentials are valid', async () => {
    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();

    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;

    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(submit.disabled).toBe(true);

    fixture.componentInstance.form.setValue({ email: 'not-an-email', password: 'pw' });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(submit.disabled).toBe(true);

    await fixture.componentInstance.onSubmit();
    expect(fakeHolder.signInCalls).toEqual([]);

    fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.valid).toBe(true);
    expect(submit.disabled).toBe(false);
  });

  it('renders the dashboard after a successful login', async () => {
    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();

    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'pw' });
    await fixture.componentInstance.onSubmit();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/');
    expect(fakeHolder.signInCalls).toEqual([{ email: 'a@b.c', password: 'pw' }]);
  });

  it('displays an inline [ERR] banner and does not navigate on a failed login', async () => {
    fakeHolder.failNextSignIn('Invalid login credentials');

    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();

    const router = TestBed.inject(Router);
    await router.navigate(['/login']);
    expect(router.url).toBe('/login');

    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'wrong' });
    await fixture.componentInstance.onSubmit();

    fixture.detectChanges();
    const errorBanner = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
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
