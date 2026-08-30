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

  it('renders the offline design system chrome: one beacon, the wordmark, mono field labels and icons', async () => {
    const auth = TestBed.inject(AuthService);
    auth.init();
    await flushMicrotasks();

    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('[data-beacon]').length).toBe(1);
    expect((host.textContent ?? '').replace(/\s+/g, '')).toContain('harness.spectator');

    const labels = Array.from(host.querySelectorAll('label'));
    expect(labels.length).toBe(2);
    for (const label of labels) {
      expect(label.className).toContain('font-mono');
      expect(label.className).toContain('uppercase');
      expect(label.getAttribute('for')).toBeTruthy();
    }

    for (const input of Array.from(host.querySelectorAll('input'))) {
      expect(input.className).toContain('font-mono');
    }

    const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.className).toContain('bg-signal');
    expect(submit.className).toContain('text-ink');

    const icons = Array.from(host.querySelectorAll('svg')).map((svg) => svg.getAttribute('class'));
    expect(icons.some((c) => c?.includes('lucide-lock'))).toBe(true);
    expect(icons.some((c) => c?.includes('lucide-mail'))).toBe(true);
    expect(icons.some((c) => c?.includes('lucide-key'))).toBe(true);
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
    expect(errorBanner?.className).toContain('border-status-blocked');

    // A failed login must not navigate to the dashboard.
    expect(router.url).toBe('/login');
  });
});
