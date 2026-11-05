import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as HttpRouter from 'effect/http/HttpRouter';

import { HealthRoute } from '../src/http/health.ts';
import { MetricsRoute, recordResponses } from '../src/http/metrics.ts';

Vitest.describe('HTTP routes', () => {
	// A probe only needs the process to accept a request.
	Vitest.it.effect('reports health', () =>
		Effect.tryPromise(async () => {
			const { handler } = HttpRouter.toWebHandler(HealthRoute, { disableLogger: true });
			const response = await handler(new Request('http://127.0.0.1/health'));
			Vitest.expect(response.status).toBe(200);
			Vitest.expect(await response.json()).toEqual({ ok: true });
		}),
	);

	// The counter uses method and status, and the body is plain text.
	Vitest.it.effect('counts responses on the metrics route', () =>
		Effect.tryPromise(async () => {
			const { handler } = HttpRouter.toWebHandler(MetricsRoute, {
				disableLogger: true,
				middleware: recordResponses,
			});
			await handler(new Request('http://127.0.0.1/metrics'));
			const second = await handler(new Request('http://127.0.0.1/metrics'));
			Vitest.expect(second.status).toBe(200);
			Vitest.expect(await second.text()).toContain(
				'private_drive_http_responses{method="GET",status="200"}',
			);
		}),
	);
});
