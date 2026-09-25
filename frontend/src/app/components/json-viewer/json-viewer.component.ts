import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/**
 * Recursive JSON viewer used to render an issue's metadata map in a
 * dedicated dialog. Pure presentational component: no API calls, no
 * state outside the inputs. Each object/array child is rendered as a
 * nested <app-json-viewer> instance so the viewer scales to arbitrary
 * depth without writing a separate tree control.
 *
 * Primitives are colour-coded:
 *  - strings: blue
 *  - numbers: amber
 *  - booleans: purple
 *  - null: muted grey
 *
 * Container nodes start expanded; the user can collapse a subtree to
 * focus on a sibling or to keep the dialog readable when the metadata
 * is large.
 */
@Component({
  selector: 'app-json-viewer',
  imports: [CommonModule, ButtonModule],
  template: `
    @if (key !== null) { <span class="json-key">{{ key }}:</span> }
    @if (isPrimitive()) {
      <span [class]="primitiveClass()">{{ primitiveLabel() }}</span>
    } @else {
      <div class="json-node">
        <button type="button" class="json-toggle"
                [attr.aria-expanded]="expanded()"
                [attr.aria-label]="(expanded() ? 'Comprimi ' : 'Espandi ') + (key ?? 'nodo')"
                (click)="toggle()">
          <i class="pi" [class.pi-chevron-down]="expanded()" [class.pi-chevron-right]="!expanded()"></i>
          <span class="json-summary">{{ summary() }}</span>
        </button>
        @if (expanded()) {
          <div class="json-children">
            @for (entry of childEntries(); track entry.trackKey) {
              <div class="json-row">
                <app-json-viewer [value]="entry.value" [key]="entry.label" />
              </div>
            }
            @if (childEntries().length === 0) {
              <span class="json-empty">{{ emptyLabel() }}</span>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; }

    .json-node { display: block; }

    .json-toggle {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 0; background: none; border: 0; cursor: pointer; color: inherit;
      font-family: inherit; font-size: inherit;
    }
    .json-toggle:hover .json-summary { text-decoration: underline; }

    .json-key { color: #1f2937; font-weight: 600; margin-right: 2px; }
    .json-summary { color: #6b7280; font-style: italic; }

    .json-children { margin-left: 14px; padding-left: 10px; border-left: 2px solid #e5e7eb; }
    .json-row { display: block; }
    .json-empty { color: #9ca3af; font-style: italic; }

    .json-string  { color: #1d4ed8; }
    .json-number  { color: #b45309; }
    .json-boolean { color: #6d28d9; }
    .json-null    { color: #9ca3af; font-style: italic; }
  `]
})
export class JsonViewerComponent implements OnInit {
  /** Value to render. Objects and arrays recurse; primitives are shown inline. */
  @Input() value: unknown = null;
  /** Optional parent key, used as the label for this node. */
  @Input() key: string | null = null;
  /** Whether container nodes start expanded. Defaults to true. */
  @Input() initiallyExpanded = true;

  private readonly expandedSignal = signal(true);

  ngOnInit(): void {
    this.expandedSignal.set(this.initiallyExpanded);
  }

  expanded(): boolean { return this.expandedSignal(); }

  toggle(): void {
    this.expandedSignal.update(value => !value);
  }

  isPrimitive(): boolean {
    const v = this.value;
    return v === null || typeof v !== 'object';
  }

  primitiveClass(): string {
    const v = this.value;
    if (v === null) return 'json-null';
    const t = typeof v;
    if (t === 'string') return 'json-string';
    if (t === 'number') return 'json-number';
    if (t === 'boolean') return 'json-boolean';
    return '';
  }

  primitiveLabel(): string {
    const v = this.value;
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    return String(v);
  }

  readonly summary = computed(() => {
    if (Array.isArray(this.value)) {
      const len = this.value.length;
      return len === 1 ? '[1 elemento]' : `[${len} elementi]`;
    }
    if (this.value !== null && typeof this.value === 'object') {
      const keys = Object.keys(this.value as Record<string, unknown>);
      return keys.length === 1 ? '{1 proprietà}' : `{${keys.length} proprietà}`;
    }
    return '';
  });

  readonly childEntries = computed<{ trackKey: string; label: string; value: unknown }[]>(() => {
    const v = this.value;
    if (Array.isArray(v)) {
      return v.map((item, index) => ({ trackKey: String(index), label: String(index), value: item }));
    }
    if (v !== null && typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => ({ trackKey: k, label: k, value: val }));
    }
    return [];
  });

  emptyLabel(): string {
    return Array.isArray(this.value) ? '[] (vuoto)' : '{} (vuoto)';
  }
}
