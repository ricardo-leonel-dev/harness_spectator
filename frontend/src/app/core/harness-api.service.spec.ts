import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import {
  DashboardResponse,
  FeatureLogResponse,
  HarnessApiService,
  ProjectSummary,
} from './harness-api.service';
import { environment } from '../../environments/environment';

describe('HarnessApiService', () => {
  let api: HarnessApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HarnessApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('lists projects from GET /api/harness/projects', () => {
    const payload: ProjectSummary[] = [
      { slug: 'alpha', description: 'a', counts: { total: 3, done: 1, inProgress: 1, blocked: 1 } },
    ];
    let received: ProjectSummary[] | undefined;
    api.listProjects().subscribe((list) => (received = list));

    const req = httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/projects`);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it('loads one project state from GET /api/harness/projects/:slug/state, encoding the slug', () => {
    api.getProjectState('team/odd slug').subscribe();
    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/api/harness/projects/team%2Fodd%20slug/state`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      project: { slug: 'x', description: '' },
      features: [],
      openSession: null,
      blockedFeatures: [],
    });
  });

  it('propagates a 404 for an unknown slug to the caller', () => {
    let status: number | undefined;
    api
      .getProjectState('nope')
      .subscribe({ error: (e: { status: number }) => (status = e.status) });
    httpTesting
      .expectOne(`${environment.apiBaseUrl}/api/harness/projects/nope/state`)
      .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });

  it('gets the cross-project dashboard from GET /api/harness/dashboard', () => {
    const payload: DashboardResponse = {
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
    };
    let received: DashboardResponse | undefined;
    api.getDashboard().subscribe((data) => (received = data));

    const req = httpTesting.expectOne(`${environment.apiBaseUrl}/api/harness/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it("gets one feature's process log, encoding slug and name", () => {
    const payload: FeatureLogResponse = {
      feature: {
        featureNumber: 7,
        name: 'a b/c',
        title: 'Show the log',
        status: 'in_progress',
        sdd: true,
        description: null,
        acceptance: ['one'],
      },
      sessions: [
        {
          localId: 3,
          agent: 'implementer',
          startedAt: '2026-10-14T06:30:00+00:00',
          closedAt: null,
          pausedAt: null,
          plan: ['step'],
          nextStep: null,
          changes: null,
          verification: null,
          closure: null,
          entries: [{ entry: 'did it', createdAt: '2026-10-14T06:31:00+00:00' }],
        },
      ],
    };
    let received: FeatureLogResponse | undefined;
    api.getFeatureLog('team/odd slug', 'a b/c').subscribe((log) => (received = log));

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/api/harness/projects/team%2Fodd%20slug/features/a%20b%2Fc/log`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });
});
