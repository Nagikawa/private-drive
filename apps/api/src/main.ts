import { Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { AppConfig } from "./config.ts"
import { Server } from "./server.ts"

NodeRuntime.runMain(Layer.launch(Server.pipe(Layer.provide(AppConfig.layer))))
