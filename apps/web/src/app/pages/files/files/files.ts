import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Effect } from 'effect';
import {
  absoluteContentUrl,
  folderCrumbs,
  folderTree,
  formatLink,
  joinFolder,
  pure,
  type FileEntry,
  type FolderEntry,
  type LinkFormat,
  type Listing,
} from '@private-drive/domain';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ClipboardFailure } from '../../../core/drive-error';
import { DriveApi } from '../../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../../services/drive-runtime/drive-runtime.service';
import { Notices } from '../../../services/notices/notices.service';
import { Workspace } from '../../../services/workspace/workspace.service';
import { ConfirmDelete } from '../../confirm-delete';
import { FolderPrompt } from '../../folder-prompt/folder-prompt/folder-prompt';
import { MoveDialog } from '../../move-dialog/move-dialog';
import { PreviewDialog } from '../../preview/preview-dialog/preview-dialog';
import { Breadcrumbs } from '../../../components/breadcrumbs/breadcrumbs';
import { FileTable } from '../../../components/file-table/file-table';
import { FolderActions, type FolderActionId } from '../../../components/folder-actions/folder-actions';
import { FolderTree } from '../../../components/folder-tree/folder-tree';

interface BrowseState {
  listing: Listing | undefined;
  error: string;
}

const fileDragType = 'application/x-private-drive-file';

