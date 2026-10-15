import { DestroyRef, Injectable, Injector, inject, signal, Signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { firstValueFrom, timeout } from 'rxjs';

import { HarnessApiService } from '../core/harness-api.service';
import { SUPABASE_CLIENT, Supabase } from './supabase-client';

export type AuthMode = 'supabase' | 'local' | 'unavailable';

export interface AuthSession {
  accessToken: string;
  email: string | null;
  expiresAt: number | null;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export const LOCAL_SESSION_STORAGE_KEY = 'harness.localSession';
export const MODE_REQUEST_TIMEOUT_MS = 5000;
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid login credentials';
export const LOCAL_SIGN_IN_FAILED_MESSAGE =
  'Sign-in failed: the backend returned an error or could not be reached.';
export const MODE_UNAVAILABLE_MESSAGE =
  'Cannot reach the backend to choose a sign-in method. Start the backend, then sign in.';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

interface LocalSession {
  accessToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly injector = inject(Injector);
  private readonly api = inject(HarnessApiService);
  private readonly _mode = signal<AuthMode | null>(null);
  private readonly _session = signal<AuthSession | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly mode: Signal<AuthMode | null> = this._mode.asReadonly();
  readonly session: Signal<AuthSession | null> = this._session.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearExpiryTimer());
  }

  async init(): Promise<void> {
    const mode = await this.resolveMode();
    await this.enterMode(mode);
  }

  hasValidSession(): boolean {
    const session = this._session();
    switch (this._mode()) {
      case 'supabase':
        return session !== null;
      case 'local':
        return session !== null && session.expiresAt !== null && !isExpired(session.expiresAt);
      default:
        return false;
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    if (this._mode() !== 'supabase' && this._mode() !== 'local') {
      const mode = await this.resolveMode();
      if (mode === 'unavailable') {
        return { ok: false, error: MODE_UNAVAILABLE_MESSAGE };
      }
      await this.enterMode(mode);
    }
    return this._mode() === 'local'
      ? this.loginLocal(email, password)
      : this.loginSupabase(email, password);
  }

  async logout(router: Router): Promise<void> {
    if (this._mode() === 'supabase') {
      await this.supabase().auth.signOut();
    } else {
      this.clearLocalSession();
    }
    await router.navigate(['/login']);
  }

  async endSession(): Promise<void> {
    if (this._mode() === 'supabase') {
      try {
        await this.supabase().auth.signOut({ scope: 'local' });
      } catch {
        // The interceptor relies on this clearing the local signal even when
        // Supabase rejects; the eventual navigation is its own concern.
      }
      this._session.set(null);
      return;
    }
    this.clearLocalSession();
  }

  private async resolveMode(): Promise<AuthMode> {
    try {
      const body = await firstValueFrom(
        this.api.getAuthMode().pipe(timeout(MODE_REQUEST_TIMEOUT_MS)),
      );
      const mode: unknown = body?.mode;
      return mode === 'supabase' || mode === 'local' ? mode : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  private async enterMode(mode: AuthMode): Promise<void> {
    this._mode.set(mode);
    if (mode === 'supabase') {
      removeStoredSession();
      await this.restoreSupabaseSession();
    } else if (mode === 'local') {
      this.restoreLocalSession();
    }
  }

  private async restoreSupabaseSession(): Promise<void> {
    const supabase = this.supabase();
    supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(fromSupabase(session));
    });
    try {
      const { data } = await supabase.auth.getSession();
      this._session.set(fromSupabase(data.session));
    } catch {
      this._session.set(null);
    }
  }

  private restoreLocalSession(): void {
    const stored = readStoredSession();
    if (!stored) {
      removeStoredSession();
      return;
    }
    this.setLocalSession(stored);
  }

  private async loginSupabase(email: string, password: string): Promise<LoginResult> {
    const { error } = await this.supabase().auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  private async loginLocal(email: string, password: string): Promise<LoginResult> {
    let body: unknown;
    try {
      body = await firstValueFrom(this.api.loginLocal(email, password));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
      }
      return { ok: false, error: LOCAL_SIGN_IN_FAILED_MESSAGE };
    }
    const local = parseLocalSession(body);
    if (!local) {
      return { ok: false, error: LOCAL_SIGN_IN_FAILED_MESSAGE };
    }
    const session = { ...local, email };
    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(session));
    this.setLocalSession(session);
    return { ok: true };
  }

  private setLocalSession(session: AuthSession & LocalSession): void {
    this._session.set(session);
    this.armExpiryTimer(session.expiresAt);
  }

  private armExpiryTimer(expiresAt: number): void {
    this.clearExpiryTimer();
    const delay = Math.min(Math.max(expiresAt * 1000 - Date.now(), 0), MAX_TIMER_DELAY_MS);
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      if (!isExpired(expiresAt)) {
        this.armExpiryTimer(expiresAt);
        return;
      }
      this.clearLocalSession();
      void this.injector.get(Router).navigate(['/login']);
    }, delay);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private clearLocalSession(): void {
    this.clearExpiryTimer();
    this._session.set(null);
    removeStoredSession();
  }

  // Resolved lazily so local mode never runs the factory: building a supabase-js client restores
  // and may refresh a persisted Supabase session over the network on its own (R5).
  private supabase(): Supabase {
    return this.injector.get(SUPABASE_CLIENT);
  }
}

function fromSupabase(session: Session | null | undefined): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    email: session.user?.email ?? null,
    expiresAt: session.expires_at ?? null,
  };
}

function isExpired(expiresAt: number): boolean {
  return expiresAt * 1000 <= Date.now();
}

function parseLocalSession(value: unknown): LocalSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const { accessToken, expiresAt } = value as Record<string, unknown>;
  if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || isExpired(expiresAt)) {
    return null;
  }
  return { accessToken, expiresAt };
}

function readStoredSession(): (AuthSession & LocalSession) | null {
  const raw = localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const local = parseLocalSession(value);
  if (!local) return null;
  const email = (value as Record<string, unknown>)['email'];
  return { ...local, email: typeof email === 'string' ? email : null };
}

function removeStoredSession(): void {
  localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
}
