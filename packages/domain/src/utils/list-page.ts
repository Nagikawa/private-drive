export const listSorts = ["name", "size", "created", "type"] as const
export type ListSort = (typeof listSorts)[number]

export const listOrders = ["asc", "desc"] as const
export type ListOrder = (typeof listOrders)[number]

// One screen of the file pane. The cursor asks for the rows after this page.
export const listPageSize = 100

export interface ListRow {
  readonly contentType?: string
  readonly createdAt: string
  readonly id: string
  readonly name: string
  readonly size: number
}

export interface ListPage<A> {
  readonly files: ReadonlyArray<A>
  readonly next?: string
}

const encodeCursor = (id: string): string => {
  const bytes = new TextEncoder().encode(id)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

const decodeCursor = (cursor: string): string | undefined => {
  try {
    const padded = cursor.replaceAll("-", "+").replaceAll("_", "/")
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
    const binary = atob(`${padded}${pad}`)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const id = new TextDecoder().decode(bytes)
    return id === "" ? undefined : id
  } catch {
    return undefined
  }
}

const compareRows =
  (sort: ListSort, order: ListOrder) =>
  (left: ListRow, right: ListRow): number => {
    const primary =
      sort === "size"
        ? left.size - right.size
        : sort === "created"
          ? left.createdAt.localeCompare(right.createdAt)
          : sort === "type"
            ? (left.contentType ?? "").localeCompare(right.contentType ?? "")
            : left.name.localeCompare(right.name, "zh-Hant")
    const tied = primary === 0 ? left.id.localeCompare(right.id) : primary
    return order === "desc" ? -tied : tied
  }

// Sorts the folder, then returns the page that follows the cursor.
export const pageFiles = <A extends ListRow>(
  files: ReadonlyArray<A>,
  input: {
    readonly cursor?: string
    readonly limit?: number
    readonly order: ListOrder
    readonly sort: ListSort
  },
): ListPage<A> => {
  const limit = input.limit ?? listPageSize
  if (limit <= 0) {
    return { files: [] }
  }
  const sorted = [...files].sort(compareRows(input.sort, input.order))
  const previousId = input.cursor === undefined ? undefined : decodeCursor(input.cursor)
  const previous =
    previousId === undefined ? -1 : sorted.findIndex((file) => file.id === previousId)
  const start = previous + 1
  const page = sorted.slice(start, start + limit)
  const last = page.at(-1)
  const next =
    last !== undefined && start + page.length < sorted.length ? encodeCursor(last.id) : undefined
  return next === undefined ? { files: page } : { files: page, next }
}
