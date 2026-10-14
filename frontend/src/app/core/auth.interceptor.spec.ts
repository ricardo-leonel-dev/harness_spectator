import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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

@Component({ template: '' })
class BlankComponent {}

describe('authInterceptor', () => {
  let httpTesting: HttpTestingController;

  const signedOutSupabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  } as unknown as Supabase;

  beforeEach(() => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: BlankComponent }]),
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
});
