> **WARNING — `surface.json` is stale and incomplete.** `.pipeline/surface.json` still contains
> only the untouched `template-enterprise` scaffold surface (`GET /health`,
> `GET /trpc/users.findAll`, `GET /trpc/users.findById`, and the `app-root` / `app-home`
> components). It does **not** describe any of the CNC Quick Quote surface. The 40 additional
> endpoints, 14 journeys and the `data-testid` set below are therefore **derived** from
> `requirements/spec.md` (supplied inline; no `requirements/spec.md` file exists on disk) and from
> the Surface contract in `.pipeline/tasks.md`. `ui_agent` is required to register every new route,
> component selector and testid back into `surface.json`; when it does, this spec should be
> re-generated and any drift treated as a defect.
>
> **Stack divergence.** The spec describes FastAPI + SQLAlchemy + `ezdxf` + a single-container
> Dockerfile. The repository is the platform-fixed `enterprise` scaffold (Angular 19 + NestJS +
> tRPC + Prisma + PostgreSQL), and `tasks.md` is written against the scaffold. **All cases below
> are written against the scaffolded stack**, using tRPC procedure names (`auth.login`) with the
> spec's REST paths noted where they differ. Cases assert *behaviour*, so they remain valid if the
> stack question is resolved the other way — only the transport names change.

# Test Specification

## Coverage summary
- Total cases: 304 (272 API, 17 data-integrity, 15 journeys)
- API endpoints covered: 43 / 3 in surface.json (3/3 scaffold endpoints covered, plus 40 endpoints derived from the spec because surface.json is stale)
- User journeys covered: 15

## API tests

For each endpoint in `surface.json`, list the cases below. Because `surface.json` covers only the
scaffold, the derived endpoints from the spec's Surface contract are included on equal footing.

**Fixture constants.** Cases are concrete against this seeded test environment; a test that changes
a constant must state the override inline.

- `PricingSettings`: `setupFeeCents=5000`, `costPerLinearFootCents=250`, `perSheetCostCents=1200`,
  `handlingFeeCents=1500`, `costPerBendCents=75`, `minimumOrderCents=7500`, `qtyMin=1`, `qtyMax=1000`
- `MachineSettings`: `sheetSpacingMm=5`, `sheetMarginMm=10`, `allowedExtensions=[".dxf"]`,
  `maxUploadBytes=5242880`, `animationSpeed=1.0`
- Materials: `M1` "Mild Steel 1.5mm" (1220×2440 mm sheet, `costMultiplier=1.0`, active);
  `M2` "Aluminium 2mm" (`costMultiplier=1.5`, active); `M3` "Retired Brass" (**inactive**)
- Shipping: `S1` "Standard" (`flat`, `rateCents=1500`, 5 days, active); `S2` "Freight"
  (`perSheet`, `rateCents=900`, 10 days, active)
- Fixtures: `square.dxf` (100 mm square, cut length 400 mm, bbox 100×100), `arcs.dxf`
  (r=50 circle + a `bulge=1` LWPOLYLINE semicircle on a 100 mm chord), `empty.dxf` (valid DXF,
  zero supported entities), `corrupt.dxf` (malformed header)
- Actors: `ADMIN` (first signup), `USER_A`, `USER_B` (later signups, own disjoint data), `ANON`
- Rate limits under test: 5 requests / 60 s window per bucket
- Unit conversion: 1 ft = 304.8 mm. All money is integer cents, rounded exactly once at the end.

---

### `GET /health`
*(in surface.json — scaffold endpoint, must keep working)*
- **Happy path**: [API-001] Unauthenticated `GET /health` → 200, body `{status:"ok"}`-shaped;
  responds with no database, Redis or MinIO connection available (kill Postgres, assert still 200).
- **Validation failures**: n/a — no inputs.
- **Auth failures**: [API-002] Endpoint is public; assert it does **not** return 401 for `ANON`.
- **Idempotency / edge cases**: [API-003] Two consecutive calls return identical bodies; median
  latency < 200 ms with dependencies down (proves no dependency check leaked into the shallow probe).

### `GET /health/deep`
- **Happy path**: [API-004] With Postgres, Redis and MinIO up → 200 and a per-dependency report
  with all three of `postgres`, `redis`, `minio` marked healthy (Postgres `SELECT 1`, Redis `PING`,
  MinIO `headBucket`).
- **Validation failures**: n/a — no inputs.
- **Auth failures**: [API-005] Public; `ANON` → 200, not 401.
- **Idempotency / edge cases**: [API-006] With Redis stopped → response still returns (does not
  throw/hang), reports `redis` unhealthy and the other two healthy. [API-007] With MinIO stopped →
  `minio` unhealthy, others healthy. [API-008] Each dependency probe is bounded by a timeout: with a
  dependency blackholed (packets dropped), the response returns in < 10 s rather than hanging.

### `GET /trpc/users.findAll`
*(in surface.json — scaffold endpoint)*
- **Happy path**: [API-009] Returns 200 and an array of users. If the procedure survives the feature
  build, it must not leak `passwordHash` for any row — assert the key is absent from every element.
- **Validation failures**: n/a — no inputs.
- **Auth failures**: [API-010] After auth lands, `ANON` → 401 (a user directory must not be public);
  if the team deliberately deletes this scaffold procedure instead, assert it 404s and remove this case.
- **Idempotency / edge cases**: [API-011] Read-only: calling twice creates no rows (`User` count
  unchanged).

### `GET /trpc/users.findById`
*(in surface.json — scaffold endpoint)*
- **Happy path**: [API-012] Valid existing id → 200 with that user, `passwordHash` absent.
- **Validation failures**: [API-013] Missing `id` input → 400/422. [API-014] Well-formed but
  unknown id → 404 (not 200 with null).
- **Auth failures**: [API-015] `ANON` → 401 once auth lands (or 404 if the procedure is removed).
- **Idempotency / edge cases**: [API-016] Read-only; repeated calls do not mutate the row.

---

### `POST /trpc/auth.signup`  *(spec: `POST /api/auth/register`)*
- **Happy path**: [API-017] Empty `User` table (excluding `ColossusAccount` seed rows), signup
  `first@t.io` / `Passw0rd!23` → 200, returns access + refresh tokens, and the persisted user's role
  is `ADMIN`. [API-018] A **second** signup `second@t.io` → 200 and role `USER`, and the first user's
  role is still `ADMIN`.
- **Validation failures**: [API-019] `email="not-an-email"` → 422. [API-020] Missing `password` → 422.
  [API-021] Password below the configured minimum length → 422 naming the length requirement.
  [API-022] Empty-string email → 422.
- **Auth failures**: [API-023] Public endpoint — `ANON` succeeds; presenting a valid bearer token
  does not change the outcome.
- **Idempotency / edge cases**: [API-024] Duplicate email → **409**, and the `User` row count is
  unchanged. [API-025] Duplicate differing only in case (`First@t.io`) → 409 (email uniqueness is
  case-insensitive). [API-026] The response never contains `passwordHash`. [API-027] The stored hash
  is a bcrypt digest (matches `^\$2[aby]\$`) at the seed's `BCRYPT_ROUNDS`, and is not the plaintext.

