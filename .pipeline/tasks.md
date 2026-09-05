# Pipeline Task Decomposition

## Summary
CNC Quick Quote is a self-serve sheet-metal quoting app. A signed-in customer uploads a DXF drawing, the server parses it into geometry (cut length, bounding box, entity count), the customer optionally draws bend lines on the parsed part, picks a material and quantity, and the system nests the part on sheets, prices the job from admin-controlled pricing settings, and issues an immutable quote with a stored pricing snapshot. The quote can be taken through checkout (shipping method selection + Stripe Checkout Session), and a Stripe webhook idempotently creates the order, assigns order/confirmation numbers, and fires a Resend confirmation email that can never fail the order. The customer sees the nested sheet and an animated laser cut path on a canvas work bed. Admins manage materials, pricing, machine limits, shipping methods, business/branding settings, and backing-service credentials from an `/admin` section. Built on the scaffolded stack: Angular 19 SPA + NestJS/tRPC backend + Prisma/PostgreSQL, with MinIO object storage and Redis for rate limiting and refresh-token revocation.

## Surface contract

### Entities (Prisma models)
`User` (exists — extend), `ColossusAccount` (exists — do not modify), `SystemSetting`, `RefreshToken`, `Material`, `Drawing`, `BendLine`, `Quote`, `PricingSettings`, `MachineSettings`, `BusinessSettings`, `ShippingMethod`, `Order`, `WebhookEvent`, `EmailLog`.

### Backend API (tRPC procedures under `/trpc/*`, REST controllers where noted)
Auth
- `auth.signup` — email + password; first ever user → `ADMIN`, all later → `USER`; 409 on duplicate email
- `auth.login` — identical error text/timing for unknown email and bad password (401)
- `auth.refresh` — rotate: revoke old `jti`, mint new pair; 401 on expired/revoked/unknown
- `auth.logout` — set `revokedAt` on the presented refresh `jti`
- `auth.me`

Drawings & bends
- `POST /api/drawings` (REST controller — multipart upload, auth + rate limited): validate extension against `MachineSettings.allowedExtensions` and size against `maxUploadBytes` **before** any storage write; parse; store object then row; returns geometry summary
- `drawings.list`, `drawings.get` (owner-scoped)
- `GET /api/drawings/:id/file` — presigned MinIO URL redirect (owner-scoped)
- `bends.create`, `bends.update`, `bends.delete` — owner-scoped via drawing; `0 <= angleDeg <= 180`, `direction ∈ {up,down}`, else 422

Materials & quotes
- `materials.list` — `isActive = true` only
- `quotes.create` (auth, rate limited), `quotes.list` (status/sort/page), `quotes.get` (owner-scoped)

Checkout & orders
- `checkout.review` — material, quantity, total for a quote
- `shipping.list` — active methods with computed cost (`flat` = rate, `perSheet` = rate × `quote.sheetCount`); 409 "contact the company" when none active
- `POST /api/checkout/:quoteId/session` (REST controller — rate limited) → Stripe Checkout Session with SPA `success_url`/`cancel_url`; 503 on Stripe connection error/timeout with **zero** partial order rows
- `POST /api/webhooks/stripe` (REST controller — raw body, no auth, no CSRF)
- `orders.list`, `orders.get`, `orders.getBySession` (polled by the return page)

Admin (all `ADMIN`-guarded)
- `admin.materials.*` (CRUD), `admin.shipping.*` (CRUD)
- `admin.pricing.get/patch`, `admin.machine.get/patch`, `admin.business.get/patch` (Stripe keys write-only; reads return `••••last4`)
- `GET /api/admin/settings`, `PATCH /api/admin/settings` (REST controllers — service + integration credentials)

Health
- `GET /health` (exists — keep), `GET /health/deep` — Postgres `SELECT 1`, Redis `PING`, MinIO `headBucket`

