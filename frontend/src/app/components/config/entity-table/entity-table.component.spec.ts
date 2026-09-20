import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { EntityTableComponent } from './entity-table.component';
import { Table } from 'primeng/table';

interface Row {
  id: number;
  name: string;
  description?: string;
}

describe('EntityTableComponent', () => {
  let fixture: ComponentFixture<EntityTableComponent<Row>>;
  let component: EntityTableComponent<Row>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntityTableComponent],
      providers: [
        provideAnimationsAsync('noop')
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EntityTableComponent<Row>);
    component = fixture.componentInstance;
  });

  describe('searchFields', () => {
    it('returns the field names from columns', () => {
      component.columns = [
        { field: 'id', label: 'ID' },
        { field: 'name', label: 'Nome' }
      ];
      expect(component.searchFields).toEqual(['id', 'name']);
    });

    it('empty when no columns', () => {
      component.columns = [];
      expect(component.searchFields).toEqual([]);
    });
  });

  describe('cell()', () => {
    it('returns the field value when present', () => {
      component.rows = [{ id: 1, name: 'A' }];
      expect(component.cell(component.rows[0], 'name')).toBe('A');
    });

    it('returns "—" when the field is missing', () => {
      component.rows = [{ id: 1, name: 'A' }];
      expect(component.cell(component.rows[0], 'missing')).toBe('—');
    });

    it('returns "—" when the field is undefined', () => {
      component.rows = [{ id: 1, name: 'A' }];
      expect(component.cell(component.rows[0], 'description')).toBe('—');
    });
  });

  describe('search()', () => {
    it('calls filterGlobal on the underlying table when present', () => {
      const filterGlobal = jest.fn();
      component.table = { filterGlobal } as unknown as Table;
      component.search('foo');
      expect(filterGlobal).toHaveBeenCalledWith('foo', 'contains');
    });

    it('does nothing when no table reference', () => {
      component.table = undefined;
      expect(() => component.search('foo')).not.toThrow();
    });
  });

  describe('outputs', () => {
    it('emits refresh when invoked', () => {
      const spy = jest.fn();
      component.refresh.subscribe(spy);
      component.refresh.emit();
      expect(spy).toHaveBeenCalled();
    });

    it('emits rowOpen with the row', () => {
      const spy = jest.fn();
      component.rowOpen.subscribe(spy);
      const row: Row = { id: 1, name: 'A' };
      component.rowOpen.emit(row);
      expect(spy).toHaveBeenCalledWith(row);
    });

    it('emits secondaryRowAction with the row', () => {
      const spy = jest.fn();
      component.secondaryRowAction.subscribe(spy);
      const row: Row = { id: 1, name: 'A' };
      component.secondaryRowAction.emit(row);
      expect(spy).toHaveBeenCalledWith(row);
    });
  });

  describe('inputs default values', () => {
    it('defaults are sensible', () => {
      expect(component.rows).toEqual([]);
      expect(component.columns).toEqual([]);
      expect(component.loading).toBe(false);
      expect(component.emptyMessage).toBe('Nessun dato disponibile.');
      expect(component.actionIcon).toBe('pi pi-arrow-right');
      expect(component.secondaryActionIcon).toBe('pi pi-trash');
    });
  });
});