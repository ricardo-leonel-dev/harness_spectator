import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

interface StatusTrack {
  connector: string;
  nodeFilled: boolean;
  node: string;
  pulse: boolean;
  label: string;
  labelColor: string;
}

const FALLBACK_TRACK: Omit<StatusTrack, 'label'> = {
  connector: 'bg-line',
  nodeFilled: false,
  node: 'border-faint',
  pulse: false,
  labelColor: 'text-muted',
};

const STATUS_TRACK: Record<string, StatusTrack> = {
  pending: {
    connector: 'bg-line',
    nodeFilled: false,
    node: 'border-status-pending',
    pulse: false,
    label: 'pending',
    labelColor: 'text-muted',
  },
  spec_ready: {
    connector: 'bg-line',
    nodeFilled: false,
    node: 'border-status-spec-ready',
    pulse: false,
    label: 'spec ready',
    labelColor: 'text-status-spec-ready',
  },
  in_progress: {
    connector: 'bg-signal',
    nodeFilled: true,
    node: 'bg-signal',
    pulse: true,
    label: 'in progress',
    labelColor: 'text-signal',
  },
  blocked: {
    connector: 'bg-status-blocked',
    nodeFilled: true,
    node: 'bg-status-blocked',
    pulse: false,
    label: 'blocked',
    labelColor: 'text-status-blocked',
  },
  done: {
    connector: 'bg-status-done',
    nodeFilled: true,
    node: 'bg-status-done',
    pulse: false,
    label: 'done',
    labelColor: 'text-status-done',
  },
};

@Component({
  selector: 'app-lifecycle-track',
  template: `
    <span class="flex w-[150px] shrink-0 items-center justify-end gap-1.5">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" data-track-queued></span>
      <span class="h-px w-3.5 shrink-0" [class]="track.connector" data-track-connector></span>
      @if (track.nodeFilled) {
        <span
          class="relative inline-flex h-1.75 w-1.75 shrink-0"
          data-track-node="filled"
          [attr.data-beacon]="track.pulse && pulse ? 'lifecycle' : null"
        >
          @if (track.pulse && pulse) {
            <span
              class="absolute inset-0 animate-beacon-fast rounded-full motion-reduce:hidden motion-reduce:animate-none"
              [class]="track.node"
              data-beacon-ping
            ></span>
          }
          <span class="absolute inset-0 rounded-full" [class]="track.node"></span>
        </span>
      } @else {
        <span
          class="h-1.75 w-1.75 shrink-0 rounded-full border-1.5"
          [class]="track.node"
          data-track-node="hollow"
        ></span>
      }
      <span
        class="w-[72px] text-right font-mono text-micro tracking-[0.03em]"
        [class]="track.labelColor"
        data-track-label
        >{{ track.label }}</span
      >
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecycleTrackComponent {
  @Input({ required: true }) status!: string;
  @Input() pulse = true;

  get track(): StatusTrack {
    return (
      STATUS_TRACK[this.status] ?? { ...FALLBACK_TRACK, label: this.status.replace(/_/g, ' ') }
    );
  }
}
