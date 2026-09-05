# Post-Deploy Report — CNC Quick Quote

**URL:** https://cnc-quick-quote-02-staging-0f4c14a69dc8ab13.olympus-ai.cloud/
**Date:** 2026-09-05
**Status:** ✅ Live and healthy — with 2 integrations awaiting human-supplied keys.

> **Note:** the technical plan describes a FastAPI backend. The shipped app is
> **NestJS + Prisma + Angular** (the certified `enterprise` stack in `colossus.stack.json`).
> The plan is stale; all checks below were run against what actually shipped.

---

## Phase 3 — Liveness ✅

| Check | Result |
|---|---|
| `GET /api/health` | **200** · 0.19 s · `{"status":"ok"}` |
| `GET /api/health/deep` | **200** · `database: up`, `storage: up`, `redis: unconfigured` |
| `GET /api/docs` (Swagger) | **200** |
| SPA deep links `/login`, `/quotes`, `/admin/materials` | **200** (nginx SPA fallback OK) |
| `POST /api/auth/login` (bad creds) | **401**, non-enumerating message — auth path live |
| TLS | **Valid** · TLSv1.3 `TLS_AES_256_GCM_SHA384` · `CN=olympus-ai.cloud` · verify=0 · ALPN h2 |

**Acceptance criteria met** — both `expect_text` strings from `.colossus-acceptance.json`
are served live in the lazy login chunk `chunk-4HKAKEYW.js` (200). Deployed bundles match
the local build; no `reject_signatures` present.

⚠️ **`REDIS_URL` is not set.** The app degrades gracefully to in-process rate limiting,
so it is healthy — but rate limits are **per-pod, not shared**, and refresh-token
revocation is not cached across replicas. Fine for single-replica staging; set `REDIS_URL`
before scaling out or going to production.

---

## Phase 0 — Demo user seeding ⏭️ Skipped (not applicable + no access)

Skipped for two independent reasons:

1. **No Kubernetes access.** The pipeline runs as
   `system:serviceaccount:colossus:temporal-worker`, which is denied `get`/`list`/`create`
   on `pods`, `jobs`, `secrets` and `services` in `colossus-01dcc3cc-7100-4cd5-9-staging`.
   The seed Job, the `kubectl exec` fallback, and the CloudBeaver NodePort lookup are all
   impossible from here.
2. **The step is redundant by design.** `backend/prisma/seed/seed.js` is platform-owned:
   it consumes `COLOSSUS_ACCOUNTS_JSON` (injected by Colossus at provision) and
   deliberately **never prints emails, passwords or hashes** — only
   `[seed] colossus_accounts upserted N (roles: …)`. There are no `SEED_CRED` lines to
   parse, and the credentials originate from Colossus, which already holds them.
   The deploy pipeline's migrate Job already runs
   `npx prisma migrate deploy && node prisma/seed/seed.js`.

**No `PATCH /demo-credentials` call was made** — there was no credential to report, and
posting fabricated values would have overwritten good platform-held data in the UI.
(`GET` on that endpoint is not supported: 404 `Cannot GET`, so existing state could not be
read back either.)

**Verification gap:** seeding could not be *directly* confirmed without pod access.
Indirect evidence is consistent with success — `database: up` and `/api/auth/login`
returns a correct 401 rather than a 500.

---

## Phase 1 — Deferred secrets

No `.pipeline/integrations.json` exists, so there were no `obtain_timing="post_deploy"`
entries and **no `agent_command` to run**. Credentials are instead managed at runtime
through the app's own catalogue at `GET/PUT /api/admin/integrations`
(admin UI: `/admin/settings`), which accepts keys **without a redeploy**.

| Credential | Kind | State | Action |
|---|---|---|---|
| `DATABASE_URL` | service | ✅ Wired (`database: up`) | none |
| `MINIO_ENDPOINT` | service | ✅ Wired (`storage: up`) | none |
| `MINIO_S3_BOTO3_API_KEY` | integration | ✅ Satisfied by platform env | none |
| `REDIS_API_KEY` / `REDIS_URL` | integration | ⚠️ Unconfigured — in-process fallback | set before scaling |
| `STRIPE_..._API_KEY` | integration | ❌ **Missing** | **human must supply** |
| `RESEND_API_API_KEY` | integration | ❌ **Missing** | **human must supply** |

Stripe and Resend keys exist in **no** accessible source — not the pipeline environment,
not a secrets store, not the pod env. Per design they are admin-entered, Fernet-encrypted
with `APP_ENCRYPTION_KEY`, and write-only over the API (reads return masked values).
They **cannot** be auto-resolved by this stage.

---

## Phase 2 — Webhook registration ⏭️ Skipped (no credential)

One webhook integration: **Stripe**.

- **Canonical URL:** `https://cnc-quick-quote-02-staging-0f4c14a69dc8ab13.olympus-ai.cloud/api/webhooks/stripe`
- **Endpoint verified wired:** an unsigned `POST` returns **400**
  `"Missing Stripe signature or request body."` — the route is live and correctly refuses
  unauthenticated payloads (raw-body HMAC is the authentication).
- **Registration: skipped.** Registering with Stripe requires a secret API key, which is
  not available (see Phase 1). Not silently dropped — surfaced below.

---

## ⚠️ Manual steps still required

1. **Add the Stripe secret key** at `/admin/settings` (or `PUT /api/admin/integrations`).
   Until then checkout returns an error and no orders can be placed.
2. **Register the Stripe webhook** in the Stripe Dashboard →
   *Developers → Webhooks → Add endpoint*:
   - URL: `https://cnc-quick-quote-02-staging-0f4c14a69dc8ab13.olympus-ai.cloud/api/webhooks/stripe`
   - Event: `checkout.session.completed`
   - Copy the generated **signing secret** back into `/admin/settings` — signature
     verification fails without it and every event is rejected with a 400.
3. **Add the Resend API key** for order-confirmation email. Low severity: send failures
   are caught and written to `email_log`, so orders and the confirmation page still
   succeed without it.
4. **Set `REDIS_URL`** before running more than one replica (shared rate limiting +
   refresh-token revocation).
5. **Retrieve demo logins from the Colossus UI** — they were minted by the platform and
   injected as `COLOSSUS_ACCOUNTS_JSON`; roles `ADMIN`, `MANAGER`, `USER` at `/login`.
6. *(Optional)* Grant the pipeline service account read access to the staging namespace if
   future post-deploy stages should be able to verify seeding or inspect pods.

---

## Files
- Written: `.pipeline/post_deploy.md`
- Application source: **unmodified** (operational glue only).
