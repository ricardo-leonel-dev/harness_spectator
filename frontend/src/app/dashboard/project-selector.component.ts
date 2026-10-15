import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CdkListbox, CdkOption, ListboxValueChangeEvent } from '@angular/cdk/listbox';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { LucideAngularModule, ChevronsUpDown } from 'lucide-angular';

import { ProjectSummary } from '../core/harness-api.service';

const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];

const PANEL_MAX_WIDTH_PX = 352;
const VIEWPORT_GUTTER_PX = 16;

function phonePositions(originLeft: number): ConnectedPosition[] {
  const offsetX = VIEWPORT_GUTTER_PX - originLeft;
  return [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetX,
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetX,
      offsetY: -6,
    },
  ];
}

@Component({
  selector: 'app-project-selector',
  imports: [OverlayModule, CdkListbox, CdkOption, LucideAngularModule],
  providers: [LucideAngularModule.pick({ ChevronsUpDown }).providers ?? []],
  template: `
    <button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="toggle()"
      (keydown.arrowdown)="onTriggerArrow($event)"
      aria-haspopup="listbox"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="isOpen() ? listboxId : null"
      [attr.aria-label]="'Switch project, current: ' + (current ?? 'all projects')"
      class="-mx-1.5 flex min-w-0 max-w-[11rem] items-center gap-1.5 rounded border border-transparent px-1.5 py-1 text-muted transition-colors hover:border-line hover:text-text focus:outline-none focus-visible:border-signal aria-expanded:border-line aria-expanded:bg-edge aria-expanded:text-text motion-reduce:transition-none sm:max-w-xs"
      data-selector-trigger
    >
      <span class="truncate font-mono text-xs" data-project-slug>{{
        current ?? 'all projects'
      }}</span>
      <lucide-icon name="chevrons-up-down" class="block h-3 w-3 shrink-0 text-faint" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayViewportMargin]="16"
      (attach)="onAttach()"
      (detach)="isOpen.set(false)"
      (overlayOutsideClick)="onOutsideClick($event)"
      (overlayKeydown)="onOverlayKeydown($event)"
    >
      <div
        class="w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-md border border-line bg-panel-raised shadow-card motion-reduce:animate-none"
        data-selector-panel
      >
        <div class="flex items-center justify-between border-b border-edge px-3 py-2">
          <span
            class="font-mono text-label font-semibold uppercase text-muted"
            id="project-list-label"
            >Projects</span
          >
          @if (projects) {
            <span class="font-mono text-micro text-faint">{{ projects.length }}</span>
          }
        </div>

        @if (error) {
          <div
            class="m-2 flex items-center gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
            role="alert"
            data-selector-error
          >
            <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked"
              >[ERR]</span
            >
            <span class="min-w-0 break-words">Could not load projects. {{ error }}</span>
          </div>
        } @else if (!projects) {
          <p
            class="m-0 flex items-center gap-2 px-3 py-3 text-xs text-muted"
            role="status"
            data-selector-loading
          >
            <span
              class="inline-block h-3 w-3 animate-spin-fast rounded-full border-2 border-signal border-r-transparent motion-reduce:animate-none"
              aria-hidden="true"
            ></span>
            Loading projects…
          </p>
        } @else if (projects.length === 0) {
          <p class="m-0 px-3 py-3 text-xs text-muted" data-selector-empty>
            No projects in the mirror yet.
          </p>
        } @else {
          <ul
            #listbox="cdkListbox"
            cdkListbox
            [id]="listboxId"
            [cdkListboxValue]="selectedValue(projects)"
            (cdkListboxValueChange)="onValueChange($event)"
            role="listbox"
            aria-labelledby="project-list-label"
            class="m-0 max-h-[min(24rem,60vh)] list-none overflow-y-auto p-1 focus:outline-none"
            data-selector-list
          >
            @for (p of projects; track p.slug) {
              <li
                [cdkOption]="p.slug"
                role="option"
                aria-selected="false"
                tabindex="-1"
                (click)="confirm(p.slug)"
                (keydown.enter)="confirm(p.slug)"
                (keydown.space)="confirm(p.slug)"
                class="flex cursor-pointer flex-col gap-1.5 rounded border-l-2 border-transparent px-2.5 py-2 transition-colors hover:bg-row-hover focus:outline-none aria-selected:border-signal motion-reduce:transition-none [&.cdk-option-active]:bg-edge"
                [attr.data-project-option]="p.slug"
              >
                <span class="flex items-baseline gap-2">
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-xs text-text"
                    data-option-slug
                    >{{ p.slug }}</span
                  >
                  <span class="shrink-0 font-mono text-micro text-dim" data-option-ratio
                    >{{ p.counts.done }}/{{ p.counts.total }} done</span
                  >
                </span>
                @if (p.description) {
                  <span class="truncate font-sans text-2xs text-muted">{{ p.description }}</span>
                }
                <span
                  class="flex h-[3px] w-full overflow-hidden rounded-full bg-edge"
                  aria-hidden="true"
                  data-option-bar
                >
                  <span class="bg-status-done" [style.width.%]="share(p, p.counts.done)"></span>
                  <span class="bg-signal" [style.width.%]="share(p, p.counts.inProgress)"></span>
                  <span
                    class="bg-status-blocked"
                    [style.width.%]="share(p, p.counts.blocked)"
                  ></span>
                </span>
                @if (p.counts.inProgress > 0 || p.counts.blocked > 0) {
                  <span class="flex gap-3 font-mono text-micro" data-option-flags>
                    @if (p.counts.inProgress > 0) {
                      <span class="text-signal">{{ p.counts.inProgress }} in progress</span>
                    }
                    @if (p.counts.blocked > 0) {
                      <span class="text-status-blocked">{{ p.counts.blocked }} blocked</span>
                    }
                  </span>
                }
              </li>
            }
          </ul>
        }
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSelectorComponent {
  @Input({ required: true }) projects: ProjectSummary[] | null = null;
  @Input() current: string | null = null;
  @Input() error: string | null = null;
  @Output() readonly selected = new EventEmitter<string>();

  @ViewChild('trigger') private readonly trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('listbox') private readonly listbox?: CdkListbox<string>;

  private readonly document = inject(DOCUMENT);

  readonly isOpen = signal(false);
  readonly positions = signal<ConnectedPosition[]>(PANEL_POSITIONS);
  readonly listboxId = 'project-selector-listbox';

  open(): void {
    this.openPanel();
    this.trigger?.nativeElement.focus();
  }

  toggle(): void {
    if (this.isOpen()) this.isOpen.set(false);
    else this.openPanel();
  }

  close(restoreFocus: boolean): void {
    this.isOpen.set(false);
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }

  selectedValue(projects: ProjectSummary[]): string[] {
    return projects.some((p) => p.slug === this.current) ? [this.current as string] : [];
  }

  share(p: ProjectSummary, count: number): number {
    return p.counts.total > 0 ? (count / p.counts.total) * 100 : 0;
  }

  onTriggerArrow(event: Event): void {
    event.preventDefault();
    this.openPanel();
  }

  onAttach(): void {
    queueMicrotask(() => this.listbox?.focus());
  }

  onValueChange(event: ListboxValueChangeEvent<string>): void {
    const [slug] = event.value;
    if (slug && slug !== this.current) {
      this.close(true);
      this.selected.emit(slug);
    }
  }

  confirm(slug: string): void {
    if (slug === this.current) this.close(true);
  }

  onOutsideClick(event: MouseEvent): void {
    if (this.trigger?.nativeElement.contains(event.target as Node)) return;
    this.close(false);
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.close(true);
    }
  }

  private openPanel(): void {
    const viewportWidth = this.document.defaultView?.innerWidth ?? Infinity;
    const trigger = this.trigger?.nativeElement;
    const narrow = viewportWidth < PANEL_MAX_WIDTH_PX + 2 * VIEWPORT_GUTTER_PX;
    this.positions.set(
      narrow && trigger ? phonePositions(trigger.getBoundingClientRect().left) : PANEL_POSITIONS,
    );
    this.isOpen.set(true);
  }
}
