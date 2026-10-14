import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface ProjectSummary {
  slug: string;
  description: string;
  counts: { total: number; done: number; inProgress: number; blocked: number };
}

export interface HarnessStateResponse {
  project: { slug: string; description: string };
  features: Array<{
    featureNumber: number;
    name: string;
    title: string;
    status: string;
    sdd: boolean;
  }>;
  openSession: {
    agent: string;
    feature: string;
    startedAt: string;
    nextStep: string | null;
  } | null;
  blockedFeatures: Array<{ name: string; note: string }>;
}

export interface AuthModeResponse {
  mode: 'supabase' | 'local';
}

export interface LocalLoginResponse {
  accessToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class HarnessApiService {
  private readonly http = inject(HttpClient);

  listProjects(): Observable<ProjectSummary[]> {
    return this.http.get<ProjectSummary[]>(`${environment.apiBaseUrl}/api/harness/projects`);
  }

  getProjectState(slug: string): Observable<HarnessStateResponse> {
    return this.http.get<HarnessStateResponse>(
      `${environment.apiBaseUrl}/api/harness/projects/${encodeURIComponent(slug)}/state`,
    );
  }

  getAuthMode(): Observable<AuthModeResponse> {
    return this.http.get<AuthModeResponse>(`${environment.apiBaseUrl}/api/auth/mode`);
  }

  loginLocal(email: string, password: string): Observable<LocalLoginResponse> {
    return this.http.post<LocalLoginResponse>(`${environment.apiBaseUrl}/api/auth/login`, {
      email,
      password,
    });
  }
}
