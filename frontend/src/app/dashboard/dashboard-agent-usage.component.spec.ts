import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withDisabledInitialNavigation } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BarHorizontalComponent } from '@swimlane/ngx-charts';

import {
  DashboardAgentUsageComponent,
  MODEL_CHART_LIMIT,
  NO_MODEL_LABEL,
} from './dashboard-agent-usage.component';
import { DashboardAgentUsage, UsageBucket } from '../core/harness-api.service';
import { formatExactTokens, formatTokens } from './usage-format';

@Component({ template: '' })
class BlankComponent {}

function bucket(overrides: Partial<UsageBucket> = {}): UsageBucket {
  return {
    runs: 0,
    effortSeconds: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
    ...overrides,
  };
}

function usage(overrides: Partial<DashboardAgentUsage> = {}): DashboardAgentUsage {
  return {
    runs: 1834,
    effortSeconds: 1123440.5,
    tokens: {
      input: 1200000,
      cacheRead: 44100000,
      cacheWrite: 2100000,
      output: 790000,
      reasoning: 12000,
      total: 48213904,
    },
    byRuntime: {
      claude: {
        runs: 1200,
        effortSeconds: 900000,
        tokens: {
          input: 1000000,
          cacheRead: 35000000,
          cacheWrite: 1500000,
          output: 700000,
          reasoning: 11000,
          total: 39500000,
        },
      },
      codex: {
        runs: 634,
        effortSeconds: 223440.5,
        tokens: {
          input: 200000,
          cacheRead: 9100000,
          cacheWrite: 600000,
          output: 90000,
          reasoning: 1000,
          total: 8713904,
        },
      },
    },
    byModel: [
      {
        model: 'claude-opus-5',
        runs: 1200,
        effortSeconds: 900000,
        tokens: {
          input: 1000000,
          cacheRead: 35000000,
          cacheWrite: 1500000,
          output: 700000,
          reasoning: 11000,
          total: 39500000,
        },
      },
      {
        model: 'gpt-5-codex',
        runs: 600,
        effortSeconds: 200000,
        tokens: {
          input: 200000,
          cacheRead: 9000000,
          cacheWrite: 600000,
          output: 90000,
          reasoning: 1000,
          total: 8700000,
        },
      },
      {
        model: null,
        runs: 34,
        effortSeconds: 23440.5,
        tokens: {
          input: 0,
          cacheRead: 100000,
          cacheWrite: 0,
          output: 0,
          reasoning: 0,
          total: 13904,
        },
      },
    ],
    byRole: [],
    topProjects: [
      {
        slug: 'spectator_backend',
        runs: 1000,
        effortSeconds: 800000,
        tokens: {
          input: 900000,
          cacheRead: 30000000,
          cacheWrite: 1000000,
          output: 600000,
          reasoning: 9000,
          total: 33500000,
        },
      },
      {
        slug: 'rushr-web',
        runs: 500,
        effortSeconds: 200000,
        tokens: {
          input: 200000,
          cacheRead: 8000000,
          cacheWrite: 500000,
          output: 80000,
          reasoning: 1000,
          total: 9700000,
        },
      },
      {
        slug: 'spectator_long_project_slug_for_360',
        runs: 334,
        effortSeconds: 123440.5,
        tokens: {
          input: 100000,
          cacheRead: 4100000,
          cacheWrite: 600000,
          output: 110000,
          reasoning: 2000,
          total: 5013904,
        },
      },
    ],
    ...overrides,
  };
}

function configure(): void {
  TestBed.configureTestingModule({
    imports: [DashboardAgentUsageComponent],
    providers: [
      provideRouter(
        [{ path: 'projects/:slug', component: BlankComponent }],
        withDisabledInitialNavigation(),
      ),
      provideNoopAnimations(),
    ],
  });
}

function setUsage(
  fixture: ComponentFixture<DashboardAgentUsageComponent>,
  value: DashboardAgentUsage | null,
): void {
  fixture.componentRef.setInput('usage', value);
  fixture.detectChanges();
}

