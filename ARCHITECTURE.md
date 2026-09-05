# Architecture

## Requested stack
- `enterprise` (Angular 19 + NestJS + tRPC + Prisma + PostgreSQL)

This is a platform-fixed stack for greenfield full-stack TypeScript projects. The
technical plan for this project ("CNC Quick Quote") described a FastAPI + Angular
stack, but per the scaffolding contract the platform's `enterprise` template is
authoritative for project structure — the plan's *features* (DXF parsing, nesting,
pricing, Stripe checkout, work-bed visualiser, admin console, etc.) must be
implemented on top of this NestJS/Prisma/tRPC backend and Angular frontend rather
than on FastAPI. Anywhere the plan names Python-only libraries (e.g. `ezdxf`), the
build agents need to find or implement a Node/TypeScript equivalent.

## Newly scaffolded
- `frontend/` — Angular 19 SPA (was empty, scaffolded from `template-enterprise`)
- `backend/` — NestJS + tRPC + Prisma API (was empty, scaffolded from `template-enterprise`)
- `docker-compose.yml`, `.pipeline/surface.json`, `.colossus-acceptance.json`, `colossus.yaml`

## Where things live
- `frontend/src/app/` — Angular components, routes, `app.config.ts` (tRPC client wiring)
- `backend/src/` — NestJS modules; `*.router.ts` files are tRPC routers (`nestjs-trpc`),
  `*.controller.ts` files are plain REST controllers (currently just `health`)
- `backend/prisma/` — Prisma schema and migrations
- `.pipeline/surface.json` — machine-readable contract of routes/components/`data-testid`s
  consumed by the test_spec agent and Playwright generator
- `.colossus-acceptance.json` — post-deploy render-gate contract (readiness testid,
  reject signatures for the untouched template stub)

## Next steps for the developer / build agents
1. Copy `backend/.env.template` to `backend/.env` (and set `DATABASE_URL`, etc.) if not already done.
2. `cd backend && npm install && npx prisma migrate dev` to create the local database schema.
3. `cd frontend && npm install` (keep `package.json` deps VERBATIM unless a new dependency is
   genuinely required by the plan — the frontend Dockerfile relies on a prebaked `node_modules`
   seed matching the template's exact dependency set).
4. `docker-compose up` for local Postgres/API/frontend.
5. Extend `backend/src/` with the plan's domain modules (drawings, materials, quotes, checkout,
   orders, admin) as NestJS modules + tRPC routers/REST controllers, and add corresponding
   Prisma models/migrations.
6. Extend `frontend/src/app/` with the plan's feature routes/components, updating
   `.pipeline/surface.json` with every new route, component selector, and `data-testid` added.
7. Finalize `.colossus-acceptance.json`'s `expect_text` once the real front page content is built.

## Template sources
- `template-enterprise` from the scaffold-templates directory (Angular 19 + NestJS + tRPC + Prisma + PostgreSQL)
