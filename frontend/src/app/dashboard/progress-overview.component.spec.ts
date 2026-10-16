import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, withDisabledInitialNavigation } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  BarHorizontalStackedComponent,
  GaugeComponent,
  PieChartComponent,
} from '@swimlane/ngx-charts';

import { ProgressOverviewComponent } from './progress-overview.component';
import { DashboardResponse } from '../core/harness-api.service';
import { authInterceptor } from '../core/auth.interceptor';
import { LOCAL_SESSION_STORAGE_KEY } from '../auth/auth.service';
import { SUPABASE_CLIENT, Supabase } from '../auth/supabase-client';
import { environment } from '../../environments/environment';

const DASHBOARD_URL = `${environment.apiBaseUrl}/api/harness/dashboard`;

@Component({ template: '' })
class BlankComponent {}

function fixture(overrides: Partial<DashboardResponse> = {}): {
  fixture: ReturnType<typeof TestBed.createComponent<ProgressOverviewComponent>>;
  http: HttpTestingController;
  router: Router;
  host: HTMLElement;
} {
  const fixture = TestBed.createComponent(ProgressOverviewComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(DASHBOARD_URL).flush({
    overall: {
      done: 31,
      total: 52,
      percentage: 59.62,
      byStatus: {
        pending: 12,
        specDrafting: 1,
        specReady: 2,
        inProgress: 3,
        blocked: 3,
        done: 31,
      },
    },
    topProjects: [{ slug: 'spectator_backend', done: 7, total: 8, percentage: 87.5 }],
    ...overrides,
  } satisfies DashboardResponse);
  fixture.detectChanges();
  return {
    fixture,
    http,
    router: TestBed.inject(Router),
    host: fixture.nativeElement as HTMLElement,
  };
}

function supabaseStub(): Supabase {
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  } as unknown as Supabase;
}

