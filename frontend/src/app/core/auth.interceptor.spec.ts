import { Component } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { HarnessApiService } from './harness-api.service';
import { AuthService, LOCAL_SESSION_STORAGE_KEY } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { environment } from '../../environments/environment';

const MODE_URL = `${environment.apiBaseUrl}/api/auth/mode`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const PROJECTS_URL = `${environment.apiBaseUrl}/api/harness/projects`;
const STATE_URL = (slug: string): string =>
  `${environment.apiBaseUrl}/api/harness/projects/${slug}/state`;

@Component({ template: '' })
class BlankComponent {}

describe('authInterceptor', () => {
  let httpTesting: HttpTestingController;

  const signedOutSupabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  } as unknown as Supabase;

  beforeEach(() => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: BlankComponent },
          { path: 'projects/:slug', component: BlankComponent },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: signedOutSupabase },
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

  function storeLocal(): void {
    localStorage.setItem(
      LOCAL_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'stored-local-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        email: 'a@b.c',
      }),
    );
  }

  function projectsRequestAuthorization(): string | null {
    TestBed.inject(HarnessApiService).listProjects().subscribe();
    const req = httpTesting.expectOne(PROJECTS_URL);
    const header = req.request.headers.get('Authorization');
    req.flush([]);
    return header;
  }

  it('attaches the restored local token as a Bearer header (R11)', async () => {
    storeLocal();
    await initWith('local');
    expect(projectsRequestAuthorization()).toBe('Bearer stored-local-token');
  });

  it('attaches the token issued by a local sign-in (R11)', async () => {
    const auth = await initWith('local');
    const login = auth.login('a@b.c', 'pw');
    const loginReq = httpTesting.expectOne(LOGIN_URL);
    expect(loginReq.request.headers.has('Authorization')).toBe(false);
    loginReq.flush({ accessToken: 'fresh-token', expiresAt: Math.floor(Date.now() / 1000) + 60 });
    await login;

    expect(projectsRequestAuthorization()).toBe('Bearer fresh-token');
    await auth.logout(TestBed.inject(Router));
  });

  it('never attaches a stored local token in supabase mode (R18)', async () => {
    storeLocal();
    await initWith('supabase');
    expect(projectsRequestAuthorization()).toBeNull();
  });

  describe('401 handling (R41–R44)', () => {
    it('ends the session and navigates to /login?returnUrl=<current> on a non-login 401', fakeAsync(() => {
      const router = TestBed.inject(Router);
      void router.navigate(['/projects/demo']);
      tick();

      TestBed.inject(HarnessApiService)
        .listProjects()
        .subscribe({
          next: () => undefined,
          error: () => undefined,
        });
      const req = httpTesting.expectOne(PROJECTS_URL);
      req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      tick();
      flushMicrotasks();

      expect(router.url).toBe('/login?returnUrl=%2Fprojects%2Fdemo');
      expect(router.parseUrl(router.url).queryParamMap.get('returnUrl')).toBe('/projects/demo');
    }));

    it('does not navigate to /login a second time when already on /login', fakeAsync(() => {
      const router = TestBed.inject(Router);
      void router.navigate(['/login']);
      tick();
      const initial = router.url;
      const navigateSpy = spyOn(router, 'navigate').and.callThrough();

      TestBed.inject(HarnessApiService)
        .listProjects()
        .subscribe({
          next: () => undefined,
          error: () => undefined,
        });
      const req = httpTesting.expectOne(PROJECTS_URL);
      req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      tick();
      flushMicrotasks();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(router.url).toBe(initial);
    }));

    it('passes a local-login 401 through without ending the session', fakeAsync(() => {
      const auth = TestBed.inject(AuthService);
      void auth.init();
      httpTesting.expectOne(MODE_URL).flush({ mode: 'local' });
      flushMicrotasks();
      void auth.login('a@b.c', 'bad');

      const sessionBefore = auth.session();
      const req = httpTesting.expectOne(LOGIN_URL);
      req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      tick();
      flushMicrotasks();

      expect(auth.session()).toBe(sessionBefore);
      expect(auth.session()).toBeNull();
    }));

    it('re-emits the original HttpErrorResponse to the caller after a 401', fakeAsync(() => {
      const router = TestBed.inject(Router);
      void router.navigate(['/projects/demo']);
      tick();

      let captured: unknown = null;
      TestBed.inject(HarnessApiService)
        .listProjects()
        .subscribe({
          error: (e: unknown) => {
            captured = e;
          },
        });
      const req = httpTesting.expectOne(PROJECTS_URL);
      req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      tick();
      flushMicrotasks();

      expect(captured).toBeInstanceOf(HttpErrorResponse);
      expect((captured as HttpErrorResponse).status).toBe(401);
    }));

    it('does not call endSession or navigate when a non-401 error happens on /projects/:slug', fakeAsync(() => {
      const auth = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      void router.navigate(['/projects/demo']);
      tick();

      const endSpy = spyOn(auth, 'endSession').and.callThrough();
      const navigateSpy = spyOn(router, 'navigate').and.callThrough();

      TestBed.inject(HarnessApiService)
        .getProjectState('demo')
        .subscribe({
          next: () => undefined,
          error: () => undefined,
        });
      httpTesting
        .expectOne(STATE_URL('demo'))
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      tick();
      flushMicrotasks();

      expect(endSpy).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(router.url).toBe('/projects/demo');
    }));
  });
});
