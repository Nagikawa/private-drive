import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as Layer from 'effect/Layer';

import { AppConfig } from './config.ts';
import { Server } from './server.ts';

NodeRuntime.runMain(Layer.launch(Server.pipe(Layer.provide(AppConfig.layer))));