### Angular routes (each with `data: { flow: ... }`)
- public: `/login`, `/signup`
- `[authGuard]`: `/quotes` (`?status=&sort=&page=`), `/quotes/new` shell with child routes `upload` | `material` | `bends` | `review`, `/quotes/:id` (`?panel=breakdown`, `?modal=`), `/checkout/:quoteId/review`, `/checkout/:quoteId/shipping`, `/checkout/:quoteId/return`, `/orders`, `/orders/:id/confirmation`, `/account`
- `[authGuard, adminGuard]`: `/admin/materials` (`?status=&modal=edit&id=`), `/admin/pricing`, `/admin/machine`, `/admin/settings`, `/admin/business/branding`, `/admin/business/contact`, `/admin/business/payment`, `/admin/business/shipping`
- Wizard and list state is always restored from the URL, never held only in a parent component.

### Shared UI
`workbed-canvas` (bed → sheet → nested placements → blue solid cut paths → orange dashed bend lines → labels), `laser-animation` (rAF along a pre-tessellated flat point array), `bend-editor-canvas`.

## db_agent tasks
- [ ] Extend `User` in `backend/prisma/schema.prisma`: keep existing `role Role @default(USER)` and the existing `enum Role { USER MANAGER ADMIN }` (contract-owned — do not rename or drop `MANAGER`); the spec's "customer" role maps to `USER`. Add relations to `Drawing`, `Quote`, `Order`, `RefreshToken`.
- [ ] Add `RefreshToken` model: `jti String @unique`, `userId`, `expiresAt DateTime`, `revokedAt DateTime?`, `createdAt`, index on `userId`.
- [ ] Add `SystemSetting` model: `key String @id`, `value String`, `updatedAt DateTime @updatedAt`.
- [ ] Add `Material` model: `name`, `thicknessMm Float`, `sheetWidthMm Float`, `sheetHeightMm Float`, `costMultiplier Decimal`, `isActive Boolean @default(true)`, timestamps.
- [ ] Add `Drawing` model: `userId`, `filename`, `objectKey`, `sizeBytes Int`, `geometryJson Json`, `bboxWMm Float`, `bboxHMm Float`, `cutLengthMm Float`, `entityCount Int`, `createdAt`; index on `userId`.
- [ ] Add `BendLine` model: `drawingId`, `startX`, `startY`, `endX`, `endY`, `angleDeg Float`, `direction String`, `createdAt`; cascade delete from `Drawing`.
- [ ] Add `Quote` model: `userId`, `drawingId`, `materialId`, `quantity Int`, `cutLengthMmTotal Float`, `bendCount Int`, `sheetCount Int`, `utilization Float`, `nestingJson Json`, `pricingSnapshotJson Json`, `breakdownJson Json`, `totalCents Int`, `status String @default("draft")`, timestamps; index on `(userId, status)`.
- [ ] Add singleton settings models `PricingSettings` (`setupFeeCents`, `costPerLinearFootCents`, `perSheetCostCents`, `handlingFeeCents`, `costPerBendCents`, `minimumOrderCents`, `qtyMin`, `qtyMax`), `MachineSettings` (`sheetSpacingMm`, `sheetMarginMm`, `allowedExtensions String[]`, `maxUploadBytes Int`, `animationSpeed Float`), `BusinessSettings` (company name/logo/`primaryColor`/`accentColor`, contact fields, encrypted `stripeSecretKeyEnc`, `stripePublishableKey`, `stripeWebhookSecretEnc`, `stripeSecretLast4`) — each with a fixed `id String @id @default("singleton")`.
- [ ] Add `ShippingMethod` model: `name`, `rateType String` (`flat` | `perSheet`), `rateCents Int`, `estDeliveryDays Int`, `isActive Boolean @default(true)`.
- [ ] Add `Order` model: `userId`, `quoteId @unique`, `shippingMethodId`, `shippingCostCents Int`, `shippingAddressJson Json`, `totalCents Int`, `orderNumber @unique`, `confirmationNumber @unique`, `stripeSessionId @unique`, `stripePaymentIntentId String?`, `status String`, timestamps.
- [ ] Add `WebhookEvent` model (`stripeEventId String @unique`, `type`, `receivedAt`) and `EmailLog` model (`orderId`, `status`, `attempts Int @default(0)`, `error String?`, `createdAt`).
- [ ] Store all money as integer cents (`Int`) across every model; never `Float` for money. Document this in a schema comment.
- [ ] Generate and commit the Prisma migration for all new models, then run `npx prisma generate`.
- [ ] Extend `backend/prisma/seed/seed.js`: keep the existing `COLOSSUS_ACCOUNTS_JSON` behaviour untouched, and additionally upsert the three settings singletons with sensible defaults, a starter set of active `Material` rows, and one active flat-rate `ShippingMethod`. Seed must be idempotent.

