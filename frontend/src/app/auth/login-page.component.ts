import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule, Coffee, Heart, Key, Mail } from 'lucide-angular';

import { AuthService, MODE_UNAVAILABLE_MESSAGE } from './auth.service';
import { safeReturnUrl } from './return-url';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, LucideAngularModule],
  providers: [LucideAngularModule.pick({ Coffee, Heart, Key, Mail }).providers ?? []],
  template: `
    <div class="relative grid min-h-screen place-items-center bg-ink px-4 py-12">
      <div
        class="pointer-events-none absolute inset-0 bg-dot-grid bg-dots opacity-60"
        aria-hidden="true"
        data-dot-grid
      ></div>

      <form
        class="relative flex w-full max-w-[368px] flex-col gap-4 rounded-md border border-line bg-panel p-[30px] shadow-card"
        [formGroup]="form"
        (ngSubmit)="onSubmit()"
      >
        <div class="mb-0.5 flex flex-col items-center gap-3" data-login-header>
          <span class="relative inline-flex h-3 w-3" data-beacon="login-mark">
            <span
              class="absolute inset-0 animate-beacon rounded-full bg-signal motion-reduce:hidden motion-reduce:animate-none"
              data-beacon-ping
            ></span>
            <span class="absolute inset-0 rounded-full bg-signal"></span>
          </span>
          <div class="flex flex-col items-center gap-1">
            <h1 class="m-0 font-sans text-[17px] font-semibold tracking-[-0.01em] text-bright">
              Sign in
            </h1>
            <p class="m-0 font-mono text-micro uppercase tracking-[0.14em] text-subtle">
              harness · spectator
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="login-email" class="font-mono text-label uppercase text-muted">Email</label>
          <div class="relative flex items-center">
            <span
              class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-faint"
              data-field-icon
            >
              <lucide-icon name="mail" class="block h-3.5 w-3.5" />
            </span>
            <input
              id="login-email"
              type="email"
              formControlName="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded border border-line bg-ink py-[9px] pl-8 pr-2.5 font-mono text-xs text-text caret-signal outline-none placeholder:text-faint focus:border-signal"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="login-password" class="font-mono text-label uppercase text-muted">
            Password
          </label>
          <div class="relative flex items-center">
            <span
              class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-faint"
              data-field-icon
            >
              <lucide-icon name="key" class="block h-3.5 w-3.5" />
            </span>
            <input
              id="login-password"
              type="password"
              formControlName="password"
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full rounded border border-line bg-ink py-[9px] pl-8 pr-2.5 font-mono text-xs text-text caret-signal outline-none placeholder:text-faint focus:border-signal"
            />
          </div>
        </div>

        @if (bannerMessage()) {
          <div
            class="flex items-center gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
            role="alert"
          >
            <span class="shrink-0 font-mono text-[10px] tracking-[0.08em] text-status-blocked">
              [ERR]
            </span>
            <span>{{ bannerMessage() }}</span>
          </div>
        }

        <button
          type="submit"
          [disabled]="form.invalid || submitting()"
          class="flex items-center justify-center gap-2 rounded bg-signal px-3 py-2.5 text-[13px] font-semibold text-ink hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
        >
          @if (submitting()) {
            <span
              class="inline-block h-[13px] w-[13px] animate-spin-fast rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
              aria-hidden="true"
              data-spinner
            ></span>
          }
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>

        <footer
          class="mt-0.5 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint"
        >
          <span class="inline-flex items-center gap-[0.5em]" aria-hidden="true" data-footer-visual>
            <span>Made with</span>
            <lucide-icon name="coffee" class="block h-[1em] w-[1em] text-current" />
            <span>and</span>
            <lucide-icon name="heart" class="block h-[1em] w-[1em] text-signal" />
          </span>
          <span class="sr-only">Made with coffee and love</span>
        </footer>
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
  readonly bannerMessage = computed(
    () =>
      this.errorMessage() ?? (this.auth.mode() === 'unavailable' ? MODE_UNAVAILABLE_MESSAGE : null),
  );

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
    const returnUrl = this.router.parseUrl(this.router.url).queryParamMap.get('returnUrl');
    await this.router.navigateByUrl(safeReturnUrl(returnUrl));
  }
}
