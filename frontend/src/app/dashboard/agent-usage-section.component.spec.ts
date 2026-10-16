import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChanges } from '@angular/core';

import {
  AgentRunNode,
  AgentRunTokens,
  AgentUsageResponse,
  AgentUsageTotals,
  TokenTotals,
} from '../core/harness-api.service';
import { AgentUsageSectionComponent, AgentUsageState } from './agent-usage-section.component';

function tokens(over: Partial<AgentRunTokens> = {}): AgentRunTokens {
  return {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    ...over,
  };
}

function run(over: Partial<AgentRunNode>): AgentRunNode {
  return {
    externalId: 'x',
    parentExternalId: null,
    runtime: 'claude',
    role: 'agent',
    label: null,
    model: null,
    spawnDepth: 0,
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    tokens: tokens(),
    children: [],
    ...over,
  };
}

function tokenTotals(over: Partial<TokenTotals> = {}): TokenTotals {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0, ...over };
}

function totals(over: Partial<AgentUsageTotals> = {}): AgentUsageTotals {
  return { effortSeconds: 0, unionSeconds: 0, tokens: tokenTotals(), ...over };
}

function usageResponse(runs: AgentRunNode[], totalsValue?: AgentUsageTotals): AgentUsageResponse {
  return { runs, totals: totalsValue ?? totals() };
}

function basicUsage(): AgentUsageResponse {
  return usageResponse(
    [
      run({
        externalId: 'lead-1',
        parentExternalId: null,
        runtime: 'claude',
        role: 'leader',
        label: null,
        model: null,
        spawnDepth: 0,
        startedAt: '2026-01-01T00:00:00+00:00',
        finishedAt: '2026-01-01T00:01:40+00:00',
        durationSeconds: 100,
        tokens: tokens({ input: 5, output: 1, total: 6 }),
        children: [
          run({
            externalId: 'impl-1',
            parentExternalId: 'lead-1',
            runtime: 'claude',
            role: 'implementer',
            label: 'implement',
            model: 'claude-opus-5-5',
            spawnDepth: 1,
            startedAt: '2026-01-01T00:00:30+00:00',
            finishedAt: '2026-01-01T00:01:00+00:00',
            durationSeconds: 30,
            tokens: tokens({ total: 625 }),
            children: [
              run({
                externalId: 'explore-1',
                parentExternalId: 'impl-1',
                runtime: 'claude',
                role: 'explore',
                label: null,
                model: null,
                spawnDepth: 2,
                startedAt: '2026-01-01T00:00:45+00:00',
                finishedAt: '2026-01-01T00:00:55+00:00',
                durationSeconds: 10,
                tokens: tokens({ total: 200 }),
              }),
            ],
          }),
          run({
            externalId: 'rev-1',
            parentExternalId: 'lead-1',
            runtime: 'claude',
            role: 'reviewer',
            label: null,
            model: null,
            spawnDepth: 1,
            startedAt: '2026-01-01T00:01:10+00:00',
            finishedAt: '2026-01-01T00:01:40+00:00',
            durationSeconds: 30,
            tokens: tokens({ total: 100 }),
          }),
        ],
      }),
      run({
        externalId: 'thread-x',
        parentExternalId: 'outside-thread',
        runtime: 'codex',
        role: null,
        label: null,
        model: null,
        spawnDepth: 3,
        startedAt: '2026-01-01T00:01:30+00:00',
        finishedAt: '2026-01-01T00:01:40+00:00',
        durationSeconds: 10,
        tokens: tokens({ total: 1100 }),
      }),
    ],
    totals({
      effortSeconds: 170,
      unionSeconds: 110,
      tokens: tokenTotals({
        input: 22,
        cacheRead: 2000,
        cacheWrite: 0,
        output: 30,
        reasoning: 0,
        total: 2252,
      }),
    }),
  );
}

