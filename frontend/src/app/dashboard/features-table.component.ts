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
    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-line text-left">
          <th class="px-3 py-2 font-sans text-label font-medium uppercase text-muted">#</th>
          <th class="px-3 py-2 font-sans text-label font-medium uppercase text-muted">Name</th>
          <th class="px-3 py-2 font-sans text-label font-medium uppercase text-muted">Title</th>
          <th class="px-3 py-2 font-sans text-label font-medium uppercase text-muted">SDD</th>
          <th class="px-3 py-2 font-sans text-label font-medium uppercase text-muted">Status</th>
        </tr>
      </thead>
      <tbody>
        @for (f of features; track f.name) {
          <tr class="border-b border-line bg-panel transition-colors hover:bg-panel-raised">
            <td class="px-3 py-3 font-mono text-xs text-muted">{{ f.featureNumber }}</td>
            <td class="px-3 py-3 font-mono text-sm text-text">{{ f.name }}</td>
            <td class="px-3 py-3 text-sm text-muted">{{ f.title }}</td>
            <td class="px-3 py-3 font-mono text-xs" [class]="f.sdd ? 'text-text' : 'text-muted'">
              {{ f.sdd ? 'yes' : '—' }}
            </td>
            <td class="px-3 py-3">
              <app-lifecycle-track [status]="f.status" />
            </td>
          </tr>
        } @empty {
          <tr class="border-b border-line bg-panel">
            <td colspan="5" class="px-3 py-6 text-center text-sm text-muted">
              Nothing queued yet — add a feature with
              <span class="font-mono text-text">scripts/harness.sh add-feature</span>.
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesTableComponent {
  @Input({ required: true }) features: FeatureRowVm[] = [];
}
