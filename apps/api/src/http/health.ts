import * as Effect from 'effect/Effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';

// Reports that the process can accept requests. It does not check a store, so a probe can stay cheap.
const healthy = Effect.fn('healthy')(function* () {
	return HttpServerResponse.jsonUnsafe({ ok: true });
});

export const HealthRoute = HttpRouter.add('GET', '/health', healthy());
