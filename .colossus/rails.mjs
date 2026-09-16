#!/usr/bin/env node
// Colossus rails shim — a stable entry point committed in every app.
//
// The rails themselves live in the PIPELINE IMAGE, not in the app repo, so they
// upgrade independently of the apps that use them. This file is the only part
// that ships with the app: it finds the rails and re-execs the requested script.
// Pattern: a launcher shim (gradlew / mvnw), not a vendored copy.
//
// Usage: node .colossus/rails.mjs <rail> [args...]
//        e.g. node .colossus/rails.mjs site-map --root .. --check
//
// Resolution order:
//   1. $COLOSSUS_RAILS_DIR   — set by the pipeline image; authoritative when set.
//   2. <app>/agent-rails     — a checkout that vendored the rails on purpose.
//   3. /app/agent-rails      — the pipeline image's default location.
//
// Exit codes: the child's, unchanged. The ONE exception is a missing toolchain:
// a plain developer checkout has no rails at all, which is a config condition,
// not a breach — so the shim says it is skipping and exits 0. A rails script
// that RUNS and fails always propagates, or the ratchet would be decorative.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const [rail, ...args] = process.argv.slice(2);
if (!rail) {
  console.error('usage: node .colossus/rails.mjs <rail> [args...]');
  process.exit(2);
}
const file = rail.endsWith('.mjs') ? rail : `${rail}.mjs`;

const env = process.env.COLOSSUS_RAILS_DIR;
const candidates = env
  ? [env]                                              // explicit wins outright
  : [path.join(APP_ROOT, 'agent-rails'), '/app/agent-rails'];

const found = candidates.map((d) => path.join(d, file)).find((p) => existsSync(p));
if (!found) {
  console.error(
    `rails: skipping ${rail} — no agent-rails found (looked in: ${candidates.join(', ')}). ` +
    `Set COLOSSUS_RAILS_DIR to run the rails locally.`,
  );
  process.exit(0);
}

const run = spawnSync(process.execPath, [found, ...args], { stdio: 'inherit' });
if (run.error) {
  console.error(`rails: failed to run ${found}: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status === null ? 1 : run.status);
