import { randomUUID } from "node:crypto"
import { Context, Effect, FileSystem, Layer, Path, Schema, Semaphore } from "effect"
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

export class Catalog extends Context.Service<Catalog, {
  readonly modify: <A>(
    use: (catalog: CatalogData) => readonly [CatalogData, A],
  ) => Effect.Effect<A, StorageError>
  readonly read: Effect.Effect<CatalogData, StorageError>
}>()("private-drive/Catalog") {
  // Serializes index reads and writes so two requests cannot overwrite the JSON file.
  static readonly layer = Layer.effect(
    Catalog,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const config = yield* AppConfig
      const indexPath = config.indexPath
      const lock = yield* Semaphore.make(1)

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
        const encoded = yield* encodeCatalog(catalog)
        const temporary = `${indexPath}.${randomUUID()}.tmp`
        yield* fs.writeFileString(temporary, encoded)
        yield* fs.rename(temporary, indexPath)
      }, Effect.mapError(asIndexError))

      // Holds the index lock for one read-modify-write so list and upload stay consistent.
      const modify = <A>(use: (catalog: CatalogData) => readonly [CatalogData, A]) =>
        lock.withPermits(1)(Effect.gen(function*() {
          const current = yield* read()
          const [next, value] = use(current)
          yield* write(next)
          return value
        }))

      return Catalog.of({
        modify,
        read: read(),
      })
    }),
  )
}
