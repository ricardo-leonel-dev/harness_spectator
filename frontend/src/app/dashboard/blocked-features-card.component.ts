import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { LucideAngularModule, AlertTriangle } from 'lucide-angular';

export interface BlockedFeatureVm {
  name: string;
  note: string;
}

@Component({
  selector: 'app-blocked-features-card',
  imports: [LucideAngularModule],
  providers: [LucideAngularModule.pick({ AlertTriangle }).providers ?? []],
  template: `
    <section class="rounded-sm border border-line bg-panel p-4">
      <h2 class="flex items-center gap-2 font-sans text-label font-medium uppercase text-muted">
        @if (features.length > 0) {
          <lucide-icon name="alert-triangle" class="h-3.5 w-3.5 text-status-blocked" />
        }
        Blocked features
      </h2>
      @if (features.length > 0) {
        <ul class="mt-3 flex list-none flex-col gap-3 p-0">
          @for (f of features; track f.name) {
            <li class="border-l-2 border-status-blocked pl-3" data-blocked-item>
              <p class="m-0 font-mono text-sm text-text">{{ f.name }}</p>
              <p class="m-0 mt-1 font-mono text-xs leading-relaxed text-muted">{{ f.note }}</p>
            </li>
          }
        </ul>
      } @else {
        <p class="mt-3 text-sm text-muted">Nothing blocked.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockedFeaturesCardComponent {
  @Input({ required: true }) features: BlockedFeatureVm[] = [];
}
