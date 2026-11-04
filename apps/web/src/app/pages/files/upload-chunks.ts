import { Effect } from 'effect';
import { uploadChunkBytes, type FileEntry, type SourceId, type UploadProgress } from '@private-drive/domain';
import { NetworkFailure, type DriveFailure } from '../../core/drive-error';
import type { DriveServices } from '../../services/drive-runtime/drive-runtime.service';

// The slice of the API client an upload needs. Listing and login stay out of this path.
export interface ResumableUpload {
  openUpload(input: {
    contentType: string;
    folder: string;
    name: string;
    size: number;
    source: SourceId;
  }): Effect.Effect<UploadProgress, DriveFailure, DriveServices>;
  sendChunk(
    id: string,
    start: number,
    end: number,
    total: number,
    bytes: Uint8Array,
  ): Effect.Effect<number, DriveFailure>;
  completeUpload(id: string): Effect.Effect<FileEntry, DriveFailure, DriveServices>;
}

// Sends each file in order, continuing a session the server already has for the same name and size.
export const uploadChunked = (input: {
  readonly api: ResumableUpload;
  readonly files: ReadonlyArray<File>;
  readonly folder: string;
  readonly onNotice: (message: string) => void;
  readonly onStatus: (message: string) => void;
  readonly source: SourceId;
}): Effect.Effect<number, never, DriveServices> =>
  Effect.gen(function* () {
    let failed = 0;
    let index = 0;
    for (const file of input.files) {
      const uploaded = yield* Effect.gen(function* () {
        const session = yield* input.api.openUpload({
          contentType: file.type === '' ? 'application/octet-stream' : file.type,
          folder: input.folder,
          name: file.name,
          size: file.size,
          source: input.source,
        });
        let offset = session.offset;
        while (offset < file.size) {
          const end = Math.min(offset + uploadChunkBytes, file.size) - 1;
          const slice = yield* Effect.tryPromise({
            try: () => file.slice(offset, end + 1).arrayBuffer(),
            catch: () => new NetworkFailure({ message: 'Could not read the file' }),
          });
          const next = yield* input.api.sendChunk(session.id, offset, end, file.size, new Uint8Array(slice));
          if (next <= offset) {
            return yield* new NetworkFailure({ message: 'Could not upload the next part' });
          }
          offset = next;
          input.onStatus(`${file.name} ${offset} / ${file.size} bytes`);
        }
        return yield* input.api.completeUpload(session.id);
      }).pipe(
        Effect.match({
          onFailure: (error) => {
            failed += 1;
            input.onNotice(error.message);
            return false;
          },
          onSuccess: () => true,
        }),
      );
      index += 1;
      input.onStatus(`Uploading ${index} / ${input.files.length}`);
      void uploaded;
    }
    return failed;
  });
