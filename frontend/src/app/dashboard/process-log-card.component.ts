import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { LucideAngularModule, ScrollText } from 'lucide-angular';

import { FeatureLogResponse, ProcessLogSession } from '../core/harness-api.service';
import { LifecycleTrackComponent } from './lifecycle-track.component';

export type ProcessLogState =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string }
  | { kind: 'ok'; log: FeatureLogResponse }
  | { kind: 'not-found'; name: string; slug: string }
  | { kind: 'error'; message: string };

type SessionState = 'closed' | 'paused' | 'open';

const STATE_LABEL_COLOR: Record<SessionState, string> = {
  open: 'text-signal',
  paused: 'text-status-blocked',
  closed: 'text-faint',
};

const STATE_NODE: Record<SessionState, string> = {
  open: 'bg-signal',
  paused: 'border-1.5 border-status-blocked bg-panel',
  closed: 'bg-line-strong',
};

@Component({
  selector: 'app-process-log-card',
  imports: [LucideAngularModule, LifecycleTrackComponent],
  providers: [LucideAngularModule.pick({ ScrollText }).providers ?? []],
  template: `
    <section class="min-w-0 rounded-md border border-line bg-panel p-3.5">
      <h2
        class="m-0 mb-2.5 flex items-center gap-1.5 font-mono text-label font-semibold uppercase text-muted"
      >
        <lucide-icon name="scroll-text" class="block h-3 w-3" />
        Process log
      </h2>
      @if (state.kind === 'idle') {
        <p class="m-0 text-sm text-muted" data-log-hint>Select a feature to see its process log.</p>
      } @else if (state.kind === 'loading') {
        <p class="m-0 flex min-w-0 items-center gap-2 text-sm text-muted" role="status">
          <span
            class="inline-block h-3.5 w-3.5 shrink-0 animate-spin-fast rounded-full border-2 border-signal border-r-transparent motion-reduce:animate-none"
            aria-hidden="true"
            data-log-spinner
          ></span>
          <span class="min-w-0 break-words"
            >Loading <span class="break-all font-mono text-text">{{ state.name }}</span
            >…</span
          >
        </p>
      } @else if (state.kind === 'not-found') {
        <div
          class="flex items-start gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
          role="alert"
          data-log-not-found
        >
          <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked">
            [404]
          </span>
          <span class="min-w-0 break-words"
            >No feature named <span class="break-all font-mono text-text">{{ state.name }}</span> in
            <span class="break-all font-mono text-text">{{ state.slug }}</span
            >.</span
          >
        </div>
      } @else if (state.kind === 'error') {
        <div
          class="flex items-start gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
          role="alert"
          data-log-error
        >
          <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked">
            [ERR]
          </span>
          <span class="min-w-0 break-words">{{ state.message }}</span>
        </div>
      } @else if (state.kind === 'ok') {
        @let feature = state.log.feature;
        <div class="flex min-w-0 flex-col gap-1" data-log-header>
          <div class="flex min-w-0 items-baseline gap-2.5">
            <span class="w-5 shrink-0 font-mono text-2xs text-faint" data-log-feature-id>{{
              idLabel(feature.featureNumber)
            }}</span>
            <span class="min-w-0 break-all font-mono text-xs text-text" data-log-feature-name>{{
              feature.name
            }}</span>
          </div>
          <p class="m-0 break-words font-sans text-xs text-dim" data-log-feature-title>
            {{ feature.title }}
          </p>
          <div class="flex justify-end">
            <app-lifecycle-track [status]="feature.status" [pulse]="false" />
          </div>
        </div>

        <div class="mt-3 border-t border-edge pt-3">
          @if (state.log.sessions.length === 0) {
            <p class="m-0 text-sm text-muted" data-log-no-sessions>
              No sessions recorded for this feature yet.
            </p>
          } @else {
            <div
              class="min-w-0 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-signal lg:max-h-[60vh] lg:overflow-y-auto"
              tabindex="0"
              [attr.aria-label]="'Sessions of ' + feature.name"
              data-log-scroll
            >
              <ol
                class="m-0 ml-[3px] flex list-none flex-col gap-4 border-l border-line p-0 pl-3.5"
              >
                @for (s of state.log.sessions; track s.localId) {
                  @let st = sessionState(s);
                  <li class="relative min-w-0" data-log-session [attr.data-state]="st">
                    <span
                      class="absolute -left-[18px] top-[5px] h-1.75 w-1.75 rounded-full"
                      [class]="stateNode(st)"
                      aria-hidden="true"
                      data-log-node
                    ></span>
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span class="font-mono text-micro text-faint" data-log-session-id
                        >#{{ s.localId }}</span
                      >
                      <span
                        class="min-w-0 flex-1 break-words font-mono text-2xs text-text [overflow-wrap:anywhere]"
                        data-log-agent
                        >{{ s.agent }}</span
                      >
                      <span
                        class="ml-auto font-mono text-micro tracking-[0.03em]"
                        [class]="stateColor(st)"
                        data-log-session-state
                        >{{ st }}</span
                      >
                    </div>
                    <dl class="m-0 mt-1.5 grid grid-cols-[8ch_minmax(0,1fr)] gap-x-2 gap-y-1">
                      <dt class="font-mono text-micro text-faint">started</dt>
                      <dd class="m-0 min-w-0" data-field="started">
                        <time
                          class="break-all font-mono text-2xs text-dim"
                          [attr.datetime]="s.startedAt"
                          >{{ s.startedAt }}</time
                        >
                      </dd>
                      @if (present(s.pausedAt)) {
                        <dt class="font-mono text-micro text-faint">paused</dt>
                        <dd class="m-0 min-w-0" data-field="paused">
                          <time
                            class="break-all font-mono text-2xs text-dim"
                            [attr.datetime]="s.pausedAt"
                            >{{ s.pausedAt }}</time
                          >
                        </dd>
                      }
                      @if (present(s.closedAt)) {
                        <dt class="font-mono text-micro text-faint">closed</dt>
                        <dd class="m-0 min-w-0" data-field="closed">
                          <time
                            class="break-all font-mono text-2xs text-dim"
                            [attr.datetime]="s.closedAt"
                            >{{ s.closedAt }}</time
                          >
                        </dd>
                      }
                      @if (present(s.plan)) {
                        <dt class="font-mono text-micro text-faint">plan</dt>
                        <dd class="m-0 min-w-0" data-field="plan">
                          <ol class="m-0 list-decimal break-words pl-4 font-sans text-xs text-soft">
                            @for (item of items(s.plan); track $index) {
                              <li>{{ item }}</li>
                            }
                          </ol>
                        </dd>
                      }
                      @if (present(s.nextStep)) {
                        <dt class="font-mono text-micro text-faint">next</dt>
                        <dd class="m-0 min-w-0" data-field="next">
                          <ol class="m-0 list-decimal break-words pl-4 font-sans text-xs text-soft">
                            @for (item of items(s.nextStep); track $index) {
                              <li>{{ item }}</li>
                            }
                          </ol>
                        </dd>
                      }
                      @if (s.entries.length > 0) {
                        <dt class="font-mono text-micro text-faint">log</dt>
                        <dd class="m-0 min-w-0" data-field="log">
                          <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
                            @for (e of s.entries; track $index) {
                              <li class="min-w-0" data-log-entry>
                                <time
                                  class="block break-all font-mono text-micro text-faint"
                                  [attr.datetime]="e.createdAt"
                                  >{{ e.createdAt }}</time
                                >
                                <p
                                  class="m-0 whitespace-pre-wrap break-words font-sans text-xs text-soft [overflow-wrap:anywhere]"
                                  [textContent]="e.entry"
                                ></p>
                              </li>
                            }
                          </ol>
                        </dd>
                      }
                      @if (present(s.changes)) {
                        <dt class="font-mono text-micro text-faint">changes</dt>
                        <dd class="m-0 min-w-0" data-field="changes">
                          <ul class="m-0 list-none break-all p-0 font-mono text-2xs text-dim">
                            @for (item of items(s.changes); track $index) {
                              <li>{{ item }}</li>
                            }
                          </ul>
                        </dd>
                      }
                      @if (present(s.verification)) {
                        <dt class="font-mono text-micro text-faint">verified</dt>
                        <dd
                          class="m-0 min-w-0 whitespace-pre-wrap break-words font-sans text-xs text-soft [overflow-wrap:anywhere]"
                          data-field="verified"
                          [textContent]="s.verification"
                        ></dd>
                      }
                      @if (present(s.closure)) {
                        <dt class="font-mono text-micro text-faint">closure</dt>
                        <dd
                          class="m-0 min-w-0 whitespace-pre-wrap break-words font-sans text-xs text-soft [overflow-wrap:anywhere]"
                          data-field="closure"
                          [textContent]="s.closure"
                        ></dd>
                      }
                    </dl>
                  </li>
                }
              </ol>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessLogCardComponent {
  @Input({ required: true }) state: ProcessLogState = { kind: 'idle' };

  idLabel(featureNumber: number): string {
    return String(featureNumber).padStart(2, '0');
  }

  present(value: string | string[] | null): boolean {
    if (value === null) return false;
    if (Array.isArray(value)) return this.items(value).length > 0;
    return value.trim() !== '';
  }

  items(list: string[] | null): string[] {
    return (list ?? []).filter((item) => item.trim() !== '');
  }

  sessionState(session: ProcessLogSession): SessionState {
    if (session.closedAt !== null) return 'closed';
    if (session.pausedAt !== null) return 'paused';
    return 'open';
  }

  stateColor(state: SessionState): string {
    return STATE_LABEL_COLOR[state];
  }

  stateNode(state: SessionState): string {
    return STATE_NODE[state];
  }
}
