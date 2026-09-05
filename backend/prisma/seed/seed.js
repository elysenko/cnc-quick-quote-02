'use strict';
/**
 * Essential seed — platform-owned logins only (Colossus accounts-v1 contract).
 *
 * Runs with plain `node` from the production image (no ts-node/tsx): the deploy
 * pipeline's migrate Job executes `npx prisma migrate deploy && node prisma/seed/seed.js`.
 *
 * Input:  COLOSSUS_ACCOUNTS_JSON — injected into the pod env by Colossus at provision:
 *         [{"role":"ADMIN","email":"admin@demo.local","password":"…","login_path":"/login"}, …]
 * Effect: upserts one `colossus_accounts` row AND one `User` per account, hashing the
 *         password with argon2 exactly as the auth service verifies it. Idempotent —
 *         re-running re-asserts the hash so the platform-held password always logs in.
 * Output: one summary line, roles only. Never prints emails, passwords or hashes.
 * Failure: exits 1 when the env is missing/malformed or a contract role has no `Role`
 *          enum value — a silent no-op would leave the app with no working login.
 *
 * This file stays essential-only. Do NOT add demo/business sample rows here or in a
 * sibling script (e.g. fixtures.js) — shipped seeds carry no sample data; screens
 * render their empty state on first load. The build gate flags any seed script that
 * writes inline rows without an environment guard (unguarded-seed-fixture).
 */
const { PrismaClient, Role } = require('@prisma/client');
const argon2 = require('argon2');

const ACCOUNTS_ENV = 'COLOSSUS_ACCOUNTS_JSON';
const DEFAULT_LOGIN_PATH = '/login';
const REQUIRED_FIELDS = ['role', 'email', 'password'];

const prisma = new PrismaClient();

/** Parse and validate the platform accounts from the environment; throws a value-free error. */
function readPlatformAccounts(env) {
  const raw = env[ACCOUNTS_ENV];
  if (!raw || !raw.trim()) {
    throw new Error(`${ACCOUNTS_ENV} is not set — Colossus injects it at provision; nothing to seed`);
  }
  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${ACCOUNTS_ENV} is not valid JSON (${error.message})`);
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(`${ACCOUNTS_ENV} must be a non-empty JSON array of accounts`);
  }
  accounts.forEach((account, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (typeof account[field] !== 'string' || account[field] === '') {
        throw new Error(`${ACCOUNTS_ENV}[${index}] is missing field "${field}"`);
      }
    }
  });
  return accounts;
}

/** Map a contract role (any case) onto the app's Prisma `Role` enum, or throw listing the known ones. */
function resolveAppRole(contractRole) {
  const known = Object.values(Role);
  const match = known.find((value) => value.toUpperCase() === contractRole.toUpperCase());
  if (!match) {
    throw new Error(`contract role "${contractRole}" has no Role enum value (known: ${known.join(', ')})`);
  }
  return match;
}

/** Upsert the colossus_accounts row and the matching User for one platform account. */
async function upsertAccount(account) {
  const role = resolveAppRole(account.role);
  const passwordHash = await argon2.hash(account.password);
  const loginPath = account.login_path || DEFAULT_LOGIN_PATH;
  await prisma.colossusAccount.upsert({
    where: { email: account.email },
    update: { role: account.role, passwordHash, loginPath },
    create: { role: account.role, email: account.email, passwordHash, loginPath },
  });
  await prisma.user.upsert({
    where: { email: account.email },
    update: { role, passwordHash },
    create: { email: account.email, name: `${role} (Colossus)`, role, passwordHash },
  });
  return role;
}

async function main() {
  const accounts = readPlatformAccounts(process.env);
  const roles = [];
  for (const account of accounts) {
    roles.push(await upsertAccount(account));
  }
  console.log(`[seed] colossus_accounts upserted ${roles.length} (roles: ${roles.join(', ')})`);
}

main()
  .catch((error) => {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