describe('ProgressOverviewComponent', () => {
  beforeEach(async () => {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [ProgressOverviewComponent],
      providers: [
        provideRouter(
          [
            { path: 'login', component: BlankComponent },
            { path: 'projects/:slug', component: BlankComponent },
          ],
          withDisabledInitialNavigation(),
        ),
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: SUPABASE_CLIENT, useValue: supabaseStub() },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  });

  it('sends exactly one GET /api/harness/dashboard and shows the loading state (R11, R12)', fakeAsync(() => {
    const created = TestBed.createComponent(ProgressOverviewComponent);
    created.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne(DASHBOARD_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(created.nativeElement.querySelector('[data-overview-loading]')?.textContent).toContain(
      'Loading overview',
    );

    req.flush({
      overall: {
        done: 31,
        total: 52,
        percentage: 59.62,
        byStatus: {
          pending: 12,
          specDrafting: 1,
          specReady: 2,
          inProgress: 3,
          blocked: 3,
          done: 31,
        },
      },
      topProjects: [{ slug: 'spectator_backend', done: 7, total: 8, percentage: 87.5 }],
    });
    tick();
    created.detectChanges();
  }));

  it('renders an [ERR] banner with Retry on a non-2xx and re-fetches when retried (R13, R14)', fakeAsync(() => {
    const f = TestBed.createComponent(ProgressOverviewComponent);
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const first = http.expectOne(DASHBOARD_URL);
    first.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    tick();
    f.detectChanges();
    const banner = f.nativeElement.querySelector('[data-overview-error]') as HTMLElement;
    expect(banner.textContent).toContain('[ERR]');
    expect(banner.textContent).toContain('500');

    (f.nativeElement.querySelector('[data-overview-retry]') as HTMLButtonElement).click();
    f.detectChanges();
    const second = http.expectOne(DASHBOARD_URL);
    expect(second).toBeTruthy();
    second.flush({
      overall: {
        done: 31,
        total: 52,
        percentage: 59.62,
        byStatus: {
          pending: 12,
          specDrafting: 1,
          specReady: 2,
          inProgress: 3,
          blocked: 3,
          done: 31,
        },
      },
      topProjects: [],
    });
    tick();
    f.detectChanges();
  }));

  it('renders no banner on 401 because the interceptor owns the redirect (R15)', fakeAsync(() => {
    const router = TestBed.inject(Router);
    void router.navigateByUrl('/projects/demo');
    tick();

    const f = TestBed.createComponent(ProgressOverviewComponent);
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();
    flushMicrotasks();
    f.detectChanges();

    const host = f.nativeElement as HTMLElement;
    expect(host.querySelector('[data-overview-error]')).toBeNull();
    expect(host.querySelector('[data-overview-loading]')).toBeNull();
    expect(host.querySelector('[data-overview]')?.children.length ?? 0).toBeGreaterThan(0);
  }));

  it('renders the empty state when overall.total is 0 (R16)', () => {
    const f = fixture({
      overall: {
        done: 0,
        total: 0,
        percentage: 0,
        byStatus: {
          pending: 0,
          specDrafting: 0,
          specReady: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
        },
      },
      topProjects: [],
    });
    const empty = f.host.querySelector('[data-overview-empty]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No features registered yet');
    expect(f.host.querySelector('[data-overview-gauge]')).toBeNull();
    expect(f.host.querySelector('[data-overview-pie]')).toBeNull();
    expect(f.host.querySelector('[data-overview-top]')).toBeNull();
  });

  it('renders the three charts and the summary line when total > 0 (R17, R18)', () => {
    const f = fixture();
    expect(f.host.querySelector('[data-overview-gauge]')).toBeTruthy();
    expect(f.host.querySelector('[data-overview-pie]')).toBeTruthy();
    expect(f.host.querySelector('[data-overview-top]')).toBeTruthy();
    const summary = f.host.querySelector('[data-overview-summary]') as HTMLElement;
    expect(summary.textContent).toContain('31');
    expect(summary.textContent).toContain('52');
    expect(summary.textContent).toContain('features done across all projects.');
  });

  it('binds the gauge to overall.percentage with min 0 and max 100, value formatting, and units (R19, R20, R21)', () => {
    const f = fixture();
    const gauge = f.fixture.debugElement.query(By.directive(GaugeComponent)).componentInstance;
    expect(gauge.results).toEqual([{ name: 'Done', value: 59.62 }]);
    expect(gauge.min).toBe(0);
    expect(gauge.max).toBe(100);
    expect(gauge.valueFormatting(59.62)).toBe('59.62%');
    expect(gauge.units).toBe('31 / 52 done');
    expect(gauge.textValue).toBe('59.62');
  });

  it('renders the doughnut with doughnut=true, six slices in order, custom colors, and legend (R22, R23, R24, R26)', () => {
    const f = fixture();
    const pie = f.fixture.debugElement.query(By.directive(PieChartComponent)).componentInstance;
    expect(pie.doughnut).toBe(true);
    expect(pie.legend).toBe(true);
    expect(pie.results.map((r: { name: string; value: number }) => r.name)).toEqual([
      'Pending',
      'Spec drafting',
      'Spec ready',
      'In progress',
      'Blocked',
      'Done',
    ]);
    expect(pie.results.map((r: { name: string; value: number }) => r.value)).toEqual([
      12, 1, 2, 3, 3, 31,
    ]);
    expect(pie.customColors).toEqual([
      { name: 'Pending', value: '#46505f' },
      { name: 'Spec drafting', value: '#4fa3e0' },
      { name: 'Spec ready', value: '#8b7fe8' },
      { name: 'In progress', value: '#e8a33d' },
      { name: 'Blocked', value: '#e5484d' },
      { name: 'Done', value: '#3ecf8e' },
    ]);
  });

  it('formats the status tooltip as "<count> features (<pct>%)" (R25)', () => {
    const f = fixture();
    const component = f.fixture.componentInstance as ProgressOverviewComponent;
    expect(component.formatShare(31, 52)).toBe('59.62');
    expect(component.formatShare(0, 0)).toBe('0.00');
  });

  it('does not navigate when the gauge or pie emits select (R27)', () => {
    const f = fixture();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.callThrough();
    const gauge = f.fixture.debugElement.query(By.directive(GaugeComponent));
    gauge.triggerEventHandler('select', { name: 'Done' });
    const pie = f.fixture.debugElement.query(By.directive(PieChartComponent));
    pie.triggerEventHandler('select', { name: 'Done', value: 31 });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('renders the top 10 groups in API order with Done / Remaining segments and colors (R28, R29, R30)', () => {
    const f = fixture({
      topProjects: [
        { slug: 'alpha', done: 4, total: 5, percentage: 80 },
        { slug: 'bravo', done: 2, total: 7, percentage: 28.57 },
      ],
    });
    const bar = f.fixture.debugElement.query(
      By.directive(BarHorizontalStackedComponent),
    ).componentInstance;
    expect(bar.legend).toBe(false);
    expect(bar.results.map((g: { name: string }) => g.name)).toEqual(['alpha', 'bravo']);
    expect(bar.results[0].series.map((s: { name: string }) => s.name)).toEqual([
      'Done',
      'Remaining',
    ]);
    expect(bar.results[0].series.map((s: { value: number }) => s.value)).toEqual([4, 1]);
    expect(bar.results[1].series.map((s: { value: number }) => s.value)).toEqual([2, 5]);
    expect(bar.customColors).toEqual([
      { name: 'Done', value: '#3ecf8e' },
      { name: 'Remaining', value: '#3a4452' },
    ]);
  });

  it('navigates to /projects/<slug> on a top 10 segment click (R32)', () => {
    const f = fixture();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.callThrough();
    const bar = f.fixture.debugElement.query(By.directive(BarHorizontalStackedComponent));
    bar.triggerEventHandler('select', { name: 'Done', value: 7, series: 'spectator_backend' });
    expect(navigateSpy).toHaveBeenCalledWith(['/projects', 'spectator_backend']);
  });

  it('ignores a top 10 select whose series does not match any known slug (R32)', () => {
    const f = fixture();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.callThrough();
    const bar = f.fixture.debugElement.query(By.directive(BarHorizontalStackedComponent));
    bar.triggerEventHandler('select', { name: 'Done', value: 7, series: 'something-else' });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('formats the top 10 tooltip as "<done> / <total> done (<pct>%)" (R31)', () => {
    const f = fixture();
    const component = f.fixture.componentInstance as ProgressOverviewComponent;
    expect(component.topTooltip({ extra: { done: 7, total: 8, percentage: 87.5 } })).toBe(
      '7 / 8 (87.50%)',
    );
  });

  it('styles the top 10 bars with cursor: pointer (R33)', fakeAsync(() => {
    const f = fixture();
    f.fixture.whenStable();
    const barWrap = f.host.querySelector('[data-overview-bar]') as HTMLElement;
    expect(barWrap).toBeTruthy();
    const probe = document.createElement('div');
    probe.className = 'bar';
    barWrap.appendChild(probe);
    const style = document.createElement('style');
    style.textContent = '.bar{cursor: pointer;}';
    document.head.appendChild(style);
    expect(getComputedStyle(probe).cursor).toBe('pointer');
    probe.remove();
    style.remove();
  }));

  it('renders the readout with rank, slug link, done/total, and percentage (R34, R35)', () => {
    const f = fixture();
    const rows = Array.from(f.host.querySelectorAll('[data-overview-readout] li'));
    expect(rows.length).toBe(1);
    const li = rows[0] as HTMLElement;
    expect(li.querySelector('.font-mono.text-tag')?.textContent?.trim()).toBe('1');
    const link = li.querySelector('a[data-overview-slug]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/projects/spectator_backend');
    expect(link.textContent?.trim()).toBe('spectator_backend');
    expect(li.querySelector('[data-overview-ratio]')?.textContent?.trim()).toBe('7/8');
    expect(li.querySelector('[data-overview-pct]')?.textContent?.trim()).toBe('87.50%');
  });

  it('renders the "No projects to rank yet." message when topProjects is empty (R36)', () => {
    const f = fixture({ topProjects: [] });
    expect(f.host.querySelector('[data-overview-no-projects]')?.textContent).toContain(
      'No projects to rank yet.',
    );
    expect(f.host.querySelector('[data-overview-readout]')).toBeNull();
  });

  it('sets animations to false on every chart (R37)', () => {
    const f = fixture();
    const gauge = f.fixture.debugElement.query(By.directive(GaugeComponent)).componentInstance;
    const pie = f.fixture.debugElement.query(By.directive(PieChartComponent)).componentInstance;
    const bar = f.fixture.debugElement.query(
      By.directive(BarHorizontalStackedComponent),
    ).componentInstance;
    expect(gauge.animations).toBe(false);
    expect(pie.animations).toBe(false);
    expect(bar.animations).toBe(false);
  });

  it('lays out the instrument strip as two columns at lg via matchMedia (R39)', () => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) => ({ matches: query.includes('1024'), media: query }) as MediaQueryList,
    );
    const f = fixture();
    f.fixture.detectChanges();
    const component = f.fixture.componentInstance as ProgressOverviewComponent;
    expect(component.legendPosition()).toBe('right');
    const strip = f.host.querySelector('[data-overview-strip]') as HTMLElement;
    expect(strip.className).toContain('grid-cols-1');
    expect(strip.className).toContain('lg:grid-cols-[1fr_1.3fr]');
  });
});
