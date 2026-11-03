import { Service } from '@angular/core';
import { Context, Effect, Exit, Fiber, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { Observable } from 'rxjs';
import { Api } from '@private-drive/domain';

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  'private-drive/ApiClient',
) {
  // Builds the typed client on the shared fetch layer and sends the session cookie with every call.
  static readonly layer = Layer.effect(ApiClient, HttpApiClient.make(Api)).pipe(
    Layer.provideMerge(FetchHttpClient.layer),
    Layer.provideMerge(Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'include' })),
  );
}

export type DriveServices = ApiClient | HttpClient.HttpClient;

@Service()
export class DriveRuntime {
  private readonly runtime = ManagedRuntime.make(ApiClient.layer);

  // Runs an effect to an Exit so a typed failure stays a value and the promise does not reject.
  run<A, E>(effect: Effect.Effect<A, E, DriveServices>): Promise<Exit.Exit<A, E>> {
    return this.runtime.runPromiseExit(effect);
  }

  // Binds a caught effect to an Observable. A defect completes the stream instead of throwing into Angular.
  bind<A>(effect: Effect.Effect<A, never, DriveServices>): Observable<A> {
    return new Observable((subscriber) => {
      const fiber = this.runtime.runFork(
        effect.pipe(
          Effect.match({
            onFailure: () => {
              if (!subscriber.closed) {
                subscriber.complete();
              }
            },
            onSuccess: (value) => {
              if (!subscriber.closed) {
                subscriber.next(value);
                subscriber.complete();
              }
            },
          }),
          Effect.catchDefect(() =>
            Effect.sync(() => {
              if (!subscriber.closed) {
                subscriber.complete();
              }
            }),
          ),
        ),
      );
      return () => {
        void this.runtime.runPromiseExit(Fiber.interrupt(fiber));
      };
    });
  }

  // Runs a fully caught effect and swallows a defect so the Angular zone never sees an exception.
  settle(effect: Effect.Effect<void, never, DriveServices>): void {
    void this.runtime.runPromiseExit(effect.pipe(Effect.catchDefect(() => Effect.void)));
  }
}
