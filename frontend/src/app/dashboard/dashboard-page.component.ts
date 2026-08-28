import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { HarnessApiService, HarnessStateResponse } from '../core/harness-api.service';
import { BlockedFeaturesCardComponent } from './blocked-features-card.component';
import { FeatureRowVm, FeaturesTableComponent } from './features-table.component';
import { OpenSessionCardComponent, OpenSessionVm } from './open-session-card.component';
import { BlockedFeatureVm } from './blocked-features-card.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [FeaturesTableComponent, OpenSessionCardComponent, BlockedFeaturesCardComponent],
  template: `
    <header class="topbar">
      <div class="brand">Harness</div>
      <div class="project">{{ projectName() ?? '…' }}</div>
      <div class="user">
        <span>{{ userInitial() }}</span>
        <button type="button" (click)="onLogout()">Log out</button>
      </div>
    </header>

    <main class="layout">
      <section class="left">
        <h1>Features</h1>
        @if (loadError()) {
          <div class="error-banner" role="alert">{{ loadError() }}</div>
        }
        <app-features-table [features]="features() ?? []" />
      </section>
      <aside class="right">
        <app-open-session-card [session]="session()" />
        <app-blocked-features-card [features]="blocked()" />
      </aside>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .topbar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 16px;
        background: #18181b;
        border-bottom: 1px solid #2d2d34;
      }
      .brand {
        font-weight: 600;
      }
      .project {
        color: #a1a1aa;
        font-size: 12px;
      }
      .user {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
      .user span {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #2d2d34;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .user button {
        padding: 4px 8px;
        background: transparent;
        color: #e6e6e6;
        border: 1px solid #2d2d34;
        border-radius: 4px;
        cursor: pointer;
      }
      .layout {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 16px;
        padding: 16px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #a1a1aa;
      }
      .right {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .error-banner {
        margin-bottom: 8px;
        padding: 8px;
        background: #5a1d1d;
        color: #ffd6d6;
        border-radius: 4px;
        font-size: 12px;
      }
    `,
  ],
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
