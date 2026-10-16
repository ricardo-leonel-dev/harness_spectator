import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import {
  BarChartModule,
  GaugeModule,
  LegendPosition,
  PieChartModule,
  ScaleType,
} from '@swimlane/ngx-charts';

import { DashboardResponse, HarnessApiService, StatusCounts } from '../core/harness-api.service';
import { CHART_COLORS, formatPercent } from './progress-format';

type OverviewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'ok'; data: DashboardResponse };

const STATUS_LEGEND: Array<{ key: keyof StatusCounts; name: string }> = [
  { key: 'pending', name: 'Pending' },
  { key: 'specDrafting', name: 'Spec drafting' },
  { key: 'specReady', name: 'Spec ready' },
  { key: 'inProgress', name: 'In progress' },
  { key: 'blocked', name: 'Blocked' },
  { key: 'done', name: 'Done' },
];

const STATUS_SLICES = STATUS_LEGEND.map((s) => s.name);
const STATUS_HEX_BY_NAME: Record<string, string> = {
  Pending: CHART_COLORS.pending,
  'Spec drafting': CHART_COLORS.specDrafting,
  'Spec ready': CHART_COLORS.specReady,
  'In progress': CHART_COLORS.inProgress,
  Blocked: CHART_COLORS.blocked,
  Done: CHART_COLORS.done,
};

const STATUS_DOMAIN = STATUS_SLICES.map((name) => STATUS_HEX_BY_NAME[name] ?? CHART_COLORS.pending);
const TOP_DOMAIN = [CHART_COLORS.done, CHART_COLORS.remaining];

const PIE_SCHEME = {
  name: 'progress-overview-status',
  selectable: false,
  group: ScaleType.Ordinal,
  domain: STATUS_DOMAIN,
};
const BAR_SCHEME = {
  name: 'progress-overview-top',
  selectable: false,
  group: ScaleType.Ordinal,
  domain: TOP_DOMAIN,
};

