import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BarChartModule, ScaleType } from '@swimlane/ngx-charts';

import { DashboardAgentUsage, UsageBucket } from '../core/harness-api.service';
import { USAGE_CHART_COLORS } from './progress-format';
import {
  formatDuration,
  formatExactSeconds,
  formatExactTokens,
  formatTokens,
} from './usage-format';

interface ChartPoint {
  name: string;
  value: number;
}

interface SplitSegment {
  runtime: 'claude' | 'codex';
  share: number;
}

const RUNTIMES: Array<'claude' | 'codex'> = ['claude', 'codex'];
const TOKEN_BREAKDOWN: Array<{ key: keyof UsageBucket['tokens']; label: string }> = [
  { key: 'input', label: 'input' },
  { key: 'cacheRead', label: 'cache read' },
  { key: 'cacheWrite', label: 'cache write' },
  { key: 'output', label: 'output' },
  { key: 'reasoning', label: 'reasoning' },
];

const RANKING_SCHEME = {
  name: 'dashboard-agent-usage-ranking',
  selectable: true,
  group: ScaleType.Ordinal,
  domain: [USAGE_CHART_COLORS.ranking],
};

const MODEL_SCHEME = {
  name: 'dashboard-agent-usage-model',
  selectable: false,
  group: ScaleType.Ordinal,
  domain: [USAGE_CHART_COLORS.model],
};

export const MODEL_CHART_LIMIT = 8;
const MODEL_VISIBLE = MODEL_CHART_LIMIT - 1;
export const NO_MODEL_LABEL = '(no model)';

