import { randomUUID } from "node:crypto"
import { copyFile, open, readFile, rm } from "node:fs/promises"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Result, Schema } from "effect"
import { StorageError } from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { CatalogData } from "./schema.ts"

// Starts from an empty index when the file has never been written.
const emptyCatalog = (): CatalogData => new CatalogData({ entries: [], folders: [], version: 1 })

const decodeCatalog = Schema.decodeUnknownEffect(Schema.fromJsonString(CatalogData))
const encodeCatalog = Schema.encodeEffect(Schema.fromJsonString(CatalogData))

// Turns a filesystem or JSON failure into the storage error the HTTP API already returns.
const asIndexError = (cause: unknown) =>
  new StorageError({
    message: cause instanceof Error
      ? `Could not read or write the index: ${cause.message}`
      : "Could not read or write the index",
  })

// A lock held by a process that no longer exists can be removed.
const ownerAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return Predicate.hasProperty(cause, "code") && cause.code === "EPERM"
  }
}

export class Catalog extends Context.Service<Catalog, {
  readonly modify: <A>(
    use: (catalog: CatalogData) => readonly [CatalogData, A],
  ) => Effect.Effect<A, StorageError>
  readonly read: Effect.Effect<CatalogData, StorageError>
}>()("private-drive/Catalog") {
  // Serializes index writes across processes so two API instances cannot overwrite the JSON file.
  static readonly layer = Layer.effect(
    Catalog,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const config = yield* AppConfig
      const indexPath = config.indexPath
      const lockPath = `${indexPath}.lock`
      const owner = String(process.pid)

      // Creates the lock exclusively, or drops a lock whose owner process has exited.
      const acquire = Effect.fn("Catalog.acquire")(function*() {
        const deadline = Date.now() + 15_000
        while (Date.now() < deadline) {
          const created = yield* Effect.tryPromise({
            catch: (cause) => cause,
            try: async () => {
              const handle = await open(lockPath, "wx")
              await handle.writeFile(owner)
              await handle.close()
            },
          }).pipe(Effect.result)
          if (Result.isSuccess(created)) {
            return
          }
          if (!(Predicate.hasProperty(created.failure, "code") && created.failure.code === "EEXIST")) {
            return yield* new StorageError({ message: "Could not lock the index" })
          }
          const holder = yield* Effect.tryPromise({
            catch: () => new StorageError({ message: "Could not read the index lock" }),
            try: () => readFile(lockPath, "utf8"),
          }).pipe(Effect.catch(() => Effect.succeed("")))
          const pid = Number(holder)
          if (!Number.isInteger(pid) || pid <= 0 || !ownerAlive(pid)) {
            yield* Effect.tryPromise({
              catch: () => new StorageError({ message: "Could not remove a stale index lock" }),
              try: () => rm(lockPath, { force: true }),
            }).pipe(Effect.catch(() => Effect.void))
            continue
          }
          yield* Effect.sleep("50 millis")
        }
        return yield* new StorageError({ message: "The index is busy" })
      })

      // Removes the lock only when this process still owns it.
      const release = Effect.fn("Catalog.release")(function*() {
        const holder = yield* Effect.tryPromise({
          catch: () => new StorageError({ message: "Could not read the index lock" }),
          try: () => readFile(lockPath, "utf8"),
        }).pipe(Effect.catch(() => Effect.succeed("")))
        if (holder !== owner) {
          return
        }
        yield* Effect.tryPromise({
          catch: () => new StorageError({ message: "Could not release the index lock" }),
          try: () => rm(lockPath, { force: true }),
        }).pipe(Effect.catch(() => Effect.void))
      })

      // Loads the local JSON index, treating a missing or blank file as an empty catalog.
      const read = Effect.fn("Catalog.read")(function*() {
        const exists = yield* fs.exists(indexPath)
        if (!exists) {
          return emptyCatalog()
        }
        const text = yield* fs.readFileString(indexPath)
        if (text.trim() === "") {
          return emptyCatalog()
        }
        return yield* decodeCatalog(text)
      }, Effect.mapError(asIndexError))

      // Writes the index via a temp file so a crash cannot leave a half-written catalog.
      const write = Effect.fn("Catalog.write")(function*(catalog: CatalogData) {
        yield* fs.makeDirectory(path.dirname(indexPath), { recursive: true })
        const exists = yield* fs.exists(indexPath)
        if (exists) {
          yield* Effect.tryPromise({
            catch: (cause) => cause,
            try: () => copyFile(indexPath, `${indexPath}.bak`),
          })
        }
        const encoded = yield* encodeCatalog(catalog)
        const temporary = `${indexPath}.${randomUUID()}.tmp`
        yield* fs.writeFileString(temporary, encoded)
        yield* fs.rename(temporary, indexPath)
      }, Effect.mapError(asIndexError))

      // Holds the index lock for one read-modify-write so list and upload stay consistent.
      const modify = <A>(use: (catalog: CatalogData) => readonly [CatalogData, A]) =>
        Effect.acquireUseRelease(
          acquire(),
          () =>
            Effect.gen(function*() {
              const current = yield* read()
              const [next, value] = use(current)
              yield* write(next)
              return value
            }),
          () => release(),
        )

      return Catalog.of({
        modify,
        read: read(),
      })
    }),
  )
}
