import { Component } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';

import {
  AuthService,
  INVALID_CREDENTIALS_MESSAGE,
  LOCAL_SESSION_STORAGE_KEY,
  LOCAL_SIGN_IN_FAILED_MESSAGE,
  MODE_REQUEST_TIMEOUT_MS,
  MODE_UNAVAILABLE_MESSAGE,
} from './auth.service';
import { SUPABASE_CLIENT, Supabase } from './supabase-client';
import { authInterceptor } from '../core/auth.interceptor';
import { environment } from '../../environments/environment';

const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

@Component({ template: '' })
class BlankComponent {}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function supabaseSession(email: string): Session {
  return {
    access_token: 'supabase-token',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: nowSeconds() + 3600,
    token_type: 'bearer',
    user: { id: 'u1', email, app_metadata: {}, user_metadata: {}, aud: 'authenticated' },
  } as unknown as Session;
}

describe('AuthService', () => {
  let httpTesting: HttpTestingController;
  let factoryCalls: number;
  let signInCalls: number;
  let signOutCalls: number;
  let storedSupabaseSession: Session | null;
  let authListener: ((event: string, session: Session | null) => void) | null;

  function fakeSupabase(): Supabase {
    return {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: storedSupabaseSession }, error: null }),
        onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
          authListener = cb;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
        signInWithPassword: () => {
          signInCalls += 1;
          return Promise.resolve({ data: { user: null, session: null }, error: null });
        },
        signOut: () => {
          signOutCalls += 1;
          return Promise.resolve({ error: null });
        },
      },
    } as unknown as Supabase;
  }

  beforeEach(() => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    factoryCalls = 0;
    signInCalls = 0;
    signOutCalls = 0;
    storedSupabaseSession = null;
    authListener = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: BlankComponent },
          { path: '', component: BlankComponent },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: SUPABASE_CLIENT,
          useFactory: () => {
            factoryCalls += 1;
            return fakeSupabase();
          },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  });

  async function initWith(mode: string): Promise<AuthService> {
    const auth = TestBed.inject(AuthService);
    const ready = auth.init();
    httpTesting.expectOne(MODE_URL).flush({ mode });
    await ready;
    return auth;
  }

  function storeLocal(value: unknown): void {
    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(value));
  }

  describe('mode detection', () => {
    it('sends exactly one unauthenticated GET /api/auth/mode and settles only after it resolves (R1)', async () => {
      const auth = TestBed.inject(AuthService);
      let settled = false;
      const ready = auth.init().then(() => (settled = true));

      const req = httpTesting.expectOne(MODE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('Authorization')).toBe(false);
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(auth.mode()).toBeNull();

      req.flush({ mode: 'local' });
      await ready;
      expect(settled).toBe(true);
      expect(auth.mode()).toBe('local');
      httpTesting.expectNone(MODE_URL);
    });

    it('restores the Supabase session and follows onAuthStateChange in supabase mode (R2)', async () => {
      storedSupabaseSession = supabaseSession('sb@example.com');
      const auth = await initWith('supabase');

      expect(factoryCalls).toBe(1);
      expect(auth.mode()).toBe('supabase');
      expect(auth.session()).toEqual({
        accessToken: 'supabase-token',
        email: 'sb@example.com',
        expiresAt: storedSupabaseSession.expires_at as number,
      });
      expect(auth.hasValidSession()).toBe(true);

      authListener?.('SIGNED_OUT', null);
      expect(auth.session()).toBeNull();
      expect(auth.hasValidSession()).toBe(false);
    });

    it('removes a stored local session at startup in supabase mode (R18)', async () => {
      storeLocal({ accessToken: 'stale-local', expiresAt: nowSeconds() + 3600, email: 'a@b.c' });
      const auth = await initWith('supabase');

      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
      expect(auth.session()).toBeNull();
    });

    const failures: Array<[string, (req: ReturnType<HttpTestingController['expectOne']>) => void]> =
      [
        ['a non-2xx status', (req) => req.flush('down', { status: 503, statusText: 'Down' })],
        ['a network error', (req) => req.error(new ProgressEvent('error'))],
        ['an unknown mode', (req) => req.flush({ mode: 'ldap' })],
        ['a body without mode', (req) => req.flush({})],
      ];
    for (const [label, respond] of failures) {
      it(`resolves to unavailable on ${label} and never rejects (R19)`, async () => {
        storeLocal({ accessToken: 'kept', expiresAt: nowSeconds() + 3600, email: 'a@b.c' });
        const auth = TestBed.inject(AuthService);
        const ready = auth.init();
        respond(httpTesting.expectOne(MODE_URL));
        await expectAsync(ready).toBeResolved();

        expect(auth.mode()).toBe('unavailable');
        expect(auth.session()).toBeNull();
        expect(auth.hasValidSession()).toBe(false);
        expect(factoryCalls).toBe(0);
      });
    }

    it('resolves to unavailable when the mode request does not answer within 5000 ms (R19)', fakeAsync(() => {
      const auth = TestBed.inject(AuthService);
      void auth.init();
      const req = httpTesting.expectOne(MODE_URL);

      tick(MODE_REQUEST_TIMEOUT_MS - 1);
      flushMicrotasks();
      expect(auth.mode()).toBeNull();

      tick(1);
      flushMicrotasks();
      expect(req.cancelled).toBe(true);
      expect(auth.mode()).toBe('unavailable');
    }));
  });

  describe('local session restore', () => {
    it('restores a valid stored session without signing in again (R13)', async () => {
      const expiresAt = nowSeconds() + 3600;
      storeLocal({ accessToken: 'local-token', expiresAt, email: 'me@example.com' });
      const auth = await initWith('local');

      expect(auth.session()).toEqual({
        accessToken: 'local-token',
        expiresAt,
        email: 'me@example.com',
      });
      expect(auth.hasValidSession()).toBe(true);
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).not.toBeNull();
      expect(factoryCalls).toBe(0);
    });

    const invalid: Array<[string, () => string]> = [
      ['not JSON', () => '{nope'],
      ['JSON null', () => 'null'],
      ['missing accessToken', () => JSON.stringify({ expiresAt: nowSeconds() + 3600 })],
      [
        'an empty accessToken',
        () => JSON.stringify({ accessToken: '', expiresAt: nowSeconds() + 3600 }),
      ],
      ['a string expiresAt', () => JSON.stringify({ accessToken: 't', expiresAt: '9999999999' })],
      [
        'an expired session',
        () => JSON.stringify({ accessToken: 't', expiresAt: nowSeconds() - 1 }),
      ],
    ];
    for (const [label, raw] of invalid) {
      it(`removes the key and starts signed out when the stored value is ${label} (R14)`, async () => {
        localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, raw());
        const auth = await initWith('local');

        expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
        expect(auth.session()).toBeNull();
        expect(auth.hasValidSession()).toBe(false);
      });
    }
  });

  describe('login', () => {
    it('signs in through Supabase in supabase mode and never posts to the backend (R3)', async () => {
      const auth = await initWith('supabase');
      expect(await auth.login('a@b.c', 'pw')).toEqual({ ok: true });
      expect(signInCalls).toBe(1);
      httpTesting.expectNone(LOGIN_URL);
    });

    it('stores and holds the backend-issued session in local mode (R6, R7)', async () => {
      const auth = await initWith('local');
      const expiresAt = nowSeconds() + 3600;
      const result = auth.login('me@example.com', 'pw');
      const req = httpTesting.expectOne(LOGIN_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'me@example.com', password: 'pw' });
      req.flush({ accessToken: 'local-token', expiresAt });

      expect(await result).toEqual({ ok: true });
      const stored = { accessToken: 'local-token', expiresAt, email: 'me@example.com' };
      expect(JSON.parse(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY) as string)).toEqual(stored);
      expect(auth.session()).toEqual(stored);
      expect(auth.hasValidSession()).toBe(true);
      await auth.logout(TestBed.inject(Router));
    });

    it('maps 401 and other failures to their fixed messages without storing anything (R9, R10)', async () => {
      const auth = await initWith('local');

      let result = auth.login('a@b.c', 'bad');
      httpTesting
        .expectOne(LOGIN_URL)
        .flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      expect(await result).toEqual({ ok: false, error: INVALID_CREDENTIALS_MESSAGE });

      result = auth.login('a@b.c', 'pw');
      httpTesting.expectOne(LOGIN_URL).flush({ accessToken: 'x' });
      expect(await result).toEqual({ ok: false, error: LOCAL_SIGN_IN_FAILED_MESSAGE });

      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
      expect(auth.session()).toBeNull();
      expect(factoryCalls).toBe(0);
    });

    it('re-requests the mode once on submit while unavailable and reports it if still down (R21)', async () => {
      const auth = TestBed.inject(AuthService);
      const ready = auth.init();
      httpTesting.expectOne(MODE_URL).flush('down', { status: 502, statusText: 'Bad Gateway' });
      await ready;

      const result = auth.login('a@b.c', 'pw');
      httpTesting.expectOne(MODE_URL).error(new ProgressEvent('error'));
      expect(await result).toEqual({ ok: false, error: MODE_UNAVAILABLE_MESSAGE });
      expect(auth.mode()).toBe('unavailable');
      httpTesting.expectNone(LOGIN_URL);
      expect(factoryCalls).toBe(0);
    });
  });

  describe('expiry', () => {
    it('clears the session, removes the key and navigates to /login when expiresAt is reached (R15)', fakeAsync(() => {
      const auth = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      void auth.init();
      httpTesting.expectOne(MODE_URL).flush({ mode: 'local' });
      flushMicrotasks();
      void router.navigateByUrl('/');
      tick();

      void auth.login('me@example.com', 'pw');
      httpTesting.expectOne(LOGIN_URL).flush({ accessToken: 't', expiresAt: nowSeconds() + 60 });
      flushMicrotasks();
      expect(auth.hasValidSession()).toBe(true);

      tick(59_000);
      expect(auth.session()).not.toBeNull();

      tick(1_000);
      expect(auth.session()).toBeNull();
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
      expect(router.url).toBe('/login');
    }));

    it('re-arms the timer when expiresAt is beyond the maximum setTimeout delay (R15)', fakeAsync(() => {
      const maxDelay = 2_147_483_647;
      storeLocal({ accessToken: 't', expiresAt: nowSeconds() + 30 * 24 * 3600, email: 'a@b.c' });
      const auth = TestBed.inject(AuthService);
      void auth.init();
      httpTesting.expectOne(MODE_URL).flush({ mode: 'local' });
      flushMicrotasks();

      tick(maxDelay);
      expect(auth.session()).not.toBeNull();
      expect(auth.hasValidSession()).toBe(true);

      tick(30 * 24 * 3600 * 1000 - maxDelay);
      expect(auth.session()).toBeNull();
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
    }));
  });

  describe('logout', () => {
    it('signs out of Supabase and lands on /login in supabase mode (R4)', async () => {
      storedSupabaseSession = supabaseSession('sb@example.com');
      const auth = await initWith('supabase');
      const router = TestBed.inject(Router);

      await auth.logout(router);
      expect(signOutCalls).toBe(1);
      expect(router.url).toBe('/login');
    });

    it('clears the local session with no Supabase or backend call in local mode (R5, R17)', fakeAsync(() => {
      const auth = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      void auth.init();
      httpTesting.expectOne(MODE_URL).flush({ mode: 'local' });
      flushMicrotasks();

      void auth.login('me@example.com', 'pw');
      httpTesting.expectOne(LOGIN_URL).flush({ accessToken: 't', expiresAt: nowSeconds() + 60 });
      flushMicrotasks();

      void auth.logout(router);
      tick();
      expect(auth.session()).toBeNull();
      expect(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
      expect(router.url).toBe('/login');
      expect(factoryCalls).toBe(0);
      expect(signOutCalls).toBe(0);
      httpTesting.verify();

      tick(120_000);
      expect(router.url).toBe('/login');
    }));
  });
});
