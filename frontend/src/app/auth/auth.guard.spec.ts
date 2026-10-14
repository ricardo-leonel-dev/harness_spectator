import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';

import { authGuard } from './auth.guard';
import { AuthService, LOCAL_SESSION_STORAGE_KEY } from './auth.service';
import { SUPABASE_CLIENT, Supabase } from './supabase-client';
import { environment } from '../../environments/environment';

const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;

@Component({ template: '' })
class BlankComponent {}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('authGuard', () => {
  let httpTesting: HttpTestingController;
  let factoryCalls: number;

  const supabaseWithSession = {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: { access_token: 'sb', user: { email: 'a@b.c' } } as Session },
          error: null,
        }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  } as unknown as Supabase;

  beforeEach(() => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    factoryCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: BlankComponent },
          {
            path: '',
            canActivate: [authGuard],
            component: BlankComponent,
            children: [{ path: 'projects/:slug', children: [] }],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SUPABASE_CLIENT,
          useFactory: () => {
            factoryCalls += 1;
            return supabaseWithSession;
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

  async function init(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
    const auth = TestBed.inject(AuthService);
    const ready = auth.init();
    respond(httpTesting.expectOne(MODE_URL));
    await ready;
    return auth;
  }

  function storeLocal(expiresAt: number): void {
    localStorage.setItem(
      LOCAL_SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: 'local-token', expiresAt, email: 'a@b.c' }),
    );
  }

  it('allows / while a non-expired local session is held (R12)', async () => {
    storeLocal(nowSeconds() + 3600);
    await init((req) => req.flush({ mode: 'local' }));
    const router = TestBed.inject(Router);

    expect(await router.navigateByUrl('/')).toBe(true);
    expect(router.url).toBe('/');
  });

  it('redirects to /login with returnUrl once the held local session has expired (R16)', async () => {
    const realNow = Date.now();
    storeLocal(Math.floor(realNow / 1000) + 60);
    const auth = await init((req) => req.flush({ mode: 'local' }));
    expect(auth.session()).not.toBeNull();

    spyOn(Date, 'now').and.returnValue(realNow + 120_000);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/projects/demo');

    expect(auth.session()).not.toBeNull();
    expect(router.url).toBe('/login?returnUrl=%2Fprojects%2Fdemo');
  });

  it('redirects / to /login while the mode is unavailable, even with a stored session (R20)', async () => {
    storeLocal(nowSeconds() + 3600);
    await init((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    expect(router.url).toBe('/login?returnUrl=%2F');
    expect(factoryCalls).toBe(0);
  });

  it('redirects while unavailable even when the Supabase client holds a session (R20)', async () => {
    const auth = await init((req) => req.flush({ mode: 'other' }));
    const supabase = TestBed.inject(SUPABASE_CLIENT);
    const { data } = await supabase.auth.getSession();
    expect(data.session).not.toBeNull();
    expect(auth.hasValidSession()).toBe(false);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/login?returnUrl=%2F');
  });

  it('keeps allowing / with a Supabase session in supabase mode', async () => {
    await init((req) => req.flush({ mode: 'supabase' }));
    const router = TestBed.inject(Router);

    expect(await router.navigateByUrl('/')).toBe(true);
    expect(router.url).toBe('/');
  });
});
