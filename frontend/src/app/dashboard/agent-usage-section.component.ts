import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideAngularModule, ListTree } from 'lucide-angular';

import { AgentRunNode, AgentUsageResponse } from '../core/harness-api.service';
import {
  formatDuration,
  formatExactSeconds,
  formatExactTokens,
  formatTokens,
} from './usage-format';

export type AgentUsageState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; usage: AgentUsageResponse }
  | { kind: 'error'; message: string };

interface SpanBox {
  left: number;
  width: number;
}

interface StripEntry {
  key: string;
  box: SpanBox;
}

@Component({
  selector: 'app-agent-usage-section',
  imports: [LucideAngularModule, NgTemplateOutlet],
  providers: [LucideAngularModule.pick({ ListTree }).providers ?? []],
  template: `
    <section
      class="mt-3 min-w-0 border-t border-edge pt-3"
      data-usage
      aria-labelledby="usage-title"
    >
      <h3
        id="usage-title"
        class="m-0 mb-2 flex items-center gap-1.5 font-mono text-label font-semibold uppercase text-muted"
      >
        <lucide-icon name="list-tree" class="block h-3 w-3" />
        Agent usage
      </h3>

      @if (state.kind === 'idle') {
        <p class="m-0 text-sm text-muted">Select a feature to see its agent usage.</p>
      } @else if (state.kind === 'loading') {
        <p
          class="m-0 flex min-w-0 items-center gap-2 text-sm text-muted"
          role="status"
          data-usage-loading
        >
          <span
            class="inline-block h-3.5 w-3.5 shrink-0 animate-spin-fast rounded-full border-2 border-signal border-r-transparent motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
          <span class="min-w-0 break-words">Loading agent usage…</span>
        </p>
      } @else if (state.kind === 'error') {
        <div
          class="flex items-start gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text"
          role="alert"
          data-usage-error
        >
          <span class="shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked">
            [ERR]
          </span>
          <span class="min-w-0 break-words">{{ state.message }}</span>
        </div>
      } @else {
        @let usage = state.usage;
        @let empty = usage.runs.length === 0;
        @if (empty) {
          <p class="m-0 text-sm text-muted" data-usage-empty>
            No agent runs recorded for this feature.
          </p>
        } @else {
          <div data-usage-totals class="mb-3 flex min-w-0 flex-col gap-2">
            @if (stripEntries.length > 0) {
              <div
                class="relative h-1.5 overflow-hidden rounded-sm bg-edge"
                aria-hidden="true"
                data-usage-strip
              >
                @for (entry of stripEntries; track entry.key) {
                  <span
                    class="absolute inset-y-0 bg-signal/35"
                    [style.left.%]="entry.box.left"
                    [style.width.%]="entry.box.width"
                    data-usage-strip-segment
                  ></span>
                }
              </div>
            }

            <dl
              class="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1"
              data-usage-totals-dl
            >
              <dt class="font-mono text-micro text-faint">agent effort</dt>
              <dd class="m-0 font-mono text-xs text-text">
                <time
                  data-usage-effort
                  [attr.title]="formatExactSeconds(usage.totals.effortSeconds)"
                  >{{ formatDuration(usage.totals.effortSeconds) }}</time
                >
              </dd>

              <dt class="font-mono text-micro text-faint">wall time</dt>
              <dd class="m-0 font-mono text-xs text-text">
                <time
                  data-usage-wall
                  [attr.title]="formatExactSeconds(usage.totals.unionSeconds)"
                  >{{ formatDuration(usage.totals.unionSeconds) }}</time
                >
              </dd>

              <dt class="font-mono text-micro text-faint">tokens</dt>
              <dd class="m-0 min-w-0">
                <data
                  class="font-mono text-xs text-text"
                  [attr.value]="usage.totals.tokens.total"
                  [attr.title]="formatExactTokens(usage.totals.tokens.total) + ' tokens'"
                  data-usage-tokens-total
                  >{{ formatTokens(usage.totals.tokens.total) }}</data
                >
                <div class="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  <span class="font-mono text-micro text-faint">input</span>
                  <data
                    class="font-mono text-2xs text-dim"
                    [attr.value]="usage.totals.tokens.input"
                    [attr.title]="formatExactTokens(usage.totals.tokens.input) + ' tokens'"
                    data-usage-tokens-input
                    >{{ formatTokens(usage.totals.tokens.input) }}</data
                  >
                  <span class="font-mono text-micro text-faint">cache read</span>
                  <data
                    class="font-mono text-2xs text-dim"
                    [attr.value]="usage.totals.tokens.cacheRead"
                    [attr.title]="formatExactTokens(usage.totals.tokens.cacheRead) + ' tokens'"
                    data-usage-tokens-cache-read
                    >{{ formatTokens(usage.totals.tokens.cacheRead) }}</data
                  >
                  <span class="font-mono text-micro text-faint">cache write</span>
                  <data
                    class="font-mono text-2xs text-dim"
                    [attr.value]="usage.totals.tokens.cacheWrite"
                    [attr.title]="formatExactTokens(usage.totals.tokens.cacheWrite) + ' tokens'"
                    data-usage-tokens-cache-write
                    >{{ formatTokens(usage.totals.tokens.cacheWrite) }}</data
                  >
                  <span class="font-mono text-micro text-faint">output</span>
                  <data
                    class="font-mono text-2xs text-dim"
                    [attr.value]="usage.totals.tokens.output"
                    [attr.title]="formatExactTokens(usage.totals.tokens.output) + ' tokens'"
                    data-usage-tokens-output
                    >{{ formatTokens(usage.totals.tokens.output) }}</data
                  >
                  <span class="font-mono text-micro text-faint">reasoning</span>
                  <data
                    class="font-mono text-2xs text-dim"
                    [attr.value]="usage.totals.tokens.reasoning"
                    [attr.title]="formatExactTokens(usage.totals.tokens.reasoning) + ' tokens'"
                    data-usage-tokens-reasoning
                    >{{ formatTokens(usage.totals.tokens.reasoning) }}</data
                  >
                </div>
              </dd>
            </dl>

            <p class="m-0 font-sans text-2xs text-muted" data-usage-note>
              Agent effort adds up every run's duration. Wall time counts overlapping runs once.
            </p>
          </div>

          <div
            class="min-w-0 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-signal lg:max-h-[40vh] lg:overflow-y-auto"
            tabindex="0"
            [attr.aria-label]="'Agent runs of ' + featureName"
            data-usage-scroll
          >
            <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
              <ng-template #runList let-runs let-level="level">
                @for (run of runs; track run.runtime + ':' + run.externalId) {
                  <li class="relative" [attr.data-run]="run.externalId" [attr.data-level]="level">
                    <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        class="min-w-0 break-all font-mono text-2xs text-text"
                        data-run-role
                        [class.text-faint]="isBlank(run.role)"
                        >{{ role(run) }}</span
                      >
                      <span
                        class="rounded-sm border border-line px-1 font-mono text-tag text-muted"
                        data-run-runtime
                        >{{ run.runtime }}</span
                      >
                      @if (isDetached(run, level)) {
                        <span
                          class="rounded-sm border border-dashed border-line-strong px-1 font-mono text-tag text-faint"
                          data-run-detached
                          [attr.title]="
                            'Parent run ' +
                            run.parentExternalId +
                            ' is not part of this feature’s runs.'
                          "
                          >detached</span
                        >
                      }
                      @if (run.durationSeconds !== null) {
                        <time
                          class="ml-auto font-mono text-2xs text-dim"
                          data-run-duration
                          [attr.title]="formatExactSeconds(run.durationSeconds)"
                          >{{ formatDuration(run.durationSeconds) }}</time
                        >
                      } @else {
                        <span class="ml-auto font-mono text-2xs text-dim" data-run-duration>—</span>
                      }
                      @if (run.tokens.total !== null) {
                        <data
                          class="font-mono text-2xs text-soft"
                          data-run-tokens
                          [attr.value]="run.tokens.total"
                          [attr.title]="formatExactTokens(run.tokens.total) + ' tokens'"
                          >{{ formatTokens(run.tokens.total) }}</data
                        >
                      } @else {
                        <span class="font-mono text-2xs text-soft" data-run-tokens>—</span>
                      }
                    </div>
                    @if (present(run.label) || present(run.model)) {
                      <div class="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
                        @if (present(run.label)) {
                          <span
                            class="min-w-0 break-words font-sans text-xs text-dim [overflow-wrap:anywhere]"
                            data-run-label
                            >{{ run.label }}</span
                          >
                        }
                        @if (present(run.model)) {
                          <span
                            class="min-w-0 break-all font-mono text-micro text-faint"
                            data-run-model
                            >{{ run.model }}</span
                          >
                        }
                      </div>
                    }
                    @if (span(run); as box) {
                      <div class="relative mt-1 h-0.5 bg-edge" data-run-track>
                        <span
                          class="absolute inset-y-0 min-w-[2px] bg-dim"
                          [style.left.%]="box.left"
                          [style.width.%]="box.width"
                          data-run-span
                        ></span>
                      </div>
                    }
                    @if (run.children.length > 0) {
                      <ul
                        class="m-0 ml-1 mt-2 flex list-none flex-col gap-2.5 border-l border-line p-0 pl-2.5"
                      >
                        <ng-container
                          *ngTemplateOutlet="
                            runList;
                            context: {
                              $implicit: run.children,
                              level: level + 1,
                            }
                          "
                        ></ng-container>
                      </ul>
                    }
                  </li>
                }
              </ng-template>
              <ng-container
                *ngTemplateOutlet="runList; context: { $implicit: usage.runs, level: 0 }"
              ></ng-container>
            </ul>
          </div>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentUsageSectionComponent implements OnChanges {
  @Input({ required: true }) state: AgentUsageState = { kind: 'idle' };
  @Input({ required: true }) featureName = '';

  formatTokens = formatTokens;
  formatExactTokens = formatExactTokens;
  formatDuration = formatDuration;
  formatExactSeconds = formatExactSeconds;

  private featureSpan: { start: number; end: number } | null = null;
  stripEntries: StripEntry[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state']) {
      if (this.state.kind === 'ok') {
        this.recomputeSpan(this.state.usage);
        this.stripEntries = this.computeStrip(this.state.usage);
      } else {
        this.featureSpan = null;
        this.stripEntries = [];
      }
    }
  }

  isBlank(value: string | null): boolean {
    return value === null || value.trim() === '';
  }

  present(value: string | null): boolean {
    return !this.isBlank(value);
  }

  role(run: AgentRunNode): string {
    return this.isBlank(run.role) ? 'unknown' : (run.role ?? 'unknown');
  }

  isDetached(run: AgentRunNode, level: number): boolean {
    return level === 0 && run.parentExternalId !== null;
  }

  span(run: AgentRunNode): SpanBox | null {
    if (this.state.kind !== 'ok') return null;
    const start = Date.parse(run.startedAt ?? '');
    const end = Date.parse(run.finishedAt ?? '');
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    const feature = this.featureSpan;
    if (!feature) return null;
    const total = feature.end - feature.start;
    if (total === 0) return { left: 0, width: 100 };
    const left = ((start - feature.start) / total) * 100;
    const width = ((end - start) / total) * 100;
    return { left, width };
  }

  private computeStrip(usage: AgentUsageResponse): StripEntry[] {
    const out: StripEntry[] = [];
    const walk = (runs: AgentRunNode[]): void => {
      for (const run of runs) {
        const box = this.spanFor(run);
        if (box) out.push({ key: `${run.runtime}:${run.externalId}`, box });
        walk(run.children);
      }
    };
    walk(usage.runs);
    return out;
  }

  private spanFor(run: AgentRunNode): SpanBox | null {
    if (this.state.kind !== 'ok') return null;
    const start = Date.parse(run.startedAt ?? '');
    const end = Date.parse(run.finishedAt ?? '');
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    const feature = this.featureSpan;
    if (!feature) return null;
    const total = feature.end - feature.start;
    if (total === 0) return { left: 0, width: 100 };
    const left = ((start - feature.start) / total) * 100;
    const width = ((end - start) / total) * 100;
    return { left, width };
  }

  private recomputeSpan(usage: AgentUsageResponse): void {
    let start = Infinity;
    let end = -Infinity;
    const walk = (runs: AgentRunNode[]): void => {
      for (const run of runs) {
        const s = Date.parse(run.startedAt ?? '');
        const e = Date.parse(run.finishedAt ?? '');
        if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
          if (s < start) start = s;
          if (e > end) end = e;
        }
        walk(run.children);
      }
    };
    walk(usage.runs);
    if (start === Infinity || end === -Infinity) {
      this.featureSpan = null;
      return;
    }
    this.featureSpan = { start, end };
  }
}
