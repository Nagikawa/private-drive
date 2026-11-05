import { Api } from '@private-drive/domain';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';

import { AuditLog } from '../audit/log.ts';
import { SessionHandlers } from '../auth/handlers.ts';
import { SessionLedger } from '../auth/ledger.ts';
import { SessionLive } from '../auth/session.ts';
import { Drive } from '../drive/drive.ts';
import { Uploads } from '../drive/uploads.ts';
import { ContentRoute } from './content.ts';
import { FilesHandlers } from './files.ts';
import { HealthRoute } from './health.ts';
import { MetricsRoute } from './metrics.ts';
import { UploadChunkRoute } from './upload-chunk.ts';

const Routes = Layer.mergeAll(
	HttpApiBuilder.layer(Api).pipe(Layer.provide(FilesHandlers), Layer.provide(SessionHandlers)),
	ContentRoute,
	HealthRoute,
	MetricsRoute,
	UploadChunkRoute,
);

// Raw routes look these services up on each request. provideMerge keeps them in the worker context.
export const provideApi = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
	layer.pipe(
		Layer.provideMerge(Uploads.layer),
		Layer.provideMerge(Drive.layer),
		Layer.provide(SessionLive),
		Layer.provideMerge(SessionLedger.layer),
		Layer.provide(AuditLog.layer),
		Layer.provide(FetchHttpClient.layer),
	);

export const ApiRoutes = Routes;
