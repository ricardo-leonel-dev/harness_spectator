import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureLogResponse, ProcessLogSession } from '../core/harness-api.service';
import { AgentUsageSectionComponent, AgentUsageState } from './agent-usage-section.component';
import { ProcessLogCardComponent, ProcessLogState } from './process-log-card.component';

function session(overrides: Partial<ProcessLogSession>): ProcessLogSession {
  return {
    localId: 1,
    agent: 'implementer',
    startedAt: '2026-10-14T06:30:00+00:00',
    closedAt: null,
    pausedAt: null,
    plan: null,
    nextStep: null,
    changes: null,
    verification: null,
    closure: null,
    entries: [],
    ...overrides,
  };
}

function log(sessions: ProcessLogSession[], status = 'in_progress'): FeatureLogResponse {
  return {
    feature: {
      featureNumber: 7,
      name: 'feature_process_log_panel',
      title: "Show a feature's process log under Blocked",
      status,
      sdd: true,
      description: 'not rendered',
      acceptance: ['not rendered either'],
    },
    sessions,
  };
}

const FULL_SESSIONS: ProcessLogSession[] = [
  session({
    localId: 17,
    agent: 'leader -> implementer (Claude)',
    startedAt: '2026-10-14T09:00:00+00:00',
    closedAt: '2026-10-14T10:00:00+00:00',
    pausedAt: '2026-10-14T09:30:00+00:00',
    plan: ['Read docs', 'Write code'],
    nextStep: ['Ask for review'],
    changes: ['src/a.ts', 'src/b.ts'],
    verification: 'init.sh green',
    closure: 'Shipped the card',
    entries: [
      { entry: 'second entry first', createdAt: '2026-10-14T09:50:00+00:00' },
      { entry: 'then the earlier one', createdAt: '2026-10-14T09:10:00+00:00' },
    ],
  }),
  session({
    localId: 12,
    agent: 'leader -> spec_author (Claude)',
    startedAt: '2026-10-13T08:00:00+00:00',
    pausedAt: '2026-10-13T08:30:00+00:00',
  }),
];

