import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Effect } from 'effect';
import { folderCrumbs, folderName, pure, type Listing, type SourceId } from '@private-drive/domain';
import { Subject, of, startWith, switchMap } from 'rxjs';
import { DriveApi } from '../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../services/drive-runtime/drive-runtime.service';

export interface MoveData {
  ids: ReadonlyArray<string>;
  source: SourceId;
}

@Component({
  selector: 'app-move-dialog',
  templateUrl: './move-dialog.html',
})
export class MoveDialog {
  private readonly api = inject(DriveApi);
  private readonly runtime = inject(DriveRuntime);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly location$ = new Subject<string>();
  readonly moved = output<void>();
  protected readonly data = signal<MoveData | undefined>(undefined);
  protected readonly location = signal('');
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal('');
  private movedOk = false;

  // Builds the breadcrumb trail for the destination browser.
  protected readonly crumbs = computed(() => pure(folderCrumbs(this.location()), []));

  // Loads the current folder's folders so the dialog can browse destinations.
  protected readonly state = toSignal(
    this.location$.pipe(
      switchMap((folder) => {
        const current = this.data();
        if (current === undefined) {
          return of({ error: '', folders: [] as Listing['folders'], ready: false });
        }
        return this.runtime
          .bind(
            this.api.list({ source: current.source, folder, kind: 'all', recursive: 'false' }).pipe(
              Effect.map((listing) => ({ error: '', folders: listing.folders, ready: true })),
              Effect.catch((error) =>
                Effect.succeed({
                  error: error.message,
                  folders: [] as Listing['folders'],
                  ready: true,
                }),
              ),
            ),
          )
          .pipe(startWith({ error: '', folders: [] as Listing['folders'], ready: false }));
      }),
    ),
    { initialValue: { error: '', folders: [] as Listing['folders'], ready: false } },
  );

  // Opens the destination browser at Root for the files the user chose to move.
  open(data: MoveData): void {
    this.data.set(data);
    this.location.set('');
    this.busy.set(false);
    this.errorMessage.set('');
    this.movedOk = false;
    this.location$.next('');
    const element = this.dialog().nativeElement;
    if (!element.open) {
      element.showModal();
    }
  }

  // Shows Root or the current folder name as the destination the move will use.
  protected destinationLabel(): string {
    const folder = this.location();
    return folder === '' ? 'Root' : pure(folderName(folder), folder);
  }

  // Browses into a folder so the user can pick a nested destination.
  protected openFolder(path: string): void {
    this.errorMessage.set('');
    this.location.set(path);
    this.location$.next(path);
  }

  // Closes the dialog without moving the files.
  protected cancel(): void {
    this.movedOk = false;
    this.dialog().nativeElement.close();
  }

  // Tells the file page to refresh after a move that already succeeded.
  protected onClose(): void {
    if (this.movedOk) {
      this.movedOk = false;
      this.moved.emit();
    }
  }

  // Moves the selected files into the folder currently open in the dialog.
  protected move(): void {
    const current = this.data();
    if (current === undefined) {
      return;
    }
    this.busy.set(true);
    this.errorMessage.set('');
    const api = this.api;
    const ids = current.ids;
    const folder = this.location();
    const finish = () => {
      this.movedOk = true;
      const element = this.dialog().nativeElement;
      if (element.open) {
        element.close();
      } else {
        this.movedOk = false;
        this.moved.emit();
      }
    };
    const fail = (message: string) => {
      this.busy.set(false);
      this.errorMessage.set(message);
    };
    const program = api.move(ids, folder).pipe(
      Effect.matchEffect({
        onFailure: (error) => Effect.sync(() => fail(error.message)),
        onSuccess: () => Effect.sync(() => finish()),
      }),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }
}
