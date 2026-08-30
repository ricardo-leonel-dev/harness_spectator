import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

interface LifecycleStyle {
  node: string;
  connector: string;
  label: string;
}

const FALLBACK_STYLE: LifecycleStyle = {
  node: 'border border-muted',
  connector: 'bg-line',
  label: 'text-muted',
};

const LIFECYCLE_STYLES: Record<string, LifecycleStyle> = {
  pending: {
    node: 'border border-status-pending',
    connector: 'bg-line',
    label: 'text-status-pending',
  },
  in_progress: {
    node: 'bg-status-in-progress',
    connector: 'bg-status-in-progress/40',
    label: 'text-status-in-progress',
  },
  blocked: {
    node: 'bg-status-blocked',
    connector: 'bg-status-blocked/40',
    label: 'text-status-blocked',
  },
  done: {
    node: 'bg-status-done',
    connector: 'bg-status-done/40',
    label: 'text-status-done',
  },
  spec_ready: {
    node: 'bg-status-spec-ready',
    connector: 'bg-status-spec-ready/40',
    label: 'text-status-spec-ready',
  },
};

@Component({
  selector: 'app-lifecycle-track',
  standalone: true,
  template: `
    <span class="flex items-center">
      <span class="h-1.5 w-1.5 rounded-full bg-muted"></span>
      <span class="h-px w-6" [class]="style.connector"></span>
      @if (isLive) {
        <span class="relative flex h-2 w-2" data-beacon>
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70 motion-reduce:hidden"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-signal"></span>
        </span>
      } @else {
        <span class="h-2 w-2 rounded-full" [class]="style.node"></span>
      }
      <span class="ml-3 font-mono text-xs" [class]="style.label">{{ status }}</span>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecycleTrackComponent {
  @Input({ required: true }) status!: string;

  get style(): LifecycleStyle {
    return LIFECYCLE_STYLES[this.status] ?? FALLBACK_STYLE;
  }

  get isLive(): boolean {
    return this.status === 'in_progress';
  }
}
