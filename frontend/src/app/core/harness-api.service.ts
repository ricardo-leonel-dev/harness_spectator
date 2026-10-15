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

export interface FeatureHeader {
  featureNumber: number;
  name: string;
  title: string;
  status: string;
  sdd: boolean;
  description: string | null;
  acceptance: string[];
}

export interface ProcessLogEntry {
  entry: string;
  createdAt: string;
}

export interface ProcessLogSession {
  localId: number;
  agent: string;
  startedAt: string;
  closedAt: string | null;
  pausedAt: string | null;
  plan: string[] | null;
  nextStep: string[] | null;
  changes: string[] | null;
  verification: string | null;
  closure: string | null;
  entries: ProcessLogEntry[];
}

export interface FeatureLogResponse {
  feature: FeatureHeader;
  sessions: ProcessLogSession[];
}

export interface AuthModeResponse {
  mode: 'supabase' | 'local';
}

export interface LocalLoginResponse {
  accessToken: string;
  expiresAt: number;
}

export interface StatusCounts {
  pending: number;
  specDrafting: number;
  specReady: number;
  inProgress: number;
  blocked: number;
  done: number;
}

export interface DashboardResponse {
  overall: { done: number; total: number; percentage: number; byStatus: StatusCounts };
  topProjects: Array<{ slug: string; done: number; total: number; percentage: number }>;
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

  getFeatureLog(slug: string, name: string): Observable<FeatureLogResponse> {
    return this.http.get<FeatureLogResponse>(
      `${environment.apiBaseUrl}/api/harness/projects/${encodeURIComponent(slug)}/features/${encodeURIComponent(name)}/log`,
    );
  }

  getDashboard(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${environment.apiBaseUrl}/api/harness/dashboard`);
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
