import * as Effect from 'effect/Effect';
import * as HttpMiddleware from 'effect/http/HttpMiddleware';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';

const startedAt = Date.now() / 1000;
const responses = new Map<string, number>();

const metricKey = (method: string, status: number): string => `${method} ${status}`;

// Counts one finished response. The key is method and status, never a path or a cookie.
const record = (method: string, status: number): void => {
	const key = metricKey(method, status);
	responses.set(key, (responses.get(key) ?? 0) + 1);
};

const render = (): string => {
	const lines = [
		'# TYPE private_drive_process_start_seconds gauge',
		`private_drive_process_start_seconds ${startedAt}`,
		'# TYPE private_drive_http_responses counter',
	];
	for (const [key, value] of responses) {
		const [method, status] = key.split(' ');
		lines.push(`private_drive_http_responses{method="${method}",status="${status}"} ${value}`);
	}
	return `${lines.join('\n')}\n`;
};

// Observes the status after the route has produced a response.
export const recordResponses = HttpMiddleware.make((app) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const response = yield* app;
		record(request.method, response.status);
		return response;
	}),
);

const metrics = Effect.fn('metrics')(function* () {
	return HttpServerResponse.text(render(), { contentType: 'text/plain; version=0.0.4' });
});

export const MetricsRoute = HttpRouter.add('GET', '/metrics', metrics());
