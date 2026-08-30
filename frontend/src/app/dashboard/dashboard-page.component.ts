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
    <div class="min-h-screen bg-ink">
      <header
        class="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel-raised px-4 py-3"
      >
        <span class="font-mono text-sm text-text">
          harness<span class="px-1 text-signal">.</span>spectator
        </span>
        <span class="font-mono text-xs text-muted">{{ projectName() ?? '…' }}</span>

        <div class="ml-auto flex items-center gap-4">
          <span class="flex items-center gap-2 font-mono text-xs text-muted">
            @if (activeAgents() > 0) {
              <span class="relative flex h-2 w-2" data-beacon>
                <span
                  class="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70 motion-reduce:hidden"
                ></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-signal"></span>
              </span>
              <span class="text-signal">{{ activeAgents() }} agent active</span>
            } @else {
              <span class="h-2 w-2 rounded-full bg-status-pending"></span>
              <span>idle</span>
            }
          </span>

          <span
            class="grid h-7 w-7 place-items-center rounded-sm border border-line font-mono text-xs text-muted"
          >
            {{ userInitial() }}
          </span>

          <button
            type="button"
            (click)="onLogout()"
            class="flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm text-text transition-colors hover:bg-panel focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal"
          >
            <lucide-icon name="log-out" class="h-4 w-4 text-muted" />
            Log out
          </button>
        </div>
      </header>

      <main class="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[2fr_1fr] lg:p-6">
        <section>
          <h1 class="font-sans text-label font-medium uppercase text-muted">Features</h1>
          @if (loadError()) {
            <div
              class="mt-3 flex gap-2 rounded-sm border-l-2 border-status-blocked bg-status-blocked/10 px-3 py-2 font-mono text-xs leading-relaxed text-text"
              role="alert"
            >
              <span class="text-status-blocked">[ERR]</span>
              <span>{{ loadError() }}</span>
            </div>
          }
          <div class="mt-3 overflow-x-auto rounded-sm border border-line">
            <app-features-table [features]="features() ?? []" />
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <app-open-session-card [session]="session()" />
          <app-blocked-features-card [features]="blocked()" />
        </aside>
      </main>
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
    await this.auth.logout(this.router);
  }
}
