import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { HarnessApiService, ProjectSummary } from './harness-api.service';
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
});
