import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { ClosedByCounts } from '../core/harness-api.service';
import { formatPercent } from './progress-format';

interface ClosurePathRow {
  key: keyof ClosedByCounts;
  label: string;
  count: number;
  share: number;
  percent: string;
}

const CLOSURE_PATHS: Array<{ key: keyof ClosedByCounts; label: string }> = [
  { key: 'approved', label: 'Reviewer approved' },
  { key: 'quick', label: 'Quick close' },
  { key: 'lean', label: 'Lean gate' },
  { key: 'none', label: 'No recorded review' },
];

@Component({
  selector: 'app-closure-paths',
  template: `
    <section class="rounded-md border border-line bg-panel p-3.5" data-overview-closed-by>
      <h2 class="m-0 mb-2.5 font-mono text-label font-semibold uppercase text-muted">Closed by</h2>
      <ol class="m-0 flex list-none flex-col gap-2.5 p-0">
        @for (row of rows; track row.key) {
          <li
            class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3"
            data-closed-by-row
            [attr.data-path]="row.key"
          >
            <span class="min-w-0 truncate font-sans text-xs text-text">{{ row.label }}</span>
            <span class="font-mono text-2xs text-soft tabular-nums" data-closed-by-count>{{
              row.count
            }}</span>
            <span class="font-mono text-2xs text-dim tabular-nums" data-closed-by-percent
              >{{ row.percent }}%</span
            >
            <div class="col-span-3 mt-1 h-1.5 rounded-sm bg-edge">
              <div
                class="h-full rounded-sm"
                [class]="row.key === 'none' ? 'bg-line-strong' : 'bg-signal'"
                role="meter"
                [style.width.%]="row.share"
                [attr.aria-valuenow]="row.percent"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="row.label"
                data-closed-by-meter
              ></div>
            </div>
          </li>
        }
      </ol>
      @if (total === 0) {
        <p class="m-0 mt-2.5 font-sans text-xs text-muted" data-closed-by-empty>
          No closed features yet.
        </p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClosurePathsComponent {
  @Input({ required: true }) closedBy!: ClosedByCounts;

  get total(): number {
    return CLOSURE_PATHS.reduce((sum, path) => sum + (this.closedBy?.[path.key] ?? 0), 0);
  }

  get rows(): ClosurePathRow[] {
    const total = this.total;
    return CLOSURE_PATHS.map((path) => {
      const count = this.closedBy?.[path.key] ?? 0;
      const share = total > 0 ? (count / total) * 100 : 0;
      return { ...path, count, share, percent: formatPercent(share) };
    });
  }
}
