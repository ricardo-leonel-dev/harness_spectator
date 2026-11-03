import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClosedByCounts } from '../core/harness-api.service';
import { ClosurePathsComponent } from './closure-paths.component';

describe('ClosurePathsComponent', () => {
  let fixture: ComponentFixture<ClosurePathsComponent>;

  function render(closedBy: ClosedByCounts): HTMLElement {
    fixture.componentRef.setInput('closedBy', closedBy);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-closed-by-row]'));
  }

  function meters(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-closed-by-meter]'));
  }

  function widths(host: HTMLElement): number[] {
    return meters(host).map((m) => Math.round(parseFloat(m.style.width) * 100) / 100);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ClosurePathsComponent] }).compileComponents();
    fixture = TestBed.createComponent(ClosurePathsComponent);
  });

  it('lists the four closure paths in a fixed order with their counts', () => {
    const host = render({ approved: 12, quick: 8, lean: 6, none: 5 });
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Closed by');
    const items = rows(host);
    expect(items.length).toBe(4);
    expect(items.map((r) => r.getAttribute('data-path'))).toEqual([
      'approved',
      'quick',
      'lean',
      'none',
    ]);
    expect(items.map((r) => r.querySelector('span')?.textContent?.trim())).toEqual([
      'Reviewer approved',
      'Quick close',
      'Lean gate',
      'No recorded review',
    ]);
    expect(
      items.map((r) => r.querySelector('[data-closed-by-count]')?.textContent?.trim()),
    ).toEqual(['12', '8', '6', '5']);
  });

  it('renders each path share of the total as a percentage', () => {
    const host = render({ approved: 12, quick: 8, lean: 6, none: 5 });
    expect(
      rows(host).map((r) => r.querySelector('[data-closed-by-percent]')?.textContent?.trim()),
    ).toEqual(['38.71%', '25.81%', '19.35%', '16.13%']);
  });

  it('sizes every meter to its share and exposes it as a meter', () => {
    const host = render({ approved: 12, quick: 8, lean: 6, none: 5 });
    expect(widths(host)).toEqual([38.71, 25.81, 19.35, 16.13]);
    const bars = meters(host);
    expect(bars.map((m) => m.getAttribute('role'))).toEqual(['meter', 'meter', 'meter', 'meter']);
    expect(bars.map((m) => m.getAttribute('aria-valuenow'))).toEqual([
      '38.71',
      '25.81',
      '19.35',
      '16.13',
    ]);
    expect(bars.map((m) => m.getAttribute('aria-valuemin'))).toEqual(['0', '0', '0', '0']);
    expect(bars.map((m) => m.getAttribute('aria-valuemax'))).toEqual(['100', '100', '100', '100']);
    expect(bars.map((m) => m.getAttribute('aria-label'))).toEqual([
      'Reviewer approved',
      'Quick close',
      'Lean gate',
      'No recorded review',
    ]);
  });

  it('renders every meter at zero and an empty line when no feature is closed yet', () => {
    const host = render({ approved: 0, quick: 0, lean: 0, none: 0 });
    expect(widths(host)).toEqual([0, 0, 0, 0]);
    expect(
      rows(host).map((r) => r.querySelector('[data-closed-by-percent]')?.textContent?.trim()),
    ).toEqual(['0.00%', '0.00%', '0.00%', '0.00%']);
    expect(host.querySelector('[data-closed-by-empty]')?.textContent?.trim()).toBe(
      'No closed features yet.',
    );
  });

  it('shows no empty line while at least one feature is closed', () => {
    const host = render({ approved: 1, quick: 0, lean: 0, none: 0 });
    expect(host.querySelector('[data-closed-by-empty]')).toBeNull();
    expect(widths(host)).toEqual([100, 0, 0, 0]);
  });
});
