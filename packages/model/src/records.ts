import * as Schema from 'effect/Schema';

import { SourceId } from './model.ts';

// One interrupted upload kept on disk so the same file can continue after a refresh.
export const StoredUpload = Schema.Struct({
	contentType: Schema.String,
	folder: Schema.String,
	id: Schema.String,
	name: Schema.String,
	offset: Schema.Number,
	path: Schema.String,
	size: Schema.Number,
	source: SourceId,
});
export type StoredUpload = typeof StoredUpload.Type;

// One multipart upload the R2 client still has to finish or abort.
export const PendingUpload = Schema.Struct({
	key: Schema.String,
	uploadId: Schema.String,
});
export type PendingUpload = typeof PendingUpload.Type;