@Component({
  selector: 'app-files',
  imports: [Breadcrumbs, ConfirmDelete, FileTable, FolderActions, FolderPrompt, FolderTree, MoveDialog, PreviewDialog],
  templateUrl: './files.html',
  host: { class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col' },
})
export class Files {
  private readonly api = inject(DriveApi);
  private readonly runtime = inject(DriveRuntime);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notices = inject(Notices);
  private readonly refresh$ = new Subject<void>();
  private readonly confirm = viewChild.required(ConfirmDelete);
  private readonly folderPrompt = viewChild.required(FolderPrompt);
  private readonly moveDialog = viewChild.required(MoveDialog);
  private readonly previewDialog = viewChild.required(PreviewDialog);
  private readonly allBox = viewChild<ElementRef<HTMLInputElement>>('allBox');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly pendingDelete = signal<
    | { kind: 'files' }
    | { kind: 'mixed'; ids: ReadonlyArray<string>; paths: ReadonlyArray<string> }
    | undefined
  >(undefined);
  protected readonly workspace = inject(Workspace);
  protected readonly search = signal('');
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly selected = signal<ReadonlyArray<string>>([]);
  protected readonly selectedFolders = signal<ReadonlyArray<string>>([]);
  protected readonly uploading = signal(false);
  protected readonly uploadStatus = signal('');
  protected readonly dropTarget = signal<string | null>(null);
  private dragOrigin: EventTarget | null = null;
  private draggingId = '';

  // Syncs the select-all checkbox, including the indeterminate state a binding cannot express.
  constructor() {
    // Keeps the select-all box indeterminate when only some files are checked.
    effect(() => {
      const element = this.allBox()?.nativeElement;
      if (element !== undefined) {
        element.indeterminate = this.someSelected();
      }
    });
  }

  protected readonly folder = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('folder') ?? '')),
    { initialValue: this.route.snapshot.queryParamMap.get('folder') ?? '' },
  );

  // Splits the current folder into breadcrumb segments.
  protected readonly crumbs = computed(() => pure(folderCrumbs(this.folder()), []));

  // Telegram has no folder listing, so the sidebar stays off and the file list uses the full width.
  protected readonly showFolderTree = computed(() => this.workspace.source() !== 'telegram');

  // Turns the recursive folder list into the sidebar tree.
  protected readonly tree = computed(() => pure(folderTree(this.treeFolders()), []));

  // Loads every folder on the source so the sidebar can stay complete while the right pane shows one folder.
  protected readonly treeFolders = toSignal(
    combineLatest([
      toObservable(this.workspace.source),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([source]) => {
        if (source === 'telegram') {
          return of([] as ReadonlyArray<FolderEntry>);
        }
        return this.runtime.bind(
          this.api.list({ source, folder: '', kind: 'all', recursive: 'true' }).pipe(
            Effect.map((listing) => listing.folders),
            Effect.catch(() => Effect.succeed([] as ReadonlyArray<FolderEntry>)),
          ),
        );
      }),
    ),
    { initialValue: [] as ReadonlyArray<FolderEntry> },
  );

  // Loads the files and child folders for the open folder, including the search box above the breadcrumbs.
  protected readonly state = toSignal(
    combineLatest([
      toObservable(this.workspace.source),
      toObservable(this.folder),
      toObservable(this.search).pipe(debounceTime(250), distinctUntilChanged()),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([source, folder, search]) =>
        this.runtime.bind(
          this.api.list({ source, folder, search, kind: 'all', recursive: 'false' }).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                this.selected.set([]);
                this.selectedFolders.set([]);
              }),
            ),
            Effect.map((listing): BrowseState => ({ listing, error: '' })),
            Effect.catch((error) => Effect.succeed<BrowseState>({ listing: undefined, error: error.message })),
          ),
        ),
      ),
    ),
    { initialValue: { listing: undefined, error: '' } satisfies BrowseState },
  );

  // True when a file or folder checkbox is on, so the action icons know there is something to act on.
  protected readonly hasSelection = computed(() => this.selected().length > 0 || this.selectedFolders().length > 0);

  // True when every file in the current list is selected.
  protected readonly allSelected = computed(() => {
    const listing = this.state().listing;
    if (listing === undefined || listing.files.length === 0) {
      return false;
    }
    return listing.files.every((file) => this.selected().includes(file.id));
  });

  // True when the select-all box should look partial rather than checked or empty.
  protected readonly someSelected = computed(() => {
    const listing = this.state().listing;
    if (listing === undefined || listing.files.length === 0) {
      return false;
    }
    const count = listing.files.filter((file) => this.selected().includes(file.id)).length;
    return count > 0 && count < listing.files.length;
  });

  // Writes the search box into the signal that reloads the listing.
  protected onSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.search.set(event.target.value);
    }
  }

  // Reads a checkbox change without assuming every event comes from an input.
  protected checkedOf(event: Event): boolean {
    return event.target instanceof HTMLInputElement && event.target.checked;
  }

  // Switches the file pane between the grid and the list.
  protected setView(value: 'grid' | 'list'): void {
    this.view.set(value);
  }

  // Opens a folder in the right pane by updating the query string.
  protected openFolder(path: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { folder: path === '' ? null : path },
    });
  }

  // Adds or removes one file from the selection.
  protected toggle(id: string, checked: boolean): void {
    this.selected.update((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  // Adds or removes one folder from the selection.
  protected toggleFolder(path: string, checked: boolean): void {
    this.selectedFolders.update((current) => (checked ? [...current, path] : current.filter((item) => item !== path)));
  }

  // Selects every file in the current list, or clears that selection.
  protected toggleAll(checked: boolean): void {
    const listing = this.state().listing;
    this.selected.set(checked ? (listing?.files ?? []).map((file) => file.id) : []);
    this.selectedFolders.set([]);
  }

  // Remembers where the pointer went down so a drag that starts on a control can be ignored.
  protected rememberDragOrigin(event: Event): void {
    this.dragOrigin = event.target;
  }

  // Starts a file drag unless it began on a checkbox or menu, which should keep working as controls.
  protected onFileDragStart(event: DragEvent, id: string): void {
    const origin = this.dragOrigin;
    this.dragOrigin = null;
    if (origin instanceof Element && origin.closest('input, label, .dropdown') !== null) {
      event.preventDefault();
      return;
    }
    const transfer = event.dataTransfer;
    if (transfer === null) {
      event.preventDefault();
      return;
    }
    transfer.setData(fileDragType, id);
    transfer.setData('text/plain', id);
    transfer.effectAllowed = 'move';
    this.draggingId = id;
  }

  // Clears the drag highlight when the pointer is released.
  protected onFileDragEnd(): void {
    this.draggingId = '';
    this.dragOrigin = null;
    this.dropTarget.set(null);
  }

  // Highlights a tree folder while a file is dragged over it.
  protected onFolderDragOver(event: DragEvent, path: string): void {
    const types = event.dataTransfer?.types;
    if (this.draggingId === '' && (types === undefined || !Array.from(types).includes(fileDragType))) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.dropTarget() !== path) {
      this.dropTarget.set(path);
    }
  }

  // Clears the highlight when the pointer leaves the folder row, but not when it enters a child.
  protected onFolderDragLeave(event: DragEvent, path: string): void {
    const next = event.relatedTarget;
    const current = event.currentTarget;
    if (current instanceof Element && next instanceof Node && current.contains(next)) {
      return;
    }
    if (this.dropTarget() === path) {
      this.dropTarget.set(null);
    }
  }

  // Moves the dragged file into the tree folder it was dropped on.
  protected onFolderDrop(event: DragEvent, path: string): void {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer?.getData(fileDragType) || this.draggingId;
    this.draggingId = '';
    this.dropTarget.set(null);
    if (id === '') {
      return;
    }
    const api = this.api;
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const program = api.move([id], path).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          notices.show('Moved');
          refresh();
        }),
      ),
      Effect.catch((error) => Effect.sync(() => notices.show(error.message))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }

  // Opens the preview dialog for one file.
  protected preview(entry: FileEntry): void {
    this.previewDialog().open(entry);
  }

  // Copies a share link and closes the menu so the notice is visible.
  protected copy(entry: FileEntry, format: LinkFormat): void {
    const notices = this.notices;
    const program = Effect.gen(function* () {
      const url = yield* absoluteContentUrl(location.origin, entry.id);
      const text = yield* formatLink({ format, image: entry.image, name: entry.name, url });
      yield* Effect.tryPromise({
        try: () => navigator.clipboard.writeText(text),
        catch: () => new ClipboardFailure({ message: 'Could not copy' }),
      });
      yield* Effect.sync(() => {
        notices.show('Copied');
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
    }).pipe(
      Effect.catch((error) => Effect.sync(() => notices.show(error.message))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }

  // Runs the current-folder action the icon row reported. Upload and delete stay on this page.
  protected onFolderAction(id: FolderActionId): void {
    if (id === 'delete') {
      this.deleteChosen();
      return;
    }
    if (id === 'upload') {
      this.pickFiles();
      return;
    }
    this.createFolder();
  }

  // Asks for a folder name inside the current folder.
  protected createFolder(): void {
    this.folderPrompt().open();
  }

  // Creates the named folder under the one currently open.
  protected onFolderNamed(name: string): void {
    const api = this.api;
    const source = this.workspace.source();
    const folder = this.folder();
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const program = Effect.gen(function* () {
      const path = yield* joinFolder(folder, name);
      yield* api.createFolder(source, path);
      yield* Effect.sync(() => refresh());
    }).pipe(
      Effect.catch((error) => Effect.sync(() => notices.show(error.message))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }

  // Opens the move dialog for the selected files.
  protected moveSelected(): void {
    const ids = this.selected();
    if (ids.length === 0) {
      return;
    }
    this.moveDialog().open({ ids, source: this.workspace.source() });
  }

  // Refreshes the list after the move dialog reports success.
  protected onMoved(): void {
    this.notices.show('Moved');
    this.refresh$.next();
  }

  // Confirms deletion of the selected files.
  protected deleteSelected(): void {
    const ids = this.selected();
    if (ids.length === 0) {
      return;
    }
    this.pendingDelete.set({ kind: 'files' });
    this.confirm().open('Delete files', `Delete the ${ids.length} selected files?`);
  }

  // Confirms deletion of the selected files and folders together.
  protected deleteChosen(): void {
    const ids = this.selected();
    const paths = this.selectedFolders();
    if (ids.length === 0 && paths.length === 0) {
      return;
    }
    this.pendingDelete.set({ kind: 'mixed', ids, paths });
    const parts: string[] = [];
    if (paths.length > 0) {
      parts.push(`${paths.length} folders`);
    }
    if (ids.length > 0) {
      parts.push(`${ids.length} files`);
    }
    this.confirm().open('Delete selected', `Delete the selected ${parts.join(' and ')}?`);
  }

  // Opens the hidden file input so the user can upload into the current folder.
  protected pickFiles(): void {
    this.fileInput().nativeElement.click();
  }

  // Uploads the files chosen from the picker and clears the input.
  protected onUpload(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.files === null) {
      return;
    }
    const files = [...input.files];
    input.value = '';
    this.uploadIntoFolder(files);
  }

  // Deletes the pending selection after the confirm dialog closes with acceptance.
  protected onConfirmed(accepted: boolean): void {
    if (!accepted) {
      return;
    }
    const pending = this.pendingDelete();
    this.pendingDelete.set(undefined);
    if (pending === undefined) {
      return;
    }
    if (pending.kind === 'mixed') {
      this.removeSelection(pending.ids, pending.paths);
      return;
    }
    const ids = this.selected();
    const api = this.api;
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const program = api.remove(ids).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          notices.show('Deleted');
          refresh();
        }),
      ),
      Effect.catch((error) => Effect.sync(() => notices.show(error.message))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }

  // Returns the content URL used by image and media previews.
  protected contentUrl(id: string): string {
    return this.api.contentUrl(id);
  }

  // Deletes the chosen files and empty folders, and still refreshes if one of the calls fails.
  private removeSelection(ids: ReadonlyArray<string>, paths: ReadonlyArray<string>): void {
    const source = this.workspace.source();
    const api = this.api;
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const program = Effect.gen(function* () {
      let failed = false;
      // Records a delete failure and lets the remaining deletes continue.
      const recover = (error: { readonly message: string }) =>
        Effect.sync(() => {
          failed = true;
          notices.show(error.message);
        });
      if (ids.length > 0) {
        yield* api.remove(ids).pipe(Effect.catch(recover));
      }
      for (const path of paths) {
        yield* api.deleteFolder(source, path).pipe(Effect.catch(recover));
      }
      if (!failed) {
        notices.show('Deleted');
      }
      refresh();
    }).pipe(Effect.asVoid);
    this.runtime.settle(program);
  }

  // Uploads into the open folder and refreshes the list when at least one file succeeds.
  private uploadIntoFolder(files: ReadonlyArray<File>): void {
    if (files.length === 0) {
      return;
    }
    const source = this.workspace.source();
    const folder = this.folder();
    const api = this.api;
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const setBusy = (value: boolean) => this.uploading.set(value);
    const setStatus = (value: string) => this.uploadStatus.set(value);
    setBusy(true);
    setStatus(`Uploading 0 / ${files.length}`);
    const program = Effect.gen(function* () {
      let failed = 0;
      let index = 0;
      for (const file of files) {
        const uploaded = yield* api.upload(file, source, folder).pipe(
          Effect.match({
            onFailure: (error) => {
              failed += 1;
              notices.show(error.message);
              return false;
            },
            onSuccess: () => true,
          }),
        );
        index += 1;
        setStatus(`Uploading ${index} / ${files.length}`);
        void uploaded;
      }
      setBusy(false);
      setStatus('');
      if (failed < files.length) {
        notices.show('Upload complete');
        refresh();
      }
    }).pipe(Effect.asVoid);
    this.runtime.settle(program);
  }
}
