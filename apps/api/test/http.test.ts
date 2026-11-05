import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { HealthRoute } from "../src/http/health.ts"
import { MetricsRoute, recordResponses } from "../src/http/metrics.ts"

describe("HTTP routes", () => {
  // A probe only needs the process to accept a request.
  it.effect("reports health", () =>
    Effect.tryPromise(async () => {
      const { handler } = HttpRouter.toWebHandler(HealthRoute, { disableLogger: true })
      const response = await handler(new Request("http://127.0.0.1/health"))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    }),
  )

  // The counter uses method and status, and the body is plain text.
  it.effect("counts responses on the metrics route", () =>
    Effect.tryPromise(async () => {
      const { handler } = HttpRouter.toWebHandler(MetricsRoute, {
        disableLogger: true,
        middleware: recordResponses,
      })
      await handler(new Request("http://127.0.0.1/metrics"))
      const second = await handler(new Request("http://127.0.0.1/metrics"))
      expect(second.status).toBe(200)
      expect(await second.text()).toContain(
        'private_drive_http_responses{method="GET",status="200"}',
      )
    }),
  )
})
