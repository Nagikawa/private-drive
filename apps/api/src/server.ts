import { createServer } from "node:http"
import { NodeFileSystem, NodeHttpServer, NodePath } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "@private-drive/domain"
import { AuditLog } from "./audit/log.ts"
import { SessionHandlers } from "./auth/handlers.ts"
import { SessionLedger } from "./auth/ledger.ts"
import { SessionLive } from "./auth/session.ts"
import { AppConfig } from "./config.ts"
import { Drive } from "./drive/drive.ts"
import { Uploads } from "./drive/uploads.ts"
import { ContentRoute } from "./http/content.ts"
import { FilesHandlers } from "./http/files.ts"
import { HealthRoute } from "./http/health.ts"
import { MetricsRoute, recordResponses } from "./http/metrics.ts"
import { UploadChunkRoute } from "./http/upload-chunk.ts"

// JSON routes and the raw content route share one drive layer so the index lock is process-wide.
const Routes = Layer.mergeAll(
  HttpApiBuilder.layer(Api).pipe(
    Layer.provide(FilesHandlers),
    Layer.provide(SessionHandlers),
  ),
  ContentRoute,
  HealthRoute,
  MetricsRoute,
  UploadChunkRoute,
)

// Reads the port, then launches HTTP with auth, the drive, and the platform services underneath.
export const Server = Layer.unwrap(
  Effect.gen(function*() {
    const config = yield* AppConfig
    yield* Effect.logInfo(`私人網盤 API 監聽 ${config.port}`)
    return HttpRouter.serve(Routes, { middleware: recordResponses }).pipe(
      Layer.provide(Uploads.layer),
      Layer.provide(Drive.layer),
      Layer.provide(SessionLive),
      Layer.provide(SessionLedger.layer),
      Layer.provide(AuditLog.layer),
      Layer.provide(AppConfig.layer),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(NodeFileSystem.layer),
      Layer.provide(NodePath.layer),
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
    )
  }),
)