### `POST /trpc/auth.login`
- **Happy path**: [API-028] Correct credentials → 200 with a new access + refresh pair; the access
  token decodes to the right `sub` and `role`; a `RefreshToken` row exists with the token's `jti`
  and `revokedAt = null`.
- **Validation failures**: [API-029] Malformed email → 422. [API-030] Missing password → 422.
- **Auth failures**: [API-031] Known email + wrong password → **401**. [API-032] Unknown email →
  **401** with a response **byte-identical** to [API-031] (same status, code and message string).
  [API-033] Timing: over 50 paired runs, the median response times of [API-031] and [API-032] differ
  by < 25 ms (no user-enumeration oracle via an early return before hashing).
- **Idempotency / edge cases**: [API-034] Two successive logins issue two distinct refresh `jti`s and
  **both** remain valid (login does not revoke existing sessions). [API-035] Login for a user whose
  refresh tokens were all revoked still succeeds.

### `POST /trpc/auth.refresh`
- **Happy path**: [API-036] Valid unused refresh token → 200 with a **new** access + refresh pair;
  the new refresh `jti` differs from the old; the old row now has `revokedAt` set.
- **Validation failures**: [API-037] Missing token field → 422. [API-038] Structurally invalid
  (non-JWT) string → 401, not 500.
- **Auth failures**: [API-039] Replay — refresh with the same token a second time → **401** and no
  new tokens issued. [API-040] Token signed with the wrong secret → 401. [API-041] Expired refresh
  token (`expiresAt` in the past) → 401. [API-042] Token whose `jti` has no `RefreshToken` row → 401.
  [API-043] Token for a deleted user → 401. [API-044] Passing an **access** token to refresh → 401
  (token-type confusion).
- **Idempotency / edge cases**: [API-045] Rotation is atomic: after refresh, exactly one non-revoked
  row exists for that chain. [API-046] The access token issued by refresh is accepted by `auth.me`.

### `POST /trpc/auth.logout`
- **Happy path**: [API-047] Logout with a valid refresh token → 200; that `jti`'s `revokedAt` is set;
  a subsequent `auth.refresh` with it → 401.
- **Validation failures**: [API-048] Missing token → 422.
- **Auth failures**: [API-049] `ANON` (no access token) → 401.
- **Idempotency / edge cases**: [API-050] Logging out twice → the second call does not 500 and
  `revokedAt` keeps its original timestamp (not overwritten). [API-051] `USER_A` cannot log out
  `USER_B`'s refresh token → 401/403 and `USER_B`'s token still refreshes successfully.

### `GET /trpc/auth.me`
- **Happy path**: [API-052] Valid access token → 200 with `id`, `email`, `role`; `passwordHash` absent.
- **Validation failures**: n/a — no inputs.
- **Auth failures**: [API-053] `ANON` → 401. [API-054] Malformed bearer header → 401.
  [API-055] Expired access token → 401. [API-056] Token signed with the wrong secret → 401.
- **Idempotency / edge cases**: [API-057] `ADMIN`'s `me` reports `role="ADMIN"`; `USER_A`'s reports
  `"USER"` (drives the admin nav).

---

### `POST /api/drawings`  *(multipart REST controller, auth + rate limited)*
- **Happy path**: [API-058] `USER_A` uploads `square.dxf` → 200 with a geometry summary:
  `cutLengthMm == 400` (±1e-6), `bboxWMm == 100`, `bboxHMm == 100`, `entityCount == 4`, plus a
  drawing id. A `Drawing` row exists with `userId = USER_A` and a non-empty `objectKey`, and the
  object is retrievable from MinIO at that key with the byte length of the uploaded file.
  [API-059] `arcs.dxf` → 200 with `cutLengthMm ≈ 314.159265 + 157.079633` (±1e-3).
- **Validation failures**: [API-060] `.stp` file (extension not in `allowedExtensions`) → 422/415
  **and zero MinIO objects written** (assert bucket object count unchanged) — validation precedes
  storage. [API-061] File of `maxUploadBytes + 1` bytes → 413/422 and zero objects written.
  [API-062] `empty.dxf` (zero supported entities) → **422** carrying the parse message, no `Drawing`
  row, no object written. [API-063] `corrupt.dxf` → **422** with the parse message (not a 500).
  [API-064] Request with no file part → 422. [API-065] A `.dxf`-named file whose bytes are a PNG →
  422 from the parser, no row.
- **Auth failures**: [API-066] `ANON` → **401** and no object written.
- **Idempotency / edge cases**: [API-067] Uploading the same file twice creates two distinct
  `Drawing` rows with distinct `objectKey`s (no clobber). [API-068] Rate limit: the 6th upload inside
  the 60 s window → **429** with a `Retry-After` header; after the window elapses the next upload
  succeeds. [API-069] A parse failure after a size/extension pass still writes no object (parse
  precedes `putObject`). [API-070] `sizeBytes` on the row equals the actual uploaded byte count.

### `GET /trpc/drawings.list`
- **Happy path**: [API-071] `USER_A` with 2 drawings → 200 with exactly those 2, newest first.
- **Validation failures**: [API-072] Invalid pagination input (negative page) → 422.
- **Auth failures**: [API-073] `ANON` → 401.
- **Idempotency / edge cases**: [API-074] `USER_B` sees **none** of `USER_A`'s drawings (owner
  scoping). [API-075] A user with no drawings → 200 with an empty array, not 404.

### `GET /trpc/drawings.get`
- **Happy path**: [API-076] Owner fetches own drawing → 200 with geometry, bbox, entity count and
  its bend lines.
- **Validation failures**: [API-077] Missing id → 422. [API-078] Unknown id → 404.
- **Auth failures**: [API-079] `ANON` → 401. [API-080] `USER_B` fetching `USER_A`'s drawing → 403 or
  404, and **never** the geometry payload.
- **Idempotency / edge cases**: [API-081] Read-only — the stored DXF object is never rewritten
  (object ETag unchanged after the call).

### `GET /api/drawings/:id/file`
- **Happy path**: [API-082] Owner → 302 redirect to a presigned MinIO URL; following it returns the
  original bytes.
- **Validation failures**: [API-083] Unknown id → 404. [API-084] Non-UUID id → 422/404, not 500.
- **Auth failures**: [API-085] `ANON` → 401. [API-086] `USER_B` on `USER_A`'s drawing → 403/404 and
  **no** presigned URL in the response body or `Location` header.
- **Idempotency / edge cases**: [API-087] The presigned URL carries a bounded TTL and, after the TTL
  passes, returns 403 from MinIO. [API-088] Two calls issue two working URLs.

### `POST /trpc/bends.create`
- **Happy path**: [API-089] Owner adds `{startX:0,startY:50,endX:100,endY:50,angleDeg:90,
  direction:"up"}` → 200 with the persisted bend; `drawings.get` now returns 1 bend; the DXF object
  in MinIO is **unchanged** (same ETag).
- **Validation failures**: [API-090] `angleDeg = -1` → 422. [API-091] `angleDeg = 181` → 422.
  [API-092] `angleDeg = 0` → 200 (inclusive lower bound). [API-093] `angleDeg = 180` → 200
  (inclusive upper bound). [API-094] `direction = "left"` → 422. [API-095] `direction` missing → 422.
  [API-096] Non-numeric `startX` → 422. [API-097] Unknown `drawingId` → 404.
