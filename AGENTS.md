# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

# Private drive

pnpm workspace managed by Turborepo.

- `apps/web`: Angular 22, Angular Material, Tailwind, RxJS
- `apps/api`: Effect HTTP API
- `packages/domain`: shared schemas and HTTP API contract

Copy `.env.example` to `.env` before `pnpm dev`. The dev password is `admin`.
Storage credentials stay empty until you fill in Cloudflare R2, Telegram, or Hugging Face.