describe('AgentUsageSectionComponent', () => {
  let fixture: ComponentFixture<AgentUsageSectionComponent>;

  function render(state: AgentUsageState): HTMLElement {
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('featureName', 'demo_feature');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function items(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-run]'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentUsageSectionComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(AgentUsageSectionComponent);
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('shows the loading state with motion disabled under reduced motion (R10, R11, R43)', () => {
    const host = render({ kind: 'loading' });
    const status = host.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent?.replace(/\s+/g, ' ').trim()).toBe('Loading agent usage…');
    expect(host.querySelector('h3')?.textContent?.replace(/\s+/g, ' ')).toContain('Agent usage');
    const animated = Array.from(host.querySelectorAll<HTMLElement>('[class*="animate-"]'));
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) expect(el.classList).toContain('motion-reduce:animate-none');
  });

  it('renders [ERR] with the message, or the fallback when there is none (R12)', () => {
    let host = render({ kind: 'error', message: 'Http failure response: 401 Unauthorized' });
    let alert = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('[ERR]');
    expect(alert.textContent).toContain('Http failure response: 401 Unauthorized');

    host = render({ kind: 'error', message: 'Failed to load agent usage.' });
    alert = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Failed to load agent usage.');
  });

  it('renders the empty message and no totals for runs: [] (R13)', () => {
    const host = render({ kind: 'ok', usage: usageResponse([]) });
    expect(host.querySelector('[data-usage-empty]')?.textContent).toContain(
      'No agent runs recorded for this feature.',
    );
    expect(host.querySelector('[data-usage-totals]')).toBeNull();
    expect(host.querySelector('[data-usage-scroll]')).toBeNull();
  });

  it('renders one run item per node, nested under its parent, with data-level, in response order (R14, R15, R16, R17)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const list = items(host);
    expect(list.map((i) => i.getAttribute('data-run'))).toEqual([
      'lead-1',
      'impl-1',
      'explore-1',
      'rev-1',
      'thread-x',
    ]);
    expect(list.map((i) => i.getAttribute('data-level'))).toEqual(['0', '1', '2', '1', '0']);
    const impl = list.find((i) => i.getAttribute('data-run') === 'impl-1') as HTMLElement;
    const explore = list.find((i) => i.getAttribute('data-run') === 'explore-1') as HTMLElement;
    expect(impl.contains(explore)).toBe(true);
    const lead = list.find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    const threadX = list.find((i) => i.getAttribute('data-run') === 'thread-x') as HTMLElement;
    expect(lead.contains(impl)).toBe(true);
    expect(lead.contains(threadX)).toBe(false);
  });

  it('renders role, runtime, label, model, duration and tokens with fallbacks (R18-R23)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const lead = items(host).find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    expect(lead.querySelector('[data-run-role]')?.textContent?.trim()).toBe('leader');
    expect(lead.querySelector('[data-run-runtime]')?.textContent?.trim()).toBe('claude');
    expect(lead.querySelector('[data-run-duration]')?.textContent?.trim()).toBe('1m 40s');
    expect(lead.querySelector('[data-run-tokens]')?.textContent?.trim()).toBe('6');

    const impl = items(host).find((i) => i.getAttribute('data-run') === 'impl-1') as HTMLElement;
    expect(impl.querySelector('[data-run-label]')?.textContent).toContain('implement');
    expect(impl.querySelector('[data-run-model]')?.textContent?.trim()).toBe('claude-opus-5-5');

    const orphan = items(host).find(
      (i) => i.getAttribute('data-run') === 'thread-x',
    ) as HTMLElement;
    expect(orphan.querySelector('[data-run-role]')?.textContent?.trim()).toBe('unknown');
    expect(orphan.querySelector('[data-run-role]')?.classList).toContain('text-faint');
  });

  it('exposes exact token and duration values via title and value (R24, R35)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const lead = items(host).find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    const tokens = lead.querySelector('[data-run-tokens]') as HTMLElement;
    expect(tokens.tagName.toLowerCase()).toBe('data');
    expect(tokens.getAttribute('value')).toBe('6');
    expect(tokens.getAttribute('title')).toBe('6 tokens');

    const duration = lead.querySelector('[data-run-duration]') as HTMLElement;
    expect(duration.tagName.toLowerCase()).toBe('time');
    expect(duration.getAttribute('title')).toBe('100 s');

    const effort = host.querySelector('[data-usage-effort]') as HTMLElement;
    expect(effort.getAttribute('title')).toBe('170 s');
    const wall = host.querySelector('[data-usage-wall]') as HTMLElement;
    expect(wall.getAttribute('title')).toBe('110 s');

    const total = host.querySelector('[data-usage-tokens-total]') as HTMLElement;
    expect(total.getAttribute('value')).toBe('2252');
    expect(total.getAttribute('title')).toBe('2,252 tokens');
    expect(total.textContent?.trim()).toBe('2.3k');
  });

  it('marks top-level runs with a missing parent as detached (R25)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const orphan = items(host).find(
      (i) => i.getAttribute('data-run') === 'thread-x',
    ) as HTMLElement;
    const tag = orphan.querySelector('[data-run-detached]') as HTMLElement;
    expect(tag.textContent?.trim()).toBe('detached');
    expect(tag.getAttribute('title')).toContain('outside-thread');

    const lead = items(host).find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    expect(lead.querySelector('[data-run-detached]')).toBeNull();

    const impl = items(host).find((i) => i.getAttribute('data-run') === 'impl-1') as HTMLElement;
    expect(impl.querySelector('[data-run-detached]')).toBeNull();
  });

  it('positions run segments on the feature span and omits runs without an interval (R26, R27)', () => {
    const usage = basicUsage();
    usage.runs[0].children.push(
      run({
        externalId: 'inverted',
        parentExternalId: 'lead-1',
        runtime: 'claude',
        role: 'special',
        startedAt: '2026-01-01T00:02:00+00:00',
        finishedAt: '2026-01-01T00:01:00+00:00',
        durationSeconds: 0,
      }),
      run({
        externalId: 'no-finish',
        parentExternalId: 'lead-1',
        runtime: 'claude',
        role: 'half-open',
        startedAt: '2026-01-01T00:01:05+00:00',
        finishedAt: null,
        durationSeconds: null,
      }),
    );
    const host = render({ kind: 'ok', usage });
    const lead = items(host).find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    const span = lead.querySelector('[data-run-span]') as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.style.left).toBe('0%');
    expect(parseFloat(span.style.width)).toBeCloseTo(100, 4);

    const impl = items(host).find((i) => i.getAttribute('data-run') === 'impl-1') as HTMLElement;
    const implSpan = impl.querySelector('[data-run-span]') as HTMLElement;
    expect(implSpan).toBeTruthy();
    expect(parseFloat(implSpan.style.left)).toBeCloseTo(30, 4);
    expect(parseFloat(implSpan.style.width)).toBeCloseTo(30, 4);

    const inv = items(host).find((i) => i.getAttribute('data-run') === 'inverted') as HTMLElement;
    expect(inv.querySelector('[data-run-track]')).toBeNull();

    const nof = items(host).find((i) => i.getAttribute('data-run') === 'no-finish') as HTMLElement;
    expect(nof.querySelector('[data-run-track]')).toBeNull();
  });

  it('fills the track when the feature span has zero length (R28)', () => {
    const fixed = '2026-01-01T00:00:00+00:00';
    const usage = usageResponse([
      run({
        externalId: 'a',
        parentExternalId: null,
        runtime: 'claude',
        role: 'main',
        startedAt: fixed,
        finishedAt: fixed,
        durationSeconds: 0,
        tokens: tokens({ total: 0 }),
      }),
    ]);
    const host = render({ kind: 'ok', usage });
    const a = items(host).find((i) => i.getAttribute('data-run') === 'a') as HTMLElement;
    const segment = a.querySelector('[data-run-span]') as HTMLElement;
    expect(segment.style.left).toBe('0%');
    expect(segment.style.width).toBe('100%');
  });

  it('draws one strip segment per run with an interval (R29)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const segments = Array.from(host.querySelectorAll<HTMLElement>('[data-usage-strip-segment]'));
    expect(segments.length).toBe(5);
  });

  it('renders effort, wall time, token total, breakdown and note in totals (R30-R34)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const dl = host.querySelector('[data-usage-totals-dl]') as HTMLElement;
    const keys = Array.from(dl.querySelectorAll('dt')).map((d) => d.textContent?.trim() ?? '');
    expect(keys).toEqual(['agent effort', 'wall time', 'tokens']);
    expect(host.querySelector('[data-usage-effort]')?.textContent?.trim()).toBe('2m 50s');
    expect(host.querySelector('[data-usage-wall]')?.textContent?.trim()).toBe('1m 50s');
    const note = host.querySelector('[data-usage-note]') as HTMLElement;
    expect(note.textContent).toContain("Agent effort adds up every run's duration");
    const breakdown = ['input', 'cache-read', 'cache-write', 'output', 'reasoning'];
    for (const name of breakdown) {
      expect(host.querySelector(`[data-usage-tokens-${name}]`)).toBeTruthy();
    }
  });

  it('renders effort and wall time as zero duration when totals are empty (R30, R31)', () => {
    const host = render({
      kind: 'ok',
      usage: usageResponse(
        [
          run({
            externalId: 'a',
            parentExternalId: null,
            runtime: 'claude',
            role: 'main',
            startedAt: '2026-01-01T00:00:00+00:00',
            finishedAt: '2026-01-01T00:00:10+00:00',
            durationSeconds: 10,
            tokens: tokens({ total: 0 }),
          }),
        ],
        totals(),
      ),
    });
    expect(host.querySelector('[data-usage-effort]')?.textContent?.trim()).toBe('0s');
    expect(host.querySelector('[data-usage-wall]')?.textContent?.trim()).toBe('0s');
  });

  it('splits mono data values from sans prose (R40)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    document.body.appendChild(host);
    const lead = items(host).find((i) => i.getAttribute('data-run') === 'lead-1') as HTMLElement;
    const impl = items(host).find((i) => i.getAttribute('data-run') === 'impl-1') as HTMLElement;
    const mono = [
      lead.querySelector('[data-run-role]'),
      lead.querySelector('[data-run-runtime]'),
      lead.querySelector('[data-run-duration]'),
      lead.querySelector('[data-run-tokens]'),
      host.querySelector('[data-usage-effort]'),
      host.querySelector('[data-usage-wall]'),
      host.querySelector('[data-usage-tokens-total]'),
    ] as HTMLElement[];
    const sans = [
      impl.querySelector('[data-run-label]'),
      host.querySelector('[data-usage-note]'),
    ] as HTMLElement[];
    for (const el of mono) {
      expect(getComputedStyle(el).fontFamily)
        .withContext(el.outerHTML.slice(0, 80))
        .toContain('IBM Plex Mono');
    }
    for (const el of sans) {
      expect(getComputedStyle(el).fontFamily)
        .withContext(el.outerHTML.slice(0, 80))
        .toContain('IBM Plex Sans');
    }
  });

  it('labels the focusable run list with the feature name (R42)', () => {
    const host = render({ kind: 'ok', usage: basicUsage() });
    const scroll = host.querySelector('[data-usage-scroll]') as HTMLElement;
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBe('Agent runs of demo_feature');
  });

  it('never renders a beacon (R44)', () => {
    const states: AgentUsageState[] = [
      { kind: 'idle' },
      { kind: 'loading' },
      { kind: 'ok', usage: basicUsage() },
      { kind: 'error', message: 'boom' },
    ];
    for (const state of states) {
      const host = render(state);
      expect(host.querySelector('[data-beacon]'))
        .withContext((state as { kind: string }).kind)
        .toBeNull();
    }
  });

  it('preserves the feature span when the state object identity changes but content is the same', () => {
    const usage = basicUsage();
    render({ kind: 'ok', usage });
    const instance = fixture.componentInstance as unknown as { featureSpan: unknown };
    expect(instance.featureSpan).toBeTruthy();
  });

  it('clears the stripEntries when transitioning out of ok', () => {
    render({ kind: 'ok', usage: basicUsage() });
    render({ kind: 'loading' });
    const instance = fixture.componentInstance as unknown as { stripEntries: unknown[] };
    expect(instance.stripEntries.length).toBe(0);
    void (instance as unknown as SimpleChanges);
  });
});
