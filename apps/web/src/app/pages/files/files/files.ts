import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Effect } from 'effect';
import {
  folderCrumbs,
  folderTree,
  formatLink,
  joinFolder,
  pure,
  uploadChunkBytes,
  type FileEntry,
  type UploadProgress,
  type FolderEntry,
  type Listing,
} from '@private-drive/domain';
import { EMPTY, Subject, combineLatest, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ClipboardFailure, NetworkFailure } from '../../../core/drive-error';
import { DriveApi } from '../../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../../services/drive-runtime/drive-runtime.service';
import { Notices } from '../../../services/notices/notices.service';
import { Workspace } from '../../../services/workspace/workspace.service';
import { ConfirmDelete } from '../../confirm-delete';
import { FolderPrompt } from '../../folder-prompt/folder-prompt/folder-prompt';
import { MoveDialog } from '../../move-dialog/move-dialog';
import { PreviewDialog } from '../../preview/preview-dialog/preview-dialog';
import { FilePane, fileDragType } from '../../../components/file-pane/file-pane';
import { type FileRowAction } from '../../../components/file-table/file-table';
import { type FolderActionId } from '../../../components/folder-actions/folder-actions';
import { FolderTree } from '../../../components/folder-tree/folder-tree';

interface BrowseState {
  listing: Listing | undefined;
  error: string;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
}

type FileSort =
  | 'name-asc'
  | 'name-desc'
  | 'size-asc'
  | 'size-desc'
  | 'created-asc'
  | 'created-desc'
  | 'type-asc'
  | 'type-desc';

const fileSorts: ReadonlyArray<FileSort> = [
  'name-asc',
  'name-desc',
  'size-asc',
  'size-desc',
  'created-asc',
  'created-desc',
  'type-asc',
  'type-desc',
];

const parseFileSort = (value: FileSort): { sort: 'name' | 'size' | 'created' | 'type'; order: 'asc' | 'desc' } => {
  const [sort, order] = value.split('-');
  if (
    (sort === 'name' || sort === 'size' || sort === 'created' || sort === 'type') &&
    (order === 'asc' || order === 'desc')
  ) {
    return { sort, order };
  }
  return { sort: 'name', order: 'asc' };
};

