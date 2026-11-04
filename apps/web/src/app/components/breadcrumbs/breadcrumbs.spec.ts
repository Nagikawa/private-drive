import { TestBed } from '@angular/core/testing';
import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs', () => {
  // Root is always present, and a crumb opens that folder.
  it('emits the folder for the crumb that was clicked', () => {
    TestBed.configureTestingModule({ imports: [Breadcrumbs] });
    const fixture = TestBed.createComponent(Breadcrumbs);
    const opened: Array<string> = [];
    fixture.componentInstance.opened.subscribe((path) => opened.push(path));
    fixture.componentRef.setInput('crumbs', [{ name: 'img', path: 'img' }]);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0]?.click();
    buttons[1]?.click();
    expect(opened).toEqual(['', 'img']);
  });
});
