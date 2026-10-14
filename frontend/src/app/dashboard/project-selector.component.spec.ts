import { DOCUMENT } from '@angular/common';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';

import { DashboardPageComponent } from './dashboard-page.component';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { authInterceptor } from '../core/auth.interceptor';
import { environment } from '../../environments/environment';

const PHONE_WIDTH = 360;

function appCss(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
}

function phoneFrame(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `width:${PHONE_WIDTH}px;height:800px;border:0;position:absolute;left:0;top:0;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument as Document;
  doc.open();
  doc.write('<!doctype html><html><head><style></style></head><body></body></html>');
  doc.close();
  (doc.head.querySelector('style') as HTMLStyleElement).textContent = appCss();
  return iframe;
}

function supabaseStub(): unknown {
  const session = {
    access_token: 't',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'u1', email: 'user@example.com', app_metadata: {}, user_metadata: {}, aud: '' },
  } as unknown as Session;
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
        cb('INITIAL_SESSION', session);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  };
}

describe('ProjectSelectorComponent in a 360px viewport', () => {
  let iframe: HTMLIFrameElement;

  beforeEach(async () => {
    iframe = phoneFrame();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: DashboardPageComponent,
            children: [{ path: 'projects/:slug', children: [] }],
          },
        ]),
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: supabaseStub() as Supabase },
        { provide: DOCUMENT, useValue: iframe.contentDocument },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    iframe.remove();
  });

  it('keeps the real CDK overlay panel inside the viewport', fakeAsync(() => {
    const doc = iframe.contentDocument as Document;
    const http = TestBed.inject(HttpTestingController);
    void TestBed.inject(AuthService).init();
    http.expectOne(`${environment.apiBaseUrl}/api/auth/mode`).flush({ mode: 'supabase' });
    flushMicrotasks();

    let harness: RouterTestingHarness | null = null;
    void RouterTestingHarness.create().then((h) => (harness = h));
    flushMicrotasks();
    void harness!.navigateByUrl('/projects/demo-project');
    tick();
    harness!.detectChanges();

    http.expectOne(`${environment.apiBaseUrl}/api/harness/projects`).flush([
      {
        slug: 'demo-project',
        description: 'A description long enough to need the full panel width',
        counts: { total: 4, done: 1, inProgress: 1, blocked: 1 },
      },
    ]);
    http.expectOne(`${environment.apiBaseUrl}/api/harness/projects/demo-project/state`).flush({
      project: { slug: 'demo-project', description: '' },
      features: [],
      openSession: null,
      blockedFeatures: [],
    });
    harness!.detectChanges();
    tick();

    const trigger = doc.querySelector('[data-selector-trigger]') as HTMLButtonElement;
    expect(doc.defaultView?.innerWidth).toBe(PHONE_WIDTH);
    expect(trigger.getBoundingClientRect().left).toBeGreaterThan(50);

    trigger.click();
    harness!.detectChanges();
    tick();
    flushMicrotasks();

    const panel = doc.querySelector('.cdk-overlay-container [data-selector-panel]') as HTMLElement;
    expect(panel).toBeTruthy();
    const rect = panel.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(250);
    expect(rect.left).toBe(16);
    expect(rect.right).toBe(PHONE_WIDTH - 16);
    expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
  }));
});
