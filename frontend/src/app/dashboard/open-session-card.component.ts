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
    <section class="rounded-md border border-line bg-panel p-3.5">
      <h2
        class="m-0 mb-2.5 flex items-center gap-1.5 font-mono text-label font-semibold uppercase text-muted"
      >
        <lucide-icon name="clock" class="block h-3 w-3" />
        Open session
      </h2>
      @if (session) {
        <div
          class="rounded border border-edge bg-ink px-3.5 py-3 font-mono text-2xs leading-[2]"
          data-terminal
        >
          @for (line of lines(session); track line.key; let last = $last) {
            <div class="break-words" data-terminal-line>
              <span class="text-faint" data-prompt>$</span>
              <span class="ml-[1ch] inline-block w-[8ch] text-muted" data-key>{{ line.key }}</span>
              <span class="text-text" data-value>{{ line.value }}</span>
              @if (last) {
                <span
                  class="ml-1 inline-block h-3 w-1.5 animate-caret bg-signal align-[-2px] motion-reduce:animate-none"
                  data-caret
                ></span>
              }
            </div>
          }
        </div>
      } @else {
        <p class="m-0 text-sm text-muted">No agent session open.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenSessionCardComponent {
  @Input() session: OpenSessionVm | null = null;

  lines(session: OpenSessionVm): Array<{ key: string; value: string }> {
    return [
      { key: 'agent', value: session.agent },
      { key: 'feature', value: session.feature },
      { key: 'started', value: session.startedAt },
      { key: 'next', value: session.nextStep ?? '—' },
    ];
  }
}
