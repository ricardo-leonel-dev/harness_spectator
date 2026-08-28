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
    signInWithPassword: (
      creds: { email: string; password: string },
    ) => Promise<{
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

    expect(fixture.nativeElement.querySelector('form.login-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button[type="submit"]')).toBeTruthy();

    const router = TestBed.inject(Router);
    await router.navigate(['/']);
    expect(router.url.startsWith('/login')).toBe(true);
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

  it('displays an inline error and does not navigate on a failed login', async () => {
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
    const errorBanner = fixture.nativeElement.querySelector('.error-banner') as HTMLElement | null;
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent ?? '').toContain('Invalid login credentials');

    // A failed login must not navigate to the dashboard.
    expect(router.url).toBe('/login');
  });
});
