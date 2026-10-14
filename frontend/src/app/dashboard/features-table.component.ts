import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

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
        <div class="[&:last-child>div]:border-b-0" role="listitem">
          <div
            class="flex cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-l-2 border-b-edge border-l-transparent py-2.75 pl-3 pr-3.5 transition-colors hover:bg-row-hover focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-signal motion-reduce:transition-none sm:flex-nowrap aria-pressed:border-l-signal aria-pressed:hover:bg-edge"
            [class.border-signal]="f.name === selected"
            [class.bg-edge]="f.name === selected"
            role="button"
            tabindex="0"
            [attr.aria-pressed]="f.name === selected"
            (click)="toggled.emit(f.name)"
            (keydown.enter)="toggled.emit(f.name)"
            (keydown.space)="onSpace($event, f.name)"
            data-feature-row
          >
            <span class="w-5 shrink-0 font-mono text-2xs text-faint" data-feature-id>{{
              idLabel(f.featureNumber)
            }}</span>
            <span
              class="min-w-0 flex-1 truncate font-mono text-xs text-text sm:w-[200px] sm:flex-none sm:shrink-0"
              [title]="f.name"
              data-feature-name
              >{{ f.name }}</span
            >
            <span
              class="order-last min-w-0 basis-full truncate pl-[2.125rem] font-sans text-xs text-dim sm:order-none sm:flex-1 sm:basis-auto sm:pl-0"
              [title]="f.title"
              data-feature-title
              >{{ f.title }}</span
            >
            <app-lifecycle-track class="shrink-0" [status]="f.status" />
          </div>
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
  @Input() selected: string | null = null;
  @Output() readonly toggled = new EventEmitter<string>();

  onSpace(event: Event, name: string): void {
    event.preventDefault();
    this.toggled.emit(name);
  }

  idLabel(featureNumber: number): string {
    return String(featureNumber).padStart(2, '0');
  }
}