- **Auth failures**: [API-098] `ANON` → 401. [API-099] `USER_B` adding a bend to `USER_A`'s drawing →
  403/404 and **no** `BendLine` row created (assert count unchanged).
- **Idempotency / edge cases**: [API-100] Two identical bends create two rows (duplicates allowed);
  the quote's `bendCount` then reads 2. [API-101] A zero-length bend (start == end) → 422.

### `POST /trpc/bends.update`
- **Happy path**: [API-102] Owner changes `angleDeg` 90 → 45 and `direction` `up` → `down` → 200 and
  the row reflects both.
- **Validation failures**: [API-103] `angleDeg = 200` → 422 and the row is **unchanged**.
  [API-104] Unknown bend id → 404.
- **Auth failures**: [API-105] `ANON` → 401. [API-106] `USER_B` updating `USER_A`'s bend → 403/404
  and the row is unchanged.
- **Idempotency / edge cases**: [API-107] Applying the same update twice yields the same final state.

### `POST /trpc/bends.delete`
- **Happy path**: [API-108] Owner deletes a bend → 200; `drawings.get` returns one fewer bend.
- **Validation failures**: [API-109] Unknown bend id → 404.
- **Auth failures**: [API-110] `ANON` → 401. [API-111] `USER_B` deleting `USER_A`'s bend → 403/404
  and the row still exists.
- **Idempotency / edge cases**: [API-112] Deleting the same bend twice → the second call → 404, no
  500. [API-113] Deleting the parent `Drawing` cascade-deletes its bends (zero orphan `BendLine` rows).

---

### `GET /trpc/materials.list`
- **Happy path**: [API-114] Returns `M1` and `M2` with name, thickness, sheet dimensions.
- **Validation failures**: n/a — no inputs.
- **Auth failures**: [API-115] `USER_A` → 200. (If the procedure is auth-gated, `ANON` → 401; assert
  whichever the implementation declares, consistently with the material step rendering.)
- **Idempotency / edge cases**: [API-116] Inactive `M3` is **absent** from the result.
  [API-117] Deactivating `M2` via admin removes it from the next call without a restart.
  [API-118] Zero active materials → 200 with an empty array, not 500.

### `POST /trpc/quotes.create`  *(auth, rate limited)*
- **Happy path**: [API-119] `USER_A`, `square.dxf` drawing, `M1`, `quantity=10`, no bends → 200 with
  `sheetCount=1`, `cutLengthMmTotal=4000`, `utilization ≈ 0.033595` (±1e-4), and
  `totalCents = 10981`. Reference computation: usable = 1200×2420; `cols=floor(1205/105)=11`,
  `rows=floor(2425/105)=23`, `perSheet=253`, `sheets=ceil(10/253)=1`; `cutLenFt = 4000/304.8 =
  13.12336`; `subtotal = 5000 + 13.12336×250 + 1×1200×1.0 + 1500 = 10980.84` → rounded once → 10981;
  `total = max(7500, 10981) = 10981`. The row persists `nestingJson` (253 placements' worth of
  layout for sheet 1), `breakdownJson` with all five line items, and `pricingSnapshotJson`.
  [API-120] Same inputs with 2 bends → `bendCount=2` and total higher by exactly `2×75 = 150` cents.
  [API-121] `M2` (`costMultiplier=1.5`) → the per-sheet line item is `1×1200×1.5 = 1800` cents.
- **Validation failures**: [API-122] `quantity = 0` → 422 and the message contains the actual
  `qtyMin` value. [API-123] `quantity = -5` → 422. [API-124] `quantity = null` → 422.
  [API-125] `quantity = 1001` (> `qtyMax`) → 422 and the message contains `1000`.
  [API-126] `quantity = 1.5` (non-integer) → 422. [API-127] Inactive `materialId` `M3` → **422**.
  [API-128] Unknown `materialId` → 422/404. [API-129] Unknown `drawingId` → 404.
  [API-130] Part larger than the usable sheet area (drawing bbox 1300×100 on a 1220 mm sheet) →
  **422** from `PartTooLargeError`, and **no** `Quote` row is created.
- **Auth failures**: [API-131] `ANON` → 401. [API-132] `USER_B` quoting `USER_A`'s drawing → 403/404
  and no `Quote` row.
- **Idempotency / edge cases**: [API-133] Rate limit: the 6th create in the window → **429** with
  `Retry-After`, and **no** `Quote` row for the rejected call. [API-134] **Snapshot immutability** —
  after issuing a quote, PATCH `admin.pricing` to double every rate, then re-read the quote:
  `totalCents` and `breakdownJson` are byte-identical to the originals, and `pricingSnapshotJson`
  still holds the *old* config. A *new* quote with identical inputs reflects the new prices.
  [API-135] Two identical creates produce two distinct quotes (no dedup) — creation is not idempotent
  by design. [API-136] `totalCents` is an integer (no floats reach the column), and every
  `breakdownJson` line item is an integer that sums to the pre-minimum subtotal.

### `GET /trpc/quotes.list`
- **Happy path**: [API-137] `USER_A` with 3 quotes → 200 with all 3.
- **Validation failures**: [API-138] `page = 0` or negative → 422. [API-139] Unknown `sort` key → 422
  (not silently ignored). [API-140] Unknown `status` value → 422 or an empty result, consistently.
- **Auth failures**: [API-141] `ANON` → 401.
- **Idempotency / edge cases**: [API-142] `status=draft` excludes `ordered` quotes.
  [API-143] `sort=-createdAt` vs `createdAt` return exactly reversed orders. [API-144] `page=2` with
  page size 2 over 3 quotes returns the 3rd only, with a total count reflecting 3.
  [API-145] `USER_B` sees none of `USER_A`'s quotes.

### `GET /trpc/quotes.get`
- **Happy path**: [API-146] Owner → 200 with breakdown, nesting placements, utilization, sheet count,
  material and drawing geometry (everything the work bed needs in one call).
- **Validation failures**: [API-147] Unknown id → 404.
- **Auth failures**: [API-148] `ANON` → 401. [API-149] `USER_B` on `USER_A`'s quote → 403/404 with no
  payload leakage.
- **Idempotency / edge cases**: [API-150] Repeated reads return byte-identical `totalCents` and
  `breakdownJson`.

---

### `GET /trpc/checkout.review`  *(spec: `GET /api/checkout/{quote_id}/review`)*
- **Happy path**: [API-151] Owner on a `draft` quote → 200 with material name, quantity and
  `totalCents` equal to the quote's stored total (no recomputation).
- **Validation failures**: [API-152] Unknown quote id → 404.
- **Auth failures**: [API-153] `ANON` → 401. [API-154] `USER_B` → 403/404.
- **Idempotency / edge cases**: [API-155] Already-`ordered` quote → 409 or a clearly flagged
  already-ordered state (never a second payable review). [API-156] Read-only: quote status unchanged.

### `GET /trpc/shipping.list`
- **Happy path**: [API-157] For a quote with `sheetCount=3`: `S1` (`flat`) → computed cost 1500;
  `S2` (`perSheet`) → computed cost `900 × 3 = 2700`. Both include `estDeliveryDays`.
  [API-158] For `sheetCount=1`, `S2` → 900.
