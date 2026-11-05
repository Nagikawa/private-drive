import './storage/worker-xml.ts';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServer from 'effect/http/HttpServer';
import * as Layer from 'effect/Layer';
import * as Scheduler from 'effect/Scheduler';

import { WorkerConfig } from './config-worker.ts';
import { AppConfig } from './config.ts';
import { ApiRoutes, provideApi } from './http/app.ts';
import { recordResponses } from './http/metrics.ts';
import { DriveState } from './state/object.ts';
import { WorkerFileSystem } from './state/worker-fs.ts';
import { WorkerState } from './state/worker-store.ts';

const SyncScheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler('sync'));

// AppConfig is read again when a content request checks the session, so it stays in the built context.
const WebApp = provideApi(ApiRoutes).pipe(
	Layer.provideMerge(AppConfig.layer),
	Layer.provide(WorkerConfig),
	Layer.provide(WorkerFileSystem.layer),
	Layer.provide(WorkerState),
	Layer.provide(HttpServer.layerServices),
	Layer.provideMerge(SyncScheduler),
) as Layer.Layer<unknown, never, never>;

const app = HttpRouter.toWebHandler(WebApp, { middleware: recordResponses });

export { DriveState };

export default {
	fetch(request: Request): Promise<Response> {
		return app.handler(request);
	},
};