describe('ProcessLogCardComponent', () => {
  let fixture: ComponentFixture<ProcessLogCardComponent>;

  function render(state: ProcessLogState): HTMLElement {
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function sessions(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-log-session]'));
  }

  function fieldKeys(item: HTMLElement): string[] {
    return Array.from(item.querySelectorAll('dt')).map((dt) => dt.textContent?.trim() ?? '');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProcessLogCardComponent, AgentUsageSectionComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ProcessLogCardComponent);
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('shows the hint when idle', () => {
    const host = render({ kind: 'idle' });
    const title = host.querySelector('h2') as HTMLElement;
    expect(title.textContent?.trim()).toBe('Process log');
    expect(host.textContent).toContain('Select a feature to see its process log.');
    expect(host.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });

  it('shows a status loader with motion disabled under reduced motion', () => {
    const host = render({ kind: 'loading', name: 'some_feature' });
    const status = host.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent?.replace(/\s+/g, ' ').trim()).toBe('Loading some_feature…');
    const animated = Array.from(host.querySelectorAll<HTMLElement>('[class*="animate-"]'));
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) expect(el.classList).toContain('motion-reduce:animate-none');
    expect(host.textContent).not.toContain('Select a feature');
  });

  it('renders the 404 and error variants, with the fallback message', () => {
    let host = render({ kind: 'not-found', name: 'ghost', slug: 'demo-project' });
    let alert = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('[404]');
    expect(alert.textContent?.replace(/\s+/g, ' ')).toContain(
      'No feature named ghost in demo-project.',
    );

    host = render({ kind: 'error', message: 'Http failure response: 401 Unauthorized' });
    alert = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('[ERR]');
    expect(alert.textContent).toContain('Http failure response: 401 Unauthorized');
    expect(alert.textContent).not.toContain('[404]');

    host = render({ kind: 'error', message: 'Failed to load the process log.' });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Failed to load the process log.',
    );
  });

  it('renders the header and the empty-sessions message', () => {
    const host = render({ kind: 'ok', log: log([], 'done') });
    expect(host.querySelector('[data-log-feature-id]')?.textContent?.trim()).toBe('07');
    expect(host.querySelector('[data-log-feature-name]')?.textContent?.trim()).toBe(
      'feature_process_log_panel',
    );
    expect(host.querySelector('[data-log-feature-title]')?.textContent?.trim()).toBe(
      "Show a feature's process log under Blocked",
    );
    const track = host.querySelector('[data-log-header] app-lifecycle-track') as HTMLElement;
    expect(track.querySelector('[data-track-label]')?.textContent?.trim()).toBe('done');
    expect(host.textContent).toContain('No sessions recorded for this feature yet.');
    expect(sessions(host).length).toBe(0);
    expect(host.textContent).not.toContain('not rendered');
  });

  it('renders every populated session field in response order', () => {
    const host = render({ kind: 'ok', log: log(FULL_SESSIONS) });
    const items = sessions(host);
    expect(items.map((i) => i.querySelector('[data-log-session-id]')?.textContent?.trim())).toEqual(
      ['#17', '#12'],
    );

    const [first] = items;
    expect(first.querySelector('[data-log-agent]')?.textContent?.trim()).toBe(
      'leader -> implementer (Claude)',
    );
    expect(fieldKeys(first)).toEqual([
      'started',
      'paused',
      'closed',
      'plan',
      'next',
      'log',
      'changes',
      'verified',
      'closure',
    ]);
    const field = (name: string): HTMLElement =>
      first.querySelector(`[data-field="${name}"]`) as HTMLElement;
    expect(field('started').textContent?.trim()).toBe('2026-10-14T09:00:00+00:00');
    expect(field('started').querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-14T09:00:00+00:00',
    );
    expect(field('paused').textContent?.trim()).toBe('2026-10-14T09:30:00+00:00');
    expect(field('closed').textContent?.trim()).toBe('2026-10-14T10:00:00+00:00');
    const listItems = (name: string): string[] =>
      Array.from(field(name).querySelectorAll('li')).map((li) => li.textContent?.trim() ?? '');
    expect(listItems('plan')).toEqual(['Read docs', 'Write code']);
    expect(listItems('next')).toEqual(['Ask for review']);
    expect(listItems('changes')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(field('verified').textContent).toBe('init.sh green');
    expect(field('closure').textContent).toBe('Shipped the card');

    const entries = Array.from(first.querySelectorAll<HTMLElement>('[data-log-entry]'));
    expect(entries.map((e) => e.querySelector('time')?.textContent?.trim())).toEqual([
      '2026-10-14T09:50:00+00:00',
      '2026-10-14T09:10:00+00:00',
    ]);
    expect(entries.map((e) => e.querySelector('p')?.textContent)).toEqual([
      'second entry first',
      'then the earlier one',
    ]);
  });

  it('omits null, empty and blank fields with their labels', () => {
    const host = render({
      kind: 'ok',
      log: log([
        session({
          closedAt: null,
          pausedAt: null,
          plan: [],
          nextStep: ['  ', ''],
          changes: null,
          verification: '   ',
          closure: '',
          entries: [],
        }),
        session({ localId: 2, plan: ['keep', ' '], verification: null }),
      ]),
    });
    const [blank, partial] = sessions(host);
    expect(fieldKeys(blank)).toEqual(['started']);
    expect(blank.querySelectorAll('[data-field]').length).toBe(1);
    expect(fieldKeys(partial)).toEqual(['started', 'plan']);
    expect(
      Array.from(partial.querySelectorAll('[data-field="plan"] li')).map((li) =>
        li.textContent?.trim(),
      ),
    ).toEqual(['keep']);
  });

  it('labels sessions closed, paused or open', () => {
    const host = render({
      kind: 'ok',
      log: log([
        session({ localId: 1, closedAt: '2026-10-14T10:00:00Z', pausedAt: '2026-10-14T09:00:00Z' }),
        session({ localId: 2, pausedAt: '2026-10-14T09:00:00Z' }),
        session({ localId: 3 }),
      ]),
    });
    const items = sessions(host);
    const labels = items.map((i) => i.querySelector('[data-log-session-state]') as HTMLElement);
    expect(labels.map((l) => l.textContent?.trim())).toEqual(['closed', 'paused', 'open']);
    expect(labels.map((l) => l.classList.contains('text-faint'))).toEqual([true, false, false]);
    expect(labels[1].classList).toContain('text-status-blocked');
    expect(labels[2].classList).toContain('text-signal');
    const nodes = items.map((i) => i.querySelector('[data-log-node]') as HTMLElement);
    expect(nodes[0].classList).toContain('bg-line-strong');
    expect(nodes[1].classList).toContain('border-status-blocked');
    expect(nodes[2].classList).toContain('bg-signal');
  });

  it('splits mono data values from sans prose', () => {
    const host = render({ kind: 'ok', log: log(FULL_SESSIONS) });
    document.body.appendChild(host);
    const [first] = sessions(host);

    const mono = [
      first.querySelector('[data-log-session-id]'),
      first.querySelector('[data-log-agent]'),
      ...Array.from(first.querySelectorAll('time')),
      ...Array.from(first.querySelectorAll('[data-field="changes"] li')),
      host.querySelector('[data-log-feature-name]'),
    ] as HTMLElement[];
    const sans = [
      host.querySelector('[data-log-feature-title]'),
      ...Array.from(first.querySelectorAll('[data-field="plan"] li')),
      ...Array.from(first.querySelectorAll('[data-field="next"] li')),
      ...Array.from(first.querySelectorAll('[data-log-entry] p')),
      first.querySelector('[data-field="verified"]'),
      first.querySelector('[data-field="closure"]'),
    ] as HTMLElement[];

    expect(mono.length).toBe(10);
    expect(sans.length).toBe(8);
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
    expect(host.querySelector('[data-log-feature-name]')?.classList).toContain('font-mono');
    expect(host.querySelector('[data-log-feature-title]')?.classList).toContain('font-sans');
  });

  it('never renders a beacon', () => {
    const open = session({ localId: 5 });
    for (const state of [
      { kind: 'idle' },
      { kind: 'loading', name: 'x' },
      { kind: 'not-found', name: 'x', slug: 'y' },
      { kind: 'error', message: 'boom' },
      { kind: 'ok', log: log([open], 'in_progress') },
    ] as ProcessLogState[]) {
      const host = render(state);
      expect(host.querySelector('[data-beacon]')).withContext(state.kind).toBeNull();
      expect(host.querySelector('[data-beacon-ping]')).withContext(state.kind).toBeNull();
      for (const el of Array.from(host.querySelectorAll<HTMLElement>('[class*="animate-"]'))) {
        expect(el.classList).toContain('motion-reduce:animate-none');
      }
    }
  });

  it('renders the usage section between the header and sessions only when the log is ok (R8, R9, R45)', () => {
    const nonOk: ProcessLogState[] = [
      { kind: 'idle' },
      { kind: 'loading', name: 'x' },
      { kind: 'not-found', name: 'x', slug: 'demo-project' },
      { kind: 'error', message: 'boom' },
    ];
    for (const state of nonOk) {
      fixture.componentRef.setInput('state', state);
      fixture.componentRef.setInput('usage', {
        kind: 'ok',
        usage: {
          runs: [],
          totals: {
            effortSeconds: 0,
            unionSeconds: 0,
            tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 },
          },
        },
      } as AgentUsageState);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('[data-usage]')).withContext(state.kind).toBeNull();
      expect(host.querySelector('h2')?.textContent?.trim()).toBe('Process log');
    }

    fixture.componentRef.setInput('state', { kind: 'ok', log: log([session({ localId: 1 })]) });
    fixture.componentRef.setInput('usage', { kind: 'idle' } as AgentUsageState);
    fixture.detectChanges();
    const okHost = fixture.nativeElement as HTMLElement;
    const header = okHost.querySelector('[data-log-header]') as HTMLElement;
    const usage = okHost.querySelector('[data-usage]') as HTMLElement;
    const sessions = okHost.querySelector('[data-log-scroll]') as HTMLElement;
    expect(usage).toBeTruthy();
    const order = Array.from(
      okHost.querySelectorAll('[data-log-header], [data-usage], [data-log-scroll]'),
    ).map((e) =>
      e.getAttribute('data-log-header') !== null
        ? 'header'
        : e.getAttribute('data-usage') !== null
          ? 'usage'
          : 'sessions',
    );
    expect(order).toEqual(['header', 'usage', 'sessions']);
    expect(header.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(usage.compareDocumentPosition(sessions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
