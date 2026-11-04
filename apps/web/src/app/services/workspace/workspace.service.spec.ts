import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Workspace } from './workspace.service';

describe('Workspace', () => {
  // The theme and source are written as soon as they change.
  it('stores the theme and switches the source', () => {
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => saved.clear(),
        getItem: (key: string) => saved.get(key) ?? null,
        removeItem: (key: string) => saved.delete(key),
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    TestBed.configureTestingModule({ providers: [provideRouter([]), Workspace] });
    const workspace = TestBed.inject(Workspace);
    TestBed.flushEffects();
    expect(workspace.source()).toBe('r2');
    workspace.toggleTheme();
    TestBed.flushEffects();
    expect(workspace.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('private-drive.theme')).toBe('dark');
    workspace.setSource('telegram');
    TestBed.flushEffects();
    expect(workspace.source()).toBe('telegram');
    expect(localStorage.getItem('private-drive.source')).toBe('telegram');
  });
});
