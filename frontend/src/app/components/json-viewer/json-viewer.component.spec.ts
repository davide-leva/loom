import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JsonViewerComponent } from './json-viewer.component';

describe('JsonViewerComponent', () => {
  let fixture: ComponentFixture<JsonViewerComponent>;
  let component: JsonViewerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JsonViewerComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(JsonViewerComponent);
    component = fixture.componentInstance;
  });

  it('renders a string primitive with the json-string class', () => {
    component.value = 'hello';
    fixture.detectChanges();
    const string = fixture.nativeElement.querySelector('.json-string');
    expect(string?.textContent).toContain('hello');
  });

  it('renders a number primitive with the json-number class', () => {
    component.value = 42;
    fixture.detectChanges();
    const number = fixture.nativeElement.querySelector('.json-number');
    expect(number?.textContent).toContain('42');
  });

  it('renders null with the json-null class', () => {
    component.value = null;
    fixture.detectChanges();
    const nullNode = fixture.nativeElement.querySelector('.json-null');
    expect(nullNode?.textContent).toContain('null');
  });

  it('renders a boolean with the json-boolean class', () => {
    component.value = true;
    fixture.detectChanges();
    const bool = fixture.nativeElement.querySelector('.json-boolean');
    expect(bool?.textContent).toContain('true');
  });

  it('renders an object as a collapsible node with a summary of property count', () => {
    component.value = { a: 1, b: 2, c: 3 };
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('.json-summary');
    expect(summary?.textContent).toContain('3 proprietà');
  });

  it('renders an array as a collapsible node with a summary of element count', () => {
    component.value = [1, 2];
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('.json-summary');
    expect(summary?.textContent).toContain('2 elementi');
  });

  it('expands by default and exposes children', () => {
    component.value = { foo: 'bar' };
    fixture.detectChanges();
    const children = fixture.nativeElement.querySelectorAll('.json-row');
    expect(children.length).toBe(1);
  });

  it('collapses the children when the toggle is clicked', () => {
    component.value = { foo: 'bar' };
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('.json-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.json-row').length).toBe(0);
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.json-row').length).toBe(1);
  });

  it('starts collapsed when initiallyExpanded is false', () => {
    component.value = { foo: 'bar' };
    component.initiallyExpanded = false;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.json-row').length).toBe(0);
  });

  it('renders the key when one is provided', () => {
    component.value = 'value';
    component.key = 'myKey';
    fixture.detectChanges();
    const keySpan = fixture.nativeElement.querySelector('.json-key');
    expect(keySpan?.textContent).toContain('myKey');
  });
});
