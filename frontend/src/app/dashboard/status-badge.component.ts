import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [style.background]="bg()">{{ status }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #0e0e10;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: string;

  bg(): string {
    switch (this.status) {
      case 'pending':
        return '#f59e0b';
      case 'in_progress':
        return '#3b82f6';
      case 'blocked':
        return '#ef4444';
      case 'done':
        return '#10b981';
      case 'spec_ready':
        return '#a855f7';
      default:
        return '#6b7280';
    }
  }
}
