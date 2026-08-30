import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule, Key, Lock, Mail } from 'lucide-angular';

import { AuthService } from './auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, LucideAngularModule],
  providers: [LucideAngularModule.pick({ Key, Lock, Mail }).providers ?? []],
  template: `
    <div class="grid min-h-screen place-items-center bg-ink px-6 py-12">
      <form
        class="w-full max-w-sm rounded-sm border border-line bg-panel p-8"
        [formGroup]="form"
        (ngSubmit)="onSubmit()"
      >
        <div class="flex items-center gap-3">
          <span
            class="relative grid h-9 w-9 place-items-center rounded-sm border border-line bg-panel-raised"
          >
            <lucide-icon name="lock" class="h-4 w-4 text-signal" />
            <span class="absolute -right-1 -top-1 flex h-2 w-2" data-beacon>
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70 motion-reduce:hidden"
              ></span>
              <span class="relative inline-flex h-2 w-2 rounded-full bg-signal"></span>
            </span>
          </span>
          <h1 class="font-mono text-sm tracking-tight text-text">
            harness<span class="px-1 text-signal">.</span>spectator
          </h1>
        </div>

        <p class="mt-6 text-sm leading-relaxed text-muted">
          Sign in to watch the agents work this project's feature queue.
        </p>

        <div class="mt-6 flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label for="login-email" class="font-mono text-label uppercase text-muted">
              Email
            </label>
            <div class="relative">
              <lucide-icon
                name="mail"
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                id="login-email"
                type="email"
                formControlName="email"
                autocomplete="email"
                class="w-full rounded-sm border border-line bg-ink py-2 pl-9 pr-3 font-mono text-sm text-text caret-signal outline-none placeholder:text-muted/60 focus:border-signal focus:ring-1 focus:ring-signal"
              />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label for="login-password" class="font-mono text-label uppercase text-muted">
              Password
            </label>
            <div class="relative">
              <lucide-icon
                name="key"
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                id="login-password"
                type="password"
                formControlName="password"
                autocomplete="current-password"
                class="w-full rounded-sm border border-line bg-ink py-2 pl-9 pr-3 font-mono text-sm text-text caret-signal outline-none placeholder:text-muted/60 focus:border-signal focus:ring-1 focus:ring-signal"
              />
            </div>
          </div>
        </div>

        @if (errorMessage()) {
          <div
            class="mt-4 flex gap-2 rounded-sm border-l-2 border-status-blocked bg-status-blocked/10 px-3 py-2 font-mono text-xs leading-relaxed text-text"
            role="alert"
          >
            <span class="text-status-blocked">[ERR]</span>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <button
          type="submit"
          [disabled]="form.invalid || submitting()"
          class="mt-6 w-full rounded-sm bg-signal py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="mt-6 text-center text-xs text-muted">Secured by Supabase Auth</p>
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.form.getRawValue();
    const result = await this.auth.login(email, password);
    this.submitting.set(false);
    if (!result.ok) {
      this.errorMessage.set(result.error ?? 'Login failed');
      return;
    }
    await this.router.navigate(['/']);
  }
}
