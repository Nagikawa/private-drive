import { randomUUID } from "node:crypto"
import { open, readFile, rm, writeFile } from "node:fs/promises"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Redacted, Result } from "effect"
import { Unauthorized } from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { issueSession, sessionClaims, sessionLifetime } from "./session.ts"

type Book = Record<string, number>

// A lock held by a process that no longer exists can be removed.
const ownerAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return Predicate.hasProperty(cause, "code") && cause.code === "EPERM"
  }
}

const parseBook = (text: string): Book => {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== "object" || value === null || !("sessions" in value)) {
      return {}
    }
    const sessions = value.sessions
    if (typeof sessions !== "object" || sessions === null) {
      return {}
    }
    const book: Book = {}
    for (const [nonce, expiresAt] of Object.entries(sessions)) {
      if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
        book[nonce] = expiresAt
      }
    }
    return book
  } catch {
    return {}
  }
}

const activeBook = (book: Book, now: number): Book => {
  const next: Book = {}
  for (const [nonce, expiresAt] of Object.entries(book)) {
    if (expiresAt > now) {
      next[nonce] = expiresAt
    }
  }
  return next
}

// Remembers which session nonces are still allowed, so logout can reject a cookie before it expires.
export class SessionLedger extends Context.Service<
  SessionLedger,
  {
    readonly accept: (token: string, now: number) => Effect.Effect<boolean>
    readonly issue: (now: number) => Effect.Effect<string, Unauthorized>
    readonly revoke: (token: string, now: number) => Effect.Effect<void>
  }
>()("private-drive/SessionLedger") {
  static readonly layer = Layer.effect(
    SessionLedger,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const secret = Redacted.value(config.sessionSecret)
      const bookPath = path.join(path.dirname(config.indexPath), "sessions.json")
      const lockPath = `${bookPath}.lock`
      const owner = String(process.pid)

      // Creates the lock exclusively, or drops a lock whose owner process has exited.
      const acquire = Effect.fn("SessionLedger.acquire")(function* () {
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
          if (
            !(Predicate.hasProperty(created.failure, "code") && created.failure.code === "EEXIST")
          ) {
            return
          }
          const holder = yield* Effect.tryPromise({
            catch: () => "",
            try: () => readFile(lockPath, "utf8"),
          }).pipe(Effect.catch(() => Effect.succeed("")))
          const pid = Number(holder)
          if (!Number.isInteger(pid) || pid <= 0 || !ownerAlive(pid)) {
            yield* Effect.tryPromise({
              catch: () => undefined,
              try: () => rm(lockPath, { force: true }),
            }).pipe(Effect.catch(() => Effect.void))
            continue
          }
          yield* Effect.sleep("50 millis")
        }
      })

      const release = Effect.fn("SessionLedger.release")(function* () {
        const holder = yield* Effect.tryPromise({
          catch: () => "",
          try: () => readFile(lockPath, "utf8"),
        }).pipe(Effect.catch(() => Effect.succeed("")))
        if (holder !== owner) {
          return
        }
        yield* Effect.tryPromise({
          catch: () => undefined,
          try: () => rm(lockPath, { force: true }),
        }).pipe(Effect.catch(() => Effect.void))
      })

      const load = Effect.fn("SessionLedger.load")(function* () {
        const exists = yield* fs.exists(bookPath).pipe(Effect.catch(() => Effect.succeed(false)))
        if (!exists) {
          return {}
        }
        const text = yield* fs.readFileString(bookPath).pipe(Effect.catch(() => Effect.succeed("")))
        return parseBook(text)
      })

      const save = Effect.fn("SessionLedger.save")(function* (book: Book) {
        yield* fs
          .makeDirectory(path.dirname(bookPath), { recursive: true })
          .pipe(Effect.mapError(() => "Could not create the session directory"))
        const temporary = `${bookPath}.${randomUUID()}.tmp`
        yield* Effect.tryPromise({
          catch: () => "Could not write the session ledger",
          try: () => writeFile(temporary, JSON.stringify({ sessions: book })),
        })
        yield* fs
          .rename(temporary, bookPath)
          .pipe(Effect.mapError(() => "Could not replace the session ledger"))
      })

      // Runs one ledger change while this process holds the lock.
      const change = <A>(use: (book: Book) => readonly [Book, A]) =>
        Effect.acquireUseRelease(
          acquire(),
          () =>
            Effect.gen(function* () {
              const book = yield* load()
              const [next, value] = use(book)
              yield* save(next)
              return value
            }),
          () => release(),
        )

      return SessionLedger.of({
        // Issues a signed cookie and records its nonce until the cookie's own expiry.
        issue: (now) =>
          change((book) => {
            const nonce = randomUUID()
            const expiresAt = now + sessionLifetime
            const next = activeBook(book, now)
            next[nonce] = expiresAt
            return [next, issueSession(secret, expiresAt, nonce)] as const
          }).pipe(
            Effect.mapError(() => new Unauthorized({ message: "Could not start the session" })),
          ),
        // Accepts a cookie only when the signature is valid and logout has not removed the nonce.
        accept: (token, now) =>
          Effect.gen(function* () {
            const claims = sessionClaims(secret, token, now)
            if (claims === undefined) {
              return false
            }
            const book = yield* load()
            return book[claims.nonce] === claims.expiresAt
          }),
        // Drops the nonce so a copied cookie cannot be used after logout.
        revoke: (token, now) =>
          change((book) => {
            const claims = sessionClaims(secret, token, now)
            const next = activeBook(book, now)
            if (claims !== undefined) {
              delete next[claims.nonce]
            }
            return [next, undefined] as const
          }).pipe(Effect.catch(() => Effect.void)),
      })
    }),
  )
}
