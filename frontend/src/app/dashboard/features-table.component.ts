import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { LifecycleTrackComponent } from './lifecycle-track.component';

export interface FeatureRowVm {
  featureNumber: number;
  name: string;
  title: string;
  status: string;
  sdd: boolean;
}

@Component({
  selector: 'app-features-table',
  imports: [LifecycleTrackComponent],
  template: `
    <div
      class="overflow-hidden rounded-md border border-line bg-panel"
      [attr.role]="features.length ? 'list' : null"
    >
      @for (f of features; track f.name) {
        <div
          class="flex items-center gap-3.5 border-b border-edge px-3.5 py-2.75 transition-colors last:border-b-0 hover:bg-row-hover motion-reduce:transition-none"
          role="listitem"
          data-feature-row
        >
          <span class="w-5 shrink-0 font-mono text-2xs text-faint" data-feature-id>{{
            idLabel(f.featureNumber)
          }}</span>
          <span
            class="w-28 shrink-0 truncate font-mono text-xs text-text sm:w-[200px]"
            [title]="f.name"
            data-feature-name
            >{{ f.name }}</span
          >
          <span
            class="min-w-0 flex-1 truncate font-sans text-xs text-dim"
            [title]="f.title"
            data-feature-title
            >{{ f.title }}</span
          >
          <app-lifecycle-track class="shrink-0" [status]="f.status" />
        </div>
      } @empty {
        <p class="m-0 px-3.5 py-6 text-center text-sm text-muted" data-features-empty>
          Nothing queued yet — add a feature with
          <span class="font-mono text-text">scripts/harness.sh add-feature</span>.
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesTableComponent {
  @Input({ required: true }) features: FeatureRowVm[] = [];

  idLabel(featureNumber: number): string {
    return String(featureNumber).padStart(2, '0');
  }
}
