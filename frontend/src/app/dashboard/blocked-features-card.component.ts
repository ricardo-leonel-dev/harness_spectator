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
    <section class="rounded-md border border-line bg-panel p-3.5">
      <h2
        class="m-0 mb-2.5 flex items-center gap-1.5 font-mono text-label font-semibold uppercase text-muted"
      >
        @if (features.length > 0) {
          <lucide-icon name="alert-triangle" class="block h-3 w-3 text-status-blocked" />
        }
        Blocked
      </h2>
      @if (features.length > 0) {
        <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
          @for (f of features; track f.name) {
            <li
              class="flex flex-col gap-[3px] border-l-2 border-status-blocked pl-2.5"
              data-blocked-item
            >
              <span class="font-mono text-2xs font-semibold text-text">{{ f.name }}</span>
              <span class="font-sans text-xs text-muted">{{ f.note }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="m-0 text-sm text-muted">Nothing blocked.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockedFeaturesCardComponent {
  @Input({ required: true }) features: BlockedFeatureVm[] = [];
}
