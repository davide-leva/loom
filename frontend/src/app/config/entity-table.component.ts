import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';

export interface EntityColumn {
  field: string;
  label: string;
}

@Component({
  selector: 'app-entity-table',
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule],
  templateUrl: './entity-table.component.html',
  styleUrl: './entity-table.component.css'
})
export class EntityTableComponent<T extends object> {
  @ViewChild('table') table?: Table;
  @Input() rows: T[] = [];
  @Input() columns: EntityColumn[] = [];
  @Input() loading = false;
  @Input() emptyMessage = 'Nessun dato disponibile.';
  @Input() actionLabel = '';
  @Input() actionIcon = 'pi pi-arrow-right';
  @Input() secondaryActionLabel = '';
  @Input() secondaryActionIcon = 'pi pi-trash';
  @Output() refresh = new EventEmitter<void>();
  @Output() rowOpen = new EventEmitter<T>();
  @Output() secondaryRowAction = new EventEmitter<T>();

  searchTerm = '';

  get searchFields(): string[] {
    return this.columns.map(column => column.field);
  }

  search(value: string): void {
    this.table?.filterGlobal(value, 'contains');
  }

  cell(row: T, field: string): unknown {
    return (row as Record<string, unknown>)[field] ?? '—';
  }
}
