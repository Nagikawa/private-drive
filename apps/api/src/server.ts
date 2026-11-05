import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import * as NodePath from '@effect/platform-node/NodePath';
import * as Effect from 'effect/Effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as Layer from 'effect/Layer';
import { createServer } from 'node:http';

import { AppConfig } from './config.ts';
import { ApiRoutes, provideApi } from './http/app.ts';
import { recordResponses } from './http/metrics.ts';
import { NodeState } from './state/node-store.ts';

// Reads the port, then launches HTTP with auth, the drive, and the platform services underneath.
export const Server = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* AppConfig;
		yield* Effect.logInfo(`私人網盤 API 監聽 ${config.port}`);
		return provideApi(HttpRouter.serve(ApiRoutes, { middleware: recordResponses })).pipe(
			Layer.provide(AppConfig.layer),
			Layer.provide(NodeState),
			Layer.provide(NodeFileSystem.layer),
			Layer.provide(NodePath.layer),
			Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
		);
	}),
);