describe('DashboardAgentUsageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardAgentUsageComponent],
      providers: [
        provideRouter(
          [{ path: 'projects/:slug', component: BlankComponent }],
          withDisabledInitialNavigation(),
        ),
        provideNoopAnimations(),
      ],
    }).compileComponents();
  });

  it('titles the block "Agent usage" with mono uppercase instrument-label classes', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const title = fixture.nativeElement.querySelector('h2#usage-title') as HTMLElement;
    expect(title).toBeTruthy();
    expect(title.textContent?.trim()).toBe('Agent usage');
    expect(title.className).toContain('font-mono');
    expect(title.className).toContain('text-label');
    expect(title.className).toContain('uppercase');
    expect(getComputedStyle(title).textTransform).toBe('uppercase');
    expect(getComputedStyle(title).fontFamily).toContain('IBM Plex Mono');
  });

  it('renders the empty state for null usage and for runs: 0, with no cards', () => {
    configure();
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);

    setUsage(fixture, null);
    let empty = fixture.nativeElement.querySelector('[data-usage-empty]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No agent runs recorded yet.');
    expect(fixture.nativeElement.querySelector('[data-usage-tokens]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-effort]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-breakdown]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-ranking]')).toBeNull();

    setUsage(
      fixture,
      usage({
        runs: 0,
        tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
      }),
    );
    empty = fixture.nativeElement.querySelector('[data-usage-empty]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-usage-tokens]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-effort]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-breakdown]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-usage-ranking]')).toBeNull();
  });

  it('renders total tokens with the category breakdown (compact + exact title)', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const total = fixture.nativeElement.querySelector('[data-usage-tokens-total]') as HTMLElement;
    expect(total.textContent?.trim()).toBe(formatTokens(48213904));
    expect(total.getAttribute('value')).toBe('48213904');
    expect(total.getAttribute('title')).toBe(`${formatExactTokens(48213904)} tokens`);

    const keys: Array<[string, number]> = [
      ['input', 1200000],
      ['cacheRead', 44100000],
      ['cacheWrite', 2100000],
      ['output', 790000],
      ['reasoning', 12000],
    ];
    for (const [key, value] of keys) {
      const el = fixture.nativeElement.querySelector(
        `[data-usage-tokens-key="${key}"]`,
      ) as HTMLElement;
      expect(el).withContext(`expected ${key} breakdown row`).toBeTruthy();
      expect(el.textContent?.trim()).toBe(formatTokens(value));
      expect(el.getAttribute('value')).toBe(String(value));
      expect(el.getAttribute('title')).toBe(`${formatExactTokens(value)} tokens`);
    }
  });

  it('renders agent effort (duration + exact title) and the runs line with the singular/plural label', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const duration = fixture.nativeElement.querySelector(
      '[data-usage-effort-duration]',
    ) as HTMLElement;
    expect(duration.getAttribute('value')).toBe('1123440.5');
    expect(duration.getAttribute('title')).toBe('1123440.5 s');

    const runsLine = fixture.nativeElement.querySelector('[data-usage-runs]') as HTMLElement;
    const runsCount = fixture.nativeElement.querySelector('[data-usage-runs-count]') as HTMLElement;
    expect(runsCount.getAttribute('value')).toBe('1834');
    expect(runsCount.getAttribute('title')).toBe(`${formatExactTokens(1834)} runs`);
    expect(runsLine.textContent?.trim()).toBe(`${formatTokens(1834)} runs`);

    const note = fixture.nativeElement.querySelector('[data-usage-effort-note]') as HTMLElement;
    expect(note.textContent?.trim()).toBe(
      "Adds up every run's duration, so overlapping runs each count in full.",
    );
    expect(note.className).toContain('font-sans');
  });

  it('shows "1 run" (singular) when runs is exactly 1', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage({ runs: 1, effortSeconds: 60 }));
    const runsLine = fixture.nativeElement.querySelector('[data-usage-runs]') as HTMLElement;
    expect(runsLine.textContent?.trim()).toBe(`${formatTokens(1)} run`);
  });

  it('renders claude then codex runtime rows with tokens and runs', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-usage-runtime]'),
    );
    expect(rows.map((r) => r.getAttribute('data-usage-runtime'))).toEqual(['claude', 'codex']);

    const claudeRow = fixture.nativeElement.querySelector(
      '[data-usage-runtime="claude"]',
    ) as HTMLElement;
    const claudeTokens = claudeRow.querySelector('[data-usage-runtime-tokens]') as HTMLElement;
    const claudeRuns = claudeRow.querySelector('[data-usage-runtime-runs]') as HTMLElement;
    expect(claudeTokens.getAttribute('value')).toBe('39500000');
    expect(claudeTokens.textContent?.trim()).toBe(formatTokens(39500000));
    expect(claudeRuns.getAttribute('value')).toBe('1200');
    expect(claudeRuns.textContent?.trim()).toBe(`${formatTokens(1200)} runs`);

    const codexRow = fixture.nativeElement.querySelector(
      '[data-usage-runtime="codex"]',
    ) as HTMLElement;
    const codexTokens = codexRow.querySelector('[data-usage-runtime-tokens]') as HTMLElement;
    expect(codexTokens.getAttribute('value')).toBe('8713904');
  });

  it('sizes split segments by token share and omits zero runtimes', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(
      fixture,
      usage({
        byRuntime: {
          claude: bucket({
            runs: 100,
            tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 1000 },
          }),
          codex: bucket({
            runs: 0,
            tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
          }),
        },
      }),
    );

    const segments = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-usage-split-segment]',
      ),
    );
    expect(segments.map((s) => s.getAttribute('data-usage-split-segment'))).toEqual(['claude']);
    const claudeSegment = segments[0] as HTMLElement;
    expect(parseFloat(claudeSegment.style.width)).toBeCloseTo(100, 2);
    expect(claudeSegment.className).toContain('bg-signal');
    const codexLabel = fixture.nativeElement.querySelector(
      '[data-usage-split-codex]',
    ) as HTMLElement;
    expect(codexLabel.textContent?.trim()).toBe('0%');
  });

  it('renders an empty split track when both runtimes have zero tokens', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(
      fixture,
      usage({
        tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
        byRuntime: {
          claude: bucket(),
          codex: bucket(),
        },
      }),
    );
    expect(fixture.nativeElement.querySelector('[data-usage-split]')).toBeNull();
    const claudeLabel = fixture.nativeElement.querySelector('[data-usage-split-claude]');
    expect(claudeLabel).toBeNull();
  });

  it('passes one model point per model in order, labelling null as (no model)', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const component = fixture.componentInstance as DashboardAgentUsageComponent;
    const points = component.modelPoints();
    expect(points.map((p) => p.name)).toEqual(['claude-opus-5', 'gpt-5-codex', NO_MODEL_LABEL]);
    expect(points.map((p) => p.value)).toEqual([39500000, 8700000, 13904]);

    const modelChart = fixture.debugElement.query(By.directive(BarHorizontalComponent));
    expect(modelChart).toBeTruthy();
  });

  it('folds models beyond seven into "Other (n models)" when there are more than eight models', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);

    const nineModels = Array.from({ length: 9 }, (_, i) => ({
      model: `m-${i}`,
      runs: 1,
      effortSeconds: 10,
      tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 1000 - i },
    }));
    setUsage(fixture, usage({ byModel: nineModels }));
    const component = fixture.componentInstance as DashboardAgentUsageComponent;
    const ninePoints = component.modelPoints();
    expect(ninePoints.length).toBe(MODEL_CHART_LIMIT);
    expect(ninePoints.slice(0, 7).map((p) => p.name)).toEqual([
      'm-0',
      'm-1',
      'm-2',
      'm-3',
      'm-4',
      'm-5',
      'm-6',
    ]);
    expect(ninePoints[7].name).toBe('Other (2 models)');
    expect(ninePoints[7].value).toBe(993 + 992);

    const eightModels = Array.from({ length: 8 }, (_, i) => ({
      model: `e-${i}`,
      runs: 1,
      effortSeconds: 10,
      tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 100 - i },
    }));
    setUsage(fixture, usage({ byModel: eightModels }));
    const eightPoints = component.modelPoints();
    expect(eightPoints.map((p) => p.name)).toEqual([
      'e-0',
      'e-1',
      'e-2',
      'e-3',
      'e-4',
      'e-5',
      'e-6',
      'e-7',
    ]);
  });

  it('renders the no-model message when byModel is empty', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage({ byModel: [] }));

    const empty = fixture.nativeElement.querySelector('[data-usage-models-empty]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.textContent?.trim()).toBe('No model recorded for any run.');
    const modelsContainer = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-usage-models]',
    );
    expect(modelsContainer).toBeNull();
    const rankingChartStill = fixture.debugElement.query(By.directive(BarHorizontalComponent));
    expect(rankingChartStill).toBeTruthy();
  });

  it('does not navigate from the model chart', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.callThrough();

    const charts = fixture.debugElement.queryAll(By.directive(BarHorizontalComponent));
    const modelChart = charts.find(
      (d) =>
        d.nativeElement.getAttribute('data-usage-models') !== null ||
        d.nativeElement.closest('[data-usage-models]') !== null,
    );
    expect(modelChart).toBeTruthy();
    if (modelChart) {
      modelChart.triggerEventHandler('select', { name: 'claude-opus-5', value: 39500000 });
    }
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('renders the ranking title, chart points and readout in response order', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const component = fixture.componentInstance as DashboardAgentUsageComponent;
    expect(component.rankingPoints().map((p) => p.name)).toEqual([
      'spectator_backend',
      'rushr-web',
      'spectator_long_project_slug_for_360',
    ]);

    const rank = fixture.nativeElement.querySelector('[data-usage-ranking] h3') as HTMLElement;
    expect(rank.textContent?.trim()).toBe('Top 10 projects by tokens');

    const rows = fixture.nativeElement.querySelectorAll('[data-usage-rank]');
    expect(rows.length).toBe(3);

    const first = rows[0] as HTMLElement;
    expect(first.querySelector('.font-mono.text-tag')?.textContent?.trim()).toBe('1');
    const slug = first.querySelector('[data-usage-slug]') as HTMLElement;
    expect(slug.textContent?.trim()).toBe('spectator_backend');
    expect(slug.getAttribute('title')).toBe('spectator_backend');
    const tokens = first.querySelector('[data-usage-rank-tokens]') as HTMLElement;
    const effort = first.querySelector('[data-usage-rank-effort]') as HTMLElement;
    expect(tokens.textContent?.trim()).toBe(formatTokens(33500000));
    expect(tokens.getAttribute('value')).toBe('33500000');
    expect(tokens.getAttribute('title')).toBe(`${formatExactTokens(33500000)} tokens`);
    expect(effort.textContent?.trim()).toBe('222h 13m');
    expect(effort.getAttribute('value')).toBe('800000');
    expect(effort.getAttribute('title')).toBe('800000 s');
  });

  it('links each ranking slug to its project', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const rows = fixture.nativeElement.querySelectorAll('[data-usage-rank]');
    for (let i = 0; i < rows.length; i += 1) {
      const slug = rows[i].querySelector('[data-usage-slug]') as HTMLAnchorElement;
      expect(slug.tagName).toBe('A');
      const slugValue = slug.textContent?.trim() ?? '';
      expect(slug.getAttribute('href')).toBe(`/projects/${slugValue}`);
    }
  });

  it('navigates on a known ranking select and ignores unknown names', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.callThrough();

    const component = fixture.componentInstance as DashboardAgentUsageComponent;
    component.onRankingSelect({ name: 'spectator_backend', value: 33500000 });
    expect(navigateSpy).toHaveBeenCalledWith(['/projects', 'spectator_backend']);

    navigateSpy.calls.reset();
    component.onRankingSelect({ name: 'something-else', value: 1 });
    expect(navigateSpy).not.toHaveBeenCalled();

    component.onRankingSelect(null);
    component.onRankingSelect({ name: 123 });
    component.onRankingSelect('not-an-object');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('exposes exact counts and durations in data/title attributes', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const total = fixture.nativeElement.querySelector('[data-usage-tokens-total]') as HTMLElement;
    expect(total.getAttribute('value')).toBe('48213904');
    expect(total.getAttribute('title')).toBe('48,213,904 tokens');

    const duration = fixture.nativeElement.querySelector(
      '[data-usage-effort-duration]',
    ) as HTMLElement;
    expect(duration.getAttribute('value')).toBe('1123440.5');
    expect(duration.getAttribute('title')).toBe('1123440.5 s');

    const runsCount = fixture.nativeElement.querySelector('[data-usage-runs-count]') as HTMLElement;
    expect(runsCount.getAttribute('title')).toBe('1,834 runs');
  });

  it('formats chart axes compactly and exposes token tooltip templates', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const component = fixture.componentInstance as DashboardAgentUsageComponent;
    expect(component.axisFormat(2500000)).toBe('2.5M');
    expect(component.tokensTitle(1234567)).toBe('1,234,567 tokens');

    const charts = fixture.debugElement.queryAll(By.directive(BarHorizontalComponent));
    expect(charts.length).toBe(2);
    for (const chartDebug of charts) {
      const chart = chartDebug.componentInstance as BarHorizontalComponent;
      expect(chart.xAxisTickFormatting).toBe(component.axisFormat);
      expect(chart.animations).toBe(false);
      expect(chart.tooltipTemplate).toBeTruthy();
    }
  });

  it('disables chart animations', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const charts = fixture.debugElement.queryAll(By.directive(BarHorizontalComponent));
    for (const chartDebug of charts) {
      const chart = chartDebug.componentInstance as BarHorizontalComponent;
      expect(chart.animations).toBe(false);
    }
  });

  it('splits mono data values from sans prose', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const total = fixture.nativeElement.querySelector('[data-usage-tokens-total]') as HTMLElement;
    expect(total.className).toContain('font-mono');
    expect(getComputedStyle(total).fontFamily).toContain('IBM Plex Mono');

    const slug = fixture.nativeElement.querySelector('[data-usage-slug]') as HTMLElement;
    expect(slug.className).toContain('font-mono');

    const note = fixture.nativeElement.querySelector('[data-usage-effort-note]') as HTMLElement;
    expect(note.className).toContain('font-sans');
  });

  it('renders no beacon and no animated element inside the usage block', () => {
    const fixture = TestBed.createComponent(DashboardAgentUsageComponent);
    setUsage(fixture, usage());

    const block = fixture.nativeElement.querySelector('[data-usage-overview]') as HTMLElement;
    expect(block.querySelector('[data-beacon]')).toBeNull();
    for (const child of Array.from(block.querySelectorAll<HTMLElement>('*'))) {
      expect(child.className).not.toMatch(/\banimate-[a-z]/);
    }
  });
});
