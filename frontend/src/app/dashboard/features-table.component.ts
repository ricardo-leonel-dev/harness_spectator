import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { StatusBadgeComponent } from './status-badge.component';

export interface FeatureRowVm {
  featureNumber: number;
  name: string;
  title: string;
  status: string;
  sdd: boolean;
}

@Component({
  selector: 'app-features-table',
  imports: [StatusBadgeComponent],
  template: `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Title</th>
          <th>SDD</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        @for (f of features; track f.name) {
          <tr>
            <td>{{ f.featureNumber }}</td>
            <td>{{ f.name }}</td>
            <td>{{ f.title }}</td>
            <td>{{ f.sdd ? '✓' : '—' }}</td>
            <td><app-status-badge [status]="f.status" /></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="5" class="empty">No features yet.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th,
      td {
        text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid #2d2d34;
      }
      th {
        color: #a1a1aa;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .empty {
        text-align: center;
        color: #71717a;
        font-style: italic;
      }
    `,
  ],
})
export class FeaturesTableComponent {
  @Input({ required: true }) features: FeatureRowVm[] = [];
}
