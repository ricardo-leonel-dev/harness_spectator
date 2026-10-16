import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureRowVm, FeaturesTableComponent } from './features-table.component';

const FEATURES: FeatureRowVm[] = [
  { featureNumber: 1, name: 'first', title: 'First', status: 'in_progress', sdd: true },
  { featureNumber: 2, name: 'second', title: 'Second', status: 'done', sdd: false },
];

describe('FeaturesTableComponent', () => {
  let fixture: ComponentFixture<FeaturesTableComponent>;

  function render(selected: string | null): HTMLElement {
    fixture.componentRef.setInput('features', FEATURES);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-feature-row]'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FeaturesTableComponent] }).compileComponents();
    fixture = TestBed.createComponent(FeaturesTableComponent);
  });

  it('renders every row as a focusable toggle button with aria-pressed reflecting the selected input', () => {
    let host = render(null);
    for (const row of rows(host)) {
      expect(row.getAttribute('role')).toBe('button');
      expect(row.getAttribute('tabindex')).toBe('0');
      expect(row.getAttribute('aria-pressed')).toBe('false');
      expect(row.classList).not.toContain('border-signal');
      expect(row.classList).not.toContain('bg-edge');
      expect(row.parentElement?.getAttribute('role')).toBe('listitem');
    }

    host = render('second');
    const [first, second] = rows(host);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(first.classList).not.toContain('border-signal');
    expect(first.classList).not.toContain('bg-edge');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(second.classList).toContain('border-signal');
    expect(second.classList).toContain('bg-edge');

    document.body.appendChild(host);
    try {
      const style = getComputedStyle(second);
      expect(style.borderLeftColor).toBe('rgb(232, 163, 61)');
      expect(style.borderLeftWidth).toBe('2px');
      expect(style.backgroundColor).toBe('rgb(26, 32, 41)');
      expect(getComputedStyle(first).borderLeftColor).toBe('rgba(0, 0, 0, 0)');
    } finally {
      host.remove();
    }
  });

  it('emits the row name on click, Enter and Space, preventing default on Space', () => {
    const host = render('first');
    const emitted: string[] = [];
    fixture.componentInstance.toggled.subscribe((name) => emitted.push(name));
    const [first, second] = rows(host);

    second.click();
    first.click();

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    second.dispatchEvent(enter);

    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    second.dispatchEvent(space);

    expect(emitted).toEqual(['second', 'first', 'second', 'second']);
    expect(space.defaultPrevented).toBeTrue();
  });
});