- **Validation failures**: [API-159] Missing/unknown quote id → 404 (per-sheet cost needs the quote).
- **Auth failures**: [API-160] `ANON` → 401.
- **Idempotency / edge cases**: [API-161] With **all** shipping methods inactive → **409** whose
  message instructs the customer to contact the company. [API-162] Inactive methods are excluded
  when at least one is active. [API-163] Costs are integer cents.

### `POST /api/checkout/:quoteId/session`  *(REST controller, rate limited)*
- **Happy path**: [API-164] Owner, valid quote, chosen shipping `S1`, Stripe stubbed → 200 with a
  Checkout Session id and URL; the stub received a `success_url` and `cancel_url` pointing at the
  SPA's `/checkout/:quoteId/return` under `PUBLIC_BASE_URL`; the line-item amount equals
  `quote.totalCents + shippingCostCents`. **Zero** `Order` rows exist yet.
- **Validation failures**: [API-165] Unknown quote id → 404. [API-166] Missing/unknown
  `shippingMethodId` → 422. [API-167] Inactive shipping method → 422. [API-168] Missing shipping
  address → 422. [API-169] Quote already `ordered` → 409 and no second session.
- **Auth failures**: [API-170] `ANON` → 401. [API-171] `USER_B` on `USER_A`'s quote → 403/404 and no
  Stripe call is made (assert the stub was not invoked).
- **Idempotency / edge cases**: [API-172] Stripe stub raises a connection error → **503** with the
  "payment could not be processed" message and **zero** `Order` rows. [API-173] Stripe stub raises a
  timeout → 503, zero `Order` rows. [API-174] Stripe credential unset / equal to
  `PLACEHOLDER_CONFIGURE_IN_SETTINGS` → **503** (`ServiceUnconfiguredError`), zero `Order` rows,
  and the response does not leak a stack trace. [API-175] Rate limit: 6th call in the window → 429
  with `Retry-After` and no Stripe call. [API-176] The Stripe secret key never appears in any
  response body or log line emitted during the call.

### `POST /api/webhooks/stripe`  *(raw body, no auth, no CSRF)*
- **Happy path**: [API-177] Valid `checkout.session.completed` signed with the configured signing
  secret → 200; exactly one `Order` row is created with non-null `orderNumber`,
  `confirmationNumber`, `stripeSessionId` and `stripePaymentIntentId`, `totalCents` equal to
  quote total + shipping, and the linked `Quote.status` flips to `ordered`. One `WebhookEvent` row
  exists for the event id.
- **Validation failures**: [API-178] Body that is not valid JSON → 400, zero `Order` rows.
  [API-179] Valid signature but unknown event type (e.g. `invoice.paid`) → 200 and **no** order.
  [API-180] `checkout.session.completed` referencing an unknown quote → 200/400 without creating an
  orphan order, and the failure is logged.
- **Auth failures**: [API-181] **Tampered signature** (body mutated after signing) → **400**, zero
  `Order` rows, `Quote.status` still `draft`, and no `WebhookEvent` row. [API-182] Missing
  `Stripe-Signature` header → 400, zero orders. [API-183] Signature valid for a *different* secret →
  400, zero orders. [API-184] Signature older than the tolerance window (replay) → 400.
- **Idempotency / edge cases**: [API-185] **Duplicate delivery** — post the identical valid event
  twice → both return 200 and **exactly one** `Order` row and one `WebhookEvent` row exist.
  [API-186] Two concurrent deliveries of the same event (fired in parallel) → still exactly one
  `Order` (the `stripeEventId` unique constraint holds under a race, and the loser returns 200, not
  500). [API-187] The handler reads the **raw** body before any JSON middleware — a body with
  insignificant whitespace differences from the signed payload still verifies, proving no re-serialise.
  [API-188] Declined-card flow: no `checkout.session.completed` is delivered → the quote stays
  `draft`, zero orders, and a second checkout session for the same quote succeeds (retryable).

### `GET /trpc/orders.list`
- **Happy path**: [API-189] `USER_A` with 2 orders → 200 with both, newest first, each carrying
  order number, total and status.
- **Validation failures**: [API-190] Negative page → 422.
- **Auth failures**: [API-191] `ANON` → 401.
- **Idempotency / edge cases**: [API-192] `USER_B` sees none of `USER_A`'s orders.
  [API-193] No orders → empty array, not 404.

### `GET /trpc/orders.get`
- **Happy path**: [API-194] Owner → 200 with order number, confirmation number, totals, shipping
  method, shipping address and the linked quote summary.
- **Validation failures**: [API-195] Unknown id → 404.
- **Auth failures**: [API-196] `ANON` → 401. [API-197] `USER_B` → 403/404, no payload leakage.
- **Idempotency / edge cases**: [API-198] Response contains no Stripe secret material (only the
  session/payment-intent identifiers).

### `GET /trpc/orders.getBySession`
- **Happy path**: [API-199] After the webhook lands, owner queries by `stripeSessionId` → 200 with
  the order.
- **Validation failures**: [API-200] Missing session id → 422.
- **Auth failures**: [API-201] `ANON` → 401. [API-202] `USER_B` querying `USER_A`'s session id →
  403/404 (session ids must not be an enumeration oracle).
- **Idempotency / edge cases**: [API-203] **Before** the webhook arrives → **404** (not 500, not an
  empty 200), so the return page can poll. [API-204] Polling 5× before and once after the webhook →
  the first 5 are 404 and the 6th is 200 with the order.

---

### `admin.materials.*` (`list` / `create` / `update` / `delete`)
- **Happy path**: [API-205] `list` as `ADMIN` → 200 including **inactive** `M3` (unlike the public
  `materials.list`). [API-206] `create` `{name:"Copper 1mm", thicknessMm:1, sheetWidthMm:1000,
  sheetHeightMm:2000, costMultiplier:2.0}` → 200, row persisted, and it appears in the public
  `materials.list`. [API-207] `update` setting `isActive=false` → the material disappears from the
  public list. [API-208] `delete` → 200 and the row is gone (or soft-deleted, consistently).
- **Validation failures**: [API-209] `create` with a negative `thicknessMm` → 422. [API-210] `create`
  with `costMultiplier <= 0` → 422. [API-211] `create` with a missing `name` → 422. [API-212]
  `update`/`delete` with an unknown id → 404.
- **Auth failures**: [API-213] Each of the four procedures: `ANON` → **401**. [API-214] Each as
  `USER` → **403**. [API-215] Each as `MANAGER` → **403** (`MANAGER` has no product behaviour).
  [API-216] Each as `ADMIN` → 200. Assert 401 is returned *before* 403 (an anonymous request never
  yields 403).
- **Idempotency / edge cases**: [API-217] `delete` of a material referenced by an existing quote does
  **not** break that quote — re-reading the quote still returns its stored breakdown and total.

### `admin.shipping.*` (`list` / `create` / `update` / `delete`)
- **Happy path**: [API-218] `create` `{name:"Express", rateType:"flat", rateCents:2500,
  estDeliveryDays:2}` → 200 and it appears in `shipping.list` with cost 2500. [API-219] `update` to
  `rateType:"perSheet", rateCents:400` → `shipping.list` for a 3-sheet quote shows 1200.
  [API-220] `delete` → removed from `shipping.list`.
