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
    return {
      host,
      queued: host.querySelector('[data-track-queued]') as HTMLElement,
      connector: host.querySelector('[data-track-connector]') as HTMLElement,
      node: host.querySelector('[data-track-node]') as HTMLElement,
      label: host.querySelector('[data-track-label]') as HTMLElement,
    };
  }

  it('follows the reference STATUS_TRACK for every known status', () => {
    const cases: Array<{
      status: string;
      connector: string;
      fill: 'filled' | 'hollow';
      node: string;
      label: string;
      labelColor: string;
    }> = [
      {
        status: 'pending',
        connector: 'bg-line',
        fill: 'hollow',
        node: 'border-status-pending',
        label: 'pending',
        labelColor: 'text-muted',
      },
      {
        status: 'spec_ready',
        connector: 'bg-line',
        fill: 'hollow',
        node: 'border-status-spec-ready',
        label: 'spec ready',
        labelColor: 'text-status-spec-ready',
      },
      {
        status: 'in_progress',
        connector: 'bg-signal',
        fill: 'filled',
        node: 'bg-signal',
        label: 'in progress',
        labelColor: 'text-signal',
      },
      {
        status: 'blocked',
        connector: 'bg-status-blocked',
        fill: 'filled',
        node: 'bg-status-blocked',
        label: 'blocked',
        labelColor: 'text-status-blocked',
      },
      {
        status: 'done',
        connector: 'bg-status-done',
        fill: 'filled',
        node: 'bg-status-done',
        label: 'done',
        labelColor: 'text-status-done',
      },
    ];

    for (const expected of cases) {
      const { queued, connector, node, label } = render(expected.status);
      const ctx = expected.status;

      expect(queued.classList.contains('bg-line-strong')).withContext(`${ctx}: queued`).toBe(true);
      expect(queued.nextElementSibling).withContext(`${ctx}: order`).toBe(connector);
      expect(connector.classList.contains(expected.connector))
        .withContext(`${ctx}: connector`)
        .toBe(true);
      expect(connector.classList.contains('h-px'))
        .withContext(`${ctx}: connector geometry`)
        .toBe(true);

      expect(node.getAttribute('data-track-node')).withContext(`${ctx}: fill`).toBe(expected.fill);
      if (expected.fill === 'hollow') {
        expect(node.classList.contains('border-1.5')).withContext(`${ctx}: ring`).toBe(true);
        expect(node.classList.contains(expected.node))
          .withContext(`${ctx}: ring colour`)
          .toBe(true);
        expect(getComputedStyle(node).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      } else {
        const core = node.lastElementChild as HTMLElement;
        expect(core.classList.contains(expected.node))
          .withContext(`${ctx}: node colour`)
          .toBe(true);
      }

      expect(label.textContent?.trim()).withContext(`${ctx}: label`).toBe(expected.label);
      expect(label.textContent).not.toContain('_');
      expect(label.classList.contains('font-mono')).toBe(true);
      expect(label.classList.contains(expected.labelColor))
        .withContext(`${ctx}: label colour`)
        .toBe(true);
    }
  });

  it('right-aligns the track at a fixed width', () => {
    const { host } = render('done');
    const track = host.firstElementChild as HTMLElement;
    expect(track.classList.contains('justify-end')).toBe(true);
    expect(getComputedStyle(track).width).toBe('150px');
  });

  it('pulses only for in_progress, with motion disabled under prefers-reduced-motion', () => {
    const live = render('in_progress');
    const beacons = live.host.querySelectorAll('[data-beacon]');
    expect(beacons.length).toBe(1);
    expect(beacons[0].getAttribute('data-beacon')).toBe('lifecycle');
    const ping = beacons[0].querySelector('[data-beacon-ping]') as HTMLElement;
    expect(ping.className).toContain('animate-beacon-fast');
    expect(ping.className).toContain('motion-reduce:animate-none');
    expect(ping.className).toContain('motion-reduce:hidden');

    for (const status of ['pending', 'blocked', 'done', 'spec_ready', 'unknown_status']) {
      const { host } = render(status);
      expect(host.querySelectorAll('[data-beacon]').length).withContext(status).toBe(0);
      expect(host.querySelectorAll('[data-beacon-ping]').length).withContext(status).toBe(0);
    }
  });

  it('falls back to a muted hollow track for a status it does not know', () => {
    const { node, label, connector } = render('archived');

    expect(node.getAttribute('data-track-node')).toBe('hollow');
    expect(node.classList.contains('border-faint')).toBe(true);
    expect(connector.classList.contains('bg-line')).toBe(true);
    expect(label.classList.contains('text-muted')).toBe(true);
    expect(label.textContent?.trim()).toBe('archived');
    expect(render('on_hold').label.textContent?.trim()).toBe('on hold');
  });
});
