import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Effect } from 'effect';
import { connectedResource, pure, type SourceId, type SourceStatus } from '@private-drive/domain';
import { SessionFailure } from '../../core/drive-error';
import { DriveApi } from '../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../services/drive-runtime/drive-runtime.service';
import { Notices } from '../../services/notices/notices.service';
import { Workspace } from '../../services/workspace/workspace.service';

@Component({
  selector: 'app-drive-shell',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './drive-shell.html',
  host: { class: 'flex h-dvh flex-col' },
})
export class DriveShell {
  private readonly api = inject(DriveApi);
  private readonly runtime = inject(DriveRuntime);
  private readonly router = inject(Router);
  protected readonly workspace = inject(Workspace);
  protected readonly notices = inject(Notices);
  private readonly sourceSelect = viewChild<ElementRef<HTMLSelectElement>>('sourceSelect');

  // Loads provider status once so the shell can hide sources that are not configured.
  protected readonly statuses = toSignal(
    this.runtime.bind(
      this.api
        .sources()
        .pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<SourceStatus>))),
    ),
    { initialValue: [] as ReadonlyArray<SourceStatus> },
  );

  // Keeps only connected sources so an unconfigured provider is not offered.
  protected readonly sources = computed(() => this.statuses().filter((status) => status.connected));

  // Reads the bucket or repo from the selected status. Telegram and a failed split stay blank.
  protected readonly resourceLabel = computed(() => {
    const status = this.statuses().find((item) => item.id === this.workspace.source());
    if (status === undefined || status.id === 'telegram') {
      return undefined;
    }
    return pure(
      connectedResource(status.detail).pipe(
        Effect.catchTag('ResourceNameError', () => Effect.succeed(undefined)),
      ),
      undefined,
    );
  });

  // Options arrive after the saved source, so the native select is pointed at that source once they are in the DOM.
  private readonly syncSource = afterRenderEffect(() => {
    const select = this.sourceSelect()?.nativeElement;
    const source = this.workspace.source();
    this.sources();
    if (select !== undefined && select.value !== source) {
      select.value = source;
    }
  });

  // Moves the selection onto a connected source when the saved one is hidden.
  private readonly alignSource = effect(() => {
    const available = this.sources();
    const selected = this.workspace.source();
    const first = available[0];
    if (first !== undefined && !available.some((status) => status.id === selected)) {
      this.chooseSource(first.id);
    }
  });

  // Reads the chosen source from the select and ignores values the API does not know.
  protected onSource(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    const source = event.target.value;
    if (source === 'r2' || source === 'telegram' || source === 'huggingface') {
      this.chooseSource(source);
    }
  }

  // Stores the source and lets the file page reload at Root.
  protected chooseSource(source: SourceId): void {
    this.workspace.setSource(source);
  }

  // Clears the session and returns to the login page even if the logout call fails.
  protected logout(): void {
    const api = this.api;
    const router = this.router;
    const notices = this.notices;
    const program = api.logout().pipe(
      Effect.catch(() => Effect.void),
      Effect.andThen(
        Effect.tryPromise({
          try: () => router.navigateByUrl('/login'),
          catch: () => new SessionFailure({ message: 'Could not open login' }),
        }),
      ),
      Effect.catch((error) => Effect.sync(() => notices.show(error.message))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }
}
