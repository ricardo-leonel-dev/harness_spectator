import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export interface BlockedFeatureVm {
  name: string;
  note: string;
}

@Component({
  selector: 'app-blocked-features-card',
  standalone: true,
  template: `
    <section class="card">
      <h2>Blocked features</h2>
      @if (features.length > 0) {
        <ul>
          @for (f of features; track f.name) {
            <li>
              <strong>{{ f.name }}</strong>
              <span class="note">{{ f.note }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">No blocked features.</p>
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
      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      li {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12px;
      }
      .note {
        color: #71717a;
      }
      .empty {
        font-size: 12px;
        color: #71717a;
        font-style: italic;
      }
    `,
  ],
})
export class BlockedFeaturesCardComponent {
  @Input({ required: true }) features: BlockedFeatureVm[] = [];
}
