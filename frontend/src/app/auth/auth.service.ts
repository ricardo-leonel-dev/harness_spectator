import { Injectable, inject, signal, Signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';

import { SUPABASE_CLIENT, Supabase } from './supabase-client';

export interface LoginResult {
  ok: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase: Supabase = inject(SUPABASE_CLIENT);
  private readonly _session = signal<Session | null>(null);

  readonly session: Signal<Session | null> = this._session.asReadonly();

  init(): Promise<void> {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session ?? null);
    });
    return this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session ?? null);
    });
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  async logout(router: Router): Promise<void> {
    await this.supabase.auth.signOut();
    await router.navigate(['/login']);
  }
}
