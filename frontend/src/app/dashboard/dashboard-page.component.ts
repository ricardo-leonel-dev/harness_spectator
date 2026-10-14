import {
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
  EMPTY,
  catchError,
  distinctUntilChanged,
  filter,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { LucideAngularModule, LogOut } from 'lucide-angular';

import { AuthService } from '../auth/auth.service';
import {
  HarnessApiService,
  HarnessStateResponse,
  ProjectSummary,
} from '../core/harness-api.service';
import { BlockedFeaturesCardComponent } from './blocked-features-card.component';
import { FeatureRowVm, FeaturesTableComponent } from './features-table.component';
import { OpenSessionCardComponent, OpenSessionVm } from './open-session-card.component';
import { BlockedFeatureVm } from './blocked-features-card.component';
import { ProjectSelectorComponent } from './project-selector.component';

export const LAST_PROJECT_STORAGE_KEY = 'harness.lastProject';

type StateResult =
  | { kind: 'ok'; slug: string; state: HarnessStateResponse }
  | { kind: 'error'; slug: string; error: HttpErrorResponse };

@Component({
  selector: 'app-dashboard-page',
  imports: [
    FeaturesTableComponent,
    OpenSessionCardComponent,
    BlockedFeaturesCardComponent,
    ProjectSelectorComponent,
    LucideAngularModule,
  ],
  providers: [LucideAngularModule.pick({ LogOut }).providers ?? []],
  template: `
    <div class="flex min-h-screen flex-col bg-ink text-text">
      <header
        class="sticky top-0 z-10 flex items-center gap-x-2.5 border-b border-line bg-panel px-4 py-2.75 sm:gap-x-3.5 sm:px-5"
      >
        <div class="flex shrink-0 items-center gap-2.25" data-wordmark>
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
        <app-project-selector
          class="flex min-w-0"
          [projects]="projects()"
          [current]="slug()"
          [error]="projectsError()"
          (selected)="openProject($event)"
        />

        <div class="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
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
            <span class="sr-only sm:not-sr-only">{{
              activeAgents() > 0 ? activeAgents() + ' agent active' : 'idle'
            }}</span>
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
            class="flex items-center gap-1.5 rounded border border-line bg-transparent px-2.5 py-1.5 text-2xs text-soft hover:bg-edge focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            data-logout
          >
            <lucide-icon name="log-out" class="block h-3 w-3" />
            <span class="sr-only sm:not-sr-only">{{
              loggingOut() ? 'Logging out…' : 'Log out'
            }}</span>
          </button>
        </div>
      </header>

      <main class="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1.7fr_1fr] lg:p-5" data-grid>
        <section class="flex min-w-0 flex-col gap-2">
          <h1 class="m-0 font-mono text-label font-semibold uppercase text-muted">Features</h1>
          @if (notFound(); as missing) {
            <div
              class="flex flex-wrap items-center gap-x-2 gap-y-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
              role="alert"
              data-not-found
            >
              <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked">
                [404]
              </span>
              <span class="min-w-0 flex-1 break-words"
                >No project named <span class="font-mono text-text">{{ missing }}</span> in the
                mirror.</span
              >
              <button
                type="button"
                (click)="selector.open()"
                class="shrink-0 rounded border border-line bg-panel px-2.5 py-1 text-2xs text-soft hover:bg-edge focus:outline-none focus-visible:border-signal"
                data-choose-project
              >
                Choose another project
              </button>
            </div>
          } @else if (loadError()) {
            <div
              class="flex items-center gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
              role="alert"
            >
              <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked">
                [ERR]
              </span>
              <span class="min-w-0 break-words">{{ loadError() }}</span>
            </div>
          }
          @if (loading()) {
            <p
              class="m-0 flex items-center gap-2 rounded-md border border-line bg-panel px-3.5 py-6 text-sm text-muted"
              role="status"
              data-state-loading
            >
              <span
                class="inline-block h-3.5 w-3.5 animate-spin-fast rounded-full border-2 border-signal border-r-transparent motion-reduce:animate-none"
                aria-hidden="true"
              ></span>
              @if (slug(); as current) {
                Loading <span class="font-mono text-text">{{ current }}</span
                >…
              } @else {
                Loading projects…
              }
            </p>
          } @else if (noProjects()) {
            <p
              class="m-0 rounded-md border border-line bg-panel px-3.5 py-6 text-center text-sm text-muted"
              data-no-projects
            >
              No projects in the mirror yet — run
              <span class="font-mono text-text">./init.sh</span> in a harness project to sync it.
            </p>
          } @else if (showsProject()) {
            <app-features-table [features]="features() ?? []" />
          }
        </section>

        @if (showsProject()) {
          <aside class="flex min-w-0 flex-col gap-3.5">
            <app-open-session-card [session]="session()" />
            <app-blocked-features-card [features]="blocked()" />
          </aside>
        }
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
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild(ProjectSelectorComponent, { static: true }) selector!: ProjectSelectorComponent;

  readonly projects = signal<ProjectSummary[] | null>(null);
  readonly projectsError = signal<string | null>(null);
  readonly slug = signal<string | null>(null);
  readonly features = signal<FeatureRowVm[] | null>(null);
  readonly session = signal<OpenSessionVm | null>(null);
  readonly blocked = signal<BlockedFeatureVm[]>([]);
  readonly stateLoading = signal(false);
  readonly notFound = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly loggingOut = signal(false);

  readonly activeAgents = computed(() => (this.session() ? 1 : 0));
  readonly loading = computed(
    () =>
      this.stateLoading() ||
      (this.slug() === null && this.projects() === null && this.projectsError() === null),
  );
  readonly showsProject = computed(() => this.slug() !== null && this.notFound() === null);
  readonly noProjects = computed(() => this.slug() === null && this.projects()?.length === 0);

  readonly userInitial = computed(() => {
    const session = this.auth.session();
    const email = session?.email ?? '?';
    return email.charAt(0).toUpperCase();
  });

  ngOnInit(): void {
    this.api
      .listProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.projects.set(list);
          if (this.slug() === null) this.redirectToDefault(list);
        },
        error: (err: { message?: string }) => {
          const msg = err?.message ?? 'Failed to load projects.';
          this.projectsError.set(msg);
          if (this.slug() === null) this.loadError.set(msg);
        },
      });

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        startWith(null),
        map(() => this.route.snapshot.firstChild?.paramMap.get('slug') ?? null),
        distinctUntilChanged(),
        switchMap((slug) => {
          this.resetState(slug);
          if (slug === null) {
            const list = this.projects();
            if (list) this.redirectToDefault(list);
            return EMPTY;
          }
          return this.api.getProjectState(slug).pipe(
            map((state): StateResult => ({ kind: 'ok', slug, state })),
            catchError((error: HttpErrorResponse) =>
              of<StateResult>({ kind: 'error', slug, error }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyState(result));
  }

  openProject(slug: string): void {
    void this.router.navigate(['/projects', slug]);
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

  private resetState(slug: string | null): void {
    this.slug.set(slug);
    this.features.set(null);
    this.session.set(null);
    this.blocked.set([]);
    this.notFound.set(null);
    this.loadError.set(null);
    this.stateLoading.set(slug !== null);
  }

  private applyState(result: StateResult): void {
    this.stateLoading.set(false);
    if (result.kind === 'ok') {
      this.features.set(result.state.features);
      this.session.set(result.state.openSession);
      this.blocked.set(result.state.blockedFeatures);
      rememberProject(result.slug);
      return;
    }
    if (result.error.status === 404) {
      this.notFound.set(result.slug);
      return;
    }
    this.loadError.set(result.error.message ?? 'Failed to load harness state.');
    this.features.set([]);
  }

  private redirectToDefault(list: ProjectSummary[]): void {
    if (list.length === 0) return;
    const remembered = recallProject();
    const target = list.some((p) => p.slug === remembered) ? remembered : list[0].slug;
    void this.router.navigate(['/projects', target], { replaceUrl: true });
  }
}

function rememberProject(slug: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, slug);
  } catch {
    return;
  }
}

function recallProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}
