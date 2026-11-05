import * as Schema from 'effect/Schema';

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
