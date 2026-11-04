import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FolderTree } from './folder-tree';

describe('FolderTree', () => {
  // The current folder keeps its parent branch open.
  it('opens the branch that contains the current folder', () => {
    TestBed.configureTestingModule({
      imports: [FolderTree],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(FolderTree);
    const opened: Array<string> = [];
    fixture.componentInstance.opened.subscribe((path) => opened.push(path));
    fixture.componentRef.setInput('folder', 'img/scene');
    fixture.componentRef.setInput('nodes', [
      { children: [{ children: [], name: 'scene', path: 'img/scene' }], name: 'img', path: 'img' },
    ]);
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('scene');
    const summary = fixture.nativeElement.querySelector('summary') as HTMLElement;
    summary.click();
    expect(opened).toEqual(['img']);
  });
});