## backend_agent tasks
- [ ] Add `AuthModule`: bcryptjs hash/verify (matching the seed's `BCRYPT_ROUNDS`), access JWT (15 min) + refresh JWT (30 days) with a `jti` claim persisted to `RefreshToken`.
- [ ] Implement `auth.signup` / `auth.login` / `auth.refresh` / `auth.logout` / `auth.me`: 409 on duplicate email; first user in an empty `User` table gets `ADMIN`, later signups get `USER`; identical error text and timing for unknown email vs. bad password; refresh rotation revokes the old `jti` and 401s on reuse.
- [ ] Add auth plumbing: `currentUser` tRPC middleware/guard (401 when unauthenticated) and `requireAdmin` (403 for `USER`/`MANAGER`) — ordering matters: unauthenticated is always 401 **before** any 403.
- [ ] Add `lib/config.ts` exporting `resolveConfig(key: string): Promise<string | null>` — reads `process.env[key]` first; if the value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, falls back to a `SystemSetting` row keyed by the same name; returns `null` if neither is set. Export `ServiceUnconfiguredError` mapping to HTTP 503.
- [ ] Add `GET /api/admin/settings` (admin) returning every service key (`postgresql`, `minio`) and every integration key — `MINIO_S3_BOTO3_API_KEY`, `REDIS_API_KEY`, `RESEND_API_API_KEY`, `STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY` — with masked values and a configured/unconfigured flag; and `PATCH /api/admin/settings` (admin) upserting key/value pairs into `SystemSetting`.
- [ ] Add `lib/integrations/minio-s3.ts`: `resolveConfig('MINIO_S3_BOTO3_API_KEY')` (plus endpoint/bucket config), throws `ServiceUnconfiguredError` when unset/placeholder; exports `ensureBucket()`, `putObject(key, body, contentType)`, `presignedGet(key, ttl)`.
- [ ] Add `lib/integrations/redis.ts`: `resolveConfig('REDIS_API_KEY')` + URL, throws `ServiceUnconfiguredError` when unset/placeholder; exports `incrWindow(key, windowSec)`, `get`, `set`, `del` used by rate limiting and refresh-token revocation cache.
- [ ] Add `lib/integrations/resend-api.ts`: `resolveConfig('RESEND_API_API_KEY')`, throws `ServiceUnconfiguredError` when unset/placeholder; exports `sendOrderConfirmation(order, to)` only.
- [ ] Add `lib/integrations/stripe-sdk.ts`: `resolveConfig('STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY')` falling back to the admin-managed encrypted key in `BusinessSettings`; throws `ServiceUnconfiguredError` when unset/placeholder; exports `createCheckoutSession({quote, shipping, successUrl, cancelUrl})` and `constructWebhookEvent(rawBody, signature, secret)`.
- [ ] Add `services/crypto.ts`: AES-256-GCM (node:crypto) encrypt/decrypt keyed on `APP_ENCRYPTION_KEY`, plus `maskLast4(value)` for read-back of Stripe credentials.
- [ ] Add `services/dxf-parser.ts`: `parse(buffer) -> ParsedGeometry`. Iterate modelspace entities LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE. Cut length: line = point distance; arc = `radius * sweepRadians`; circle = `2πr`; LWPOLYLINE segments expand bulges into arcs (`bulge → arc` conversion) and are straight when `bulge == 0`. Accumulate bbox and entity count. Throw `DxfParseError` (→ 422 with the parse message) when zero supported entities are found or the parse fails.
- [ ] Add `services/nesting.ts`: `compute(bboxW, bboxH, qty, sheetW, sheetH, spacing, margin) -> NestResult`. `usable = sheet - 2*margin`; throw `PartTooLargeError` (→ 422) when `bboxW > usableW || bboxH > usableH`; `cols = floor((usableW + spacing)/(bboxW + spacing))`, rows likewise; `perSheet = cols*rows`; `sheets = ceil(qty/perSheet)`; emit explicit top-left-origin placements `[{sheet, x, y}]` and `utilization = partArea*qty/(sheets*sheetArea)`.
- [ ] Add `services/pricing.ts`: `price(cutLenFt, sheets, bends, qty, material, cfg)` → `subtotal = setupFee + cutLenFt*costPerLinearFoot + sheets*perSheetCost*material.costMultiplier + handlingFee + bends*costPerBend`; `total = max(minimumOrder, subtotal)`. Compute in a decimal-safe representation and round to integer cents exactly once at the end; return an itemised `breakdown`.
- [ ] Implement `POST /api/drawings` (multipart controller): extension + size validation against `MachineSettings` **before** touching storage, then parse, then `putObject`, then insert the `Drawing` row; 401 unauthenticated, 422 on parse failure, 413/422 on limit violations. Add `drawings.list`/`drawings.get` (owner-scoped) and the presigned-download route.
- [ ] Implement `bends.create/update/delete` with ownership scoping through `Drawing.userId`, `0 <= angleDeg <= 180` and `direction ∈ {up,down}` validation (422 otherwise); bends are separate rows and the stored DXF object is never rewritten.
- [ ] Implement `materials.list` returning only `isActive = true`.
- [ ] Implement `quotes.create`: validate quantity against `qtyMin`/`qtyMax` with the actual limit stated in the error message and reject null/0/negative; reject inactive or unknown `materialId` (422); run nesting; `cutLenTotal = drawing.cutLengthMm * qty`; convert mm → linear feet; price; persist the quote with a **copy** of the pricing config in `pricingSnapshotJson` so later admin edits never mutate issued quotes. Add `quotes.list` (status filter, sort, pagination) and `quotes.get` (owner-scoped 404/403).
- [ ] Implement `checkout.review` and `shipping.list` (computed cost per `rateType`; 409 with the "contact the company" message when no active methods exist).
- [ ] Implement `POST /api/checkout/:quoteId/session`: decrypt the Stripe secret, create a Checkout Session with SPA `success_url`/`cancel_url`, wrap every Stripe call in try/catch → 503 "payment could not be processed" on connection error/timeout, and never write a partial order.
- [ ] Implement `POST /api/webhooks/stripe`: read the **raw** body before any JSON parsing, verify with the decrypted signing secret, return 400 with zero state change on signature failure, insert `WebhookEvent.stripeEventId` for idempotency (duplicate → 200, one order), and on `checkout.session.completed` create the `Order` with generated `orderNumber` + `confirmationNumber` and flip the quote to `ordered`.
- [ ] Implement `orders.list`, `orders.get` (owner-scoped) and `orders.getBySession` returning 404-until-present so the return page can poll while the webhook is in flight.
- [ ] Add `services/email.ts`: send the confirmation via the Resend integration after order creation, wrapped so **any** exception is caught, recorded in `EmailLog` (status + attempts + error), and never propagated.
- [ ] Add admin routers: `admin.materials.*` and `admin.shipping.*` CRUD, `admin.pricing`, `admin.machine`, `admin.business` get/patch. Business patch encrypts Stripe secret + webhook secret; get returns masked `••••last4` only. Every procedure guarded by `requireAdmin`.
- [ ] Add `services/ratelimit.ts`: Redis fixed-window counter keyed on `userId || clientIp` + bucket, applied to `quotes.create`, `POST /api/drawings`, and `POST /api/checkout/*`; over limit → 429 with a `Retry-After` header.
- [ ] Extend the health module with `GET /health/deep` checking Postgres `SELECT 1`, Redis `PING`, and MinIO `headBucket`, reporting per-dependency status without throwing.

## ui_agent tasks
- [ ] Rewrite `frontend/src/app/app.routes.ts` with the full route table from the Surface contract, every route carrying `data: { flow: ... }`, lazy `loadComponent`, and `/quotes/new` declared as a shell with real `upload` | `material` | `bends` | `review` **child** routes.
- [ ] Build `features/auth/login.component.ts` and `signup.component.ts` (public routes) with reactive forms, inline field validation, submit-pending state, and a generic credential-error message.
- [ ] Build the app shell: header with company name/logo, primary nav, user menu with logout, and an admin nav section rendered only when the signed-in user's role is `ADMIN`.
- [ ] Build `features/quotes/quote-list.component.ts` driven by `?status=&sort=&page=` query params, with empty, loading, and error states and a "New quote" call to action.
- [ ] Build the `/quotes/new` wizard shell plus the four step components (`upload`, `material`, `bends`, `review`); step state is read from the route/URL on every activation so a hard refresh or deep link restores the wizard exactly.
- [ ] Build the upload step: file picker with client-side extension/size hints, upload progress, parse-failure error surface, and a geometry summary (entity count, cut length, bbox) so customers can sanity-check drawing hygiene.
- [ ] Build the material + quantity step: active-materials selector, quantity input validated against the machine quantity limits, and server validation errors surfaced inline.
- [ ] Build the review step: nested-sheet preview, itemised price breakdown, sheet count and utilisation, and a confirm action that issues the quote.
- [ ] Build `features/quotes/quote-detail.component.ts` with `?panel=breakdown` and `?modal=` driven from the URL, the work-bed canvas, and a **Print Bed** button whose label reflects state.
- [ ] Build `shared/workbed/workbed-canvas.component.ts` (Canvas 2D): draw bed → sheet → nested placements → cut paths in **blue solid** → bend lines in **orange dashed** → labels, with a fit-to-viewport uniform-scale transform recomputed in a `ResizeObserver` and `devicePixelRatio`-aware sizing so nothing clips on resize.
- [ ] Build `shared/workbed/geometry.ts` + `laser-animation.ts`: pre-tessellate the ordered cut path **once** into a flat point array, then advance arc-length per frame in a `requestAnimationFrame` loop at the configured animation speed, rendering completed cuts, the active segment, the laser head, and remaining cuts. Auto-start on quote-detail load; **Print Bed** stops **and resets to frame 0** when running and starts when stopped; cancel the rAF handle in `ngOnDestroy`.
- [ ] Build `shared/bend-editor/bend-editor-canvas.component.ts`: Bend Mode overlay on the parsed geometry with click-drag to draw a bend line, angle (0–180, client-validated) and direction inputs, and select-to-move/rotate/delete; every mutation re-renders the bend list.
- [ ] Build `features/checkout/review.component.ts` and `shipping.component.ts`: order summary, shipping-method selection with computed costs, shipping-address form, and a blocking message when no shipping methods are active.
- [ ] Build `features/checkout/payment-return.component.ts`: poll the order-by-session endpoint with backoff while the webhook is in flight, showing a "confirming payment" state and a retry path if the poll times out.
- [ ] Build `features/orders/order-list.component.ts` and `confirmation.component.ts` (order number, confirmation number, totals, shipping details) plus an `/account` page showing the current user and logout.
- [ ] Build `features/admin/materials.component.ts` driven by `?status=&modal=edit&id=` (list, create/edit modal, activate/deactivate), `pricing.component.ts`, and `machine.component.ts` as reactive forms bound to the settings endpoints.
- [ ] Build `features/admin/business/` — `branding`, `contact`, `payment` (Stripe keys write-only; existing values shown as `••••last4`), and `shipping` (shipping-method CRUD) as tabbed child routes.
- [ ] Build `/admin/settings`: one row per provisioned service (`postgresql`, `minio`) and per integration (MinIO / S3 (boto3), Redis, Resend API, Stripe SDK (Python) + Stripe Checkout Sessions) with a configured/unconfigured badge and a per-item credential form. Show a prominent banner: "The following need credentials to activate: Stripe SDK (Python) + Stripe Checkout Sessions, Resend API, MinIO / S3 (boto3), Redis."
- [ ] Add `core/branding.service.ts`: load business settings at bootstrap and apply `--primary`/`--accent` CSS custom properties plus company name and logo across customer-facing pages.
- [ ] Add loading, empty, and error states plus stable `data-testid` attributes to every new component, and register each new route/component/testId in `.pipeline/surface.json`.

## service_agent tasks
- [ ] Add `core/auth.service.ts`: signed-in user signal, token storage, login/signup/logout/refresh calls, and role helpers (`isAdmin`).
- [ ] Add `core/auth.interceptor.ts`: attach the bearer token, and on a 401 attempt exactly one refresh then replay the original request; on refresh failure clear session state and redirect to `/login`.
- [ ] Add `core/auth.guard.ts` and `core/admin.guard.ts`: `authGuard` redirects anonymous users to `/login` preserving the return URL; `adminGuard` renders a 403 view for non-admins rather than silently redirecting.
- [ ] Add `core/api/drawing.service.ts`: multipart upload with progress events, drawing fetch, presigned-file URL, and typed bend create/update/delete calls.
- [ ] Add `core/api/quote.service.ts`: create/list/get quotes with typed request+response models, query-param-driven list options, and typed error mapping for 422 validation and 429 rate limits.
- [ ] Add `core/api/material.service.ts` and `core/api/order.service.ts`: active materials, shipping methods with computed cost, checkout review, checkout-session creation, orders list/get, and `getBySession` polling helper.
- [ ] Add `core/api/settings.service.ts`: business/pricing/machine settings reads and admin patches, admin materials + shipping CRUD, and the admin service/integration credential endpoints.
- [ ] Add a shared typed tRPC client + error normaliser mapping backend 401/403/409/422/429/503 into discriminated UI error types, and regenerate `frontend/src/app/trpc-client.types.ts` against the new routers.

## tester tasks
- [ ] DXF parser tests with fixtures: 100 mm square → cut length exactly 400 mm; r=50 circle ≈ 314.159 mm; a `bulge=1` LWPOLYLINE segment equals its semicircle length; `empty.dxf` and `corrupt.dxf` → 422 with the parse message.
- [ ] Nesting tests: part exactly equal to usable area → 1 per sheet; part 1 mm oversize → `PartTooLargeError` → 422; quantity spanning multiple sheets → correct `ceil` and utilisation.
- [ ] Pricing tests: a computed subtotal below `minimumOrder` returns exactly `minimumOrder`; editing `PricingSettings` after a quote is issued leaves that quote's `totalCents` and `breakdownJson` byte-identical.
- [ ] Auth tests: duplicate signup → 409; first user → `ADMIN`, second → `USER`; unknown email and wrong password produce identical error responses; refresh rotation makes the old refresh token 401 on reuse; logout revokes.
- [ ] Table-driven RBAC test asserting every admin procedure/route returns 401 anonymous, 403 as `USER`, and 200 as `ADMIN` — including `/api/admin/settings`.
- [ ] Quote-creation tests: quantity 0/negative/null and above `qtyMax` → 422 with the limit in the message; inactive `materialId` → 422; happy path persists nesting, breakdown, and pricing snapshot.
- [ ] Checkout/Stripe tests: tampered webhook signature → 400 and zero `Order` rows; duplicate `stripeEventId` → exactly one order; Stripe connection error stubbed → 503 and zero order rows; declined-card path leaves the quote intact and retryable.
- [ ] Email test: Resend stubbed to throw → order creation and the confirmation response still return 200 and `EmailLog` records the failure with the error.
- [ ] Rate-limit tests: exceeding the window on `quotes.create` and `POST /api/drawings` → 429 with a `Retry-After` header; the counter resets after the window.
- [ ] Unconfigured-integration tests: with each integration key absent or set to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, the dependent route returns 503 and `resolveConfig` falls back to a `SystemSetting` row when one exists.
- [ ] Frontend deep-link tests: load every route from the Surface contract directly on a fresh page load and assert it renders without an unexpected redirect, including `/quotes/new/bends` and `/admin/business/payment`.
- [ ] Frontend canvas tests: resize the work bed and assert the drawing is not clipped and the aspect ratio holds; assert **Print Bed** starts the animation, and stops **and resets to frame 0** on the second press.
- [ ] End-to-end happy path: signup → upload DXF → add a bend → select material and quantity → issue quote → select shipping → create checkout session (Stripe stubbed) → webhook → confirmation page shows order and confirmation numbers.

## Open questions
- **Stack divergence (blocking assumption).** The spec specifies FastAPI + Python + SQLAlchemy/Alembic + `ezdxf`, but the scaffolded repo is the certified enterprise stack: Angular 19 + NestJS + tRPC + Prisma + PostgreSQL. These tasks are written against the **scaffolded** stack. Confirm this is intended; if the Python stack is truly required, this decomposition must be regenerated.
- **DXF parsing library.** `ezdxf` has no Node equivalent of equal maturity. Tasks assume a TypeScript DXF parser (e.g. `dxf-parser`) plus hand-written bulge→arc expansion matching the spec's formulas. Confirm the library choice and whether POLYLINE (as distinct from LWPOLYLINE) coverage is required at launch.
- **REST vs tRPC.** The stack glue is tRPC, but the spec's multipart upload and the Stripe webhook (raw body, unauthenticated) cannot go through tRPC. Tasks put those two on plain Nest controllers under `/api`. Confirm.
- **Role naming.** The spec says `admin` / `customer`; the stack contract fixes `enum Role { USER MANAGER ADMIN }` and mints one login per role. Tasks map `customer → USER` and leave `MANAGER` unused. Confirm `MANAGER` needs no product behaviour.
- **Integration env-key naming.** The provisioned keys (`MINIO_S3_BOTO3_API_KEY`, `REDIS_API_KEY`, `STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY`) are single-value API keys, but MinIO needs endpoint + access key + secret + bucket, Redis needs a URL, and Stripe needs a publishable key and a webhook signing secret. Tasks resolve the primary secret through `resolveConfig` and take the remaining fields from `SystemSetting` / `BusinessSettings`. Confirm the intended shape.
- **Stripe credential source of truth.** The spec has admins entering Stripe keys in `business_settings` (encrypted); the platform also provisions a Stripe env key. Tasks prefer env, then admin settings. Confirm the precedence.
- **Encryption key.** `APP_ENCRYPTION_KEY` has no provisioned value. Confirm how it is supplied and what should happen on key loss (spec says admins must be able to re-enter Stripe keys).
- **Deployment artefacts.** The spec's `Dockerfile` / `docker-compose.yml` / `k8s/*` single-container design conflicts with the scaffold's two-target (nginx frontend + backend) topology and its known-good Dockerfiles. Tasks intentionally leave deployment files untouched. Confirm.
- **Unspecified numbers.** Default values for pricing fields, `qtyMin`/`qtyMax`, sheet spacing/margin, `maxUploadBytes`, allowed extensions, and `animationSpeed` are not given in the spec; the seed will use placeholder defaults that admins can edit.
- **Order/confirmation number format.** The spec requires both but does not define their format or uniqueness scope.
