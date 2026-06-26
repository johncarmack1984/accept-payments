# accept-payments

A small payments-and-invoicing service that runs as a single Rust binary on the
AWS Lambda Rust runtime: an [Axum](https://github.com/tokio-rs/axum) API backed
by DynamoDB, fronted by a React single-page app that the same binary serves. It
takes card and ACH payments through Stripe Checkout, and issues pay-by-invoice
links for clients who'd rather pay by bank transfer.

A portfolio piece, but a working one: real webhook signature verification and
the settlement edge cases handled rather than hand-waved.

## What it does

- **Checkout**: `POST /checkout` opens a Stripe Checkout Session offering both
  card and US bank (ACH) payment. ACH runs 0.8% capped at $5 against 2.9% + 30c
  for cards, so both are offered and the customer picks.
- **Idempotent webhooks**: `POST /webhooks/stripe` verifies the Stripe signature,
  then records the payment. Deliveries retry, so the write is idempotent: the
  Stripe event id is the DynamoDB key under an `attribute_not_exists` condition,
  which makes a replay a no-op instead of a double-count.
- **Card vs. ACH settlement**: cards settle inside the session and arrive `paid`;
  ACH debits complete the session `unpaid` and settle days later via
  `async_payment_succeeded`. The ledger keys on `payment_status`, not the event
  type, so money is recorded only once it has actually moved.
- **Invoicing**: an admin issues invoices and shares a token-gated public link
  (`GET /invoice/:token`) the client opens to see line items, totals, and
  remit-to details. Invoice numbers come from an atomic DynamoDB counter.
- **Admin auth**: the admin UI is gated by GitHub OAuth; the session is an HS256
  JWT in an `HttpOnly; Secure; SameSite=Lax` cookie, scoped to a single
  configured GitHub login. Unconfigured, the admin side is closed, not open.

Payment and auth routes degrade cleanly: with their secrets unset they return
`503` rather than failing at boot, so the API runs and the SPA serves before any
Stripe or OAuth setup is in place.

## One binary, one deploy

With the `embed-web` feature the built SPA (`web/dist`) is baked into the Rust
binary via `rust-embed` and served as the fallback for any non-API path, with
unknown paths returning `index.html` so the client router can resolve deep links.
CI builds the SPA, then `cargo lambda build --features embed-web`. The result is
one artifact behind a Lambda function URL, with no separate static host.

## Stack

Rust · Axum · Tokio · AWS Lambda (Rust runtime, `cargo lambda`) · DynamoDB ·
Stripe (`async-stripe`) · React 19 · TanStack Router · Vite · Tailwind v4 ·
shadcn · Terraform

## Layout

```
src/main.rs      the API: checkout, webhooks, invoicing, OAuth, DynamoDB storage
tests/fixtures/  a real Stripe async-payment event captured via `stripe trigger`
web/             React + TanStack Router SPA (checkout, receipt, admin, invoice)
infra/           Terraform: least-privilege deploy user + CI secret wiring
```

## Running it

The API needs AWS credentials (DynamoDB) and, for live payments, Stripe keys:

```sh
cargo lambda watch                 # API, local
cd web && bun install && bun dev   # SPA at http://localhost:5173
```

Without `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` the payment routes return
`503`; without `OAUTH_*` + `SESSION_SECRET` + `ADMIN_GITHUB_LOGIN` the admin
routes do the same. The tests need none of it:

```sh
cargo test
```

## Scope and honesty

A personal project, not a hardened production processor: a single-admin model and DynamoDB `scan`s where a real ledger would page or index. The Stripe integration is mode-agnostic. It runs against whichever secret key you supply (`sk_test_…` by default for the sandbox, `sk_live_…` for real charges, no code change). The point is the seams that are easy to get wrong (webhook idempotency, ACH settlement timing, signed sessions) handled and unit-tested (including a real captured Stripe event), not a checkout button that calls the API and hopes.