@Component({
  selector: 'app-progress-overview',
  imports: [GaugeModule, PieChartModule, BarChartModule, RouterLink],
  template: `
    <div class="flex min-w-0 flex-col gap-4" data-overview>
      <header class="flex flex-col gap-1">
        <h1 class="m-0 font-mono text-label font-semibold uppercase text-muted">Overview</h1>
        @if (state(); as current) {
          @if (current.kind === 'ok' && current.data.overall.total > 0) {
            <p class="m-0 font-sans text-sm text-soft" data-overview-summary>
              <span class="font-mono text-text">{{ current.data.overall.done }}</span> of
              <span class="font-mono text-text">{{ current.data.overall.total }}</span>
              features done across all projects.
            </p>
          }
        }
      </header>

      @switch (state()?.kind) {
        @case ('loading') {
          <p
            class="m-0 flex items-center gap-2 rounded-md border border-line bg-panel px-3.5 py-6 text-sm text-muted"
            role="status"
            data-overview-loading
          >
            <span
              class="inline-block h-3.5 w-3.5 animate-spin-fast rounded-full border-2 border-signal border-r-transparent motion-reduce:animate-none"
              aria-hidden="true"
            ></span>
            Loading overview…
          </p>
        }
        @case ('error') {
          @if (state(); as current) {
            @if (current.kind === 'error') {
              <div
                class="flex flex-wrap items-center gap-x-2 gap-y-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
                role="alert"
                data-overview-error
              >
                <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked"
                  >[ERR]</span
                >
                <span class="min-w-0 flex-1 break-words"
                  >Could not load the overview: {{ current.message }}</span
                >
                <button
                  type="button"
                  (click)="retry()"
                  class="shrink-0 rounded border border-line bg-panel px-2.5 py-1 text-2xs text-soft hover:bg-edge focus:border-signal focus:outline-none"
                  data-overview-retry
                >
                  Retry
                </button>
              </div>
            }
          }
        }
        @case ('ok') {
          @if (state(); as current) {
            @if (current.kind === 'ok') {
              @if (current.data.overall.total === 0) {
                <p
                  class="m-0 rounded-md border border-line bg-panel px-3.5 py-6 text-center text-sm text-muted"
                  data-overview-empty
                >
                  No features registered yet. Run
                  <span class="font-mono text-text">./init.sh</span> in a harness project to sync it
                  to the mirror.
                </p>
              } @else {
                <section
                  class="grid grid-cols-1 rounded-md border border-line bg-panel lg:grid-cols-[1fr_1.3fr]"
                  data-overview-strip
                >
                  <div class="min-w-0 p-3.5">
                    <h2 class="m-0 mb-2.5 font-mono text-label font-semibold uppercase text-muted">
                      Overall progress
                    </h2>
                    <div
                      class="h-[220px] w-full overflow-hidden sm:h-[240px] [&_.background-arc_path]:!fill-line [&_.gauge_text]:font-mono [&_.gauge_text]:!fill-bright [&_.gauge_.units]:!fill-muted"
                      data-overview-gauge
                    >
                      <ngx-charts-gauge
                        [results]="gaugeResults()"
                        [min]="0"
                        [max]="100"
                        [textValue]="gaugeText()"
                        [units]="gaugeUnits()"
                        [bigSegments]="10"
                        [smallSegments]="0"
                        [angleSpan]="240"
                        [startAngle]="-120"
                        [showAxis]="false"
                        [animations]="false"
                        [valueFormatting]="gaugeValueFormatting"
                      />
                    </div>
                  </div>
                  <div
                    class="min-w-0 border-t border-line p-3.5 lg:border-l lg:border-t-0"
                    data-overview-status
                  >
                    <h2 class="m-0 mb-2.5 font-mono text-label font-semibold uppercase text-muted">
                      By status
                    </h2>
                    <div
                      class="h-[260px] w-full overflow-hidden [&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge [&_path]:cursor-default [&_.legend-label]:cursor-default"
                      data-overview-pie
                    >
                      <ngx-charts-pie-chart
                        [results]="statusSlices()"
                        [scheme]="pieScheme()"
                        [customColors]="statusColors()"
                        [doughnut]="true"
                        [arcWidth]="0.28"
                        [legend]="true"
                        [legendTitle]="''"
                        [legendPosition]="legendPosition()"
                        [animations]="false"
                      >
                        <ng-template #statusTip let-model="model">
                          <div class="flex flex-col gap-0.5">
                            <span class="font-mono text-text">{{ model.name }}</span>
                            <span class="font-mono text-2xs text-dim"
                              >{{ model.value }} features ({{
                                formatShare(model.value, total()!)
                              }}%)</span
                            >
                          </div>
                        </ng-template>
                      </ngx-charts-pie-chart>
                    </div>
                  </div>
                </section>

                <section class="rounded-md border border-line bg-panel p-3.5" data-overview-top>
                  <div class="mb-2.5 flex items-baseline justify-between gap-3">
                    <h2 class="m-0 font-mono text-label font-semibold uppercase text-muted">
                      Top 10 projects
                    </h2>
                    @if (current.data.topProjects.length > 0) {
                      <span class="flex gap-3 font-mono text-micro text-dim">
                        <span class="inline-flex items-center gap-1.5"
                          ><span
                            class="inline-block h-2 w-2 rounded-sm bg-status-done"
                            aria-hidden="true"
                          ></span>
                          Done</span
                        >
                        <span class="inline-flex items-center gap-1.5"
                          ><span
                            class="inline-block h-2 w-2 rounded-sm bg-line-strong"
                            aria-hidden="true"
                          ></span>
                          Remaining</span
                        >
                      </span>
                    }
                  </div>
                  @if (current.data.topProjects.length === 0) {
                    <p class="m-0 py-2 text-center text-sm text-muted" data-overview-no-projects>
                      No projects to rank yet.
                    </p>
                  } @else {
                    <div
                      class="w-full overflow-hidden [&_.bar]:cursor-pointer [&_.bar:hover]:brightness-125 [&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge"
                      [style.height.px]="topChartHeight()"
                      data-overview-bar
                    >
                      <ngx-charts-bar-horizontal-stacked
                        [results]="topGroups()"
                        [scheme]="barScheme()"
                        [customColors]="topColors()"
                        [xAxis]="true"
                        [yAxis]="true"
                        [showGridLines]="true"
                        [trimYAxisTicks]="true"
                        [maxYAxisTickLength]="16"
                        [barPadding]="10"
                        [legend]="false"
                        [animations]="false"
                        (select)="onTopSelect($event)"
                      >
                        <ng-template #topTip let-model="model">
                          <div class="flex flex-col gap-0.5">
                            <span class="font-mono text-text">{{ model.series }}</span>
                            <span class="font-mono text-2xs text-dim"
                              >{{ model.extra?.done }}/{{ model.extra?.total }} done ({{
                                formatPercent(model.extra?.percentage ?? 0)
                              }}%)</span
                            >
                          </div>
                        </ng-template>
                      </ngx-charts-bar-horizontal-stacked>
                    </div>
                    <ol
                      class="m-0 mt-3 list-none border-t border-edge p-0 pt-2"
                      data-overview-readout
                    >
                      @for (entry of current.data.topProjects; track entry.slug; let i = $index) {
                        <li
                          class="grid grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-1"
                        >
                          <span class="font-mono text-tag text-faint">{{ i + 1 }}</span>
                          <a
                            [routerLink]="['/projects', entry.slug]"
                            class="min-w-0 truncate font-mono text-xs text-text hover:text-signal hover:underline underline-offset-2 focus:outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-signal"
                            [title]="entry.slug"
                            data-overview-slug
                            >{{ entry.slug }}</a
                          >
                          <span class="font-mono text-2xs text-dim tabular-nums" data-overview-ratio
                            >{{ entry.done }}/{{ entry.total }}</span
                          >
                          <span class="font-mono text-2xs text-soft tabular-nums" data-overview-pct
                            >{{ formatPercent(entry.percentage) }}%</span
                          >
                        </li>
                      }
                    </ol>
                  }
                </section>
              }
            }
          }
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressOverviewComponent implements OnInit {
  private readonly api = inject(HarnessApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly state = signal<OverviewState>({ kind: 'loading' });

  readonly total = computed<number | null>(() => {
    const s = this.state();
    return s.kind === 'ok' ? s.data.overall.total : null;
  });

  readonly gaugeResults = computed<Array<{ name: string; value: number }>>(() => {
    const s = this.state();
    if (s.kind !== 'ok') return [{ name: 'Done', value: 0 }];
    return [{ name: 'Done', value: s.data.overall.percentage }];
  });

  readonly gaugeText = computed<string>(() => {
    const s = this.state();
    if (s.kind !== 'ok') return formatPercent(0);
    return formatPercent(s.data.overall.percentage);
  });

  readonly gaugeUnits = computed<string>(() => {
    const s = this.state();
    if (s.kind !== 'ok') return '0 / 0 done';
    return `${s.data.overall.done} / ${s.data.overall.total} done`;
  });

  readonly gaugeValueFormatting = (v: number): string => `${formatPercent(v)}%`;

  readonly statusSlices = computed<Array<{ name: string; value: number }>>(() => {
    const s = this.state();
    if (s.kind !== 'ok') return [];
    const by = s.data.overall.byStatus;
    return STATUS_LEGEND.map((row) => ({ name: row.name, value: by[row.key] }));
  });

  readonly statusColors = computed<Array<{ name: string; value: string }>>(() =>
    STATUS_SLICES.map((name) => ({
      name,
      value: STATUS_HEX_BY_NAME[name] ?? CHART_COLORS.pending,
    })),
  );

  readonly pieScheme = computed(() => PIE_SCHEME);

  readonly topGroups = computed<
    Array<{
      name: string;
      series: Array<{
        name: string;
        value: number;
        extra?: { done: number; total: number; percentage: number };
      }>;
    }>
  >(() => {
    const s = this.state();
    if (s.kind !== 'ok') return [];
    return s.data.topProjects.map((p) => ({
      name: p.slug,
      series: [
        {
          name: 'Done',
          value: p.done,
          extra: { done: p.done, total: p.total, percentage: p.percentage },
        },
        {
          name: 'Remaining',
          value: Math.max(p.total - p.done, 0),
          extra: { done: p.done, total: p.total, percentage: p.percentage },
        },
      ],
    }));
  });

  readonly topColors = computed<Array<{ name: string; value: string }>>(() => [
    { name: 'Done', value: CHART_COLORS.done },
    { name: 'Remaining', value: CHART_COLORS.remaining },
  ]);

  readonly barScheme = computed(() => BAR_SCHEME);

  readonly topChartHeight = computed<number>(() => {
    const s = this.state();
    if (s.kind !== 'ok') return 40;
    return Math.max(s.data.topProjects.length * 34 + 40, 74);
  });

  readonly legendPosition = computed<LegendPosition>(() => {
    if (typeof window === 'undefined') return LegendPosition.Below;
    return this.document.defaultView?.matchMedia?.('(min-width: 1024px)').matches
      ? LegendPosition.Right
      : LegendPosition.Below;
  });

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  onTopSelect(event: unknown): void {
    if (!event || typeof event !== 'object') return;
    const ev = event as { series?: unknown };
    const series = ev.series;
    if (typeof series !== 'string') return;
    const s = this.state();
    if (s.kind !== 'ok') return;
    const known = s.data.topProjects.some((p) => p.slug === series);
    if (!known) return;
    void this.router.navigate(['/projects', series]);
  }

  topTooltip(entry: { extra?: { done: number; total: number; percentage: number } }): string {
    const x = entry.extra;
    if (!x) return '';
    return `${x.done} / ${x.total} (${formatPercent(x.percentage)}%)`;
  }

  formatPercent(value: number): string {
    return formatPercent(value);
  }

  formatShare(count: number, total: number): string {
    if (total <= 0) return '0.00';
    return formatPercent((count / total) * 100);
  }

  private load(): void {
    this.state.set({ kind: 'loading' });
    this.api
      .getDashboard()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.state.set({ kind: 'ok', data }),
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.state.set({ kind: 'unauthorized' });
            return;
          }
          const message =
            err instanceof HttpErrorResponse ? err.message : 'Failed to load the overview.';
          this.state.set({ kind: 'error', message });
        },
      });
  }
}
