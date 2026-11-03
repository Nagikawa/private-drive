import { Effect, Exit } from "effect"

// Reads an infallible Effect at a synchronous boundary and returns the fallback if a defect appears.
export const pure = <A>(effect: Effect.Effect<A, never>, fallback: A): A => {
  const exit = Effect.runSyncExit(effect)
  return Exit.isSuccess(exit) ? exit.value : fallback
}
