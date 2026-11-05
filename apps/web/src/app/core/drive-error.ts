import { NotFound, StorageError, Unauthorized } from '@private-drive/domain';
import * as Schema from 'effect/Schema';

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