- **Validation failures**: [API-221] `rateType:"weight"` (not `flat`|`perSheet`) → 422.
  [API-222] Negative `rateCents` → 422. [API-223] Non-integer `rateCents` → 422.
  [API-224] Negative `estDeliveryDays` → 422. [API-225] Unknown id on update/delete → 404.
- **Auth failures**: [API-226] All four: `ANON` → 401, `USER` → 403, `MANAGER` → 403, `ADMIN` → 200.
- **Idempotency / edge cases**: [API-227] Deactivating the **last** active method makes
  `shipping.list` return 409 (ties to [API-161]).

### `admin.pricing.get` / `admin.pricing.patch`
- **Happy path**: [API-228] `get` as `ADMIN` → 200 with all eight fields. [API-229] `patch`
  `{setupFeeCents: 9999}` → 200; `get` reflects 9999; other fields unchanged (partial update).
- **Validation failures**: [API-230] Negative `setupFeeCents` → 422. [API-231] Non-integer
  `costPerLinearFootCents` (e.g. `2.5`) → 422 (money is integer cents). [API-232] `qtyMin > qtyMax` →
  422. [API-233] `qtyMin = 0` → 422. [API-234] Unknown field in the patch body → 422 or ignored,
  consistently — assert it is never persisted.
- **Auth failures**: [API-235] `get` and `patch`: `ANON` → 401, `USER` → 403, `MANAGER` → 403,
  `ADMIN` → 200.
- **Idempotency / edge cases**: [API-236] Patching the same value twice is a no-op with a stable
  result. [API-237] Only one `PricingSettings` row ever exists (`id="singleton"`) — patch never
  inserts a second row.

### `admin.machine.get` / `admin.machine.patch`
- **Happy path**: [API-238] `get` → 200 with spacing, margin, allowed extensions, max upload bytes,
  animation speed. [API-239] `patch` `{allowedExtensions:[".dxf",".dwg"]}` → a `.dwg` upload is then
  accepted by extension validation (it may still 422 at parse). [API-240] `patch`
  `{maxUploadBytes: 1024}` → a 2 KB upload now → 413/422.
- **Validation failures**: [API-241] Negative `sheetMarginMm` → 422. [API-242] `sheetMarginMm` so
  large that usable area ≤ 0 → 422. [API-243] `maxUploadBytes = 0` or negative → 422.
  [API-244] `animationSpeed <= 0` → 422. [API-245] `allowedExtensions` as a bare string rather than
  an array → 422.
- **Auth failures**: [API-246] `get`/`patch`: `ANON` → 401, `USER` → 403, `MANAGER` → 403,
  `ADMIN` → 200.
- **Idempotency / edge cases**: [API-247] Single singleton row invariant, as [API-237].
  [API-248] Changing spacing/margin does **not** alter any previously issued quote's `sheetCount`.

### `admin.business.get` / `admin.business.patch`
- **Happy path**: [API-249] `patch` company name, logo URL, `primaryColor="#0055ff"`,
  `accentColor="#ff7700"` and contact fields → 200; `get` returns them verbatim and the SPA bootstrap
  read reflects them. [API-250] `patch` `{stripeSecretKey:"sk_test_ABCD1234EFGH5678"}` → 200; the
  stored `stripeSecretKeyEnc` is **not** the plaintext (assert the plaintext substring is absent from
  the column) and decrypts back to the original.
- **Validation failures**: [API-251] `primaryColor="notacolor"` → 422. [API-252] Malformed contact
  email → 422. [API-253] Empty-string company name → 422.
- **Auth failures**: [API-254] `get`/`patch`: `ANON` → 401, `USER` → 403, `MANAGER` → 403,
  `ADMIN` → 200. [API-255] A `USER` cannot read Stripe key material by any of these routes (403,
  empty body).
- **Idempotency / edge cases**: [API-256] **Write-only credentials** — `get` returns the Stripe
  secret and webhook secret as `••••5678` (mask + last 4) and **never** the plaintext or the
  ciphertext. [API-257] Patching with the masked value `••••5678` does **not** overwrite the stored
  secret with the mask (round-tripping the GET payload back through PATCH is safe).
  [API-258] Omitting `stripeSecretKey` from the patch leaves the existing secret intact.
  [API-259] Re-entering a new key replaces the old one and updates `stripeSecretLast4`.
  [API-260] With a wrong/rotated `APP_ENCRYPTION_KEY`, decryption fails cleanly → dependent checkout
  returns 503 (not 500), and an admin re-entering the key restores function.

### `GET /api/admin/settings` / `PATCH /api/admin/settings`
- **Happy path**: [API-261] `GET` as `ADMIN` → 200 listing every service key (`postgresql`, `minio`)
  and every integration key (`MINIO_S3_BOTO3_API_KEY`, `REDIS_API_KEY`, `RESEND_API_API_KEY`,
  `STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY`), each with a masked value and a
  configured/unconfigured flag. [API-262] `PATCH {RESEND_API_API_KEY:"re_live_xyz"}` → 200; the
  `SystemSetting` row is upserted and `GET` now flags it configured.
- **Validation failures**: [API-263] `PATCH` with an unknown key → 422 (no arbitrary key injection).
  [API-264] `PATCH` with a non-string value → 422. [API-265] `PATCH` with an empty body → 422 or a
  200 no-op, consistently.
- **Auth failures**: [API-266] `GET`/`PATCH`: `ANON` → **401**, `USER` → **403**, `MANAGER` → **403**,
  `ADMIN` → 200.
- **Idempotency / edge cases**: [API-267] `GET` never returns a full credential in plaintext, for any
  key, including immediately after the `PATCH` that set it. [API-268] **`resolveConfig` precedence** —
  with the env var set to a real value, that value wins over the `SystemSetting` row.
  [API-269] With the env var absent, the `SystemSetting` row is used. [API-270] With the env var
  equal to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, it is treated as absent and the `SystemSetting` row
  is used. [API-271] With neither set, the dependent route returns **503**, and setting the value via
  `PATCH` makes the same route succeed **without a restart**. [API-272] Repeat [API-271] once per
  integration (MinIO → `POST /api/drawings`; Redis → any rate-limited route; Resend → order
  confirmation still 200 with `EmailLog` failure; Stripe → checkout session 503).

---

## UI / journey tests

Every journey is driven by stable `data-testid` attributes; each testid named below must exist in the
component **and** be registered in `.pipeline/surface.json`. Journeys run against a seeded database
and stubbed Stripe/Resend.

### Journey: Signup and first-user admin bootstrap
- **Steps**: On an empty user table, navigate to `/signup` → fill `signup-email`
  (`owner@t.io`) and `signup-password` (`Passw0rd!23`) → click `signup-submit`. Then log out via
  `user-menu` → `logout-button`, and repeat the signup at `/signup` as `cust@t.io`.
- **Expected outcomes**: The first signup lands on `/quotes` (not `/login`), the header shows the
  company name from business settings, and `admin-nav` **is visible**. The second account also lands
  on `/quotes` but `admin-nav` is **absent**. `auth.me` reports `ADMIN` then `USER` respectively.
- **Negative path**: Signing up with `owner@t.io` again shows an inline "email already registered"
  error next to `signup-email` (from the 409), stays on `/signup`, and does not clear the password
  field into a submitted state. Submitting a malformed email shows inline validation and never fires
  a network request. Password shorter than the minimum shows an inline length error.

