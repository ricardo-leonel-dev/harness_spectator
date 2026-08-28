import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export interface OpenSessionVm {
  agent: string;
  feature: string;
  startedAt: string;
  nextStep: string | null;
}

@Component({
  selector: 'app-open-session-card',
  standalone: true,
  template: `
    <section class="card">
      <h2>Open session</h2>
      @if (session) {
        <dl>
          <dt>Agent</dt>
          <dd>{{ session.agent }}</dd>
          <dt>Feature</dt>
          <dd>{{ session.feature }}</dd>
          <dt>Started</dt>
          <dd>{{ session.startedAt }}</dd>
          <dt>Next step</dt>
          <dd>{{ session.nextStep ?? '—' }}</dd>
        </dl>
      } @else {
        <p class="empty">No open session.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .card {
        background: #18181b;
        border: 1px solid #2d2d34;
        border-radius: 6px;
        padding: 12px;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #a1a1aa;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 12px;
        margin: 0;
        font-size: 12px;
      }
      dt {
        color: #71717a;
      }
      dd {
        margin: 0;
      }
      .empty {
        font-size: 12px;
        color: #71717a;
        font-style: italic;
      }
    `,
  ],
})
export class OpenSessionCardComponent {
  @Input() session: OpenSessionVm | null = null;
}
