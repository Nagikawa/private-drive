# Private Drive

A private drive for one shared password. After login the only page is the file list. R2 and Hugging Face are listed from the provider. Telegram accepts uploads and does not keep a file list. File bytes can live in Cloudflare R2, Telegram, or Hugging Face.

## Structure

pnpm workspace, orchestrated by Turborepo.

```
apps/web            Angular 22 UI. Tailwind and daisyUI. In dev, /api is proxied to the API
apps/api            Effect HTTP API, running on Node
packages/domain     Shared schemas and the HTTP contract
data/               Runtime files. Gitignored
```

`DATA_DIR` is that directory, for example `data`. It holds:

- `sessions.json`: login sessions. Logout revokes that cookie
- `audit.jsonl`: logins and file changes
- `r2-uploads.json`: R2 multipart uploads that have not finished
- `uploads/`: temporary files for chunked browser uploads

If `DATA_DIR` is unset and `INDEX_PATH` still names an old catalog file, the runtime files stay in that file's directory. The catalog itself is not read.

R2 and Hugging Face show the objects their list APIs return. Telegram cannot list chat history, so its page stays empty. Telegram cloud cannot download a file larger than about 20 MB.

## Run locally

Node.js 22 or newer, and pnpm 12.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

- UI: <http://localhost:4200>
- API: <http://127.0.0.1:8787>
- The password in `.env.example` is `admin`

Storage variables can stay empty. That source then shows as disconnected. To enable one, fill the whole set: R2 needs the account, keys, and bucket; Telegram needs the bot token and chat id; Hugging Face needs the token and `owner/repo`.

The API starts from `apps/api` and reads `.env` at the repo root. `DATA_DIR=../../data` in `.env.example` is relative to `apps/api`.

Other commands:

```bash
pnpm test        # domain, API, and web
pnpm lint        # oxlint in each package
pnpm format      # root oxfmt, check only
```

## Deploy

The API is a long-running Node process. The catalog and upload temp files stay on its disk. The UI is a static Angular build. The browser calls `/api` on the same site as the page, so the session cookie is sent.

Replace `SESSION_SECRET` with a long random string, and change `AUTH_PASSWORD`. Set `COOKIE_SECURE=true` when the site is served over HTTPS. Set `DATA_DIR` to an absolute path on a disk that persists.

Build the UI:

```bash
pnpm install --frozen-lockfile
pnpm --filter web build
```

The build output is `apps/web/dist/web/browser`.

On the server, start the API from `apps/api` without `--watch`:

```bash
node --env-file=../../.env --import tsx src/main.ts
```

`GET /health` returns `{"ok":true}`. `GET /metrics` is a text counter and does not require login.

### Conventional

One machine, one reverse proxy. Client routes fall back to `index.html`. `/api` goes to the API port. Caddy example:

```caddy
example.com {
	handle /api/* {
		reverse_proxy 127.0.0.1:8787
	}

	handle {
		root * /var/www/private-drive
		try_files {path} /index.html
		file_server
	}
}
```

Put the contents of `apps/web/dist/web/browser` in `/var/www/private-drive`. Keep the API running with systemd or the equivalent, with its working directory set to `apps/api`. Back up `DATA_DIR`.

### Cloudflare

File bytes can live in R2. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. The file list is the bucket's own object list. Sessions and upload temps still live in `DATA_DIR` on the machine that runs the API.

Publish that reverse proxy with a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). The tunnel is HTTPS, so set `COOKIE_SECURE=true`. Point the public hostname at this one origin so the page and `/api` stay on the same site.
