import * as Schema from 'effect/Schema';

import { NotFound, StorageError, Unauthorized } from './model.ts';

// A folder string contained `.`, `..`, or an empty segment and cannot be stored.
export class InvalidFolderPath extends Schema.TaggedError<InvalidFolderPath>()(
	'InvalidFolderPath',
	{
		message: Schema.String,
	},
) {}

// A file name was empty, a path, or the folder marker, so it cannot be stored.
export class InvalidFileName extends Schema.TaggedError<InvalidFileName>()('InvalidFileName', {
	message: Schema.String,
}) {}

// A download URL failed a structural check before any bytes were requested.
export class DownloadUrlError extends Schema.TaggedError<DownloadUrlError>()('DownloadUrlError', {
	message: Schema.String,
}) {}

// Response text was not JSON, so the caller can show a fixed message instead of a parse exception.
export class InvalidJson extends Schema.TaggedError<InvalidJson>()('InvalidJson', {
	message: Schema.String,
}) {}

// A provider status did not include a bucket or repo name, so the header stays blank.
export class ResourceNameError extends Schema.TaggedError<ResourceNameError>()(
	'ResourceNameError',
	{
		message: Schema.String,
	},
) {}

// A resumable upload omitted the byte range the server asked for.
export class ContentRangeError extends Schema.TaggedError<ContentRangeError>()(
	'ContentRangeError',
	{
		message: Schema.String,
	},
) {}

// The browser could not reach the API, or the client rejected the call before a body arrived.
export class NetworkFailure extends Schema.TaggedError<NetworkFailure>()('NetworkFailure', {
	message: Schema.String,
}) {}

// The API answered, but the body was not the shape the screen can show.
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()('InvalidResponse', {
	message: Schema.String,
}) {}

// The clipboard refused the copied link.
export class ClipboardFailure extends Schema.TaggedError<ClipboardFailure>()('ClipboardFailure', {
	message: Schema.String,
}) {}

// Login or a following navigation failed before the drive opened.
export class SessionFailure extends Schema.TaggedError<SessionFailure>()('SessionFailure', {
	message: Schema.String,
}) {}

// A saved preference could not be read or written, so the screen keeps the in-memory value.
export class PreferenceFailure extends Schema.TaggedError<PreferenceFailure>()(
	'PreferenceFailure',
	{
		message: Schema.String,
	},
) {}

export type DriveFailure =
	| Unauthorized
	| StorageError
	| NotFound
	| NetworkFailure
	| InvalidResponse;