@Component({
  selector: 'app-files',
  imports: [ConfirmDelete, FilePane, FolderPrompt, FolderTree, MoveDialog, PreviewDialog],
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
  private readonly turnPage$ = new Subject<'next' | 'prev'>();
  private readonly confirm = viewChild.required(ConfirmDelete);
  private readonly folderPrompt = viewChild.required(FolderPrompt);
  private readonly moveDialog = viewChild.required(MoveDialog);
  private readonly previewDialog = viewChild.required(PreviewDialog);
  private readonly pendingDelete = signal<
    | { kind: 'files'; ids: ReadonlyArray<string> }
    | { kind: 'mixed'; ids: ReadonlyArray<string>; paths: ReadonlyArray<string> }
    | undefined
  >(undefined);
  private readonly pendingRename = signal<FileEntry | undefined>(undefined);
  protected readonly workspace = inject(Workspace);
  protected readonly search = signal('');
  protected readonly sort = signal<FileSort>('name-asc');
  protected readonly selected = signal<ReadonlyArray<string>>([]);
  protected readonly selectedFolders = signal<ReadonlyArray<string>>([]);
  protected readonly uploading = signal(false);
  protected readonly uploadStatus = signal('');
  protected readonly dropTarget = signal<string | null>(null);
  private draggingId = '';

  // Returns the content URL used by image and media previews.
  protected readonly contentUrl = (id: string): string => this.api.contentUrl(id);

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
      toObservable(this.sort),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([source, folder, search, sort]) => {
        const parsed = parseFileSort(sort);
        const history: Array<string | undefined> = [undefined];
        let index = 0;
        return this.turnPage$.pipe(
          startWith(undefined),
          switchMap((turn) => {
            if (turn === 'next') {
              if (history[index + 1] === undefined) {
                return EMPTY;
              }
              index += 1;
            } else if (turn === 'prev') {
              if (index === 0) {
                return EMPTY;
              }
              index -= 1;
            } else {
              index = 0;
            }
            const cursor = history[index];
            return this.runtime.bind(
              this.api.list({
                source,
                folder,
                search,
                kind: 'all',
                recursive: 'false',
                sort: parsed.sort,
                order: parsed.order,
                ...(cursor === undefined ? {} : { cursor }),
              }).pipe(
                Effect.tap((listing) =>
                  Effect.sync(() => {
                    this.selected.set([]);
                    this.selectedFolders.set([]);
                    if (listing.next !== undefined) {
                      history[index + 1] = listing.next;
                    }
                  }),
                ),
                Effect.map((listing): BrowseState => ({
                  listing,
                  error: '',
                  page: index + 1,
                  hasPrev: index > 0,
                  hasNext: listing.next !== undefined,
                })),
                Effect.catch((error) =>
                  Effect.succeed<BrowseState>({
                    listing: undefined,
                    error: error.message,
                    page: index + 1,
                    hasPrev: false,
                    hasNext: false,
                  }),
                ),
              ),
            );
          }),
        );
      }),
    ),
    { initialValue: { listing: undefined, error: '', page: 1, hasPrev: false, hasNext: false } satisfies BrowseState },
  );

  // Asks for the previous or next page of the current folder.
  protected turnPage(direction: 'next' | 'prev'): void {
    this.turnPage$.next(direction);
  }

  // Changes the server sort and returns to the first page.
  protected setSort(value: string): void {
    const match = fileSorts.find((item) => item === value);
    if (match !== undefined) {
      this.sort.set(match);
    }
  }

  // True when a file or folder checkbox is on, so the action icons know there is something to act on.
  // An upload that stopped before the last byte. Choosing the same file continues it.
  protected readonly paused = toSignal(
    combineLatest([
      toObservable(this.workspace.source),
      toObservable(this.folder),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([source, folder]) =>
        this.runtime.bind(
          this.api.uploadSessions(source, folder).pipe(
            Effect.map((sessions) => sessions.find((item) => item.offset < item.size)),
            Effect.catch(() => Effect.succeed(undefined)),
          ),
        ),
      ),
    ),
    { initialValue: undefined as UploadProgress | undefined },
  );

  // Shows the active chunk, or the paused upload once the request has stopped.
  protected readonly statusLine = computed(() => {
    const active = this.uploadStatus();
    if (active !== '') {
      return active;
    }
    const paused = this.paused();
    if (paused === undefined) {
      return '';
    }
    return `${paused.name} paused at ${paused.offset} of ${paused.size} bytes. Upload the same file to continue.`;
  });

  protected readonly hasSelection = computed(() => this.selected().length > 0 || this.selectedFolders().length > 0);

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

  // Remembers the file the pane started dragging so a drop can still find it.
  protected onDragStarted(id: string): void {
    this.draggingId = id;
  }

  // Clears the drag highlight when the pointer is released.
  protected onDragEnded(): void {
    this.draggingId = '';
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
  protected copy(entry: FileEntry): void {
    const api = this.api;
    const notices = this.notices;
    const program = Effect.gen(function* () {
      const link = yield* api.share(entry.id);
      const url = link.url.startsWith('http') ? link.url : `${location.origin}${link.url}`;
      const text = yield* formatLink({ format: 'url', image: entry.image, name: entry.name, url });
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

  // Runs the current-folder action the icon row reported. Upload stays inside the file pane.
  protected onFolderAction(id: FolderActionId): void {
    if (id === 'delete') {
      this.deleteChosen();
      return;
    }
    this.createFolder();
  }

  // Asks for a folder name inside the current folder.
  protected createFolder(): void {
    this.pendingRename.set(undefined);
    this.folderPrompt().open();
  }

  // Runs the icon action from the file pane.
  protected onFileAction(file: FileEntry, action: FileRowAction): void {
    if (action === 'download') {
      this.downloadFile(file);
      return;
    }
    if (action === 'share') {
      this.copy(file);
      return;
    }
    if (action === 'delete') {
      this.deleteFile(file);
      return;
    }
    this.renameFile(file);
  }

  // Asks the browser to save the file. The content route streams the bytes to disk.
  protected downloadFile(file: FileEntry): void {
    const anchor = document.createElement('a');
    anchor.href = `${this.contentUrl(file.id)}?download=1`;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  // Confirms deletion of one file, without using the current multi-selection.
  protected deleteFile(file: FileEntry): void {
    this.pendingDelete.set({ kind: 'files', ids: [file.id] });
    this.confirm().open('Delete file', `Delete ${file.name}?`);
  }

  // Asks for a new display name. The server keeps the stored extension.
  protected renameFile(file: FileEntry): void {
    this.pendingRename.set(file);
    this.folderPrompt().open(file.name, 'Rename', 'Rename');
  }

  // Creates the named folder under the one currently open, or renames the pending file.
  protected onFolderNamed(name: string): void {
    const renaming = this.pendingRename();
    if (renaming !== undefined) {
      this.pendingRename.set(undefined);
      this.applyRename(renaming, name);
      return;
    }
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

  // Sends the requested name. The server keeps the original extension and content type.
  private applyRename(file: FileEntry, name: string): void {
    const api = this.api;
    const notices = this.notices;
    const refresh = () => this.refresh$.next();
    const program = api.rename(file.id, name).pipe(
      Effect.tap((entry) =>
        Effect.sync(() => {
          notices.show(`Renamed to ${entry.name}`);
          refresh();
        }),
      ),
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
    this.pendingDelete.set({ kind: 'files', ids });
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

  // Uploads the files chosen from the file pane into the current folder.
  protected uploadFiles(files: ReadonlyArray<File>): void {
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
    const ids = pending.ids;
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
        const uploaded = yield* Effect.gen(function* () {
          const session = yield* api.openUpload({
            contentType: file.type === '' ? 'application/octet-stream' : file.type,
            folder,
            name: file.name,
            size: file.size,
            source,
          });
          let offset = session.offset;
          while (offset < file.size) {
            const end = Math.min(offset + uploadChunkBytes, file.size) - 1;
            const slice = yield* Effect.tryPromise({
              try: () => file.slice(offset, end + 1).arrayBuffer(),
              catch: () => new NetworkFailure({ message: 'Could not read the file' }),
            });
            const next = yield* api.sendChunk(session.id, offset, end, file.size, new Uint8Array(slice));
            if (next <= offset) {
              return yield* new NetworkFailure({ message: 'Could not upload the next part' });
            }
            offset = next;
            setStatus(`${file.name} ${offset} / ${file.size} bytes`);
          }
          return yield* api.completeUpload(session.id);
        }).pipe(
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
      refresh();
      if (failed < files.length) {
        notices.show('Upload complete');
      }
    }).pipe(Effect.asVoid);
    this.runtime.settle(program);
  }
}
