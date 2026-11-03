import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureRowVm, FeaturesTableComponent } from './features-table.component';

const FEATURES: FeatureRowVm[] = [
  { featureNumber: 1, name: 'first', title: 'First', status: 'in_progress', sdd: true },
  { featureNumber: 2, name: 'second', title: 'Second', status: 'done', sdd: false },
];

const LEAN_FEATURES: FeatureRowVm[] = [
  {
    featureNumber: 3,
    name: 'lean_one',
    title: 'Lean one',
    status: 'in_progress',
    sdd: false,
    mode: 'risk',
    planApproval: true,
    planApprovedBy: 'ricardo',
    planApprovedAt: '2026-10-14T10:00:00Z',
  },
  {
    featureNumber: 4,
    name: 'lean_two',
    title: 'Lean two',
    status: 'in_progress',
    sdd: false,
    mode: 'normal',
    planApproval: false,
  },
  {
    featureNumber: 5,
    name: 'no_mode',
    title: 'No mode',
    status: 'done',
    sdd: true,
    mode: null,
    planApprovedBy: null,
    planApprovedAt: null,
  },
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

  function renderRows(features: FeatureRowVm[]): HTMLElement {
    fixture.componentRef.setInput('features', features);
    fixture.componentRef.setInput('selected', null);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
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

  it('shows the raw lean mode as a chip and a plan approval icon', () => {
    const host = renderRows(LEAN_FEATURES);
    const [first] = rows(host);

    const chip = first.querySelector('[data-feature-mode]') as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent?.trim()).toBe('lean risk');
    expect(chip.classList).toContain('font-mono');
    expect(chip.classList).toContain('border-line-strong');

    const icon = first.querySelector('[data-feature-plan]') as HTMLElement;
    expect(icon).toBeTruthy();
    const glyph = (icon.querySelector('svg') ?? icon) as HTMLElement;
    expect(glyph.classList).toContain('h-3');
    expect(glyph.classList).toContain('w-3');
    expect(glyph.classList).toContain('text-signal');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('title')).toBe('Plan approved by ricardo at 2026-10-14T10:00:00Z');
    expect(first.querySelector('.sr-only')?.textContent?.trim()).toBe(
      'Plan approved by ricardo at 2026-10-14T10:00:00Z',
    );
  });

  it('shows the chip without an icon when the plan was not approved', () => {
    const host = renderRows(LEAN_FEATURES);
    const second = rows(host)[1];
    expect(second.querySelector('[data-feature-mode]')?.textContent?.trim()).toBe('lean normal');
    expect(second.querySelector('[data-feature-plan]')).toBeNull();
  });

  it('leaves a feature without a mode free of chip, icon and extra row markup', () => {
    const host = renderRows(LEAN_FEATURES);
    const third = rows(host)[2];
    expect(third.querySelector('[data-feature-mode]')).toBeNull();
    expect(third.querySelector('[data-feature-plan]')).toBeNull();
    const name = third.querySelector('[data-feature-name]') as HTMLElement;
    expect(name.nextElementSibling?.getAttribute('data-feature-title')).toBe('');
  });

  it('treats missing mode and approval keys like null', () => {
    const host = renderRows([
      { featureNumber: 6, name: 'bare', title: 'Bare', status: 'pending', sdd: false },
    ]);
    const [bare] = rows(host);
    expect(bare.querySelector('[data-feature-mode]')).toBeNull();
    expect(bare.querySelector('[data-feature-plan]')).toBeNull();
  });

  it('names an approval without a reviewer or a time', () => {
    const host = renderRows([
      {
        featureNumber: 7,
        name: 'no_reviewer',
        title: 'No reviewer',
        status: 'done',
        sdd: false,
        mode: 'risk',
        planApproval: true,
      },
    ]);
    const [bare] = rows(host);
    const icon = bare.querySelector('[data-feature-plan]') as HTMLElement;
    expect(icon.getAttribute('title')).toBe('Plan approved');
    expect(bare.querySelector('.sr-only')?.textContent?.trim()).toBe('Plan approved');
  });
});