### Journey: Login, session refresh, and logout
- **Steps**: Navigate to `/login` → enter valid credentials → `login-submit`. Then let the access
  token expire (fast-forward or seed a 15-min-expired token) and click through to `/orders`.
  Finally open `user-menu` → `logout-button`.
- **Expected outcomes**: Login redirects to `/quotes`, or to the `returnUrl` when one was preserved
  by `authGuard`. On the expired-token navigation, the interceptor performs **exactly one**
  `auth.refresh` (assert one refresh request, not a loop) and **replays** the original request, so
  `/orders` renders its data without the user seeing `/login`. Logout clears stored tokens, redirects
  to `/login`, and a browser Back press does not restore an authenticated page.
- **Negative path**: Wrong password shows a **generic** credential error (identical text to an
  unknown email) via `login-error`, and stays on `/login`. If the refresh itself 401s, the
  interceptor does **not** retry a second time, clears the session and redirects to `/login` with the
  attempted URL preserved as the return URL.

### Journey: New-quote wizard — upload step
- **Steps**: As `USER_A`, navigate to `/quotes` → click `new-quote-button` → land on
  `/quotes/new/upload` → choose `square.dxf` via `upload-file-input` → observe `upload-progress` →
  wait for `geometry-summary`.
- **Expected outcomes**: URL is `/quotes/new/upload`; `geometry-summary` shows entity count 4, cut
  length 400 mm and bbox 100×100 mm (the drawing-hygiene sanity check from the spec's risk section);
  `wizard-next` becomes enabled and advances to `/quotes/new/material`.
- **Negative path**: Selecting `corrupt.dxf` renders `upload-error` containing the parser's message,
  leaves `wizard-next` disabled, and does not advance the URL. Selecting a `.stp` file shows a
  client-side extension hint **and**, if submitted, surfaces the 422 without a partial upload.
  A file over `maxUploadBytes` shows a size hint before any request is sent.

### Journey: New-quote wizard — material, quantity, review, issue
- **Steps**: From `/quotes/new/material`, open `material-select` → choose "Mild Steel 1.5mm" → type
  `10` into `quantity-input` → `wizard-next` → `/quotes/new/bends` → `wizard-next` →
  `/quotes/new/review` → inspect `price-breakdown` and `nested-preview` → click `issue-quote-button`.
- **Expected outcomes**: `material-select` lists only **active** materials (no "Retired Brass").
  The review step shows sheet count 1, a utilisation figure, and an itemised breakdown whose line
  items sum to the displayed total (10981 cents → "$109.81"). Issuing navigates to `/quotes/:id` and
  the quote appears at the top of `/quotes`.
- **Negative path**: `quantity=0` shows an inline error naming the minimum and blocks `wizard-next`.
  `quantity=1001` surfaces the server 422 text including `1000`. If a material is deactivated by an
  admin between the material step and issuing, `issue-quote-button` surfaces the 422 inline rather
  than navigating. Hitting the rate limit shows a 429 message with the retry delay, and no quote is
  created.

### Journey: Wizard state restoration from the URL
- **Steps**: Complete the upload step, navigate to `/quotes/new/bends`, then **hard-reload** the
  browser. Separately, deep-link straight to `/quotes/new/review?drawingId=…&materialId=…&qty=10`
  in a fresh tab. Then use browser Back/Forward across all four steps.
- **Expected outcomes**: After the hard reload the wizard is still on the bends step with the parsed
  geometry and prior selections rehydrated from the route/query params — **not** reset to `upload`
  and **not** redirected. Deep-linking to `review` renders the priced review directly. Back/Forward
  moves between steps and each step re-derives its state from the URL (no state held only in the
  parent shell component).
- **Negative path**: Deep-linking to `/quotes/new/review` with a missing or foreign `drawingId`
  redirects to `/quotes/new/upload` with an explanatory message rather than rendering a broken
  review or throwing.

### Journey: Bend editor
- **Steps**: On `/quotes/new/bends` (or the drawing's bend mode), click `bend-mode-toggle` →
  click-drag across the part on `bend-editor-canvas` → set `bend-angle-input` to `90` and
  `bend-direction-select` to `up` → `bend-save-button`. Then select the bend, drag to move it,
  rotate it, and click `bend-delete-button`.
- **Expected outcomes**: Each drag creates one entry in `bend-list`; the canvas renders the bend as
  an **orange dashed** line distinct from the blue solid cut path. Each mutation issues the matching
  bends API call and the list re-renders from the server response. Deleting removes it from both the
  list and the canvas. The bend count carries into the quote's price (`+75` cents per bend).
- **Negative path**: Entering `181` in `bend-angle-input` shows a client-side validation error and
  does **not** call the API; forcing the value past the client check surfaces the server 422 and
  leaves `bend-list` unchanged. A zero-length drag (click without drag) creates no bend.

### Journey: Quote detail, work bed, and laser animation
- **Steps**: Open `/quotes/:id`. Observe `workbed-canvas` and the auto-started animation. Click
  `print-bed-button` once, then again. Resize the browser window to a narrow and then a wide
  viewport. Append `?panel=breakdown` and reload; append `?modal=share` and reload.
- **Expected outcomes**: The canvas draws bed → sheet → nested placements → **blue solid** cut paths
  → **orange dashed** bend lines → labels. The laser animation **auto-starts** on load. First
  `print-bed-button` press (while running) **stops and resets to frame 0** — assert the rendered
  progress returns to 0, not merely pauses — and the button label reflects the stopped state; the
  second press starts it again from 0. On resize, the drawing is not clipped (the full sheet bounds
  stay inside the canvas), the aspect ratio is preserved (uniform scale — a square part stays
  square), and the backing store is `devicePixelRatio`-scaled so lines are not blurry.
  `?panel=breakdown` renders the breakdown panel on a fresh load; `?modal=share` opens the modal on a
  fresh load — both driven from the URL, not from click state.
- **Negative path**: Navigating away from `/quotes/:id` cancels the `requestAnimationFrame` handle
  (assert no further frame callbacks fire after `ngOnDestroy`, and no console errors). A quote whose
  drawing has zero bends renders the work bed with cut paths only, no crash. An unknown quote id
  renders a not-found view, not a blank canvas.

### Journey: Checkout — review and shipping
- **Steps**: From `/quotes/:id`, click `checkout-button` → `/checkout/:quoteId/review` → confirm the
  summary → `/checkout/:quoteId/shipping` → pick `shipping-option-S2` → fill `shipping-address-form`
  → click `pay-button`.
- **Expected outcomes**: The review page shows material, quantity and the quote's stored total.
  The shipping page lists active methods with **computed** costs (flat 1500; per-sheet 900 × sheet
  count) and estimated delivery days, and the running total updates when the selection changes.
  `pay-button` creates a Checkout Session and redirects the browser to the Stripe-hosted URL.
- **Negative path**: With **no active shipping methods**, the shipping page renders a blocking
  message telling the customer to contact the company (from the 409) and `pay-button` is disabled —
  checkout cannot proceed. An incomplete address blocks submission with inline field errors. If the
  session call returns 503, an error banner says payment could not be processed, the user stays on
  the page, and re-clicking `pay-button` after the stub recovers succeeds.

### Journey: Payment return — polling while the webhook is in flight
- **Steps**: Land on `/checkout/:quoteId/return?session_id=cs_test_123` **before** the webhook has
  been delivered. Observe the confirming state. Then deliver the webhook and let the poll continue.
- **Expected outcomes**: The page shows a "confirming payment" state (`payment-confirming`) while
  `orders.getBySession` 404s, polls with backoff rather than in a tight loop (assert the interval
  grows), and on the first successful poll navigates to `/orders/:id/confirmation` showing the order
  number and confirmation number. This is the ordering risk called out in the spec — the page must
  never assume the order already exists.
- **Negative path**: If the webhook never arrives, polling stops after a bounded number of attempts
  and shows a retry path (`payment-retry-button`) plus support guidance, rather than spinning
  forever. Cancelling at Stripe returns to `cancel_url`, leaves the quote `draft`, and the quote is
  still checkout-able.

### Journey: Order confirmation and order history
- **Steps**: After a successful webhook, view `/orders/:id/confirmation`, then navigate to `/orders`,
  then hard-reload the confirmation URL directly.
- **Expected outcomes**: The confirmation page shows order number, confirmation number, itemised
  totals including shipping, and the shipping address. `/orders` lists the order. The confirmation
  URL renders identically on a fresh deep-linked load.
- **Negative path**: With Resend stubbed to **throw**, the confirmation page still renders 200 with
  the order (email failure never surfaces as a broken order); an `EmailLog` row records the failure.
  `USER_B` deep-linking to `USER_A`'s confirmation URL sees a not-authorised/not-found view, never
  the order details.

### Journey: Admin — materials, pricing, machine
- **Steps**: As `ADMIN`, open `/admin/materials` → click `material-create-button` → fill the modal →
  save. Deep-link to `/admin/materials?status=inactive&modal=edit&id=<M3>`. Then open `/admin/pricing`
  and `/admin/machine`, change a field on each and save.
- **Expected outcomes**: The admin material list shows inactive materials too, and `?status=` filters
  it. The deep-linked URL **opens the edit modal for M3 on a fresh load** (modal state derives from
  the URL). Saving a material immediately changes the customer-facing `material-select`. Pricing and
  machine forms are reactive forms pre-populated from the settings endpoints; saving persists and
  a reload shows the new values.
- **Negative path**: Submitting a negative `costMultiplier` shows inline validation and the server
  422 message; the list is unchanged. Deactivating a material used by an existing quote does not
  alter that quote's stored total when re-opened.

### Journey: Admin — business settings, branding, and write-only Stripe keys
- **Steps**: As `ADMIN`, visit `/admin/business/branding` → set company name, logo, `--primary` and
  `--accent` colours → save → navigate to a customer page. Then `/admin/business/contact`,
  `/admin/business/payment` (enter a Stripe secret key and webhook secret, save, then reload), and
  `/admin/business/shipping` (create/edit/deactivate a method).
- **Expected outcomes**: Branding applies at bootstrap — the computed `--primary` / `--accent` CSS
  custom properties and the company name/logo appear across customer-facing pages, not just admin.
  After saving Stripe keys and reloading, `/admin/business/payment` shows `••••5678` — never the
  plaintext — and re-saving the form **without retyping** the key does not clobber the stored secret.
  Shipping CRUD changes are reflected on the customer checkout shipping step.
- **Negative path**: An invalid colour value shows inline validation. Deactivating the last active
  shipping method causes the customer shipping step to show the blocking "contact the company"
  message.

### Journey: Admin — integration settings and unconfigured banner
- **Steps**: As `ADMIN`, open `/admin/settings` with all integration keys unset. Enter a value for
  one integration and save. Exercise the dependent customer flow.
- **Expected outcomes**: One row per provisioned service (`postgresql`, `minio`) and per integration
  (MinIO / S3 (boto3), Redis, Resend API, Stripe SDK (Python) + Stripe Checkout Sessions), each with
  a configured/unconfigured badge and a credential form. The banner reads exactly: "The following
  need credentials to activate: Stripe SDK (Python) + Stripe Checkout Sessions, Resend API,
  MinIO / S3 (boto3), Redis." Saving a credential flips that row's badge to configured, removes it
  from the banner, and the dependent flow stops returning 503 **without a restart**.
- **Negative path**: A `USER` navigating to `/admin/settings` sees the 403 view. Saved credentials
  are re-displayed masked after reload, never in plaintext.

### Journey: Route guards and deep linking across the whole route table
- **Steps**: For **every** route in the Surface contract — `/login`, `/signup`, `/quotes`,
  `/quotes/new/upload`, `/quotes/new/material`, `/quotes/new/bends`, `/quotes/new/review`,
  `/quotes/:id`, `/checkout/:quoteId/review`, `/checkout/:quoteId/shipping`,
  `/checkout/:quoteId/return`, `/orders`, `/orders/:id/confirmation`, `/account`,
  `/admin/materials`, `/admin/pricing`, `/admin/machine`, `/admin/settings`,
  `/admin/business/branding`, `/admin/business/contact`, `/admin/business/payment`,
  `/admin/business/shipping` — perform a **fresh page load** (not an in-app navigation) as the
  appropriate actor, under the deployed `baseHref`.
- **Expected outcomes**: Each route renders its own component with no unexpected redirect and no
  404 from the static server (nginx SPA fallback serves `index.html` for unknown paths). Every route
  carries its `data.flow` metadata. `app-ready` is present on each load. Query-param-driven routes
  (`/quotes?status=&sort=&page=`, `/admin/materials?status=&modal=edit&id=`, `/quotes/:id?panel=`)
  restore their full state from the URL alone.
- **Negative path**: `ANON` deep-linking any `[authGuard]` route redirects to `/login` with the
  return URL preserved, and completing login lands on the originally requested route. `USER_A`
  deep-linking any `/admin/**` route renders a **403 view** (per the spec: the admin guard renders
  403, it does not silently redirect). The scaffold stub must be gone — assert the rendered app
  contains none of the acceptance-gate reject signatures (`home-title">Users<`, `Loading...`,
  `Failed to load users.`).

### Journey: End-to-end happy path
- **Steps**: Fresh database → signup → upload `square.dxf` → add one bend (90°, up) → select
  "Mild Steel 1.5mm" and quantity 10 → issue the quote → open the quote detail and watch the laser
  animation → checkout review → select "Standard" shipping and enter an address → create a Checkout
  Session (Stripe stubbed) → deliver the `checkout.session.completed` webhook → return page polls →
  confirmation page.
- **Expected outcomes**: A single coherent chain: exactly one `Drawing`, one `BendLine`, one `Quote`
  (`totalCents = 11131` = 10981 + one bend at 75… recompute from the fixture constants and assert the
  exact value), one `Order` with `totalCents = quote.totalCents + 1500` shipping, unique
  `orderNumber` and `confirmationNumber`, `Quote.status = "ordered"`, one `WebhookEvent`, and one
  `EmailLog` row. The confirmation page displays both numbers.
- **Negative path**: Re-delivering the same webhook at the end leaves exactly one order and the
  confirmation page unchanged. Running the whole chain a second time for the same user produces a
  second independent quote and order with different numbers.

## Data integrity tests
- [DATA-001] **Money is always integer cents.** After every mutation, assert no money column
  (`totalCents`, `rateCents`, `shippingCostCents`, all `*Cents` settings fields, every
  `breakdownJson` line item) holds a non-integer or a float-typed value.
- [DATA-002] **Rounding happens once.** For a quote whose exact subtotal is `10980.8398…` cents, the
  stored total is `10981` — not the sum of individually rounded line items. Assert the breakdown's
  line items and the stored total are mutually consistent under the documented rule.
- [DATA-003] **Pricing snapshot immutability.** Editing `PricingSettings` after a quote is issued
  leaves that quote's `totalCents`, `breakdownJson` and `pricingSnapshotJson` byte-identical.
  Same for `MachineSettings` edits and the quote's `sheetCount` / `nestingJson`.
- [DATA-004] **Minimum order floor.** With `setupFeeCents=0`, `handlingFeeCents=0`,
  `perSheetCostCents=0` and `minimumOrderCents=7500`, a quote whose computed subtotal is 328 cents
  stores exactly `7500`, and the breakdown records the minimum-order adjustment explicitly rather
  than silently rewriting a line item.
- [DATA-005] **Nesting arithmetic.** Part exactly equal to the usable area (1200×2420 on a
  1220×2440 sheet with margin 10) → `perSheet = 1`. Part 1 mm oversize (1201×2420) → `PartTooLargeError`
  → 422 and **no** `Quote` row. Part 600×1200, qty 5 → `perSheet = 2`, `sheets = 3`,
  `utilization ≈ 0.40312`. `utilization` is always in `(0, 1]`.
- [DATA-006] **Nesting placements are real.** `nestingJson` contains exactly `min(qty, perSheet ×
  sheets)` placements, each with a `sheet` index in `[1, sheets]`, top-left origin coordinates, and
  no two placements on the same sheet overlapping once `spacing` is accounted for; every placement
  lies inside the margin-inset usable area.
- [DATA-007] **DXF cut-length fidelity.** 100 mm square → exactly 400 mm; r=50 circle → 314.159265 mm
  (±1e-3); a `bulge=1` LWPOLYLINE segment on a 100 mm chord → 157.079633 mm (±1e-3, equal to its
  semicircle); a `bulge=0` segment equals the straight chord length. `entityCount` matches the number
  of supported modelspace entities.
- [DATA-008] **Refresh-token chain.** After N rotations, exactly one `RefreshToken` row for the chain
  has `revokedAt = null`; every earlier `jti` is revoked; no `jti` is ever reused; `jti` is unique
  across the table.
- [DATA-009] **Webhook idempotency.** `WebhookEvent.stripeEventId` is unique; after any number of
  redeliveries of one event, `Order` count for that quote is exactly 1 and `Quote.status = "ordered"`.
- [DATA-010] **Order uniqueness.** `orderNumber`, `confirmationNumber`, `stripeSessionId` and
  `quoteId` are each unique across `Order`; creating 50 orders concurrently yields 50 distinct
  order and confirmation numbers with no collisions.
- [DATA-011] **No partial orders.** After any failed checkout path (503 from Stripe, unconfigured
  credential, tampered signature, rate limit), `Order`, `EmailLog` and `WebhookEvent` row counts are
  unchanged and the quote is still `draft`.
- [DATA-012] **Email never breaks the order.** With Resend throwing, the `Order` row exists, the
  confirmation endpoint returns 200, and exactly one `EmailLog` row records status=failed with the
  error text and an attempt count ≥ 1. No exception propagates to the webhook response (still 200).
- [DATA-013] **Ownership scoping.** For every owner-scoped entity (`Drawing`, `BendLine`, `Quote`,
  `Order`), a cross-user read or write attempt neither returns data nor mutates a row.
- [DATA-014] **Credential storage.** `stripeSecretKeyEnc` and `stripeWebhookSecretEnc` never contain
  the plaintext key as a substring; `stripeSecretLast4` matches the plaintext's last 4 characters;
  no credential plaintext appears in any API response, log line, or the `SystemSetting` GET payload.
- [DATA-015] **Settings singletons.** `PricingSettings`, `MachineSettings` and `BusinessSettings` each
  hold exactly one row (`id = "singleton"`) after any number of patches; the seed is idempotent
  (running it twice leaves row counts and values unchanged and does not disturb `ColossusAccount`).
- [DATA-016] **Cascade integrity.** Deleting a `Drawing` removes its `BendLine` rows and leaves no
  orphans; a `Quote` referencing a deleted material still reads back its stored snapshot values.
- [DATA-017] **Rate-limit counters.** The Redis fixed-window key is scoped by `userId || clientIp`
  plus bucket — `USER_B` is not throttled by `USER_A`'s usage, and the counter resets after the
  window so the next request succeeds.

## Out of scope
- **The spec's FastAPI/Python backend** (`app/main.py`, SQLAlchemy models, Alembic migrations,
  `ezdxf`, `argon2-cffi`, Fernet) — the repository is the platform-fixed NestJS/Prisma/tRPC scaffold
  and `tasks.md` targets it. Behaviour is tested; the Python module layout is not. If the stack
  question in `tasks.md` is resolved toward FastAPI, this section must be revisited.
- **The spec's single-container `Dockerfile`, `docker-compose.yml` and `k8s/*.yaml`**, including the
  `COPY --from=web /web/dist/cnc-quick-quote/browser` static-path assertion and the FastAPI SPA
  catch-all. The scaffold owns deployment via `colossus.yaml` (nginx `spa-fallback`, Angular output
  `dist/frontend/browser`, separate backend image). The equivalent behaviour — deep links resolving
  on a fresh load — **is** covered by the guards-and-deep-linking journey.
- **Real Stripe, Resend and MinIO network calls.** All three are stubbed. Live-key smoke tests
  against real providers, Stripe's hosted card form itself, and real card decline codes are not
  under test; the declined-card *outcome* (no webhook → quote retryable) is.
- **The 60 FPS animation performance target.** The spec's risk note requires pre-tessellating the cut
  path once; correctness (auto-start, stop-and-reset, rAF cancellation, no clipping) is covered, but
  frame-rate benchmarking is not, being environment-dependent in CI. The structural proxy — that
  tessellation runs once per path rather than per frame — should be asserted by the unit test suite
  if the implementation exposes a seam.
- **`MANAGER` role product behaviour.** `tasks.md` leaves it unused; it is tested only as a
  negative (403 on every admin surface), never as a positive capability.
- **Order/confirmation number formats.** The spec does not define them; only uniqueness,
  non-nullness and display are asserted, not any pattern.
- **Default values for unspecified numbers** (pricing rates, `qtyMin`/`qtyMax`, spacing, margin,
  `maxUploadBytes`, `animationSpeed`). The spec is silent, so tests pin the *fixture* constants above
  and assert behaviour relative to them, never a particular seeded default.
- **Irregular-part nesting efficiency.** Axis-aligned bounding-box row/column packing is accepted per
  the spec; no test asserts a better packing for non-rectangular parts.
- **Accessibility, i18n, and cross-browser matrix.** Not described in the spec; journeys run on a
  single browser engine.
- **`APP_ENCRYPTION_KEY` loss recovery beyond re-entry.** [API-260] covers clean 503 plus admin
  re-entry; key-management/rotation procedure and k8s secret provisioning are not under test.
