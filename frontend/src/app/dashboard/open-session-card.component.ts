import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { LucideAngularModule, Clock } from 'lucide-angular';

export interface OpenSessionVm {
  agent: string;
  feature: string;
  startedAt: string;
  nextStep: string | null;
}

@Component({
  selector: 'app-open-session-card',
  imports: [LucideAngularModule],
  providers: [LucideAngularModule.pick({ Clock }).providers ?? []],
  template: `
    <section class="rounded-sm border border-line bg-panel p-4">
      <h2 class="font-sans text-label font-medium uppercase text-muted">Open session</h2>
      @if (session) {
        <div class="mt-3 rounded-sm border border-line bg-ink p-3 font-mono text-xs leading-6">
          <dl class="grid grid-cols-[5rem_1fr] gap-x-3">
            <dt class="text-muted">agent</dt>
            <dd class="m-0 break-words text-text">{{ session.agent }}</dd>
            <dt class="text-muted">feature</dt>
            <dd class="m-0 break-words text-text">{{ session.feature }}</dd>
            <dt class="text-muted">started</dt>
            <dd class="m-0 flex items-center gap-2 break-words text-text">
              <lucide-icon name="clock" class="h-3 w-3 shrink-0 text-muted" />
              <span>{{ session.startedAt }}</span>
            </dd>
            <dt class="text-muted">next</dt>
            <dd class="m-0 break-words text-text">{{ session.nextStep ?? '—' }}</dd>
          </dl>
          <span
            class="mt-1 inline-block h-3 w-1.5 animate-caret bg-signal align-middle motion-reduce:animate-none"
            data-caret
          ></span>
        </div>
      } @else {
        <p class="mt-3 text-sm text-muted">No agent session open.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenSessionCardComponent {
  @Input() session: OpenSessionVm | null = null;
}
