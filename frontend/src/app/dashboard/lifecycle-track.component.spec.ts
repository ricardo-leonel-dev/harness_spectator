import { TestBed } from '@angular/core/testing';

import { LifecycleTrackComponent } from './lifecycle-track.component';

describe('LifecycleTrackComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LifecycleTrackComponent],
    }).compileComponents();
  });

  interface TrackParts {
    host: HTMLElement;
    queued: HTMLElement;
    connector: HTMLElement;
    node: HTMLElement;
    label: HTMLElement;
  }

  function render(status: string): TrackParts {
    const fixture = TestBed.createComponent(LifecycleTrackComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const track = host.querySelector('span') as HTMLElement;
    const [queued, connector, node, label] = Array.from(track.children) as HTMLElement[];
    return { host, queued, connector, node, label };
  }

  it('renders a queued node, a connector and a status node carrying that status colour', () => {
    const cases: Array<{ status: string; node: string; connector: string; label: string }> = [
      {
        status: 'pending',
        node: 'border-status-pending',
        connector: 'bg-line',
        label: 'text-status-pending',
      },
      {
        status: 'in_progress',
        node: 'bg-signal',
        connector: 'bg-status-in-progress/40',
        label: 'text-status-in-progress',
      },
      {
        status: 'blocked',
        node: 'bg-status-blocked',
        connector: 'bg-status-blocked/40',
        label: 'text-status-blocked',
      },
      {
        status: 'done',
        node: 'bg-status-done',
        connector: 'bg-status-done/40',
        label: 'text-status-done',
      },
      {
        status: 'spec_ready',
        node: 'bg-status-spec-ready',
        connector: 'bg-status-spec-ready/40',
        label: 'text-status-spec-ready',
      },
    ];

    for (const expected of cases) {
      const { queued, connector, node, label } = render(expected.status);

      expect(queued.classList.contains('bg-muted'))
        .withContext(`${expected.status}: queued node`)
        .toBe(true);
      expect(connector.classList.contains(expected.connector))
        .withContext(`${expected.status}: connector`)
        .toBe(true);
      // The live node paints its own beacon dot; every other status paints the node itself.
      const nodeClasses = expected.status === 'in_progress' ? node.innerHTML : node.className;
      expect(nodeClasses).withContext(`${expected.status}: status node`).toContain(expected.node);

      expect(label.textContent?.trim()).toBe(expected.status);
      expect(label.classList.contains('font-mono')).toBe(true);
      expect(label.classList.contains(expected.label))
        .withContext(`${expected.status}: label colour`)
        .toBe(true);
    }
  });

  it('keeps the status node geometry when the variant class is bound', () => {
    const { node } = render('done');

    expect(node.classList.contains('bg-status-done')).toBe(true);
    expect(node.classList.contains('h-2')).toBe(true);
    expect(node.classList.contains('w-2')).toBe(true);
    expect(node.classList.contains('rounded-full')).toBe(true);
  });

  it('beacons only for in_progress', () => {
    expect(render('in_progress').host.querySelectorAll('[data-beacon]').length).toBe(1);

    for (const status of ['pending', 'blocked', 'done', 'spec_ready', 'unknown_status']) {
      expect(render(status).host.querySelectorAll('[data-beacon]').length)
        .withContext(status)
        .toBe(0);
    }
  });

  it('falls back to a muted track for a status it does not know', () => {
    const { host, node, label } = render('archived');

    expect(node.classList.contains('border-muted')).toBe(true);
    expect(label.classList.contains('text-muted')).toBe(true);
    expect(host.textContent).toContain('archived');
  });
});
