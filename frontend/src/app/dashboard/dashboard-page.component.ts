import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, LogOut } from 'lucide-angular';

import { AuthService } from '../auth/auth.service';
import { HarnessApiService, HarnessStateResponse } from '../core/harness-api.service';
import { BlockedFeaturesCardComponent } from './blocked-features-card.component';
import { FeatureRowVm, FeaturesTableComponent } from './features-table.component';
import { OpenSessionCardComponent, OpenSessionVm } from './open-session-card.component';
import { BlockedFeatureVm } from './blocked-features-card.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    FeaturesTableComponent,
    OpenSessionCardComponent,
    BlockedFeaturesCardComponent,
    LucideAngularModule,
  ],
  providers: [LucideAngularModule.pick({ LogOut }).providers ?? []],
  template: `
    <div class="flex min-h-screen flex-col bg-ink text-text">
      <header
        class="sticky top-0 z-10 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-panel px-5 py-2.75"
      >
        <div class="flex items-center gap-2.25" data-wordmark>
          <span class="relative inline-flex h-2.25 w-2.25" data-beacon="wordmark">
            <span
              class="absolute inset-0 animate-beacon rounded-full bg-signal motion-reduce:hidden motion-reduce:animate-none"
              data-beacon-ping
            ></span>
            <span class="absolute inset-0 rounded-full bg-signal"></span>
          </span>
          <span class="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-bright">
            Harness
          </span>
        </div>
        <span class="text-line-strong" aria-hidden="true">·</span>
        <span class="font-mono text-xs text-muted" data-project-slug>{{
          projectName() ?? '…'
        }}</span>

        <div class="ml-auto flex items-center gap-4">
          <span
            class="flex items-center gap-1.75 font-mono text-tiny tracking-[0.04em]"
            [class]="activeAgents() > 0 ? 'text-signal' : 'text-faint'"
            data-agent-indicator
          >
            <span
              class="relative inline-flex h-1.75 w-1.75"
              [attr.data-beacon]="activeAgents() > 0 ? 'agent' : null"
            >
              @if (activeAgents() > 0) {
                <span
                  class="absolute inset-0 animate-beacon-fast rounded-full bg-signal motion-reduce:hidden motion-reduce:animate-none"
                  data-beacon-ping
                ></span>
              }
              <span
                class="absolute inset-0 rounded-full"
                [class]="activeAgents() > 0 ? 'bg-signal' : 'bg-faint'"
              ></span>
            </span>
            {{ activeAgents() > 0 ? activeAgents() + ' agent active' : 'idle' }}
          </span>

          <span
            class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-edge font-mono text-tiny font-semibold text-text"
            data-user-initial
          >
            {{ userInitial() }}
          </span>

          <button
            type="button"
            (click)="onLogout()"
            [disabled]="loggingOut()"
            class="flex items-center gap-1.5 rounded border border-line bg-transparent px-2.5 py-1.5 text-[11.5px] text-soft hover:bg-edge focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            data-logout
          >
            <lucide-icon name="log-out" class="block h-3 w-3" />
            {{ loggingOut() ? 'Logging out…' : 'Log out' }}
          </button>
        </div>
      </header>

      <main class="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1.7fr_1fr] lg:p-5" data-grid>
        <section class="flex min-w-0 flex-col gap-2">
          <h1 class="m-0 font-mono text-label font-semibold uppercase text-muted">Features</h1>
          @if (loadError()) {
            <div
              class="flex items-center gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
              role="alert"
            >
              <span class="shrink-0 font-mono text-[10px] tracking-[0.08em] text-status-blocked">
                [ERR]
              </span>
              <span>{{ loadError() }}</span>
            </div>
          }
          <app-features-table [features]="features() ?? []" />
        </section>

        <aside class="flex min-w-0 flex-col gap-3.5">
          <app-open-session-card [session]="session()" />
          <app-blocked-features-card [features]="blocked()" />
        </aside>
      </main>

      @if (loggingOut()) {
        <div
          class="fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-2.5 bg-ink/[0.88] motion-reduce:animate-none"
          role="status"
          aria-live="polite"
          data-logout-overlay
        >
          <span
            class="inline-block h-5 w-5 animate-spin-fast rounded-full border-[2.5px] border-signal border-r-transparent motion-reduce:animate-none"
            aria-hidden="true"
            data-spinner
          ></span>
          <span class="font-mono text-xs tracking-[0.04em] text-muted"
            >redirecting to sign in…</span
          >
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(HarnessApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly features = signal<FeatureRowVm[] | null>(null);
  readonly session = signal<OpenSessionVm | null>(null);
  readonly blocked = signal<BlockedFeatureVm[]>([]);
  readonly projectName = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly loggingOut = signal(false);

  readonly activeAgents = computed(() => (this.session() ? 1 : 0));

  readonly userInitial = computed(() => {
    const session = this.auth.session();
    const email = session?.user?.email ?? '?';
    return email.charAt(0).toUpperCase();
  });

  ngOnInit(): void {
    this.api.getState().subscribe({
      next: (state: HarnessStateResponse) => {
        this.features.set(state.features);
        this.session.set(state.openSession);
        this.blocked.set(state.blockedFeatures);
        this.projectName.set(state.project.slug);
      },
      error: (err: { message?: string }) => {
        const msg = err?.message ?? 'Failed to load harness state.';
        this.loadError.set(msg);
        this.features.set([]);
      },
    });
  }

  async onLogout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    try {
      await this.auth.logout(this.router);
    } finally {
      this.loggingOut.set(false);
    }
  }
}
