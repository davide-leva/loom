import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IssueFormComponent, IssueFormModel } from './issue-form.component';
import type { IssueField, IssueFieldOption } from '../../shared/models/issue.types';

function field(partial: Partial<IssueField>): IssueField {
  return {
    id: 1, projectId: 1, code: 'X', label: 'X', description: null,
    mandatory: false, multiple: false, type: 'TEXT', scope: 'USER',
    ...partial
  } as IssueField;
}

describe('IssueFormComponent', () => {
  let fixture: ComponentFixture<IssueFormComponent>;
  let component: IssueFormComponent;

  function makeModel(): IssueFormModel {
    return { title: '', description: '', values: {}, attachments: {}, internal: false };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IssueFormComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(IssueFormComponent);
    component = fixture.componentInstance;
  });

  describe('orderedFields()', () => {
    it('returns non-attachments before attachments', () => {
      component.fields = [
        field({ id: 1, type: 'ATTACHMENTS' }),
        field({ id: 2, type: 'TEXT' }),
        field({ id: 3, type: 'SELECT' }),
        field({ id: 4, type: 'TEXTAREA' })
      ];
      const ids = component.orderedFields().map(f => f.id);
      expect(ids).toEqual([2, 3, 4, 1]);
    });

    it('filters fields by visibleScopes', () => {
      component.fields = [
        field({ id: 1, scope: 'USER' }),
        field({ id: 2, scope: 'TEAM' }),
        field({ id: 3, scope: 'SUPERUSER' })
      ];
      component.visibleScopes = ['USER'];
      const ids = component.orderedFields().map(f => f.id);
      expect(ids).toEqual([1]);
    });

    it('includes multiple scopes', () => {
      component.fields = [
        field({ id: 1, scope: 'USER' }),
        field({ id: 2, scope: 'TEAM' }),
        field({ id: 3, scope: 'SUPERUSER' })
      ];
      component.visibleScopes = ['USER', 'TEAM'];
      const ids = component.orderedFields().map(f => f.id);
      expect(ids).toEqual([1, 2]);
    });
  });

  describe('activeOptionsFor()', () => {
    it('returns only options flagged active=true', () => {
      const opt = (id: number, active: boolean) => ({ id, definitionId: 1, projectId: 1, value: `v${id}`, label: `V${id}`, active }) as IssueFieldOption;
      component.optionsByField = new Map([
        [1, [opt(1, true), opt(2, false), opt(3, true)]]
      ]);
      const result = component.activeOptionsFor(field({ id: 1, type: 'SELECT' }));
      expect(result.map(o => o.id)).toEqual([1, 3]);
    });

    it('returns empty array when no options', () => {
      component.optionsByField = new Map();
      expect(component.activeOptionsFor(field({ id: 1 }))).toEqual([]);
    });
  });

  describe('file management', () => {
    beforeEach(() => {
      component.model = makeModel();
    });

    it('clearFiles() empties attachments for the field', () => {
      component.model.attachments[1] = [new File(['x'], 'x.txt')];
      component.clearFiles(1);
      expect(component.model.attachments[1]).toEqual([]);
    });

    it('setFiles() replaces existing file when not multiple', () => {
      component.fields = [field({ id: 1, type: 'ATTACHMENTS', multiple: false })];
      const old = new File(['old'], 'old.txt');
      const next = new File(['next'], 'next.txt');
      component.model.attachments[1] = [old];
      component.setFiles(1, { currentFiles: [next] } as any);
      expect(component.model.attachments[1]).toEqual([next]);
    });

    it('setFiles() appends when multiple, deduplicating identical files', () => {
      component.fields = [field({ id: 1, type: 'ATTACHMENTS', multiple: true })];
      const existing = new File(['a'], 'a.txt');
      const newFile = new File(['b'], 'b.txt');
      const dupOfExisting = new File(['a'], 'a.txt');
      component.model.attachments[1] = [existing];
      component.setFiles(1, { currentFiles: [newFile, dupOfExisting] } as any);
      expect(component.model.attachments[1]).toEqual([existing, newFile]);
    });

    it('removeFile() drops the matching file', () => {
      component.fields = [field({ id: 1, type: 'ATTACHMENTS', multiple: true })];
      const a = new File(['a'], 'a.txt');
      const b = new File(['b'], 'b.txt');
      component.model.attachments[1] = [a, b];
      component.removeFile(1, { file: a } as any);
      expect(component.model.attachments[1]).toEqual([b]);
    });

    it('setFiles() does nothing when currentFiles is empty', () => {
      component.fields = [field({ id: 1, type: 'ATTACHMENTS', multiple: false })];
      component.model.attachments[1] = [new File(['p'], 'p.txt')];
      component.setFiles(1, { currentFiles: [] } as any);
      expect(component.model.attachments[1].length).toBe(1);
    });
  });
});