@Component({
  selector: 'app-dashboard-agent-usage',
  imports: [BarChartModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let u = data();
    @if (u === null) {
      <section
        class="flex min-w-0 flex-col gap-3"
        data-usage-overview
        aria-labelledby="usage-title"
      >
        <h2 id="usage-title" class="m-0 font-mono text-label font-semibold uppercase text-muted">
          Agent usage
        </h2>
        <p
          class="m-0 rounded-md border border-line bg-panel px-3.5 py-6 text-center font-sans text-sm text-muted"
          data-usage-empty
        >
          No agent runs recorded yet. Usage appears here once a harness project syncs its agent runs
          to the mirror.
        </p>
      </section>
    } @else {
      <section
        class="flex min-w-0 flex-col gap-3"
        data-usage-overview
        aria-labelledby="usage-title"
      >
        <h2 id="usage-title" class="m-0 font-mono text-label font-semibold uppercase text-muted">
          Agent usage
        </h2>

        <div
          class="grid grid-cols-1 rounded-md border border-line bg-panel sm:grid-cols-2"
          data-usage-strip
        >
          <div class="min-w-0 p-3.5" data-usage-tokens>
            <h3 class="m-0 mb-2 font-mono text-label font-semibold uppercase text-muted">
              Total tokens
            </h3>
            <data
              class="block font-mono text-2xl leading-none font-semibold text-bright tabular-nums"
              [attr.value]="u.tokens.total"
              [attr.title]="tokensTitle(u.tokens.total)"
              data-usage-tokens-total
              >{{ formatTokens(u.tokens.total) }}</data
            >
            <dl class="m-0 mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
              @for (item of tokenBreakdown; track item.key) {
                <div class="flex gap-1.5">
                  <dt class="font-mono text-micro text-faint">{{ item.label }}</dt>
                  <dd class="m-0">
                    <data
                      class="font-mono text-2xs text-dim tabular-nums"
                      [attr.value]="u.tokens[item.key]"
                      [attr.title]="tokensTitle(u.tokens[item.key])"
                      [attr.data-usage-tokens-key]="item.key"
                      >{{ formatTokens(u.tokens[item.key]) }}</data
                    >
                  </dd>
                </div>
              }
            </dl>
          </div>

          <div
            class="min-w-0 border-t border-line p-3.5 sm:border-l sm:border-t-0"
            data-usage-effort
          >
            <h3 class="m-0 mb-2 font-mono text-label font-semibold uppercase text-muted">
              Agent effort
            </h3>
            <data
              class="block font-mono text-2xl leading-none font-semibold text-bright tabular-nums"
              [attr.value]="u.effortSeconds"
              [attr.title]="formatExactSeconds(u.effortSeconds)"
              data-usage-effort-duration
              >{{ formatDuration(u.effortSeconds) }}</data
            >
            <div class="mt-2 font-mono text-2xs text-dim tabular-nums" data-usage-runs>
              <data [attr.value]="u.runs" [attr.title]="runsTitle(u.runs)" data-usage-runs-count>{{
                formatTokens(u.runs)
              }}</data
              >{{ runsLabel(u.runs) }}
            </div>
            <p class="m-0 mt-2 font-sans text-2xs text-muted" data-usage-effort-note>
              Adds up every run's duration, so overlapping runs each count in full.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.3fr]">
          <div class="min-w-0 rounded-md border border-line bg-panel p-3.5" data-usage-breakdown>
            <h3 class="m-0 mb-2 font-mono text-label font-semibold uppercase text-muted">
              By runtime
            </h3>
            <div class="flex items-center gap-2">
              @if (splitSegments().length > 0) {
                <span class="font-mono text-2xs text-soft tabular-nums" data-usage-split-claude
                  >{{ splitPercent(splitSegments(), 'claude') }}%</span
                >
              }
              <div
                class="flex h-2.5 flex-1 gap-0.5 overflow-hidden rounded-sm bg-edge"
                aria-hidden="true"
                data-usage-split
              >
                @for (segment of splitSegments(); track segment.runtime) {
                  <span
                    class="h-full"
                    [class]="segment.runtime === 'claude' ? 'bg-signal' : 'bg-dim'"
                    [style.width.%]="segment.share"
                    [attr.data-usage-split-segment]="segment.runtime"
                  ></span>
                }
              </div>
              @if (splitSegments().length > 0) {
                <span class="font-mono text-2xs text-soft tabular-nums" data-usage-split-codex
                  >{{ splitPercent(splitSegments(), 'codex') }}%</span
                >
              }
            </div>

            <ul class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              @for (runtime of runtimes; track runtime) {
                <li
                  class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-3"
                  [attr.data-usage-runtime]="runtime"
                >
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    [class]="runtime === 'claude' ? 'bg-signal' : 'bg-dim'"
                    aria-hidden="true"
                  ></span>
                  <span class="font-mono text-xs text-text">{{ runtime }}</span>
                  <data
                    class="font-mono text-2xs text-soft tabular-nums"
                    [attr.value]="u.byRuntime[runtime].tokens.total"
                    [attr.title]="tokensTitle(u.byRuntime[runtime].tokens.total)"
                    data-usage-runtime-tokens
                    >{{ formatTokens(u.byRuntime[runtime].tokens.total) }}</data
                  >
                  <data
                    class="font-mono text-2xs text-dim tabular-nums"
                    [attr.value]="u.byRuntime[runtime].runs"
                    [attr.title]="runsTitle(u.byRuntime[runtime].runs)"
                    data-usage-runtime-runs
                    >{{ formatTokens(u.byRuntime[runtime].runs)
                    }}{{ runsLabel(u.byRuntime[runtime].runs) }}</data
                  >
                </li>
              }
            </ul>

            <h3 class="m-0 mb-2 mt-4 font-mono text-label font-semibold uppercase text-muted">
              By model
            </h3>
            <div
              class="w-full overflow-hidden [&_.bar]:cursor-default [&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge"
              [style.height.px]="u.byModel.length === 0 ? null : modelChartHeight()"
              data-usage-models
            >
              @if (u.byModel.length === 0) {
                <p
                  class="m-0 py-2 text-center font-sans text-sm text-muted"
                  data-usage-models-empty
                >
                  No model recorded for any run.
                </p>
              } @else {
                <ngx-charts-bar-horizontal
                  [results]="modelPoints()"
                  [scheme]="modelScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showGridLines]="true"
                  [trimYAxisTicks]="true"
                  [maxYAxisTickLength]="16"
                  [barPadding]="8"
                  [legend]="false"
                  [animations]="false"
                  [xAxisTickFormatting]="axisFormat"
                >
                  <ng-template #tooltipTemplate let-model="model">
                    <div class="flex flex-col gap-0.5">
                      <span class="font-mono text-text">{{ model.name }}</span>
                      <span class="font-mono text-2xs text-dim">{{
                        tokensTitle(model.value)
                      }}</span>
                    </div>
                  </ng-template>
                </ngx-charts-bar-horizontal>
              }
            </div>
          </div>

          <div class="min-w-0 rounded-md border border-line bg-panel p-3.5" data-usage-ranking>
            <h3 class="m-0 mb-2 font-mono text-label font-semibold uppercase text-muted">
              Top 10 projects by tokens
            </h3>
            <div
              class="w-full overflow-hidden [&_.bar]:cursor-pointer [&_.bar:hover]:brightness-125 [&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge"
              [style.height.px]="rankingChartHeight()"
              data-usage-ranking-chart
            >
              <ngx-charts-bar-horizontal
                [results]="rankingPoints()"
                [scheme]="rankingScheme"
                [xAxis]="true"
                [yAxis]="true"
                [showGridLines]="true"
                [trimYAxisTicks]="true"
                [maxYAxisTickLength]="16"
                [barPadding]="8"
                [legend]="false"
                [animations]="false"
                [xAxisTickFormatting]="axisFormat"
                (select)="onRankingSelect($event)"
              >
                <ng-template #tooltipTemplate let-model="model">
                  <div class="flex flex-col gap-0.5">
                    <span class="font-mono text-text">{{ model.name }}</span>
                    <span class="font-mono text-2xs text-dim">{{ tokensTitle(model.value) }}</span>
                  </div>
                </ng-template>
              </ngx-charts-bar-horizontal>
            </div>
            <ol class="m-0 mt-3 list-none border-t border-edge p-0 pt-2" data-usage-ranking-readout>
              @for (entry of u.topProjects; track entry.slug; let i = $index) {
                <li
                  class="grid grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-1"
                  data-usage-rank
                >
                  <span class="font-mono text-tag text-faint">{{ i + 1 }}</span>
                  <a
                    [routerLink]="['/projects', entry.slug]"
                    class="min-w-0 truncate font-mono text-xs text-text hover:text-signal hover:underline underline-offset-2 focus:outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-signal"
                    [title]="entry.slug"
                    data-usage-slug
                    >{{ entry.slug }}</a
                  >
                  <data
                    class="font-mono text-2xs text-soft tabular-nums"
                    [attr.value]="entry.tokens.total"
                    [attr.title]="tokensTitle(entry.tokens.total)"
                    data-usage-rank-tokens
                    >{{ formatTokens(entry.tokens.total) }}</data
                  >
                  <data
                    class="font-mono text-2xs text-dim tabular-nums"
                    [attr.value]="entry.effortSeconds"
                    [attr.title]="formatExactSeconds(entry.effortSeconds)"
                    data-usage-rank-effort
                    >{{ formatDuration(entry.effortSeconds) }}</data
                  >
                </li>
              }
            </ol>
          </div>
        </div>
      </section>
    }
  `,
})
export class DashboardAgentUsageComponent {
  private readonly router = inject(Router);

  private readonly usageSignal = signal<DashboardAgentUsage | null>(null);

  @Input({ required: true })
  set usage(value: DashboardAgentUsage | null) {
    this.usageSignal.set(value);
  }

  readonly runtimes = RUNTIMES;
  readonly tokenBreakdown = TOKEN_BREAKDOWN;
  readonly rankingScheme = RANKING_SCHEME;
  readonly modelScheme = MODEL_SCHEME;

  formatTokens = formatTokens;
  formatDuration = formatDuration;
  formatExactSeconds = formatExactSeconds;

  readonly data = computed<DashboardAgentUsage | null>(() => {
    const u = this.usageSignal();
    if (!u || u.runs === 0) return null;
    return u;
  });

  readonly splitSegments = computed<SplitSegment[]>(() => {
    const u = this.data();
    if (!u) return [];
    const claudeTotal = u.byRuntime.claude.tokens.total;
    const codexTotal = u.byRuntime.codex.tokens.total;
    const sum = claudeTotal + codexTotal;
    if (sum === 0) return [];
    const out: SplitSegment[] = [];
    if (claudeTotal > 0) {
      out.push({ runtime: 'claude', share: (claudeTotal / sum) * 100 });
    }
    if (codexTotal > 0) {
      out.push({ runtime: 'codex', share: (codexTotal / sum) * 100 });
    }
    return out;
  });

  readonly modelPoints = computed<ChartPoint[]>(() => {
    const u = this.data();
    if (!u) return [];
    const total = u.byModel.length;
    if (total <= MODEL_CHART_LIMIT) {
      return u.byModel.map((m) => ({
        name: m.model ?? NO_MODEL_LABEL,
        value: m.tokens.total,
      }));
    }
    const head = u.byModel.slice(0, MODEL_VISIBLE);
    const rest = u.byModel.slice(MODEL_VISIBLE);
    const restValue = rest.reduce((acc, m) => acc + m.tokens.total, 0);
    return [
      ...head.map((m) => ({ name: m.model ?? NO_MODEL_LABEL, value: m.tokens.total })),
      { name: `Other (${rest.length} models)`, value: restValue },
    ];
  });

  readonly rankingPoints = computed<ChartPoint[]>(() => {
    const u = this.data();
    if (!u) return [];
    return u.topProjects.map((p) => ({ name: p.slug, value: p.tokens.total }));
  });

  readonly modelChartHeight = computed<number>(() => {
    const u = this.data();
    if (!u) return 74;
    return Math.max(this.modelPoints().length * 30 + 40, 74);
  });

  readonly rankingChartHeight = computed<number>(() => {
    const u = this.data();
    if (!u) return 74;
    return Math.max(u.topProjects.length * 30 + 40, 74);
  });

  readonly axisFormat = (v: number): string => formatTokens(v);

  tokensTitle(n: number): string {
    return `${formatExactTokens(n)} tokens`;
  }

  runsTitle(n: number): string {
    return `${formatExactTokens(n)} runs`;
  }

  runsLabel(n: number): string {
    return n === 1 ? ' run' : ' runs';
  }

  /**
   * Percentage label for one side of the split. Both labels stay consistent with the visible
   * segments: a present runtime never reads `0%`/`100%` (it reads `<1%`/`>99%`), and in the
   * middle range codex is derived as `100 - claude` so the two labels always add up to 100.
   */
  splitPercent(segments: SplitSegment[], runtime: 'claude' | 'codex'): string {
    const share = (r: 'claude' | 'codex'): number =>
      segments.find((s) => s.runtime === r)?.share ?? 0;
    const own = share(runtime);
    if (own <= 0) return '0';
    if (own >= 100) return '100';
    if (own < 1) return '<1';
    if (own > 99) return '>99';
    const claudeRounded = Math.round(share('claude'));
    return (runtime === 'claude' ? claudeRounded : 100 - claudeRounded).toString();
  }

  onRankingSelect(event: unknown): void {
    if (!event || typeof event !== 'object') return;
    const name = (event as { name?: unknown }).name;
    if (typeof name !== 'string') return;
    const u = this.data();
    if (!u) return;
    if (!u.topProjects.some((p) => p.slug === name)) return;
    void this.router.navigate(['/projects', name]);
  }
}
