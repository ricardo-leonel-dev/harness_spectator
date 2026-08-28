import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <div class="login-shell">
      <form class="login-card" [formGroup]="form" (ngSubmit)="onSubmit()">
        <h1>Sign in</h1>
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" />
        </label>
        <label>
          Password
          <input type="password" formControlName="password" autocomplete="current-password" />
        </label>
        @if (errorMessage()) {
          <div class="error-banner" role="alert">{{ errorMessage() }}</div>
        }
        <button type="submit" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Signing in...' : 'Sign in' }}
        </button>
        <footer>Secured by Supabase Auth</footer>
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .login-shell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .login-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 320px;
        padding: 24px;
        background: #18181b;
        border: 1px solid #2d2d34;
        border-radius: 6px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #a1a1aa;
      }
      input {
        padding: 8px;
        background: #0e0e10;
        color: #e6e6e6;
        border: 1px solid #2d2d34;
        border-radius: 4px;
      }
      .error-banner {
        padding: 8px;
        background: #5a1d1d;
        color: #ffd6d6;
        border-radius: 4px;
        font-size: 12px;
      }
      button {
        padding: 8px 12px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      footer {
        font-size: 11px;
        color: #71717a;
        text-align: center;
      }
    `,
  ],
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
