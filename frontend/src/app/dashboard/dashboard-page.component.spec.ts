import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Session } from '@supabase/supabase-js';

import { DashboardPageComponent } from './dashboard-page.component';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { authInterceptor } from '../core/auth.interceptor';
import { environment } from '../../environments/environment';

describe('DashboardPageComponent', () => {
  let httpTesting: HttpTestingController;

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
        signOut: () => Promise.resolve({ error: null }),
      },
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideRouter([]),
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

    req.flush({
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
    });

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

  it('surfaces an inline error when the backend returns a non-2xx response', fakeAsync(() => {
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

    const errorBanner = fixture.nativeElement.querySelector('.error-banner') as HTMLElement | null;
    expect(errorBanner).toBeTruthy();
  }));
});
