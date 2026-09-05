# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --loglevel=error
COPY . .
# A compiled prisma.config.js (emitted whenever the app's tsconfig `include` matches the
# root-level prisma.config.ts) SHADOWS the authoritative .ts config, and Prisma 7 fails to
# parse the compiled output ("Failed to parse syntax of config file at prisma.config.js"),
# hard-failing `prisma generate` AND the runtime `migrate deploy`. When the .ts exists,
# strip any compiled shadow so the .ts is the config Prisma loads. Deterministic
# build-contract defense — we don't trust generated build output.
RUN if [ -f prisma.config.ts ]; then rm -f prisma.config.js prisma.config.cjs prisma.config.mjs prisma.config.d.ts prisma.config.js.map; fi
# TS6059 guard: generated backends set tsconfig `rootDir:"src"` but do NOT exclude the
# root-level `prisma.config.ts` / `prisma/seed/*.ts` (outside src), which tsc's default
# `**/*` include then pulls in -> `nest build` fails TS6059 ("not under rootDir 'src'").
# Deterministically add the stray prisma paths to `exclude` in tsconfig(.build).json.
# DEFECT#9 (soak 2026-07-12): the previous regex JSONC comment-stripper ate the `/**/`
# INSIDE glob strings ("src/**/*.ts" -> "src*.ts"), so tsc matched ZERO inputs and
# `nest build` exited 0 with NO dist -> runtime MODULE_NOT_FOUND crash-loop (App2).
# Fix: parse-first (valid JSON is never run through any stripper), and the JSONC fallback
# strips comments with a STRING-AWARE scanner (never inside quoted literals). Per-file
# fail-open with a logged outcome; nest build reads tsconfig.build.json, whose exclude
# REPLACES the base, so patching it is what counts.
RUN node <<'TSPATCH'
const fs = require('fs');
function stripJsonc(t) {
  let o = '', i = 0, inStr = false;
  while (i < t.length) {
    const c = t[i];
    if (inStr) {
      o += c;
      if (c === '\\') { o += t[i + 1] ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '"') { inStr = true; o += c; i++; continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t.charCodeAt(i) !== 10) i++; continue; }
    if (c === '/' && t[i + 1] === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i += 2; continue; }
    o += c; i++;
  }
  return o.replace(/,(\s*[}\]])/g, '$1');
}
for (const f of ['tsconfig.json', 'tsconfig.build.json']) {
  if (!fs.existsSync(f)) continue;
  try {
    const raw = fs.readFileSync(f, 'utf8');
    let j;
    try { j = JSON.parse(raw); } catch { j = JSON.parse(stripJsonc(raw)); }
    j.exclude = [...new Set([...(j.exclude || []), 'prisma.config.ts', 'prisma.config.js', 'prisma/**', 'prisma'])];
    fs.writeFileSync(f, JSON.stringify(j, null, 2));
    console.log('tsconfig-guard: patched', f);
  } catch (e) { console.log('tsconfig-guard: SKIP', f, '-', e.message); }
}
TSPATCH
# datasource.url guard (Prisma 7): the CLI `migrate deploy`/`db push` in the runtime CMD
# need a connection URL, but a Prisma-7 driver-adapter scaffold may leave it unset (the
# app's PrismaClient uses @prisma/adapter-pg at runtime). In Prisma 7 the `url` field is
# NO LONGER allowed in schema.prisma (validation error P1012) — it must live in
# prisma.config.ts. So if prisma.config.ts exists and has no `datasource:` key, inject
# `datasource: { url: process.env.DATABASE_URL }`. process.env (NOT the env() helper, which
# throws when unset) is read lazily: undefined at Docker BUILD time (generate tolerates it,
# doesn't connect); resolved at RUNTIME when the CMD runs migrate with DATABASE_URL injected.
# Idempotent (skips when already present); JS/TS config supported; fail-open.
RUN C=$(find . -maxdepth 3 -name prisma.config.ts -not -path "*/node_modules/*" 2>/dev/null | head -1); if [ -n "$C" ]; then node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');if(!/datasource\s*:/.test(s)){s=s.replace(/defineConfig\(\s*\{/,'defineConfig({\n  datasource: { url: process.env.DATABASE_URL },');fs.writeFileSync(p,s);}" "$C" || true; fi
# DEFECT #6 (soak 2026-07-12): a prisma.config.ts using Prisma's env("DATABASE_URL")
# helper THROWS at config-LOAD time when the var is unset ("PrismaConfigEnvError"),
# failing `prisma generate` before it even starts. generate never CONNECTS, so a
# placeholder satisfies config loading at build time; build-stage ENV does not leak
# into the runtime stage, whose CMD reads the real DATABASE_URL from container env.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
# Generate the Prisma client against the app's ACTUAL schema (generated apps place it
# inconsistently) BEFORE the type-checking build — without a generated @prisma/client,
# `nest build` fails TS2305 "no exported member PrismaClient". Fail-loud (not swallowed):
# a real codegen failure should surface here, not as a confusing build error downstream.
RUN S=$(find . -name schema.prisma -not -path "*/node_modules/*" 2>/dev/null | head -1); if [ -n "$S" ]; then npx prisma generate --schema "$S"; fi
# stale tsbuildinfo guard: generated NestJS apps ship a committed *.tsbuildinfo AND set
# tsconfig incremental:true. With nest-cli deleteOutDir:true, `nest build` sees the stale
# buildinfo -> thinks nothing changed -> emits NOTHING while deleteOutDir already wiped dist
# -> empty dist -> runtime `node dist/main` fails MODULE_NOT_FOUND -> backend crash-loop.
# Remove any tsbuildinfo so nest build does a clean full emit. Idempotent.
RUN find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete 2>/dev/null || true
RUN npm run build
# `npm run build` (tsc) re-emits the prisma.config.js shadow into the build stage, which
# `COPY --from=build /app` would carry into the runtime image and break `migrate deploy`.
# Strip it again so the runtime CMD's prisma commands read the authoritative .ts.
RUN if [ -f prisma.config.ts ]; then rm -f prisma.config.js prisma.config.cjs prisma.config.mjs; fi
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Locate the prisma schema (generated apps place it inconsistently) then auto-migrate,
# then start. DB env is injected as container env (see _expand_service_env).
CMD sh -c 'S=$(find /app -name schema.prisma -not -path "*/node_modules/*" 2>/dev/null | head -1); if [ -n "$S" ]; then (npx prisma migrate deploy --schema "$S" || npx prisma db push --schema "$S" --accept-data-loss || true); fi; npm run start:prod'
