# Athena Development Progress

**Last updated**: 2026-11-13
**Status**: All build phases implemented except deployment (deploy after completion, as agreed). Not yet run against live LLM or third-party credentials.

## What exists

| Area | Status | Where |
|---|---|---|
| Monorepo, TypeScript, lint, build order | Done | root `package.json` |
| MongoDB models (users, agents, tools, agent-tools, workflows, executions, events, memory, approvals, MoneyGuard cases) | Done | `packages/database`, `apps/moneyguard/src/models` |
| Shared errors, logger with redaction, validation, responses | Done | `packages/shared` |
| LLM adapters: Anthropic (adaptive thinking, thinking-block replay), Groq | Done | `packages/core/src/llm` |
| Agent runtime: tool loop, permission checks, input validation, approvals, cancellation, restart recovery, token tracking | Done | `packages/core/src/agent` |
| Tool registry with JSON Schema export | Done | `packages/core/src/tools` |
| Memory manager and built-in `remember_fact` / `recall_memory` tools | Done | `packages/core/src/memory` |
| Event bus and execution monitor (persisted timeline, live broadcast) | Done | `packages/core/src/events`, `monitor` |
| Workflow engine: tool_call, agent_task, approval, condition steps; event, webhook, schedule, manual triggers; templating | Done | `packages/core/src/workflows` |
| Application contract and registry | Done | `packages/core/src/application.ts` |
| Integrations: REST client, webhook signatures, CSV/XML bridge, Bachs/GitHub/Slack | Done | `packages/integrations` |
| MoneyGuard on Bachs: 9 tools, per-currency risk rules, 4 workflows | Done | `apps/moneyguard` |
| OpsGuard: 11 tools (orders via Bachs checkouts and payments), 4 workflows | Done | `apps/opsguard` |
| API: auth, agents, tools, executions, approvals, workflows, apps, events, webhooks (Bachs, GitHub, per-workflow), WebSocket | Done | `apps/api` |
| Dashboard: 16 routes incl. live execution timeline and approval queue | Done | `apps/dashboard` |
| Docs: README, deployment guide, demo script, `.env.example` | Done | `docs/` |
| Deployment | Not started | see `docs/deployment.md` |

## Payment provider: Bachs

MoneyGuard and OpsGuard use the Bachs REST API (`/v1`), following https://docs.bachs.io and the official `@bachs/sdk` 2.0.0 type definitions:

- Bearer auth; `sk_sandbox_` keys go to `https://sandbox-api.bachs.io`, `sk_live_` to `https://api.bachs.io`.
- Endpoints used: `GET /v1/payments`, `GET /v1/payments/{id}`, `GET /v1/customers?search=`, `GET`/`PATCH /v1/customers/{id}`, `GET /v1/disputes`, `GET /v1/disputes/{id}`, `GET /v1/refunds/by-charge/{id}`, `POST /v1/refunds`, `GET /v1/checkout-sessions/{id}`.
- Webhooks at `/api/webhooks/bachs`, verified like the SDK (`X-Bachs-Signature-V2`, legacy headers, 300s tolerance), emitted as `bachs.<event type>`.
- Bachs has no payment search by customer, so payment history is matched by customer email across the 300 most recent account payments, and the tool reports when coverage is partial.

## Verification performed

Against an in-memory MongoDB (`mongodb-memory-server`, outside the repo):

- **API suite, 38 checks, all pass**: auth, app install, tool registry, agent and workflow validation, signed per-workflow webhook, a tool-only workflow running real HTTP health checks, cross-user isolation, invalid ids, Bachs webhook without a secret (503) and MoneyGuard payments without a key.
- **Runtime suite, 46 checks, all pass**, with a scripted LLM: tool loop, permission denial, input validation, memory, approve/reject/cancel, workflow branching and templating, event scoping.
- **Bachs suite, 47 checks, all pass**, against a local server returning the documented Bachs response shapes: bearer auth, decimal money with currency, masked sender accounts, customer lookup by email, guest checkouts, history matching, dispute filtering, all risk rules, flag metadata merge with idempotency key, refund request body and idempotency, one-refund-per-charge guard, non-refundable guard, OpsGuard order lookup, Bachs error messages. Webhook signatures cross-checked against the official SDK verifier (V2 with rotation, legacy, tampered, stale, wrong secret, malformed V2).
- **Bachs webhook end to end, 7 checks, all pass**: unsigned and wrongly signed requests rejected, signed V2 and legacy deliveries accepted, duplicate delivery ignored, exactly one MoneyGuard execution started with the charge id in its payload.
- **LLM wire format**: Anthropic and Groq adapters checked against intercepted HTTP requests.
- **Dashboard**: production build passes type-check and lint.

## Not yet verified

- Real Anthropic or Groq calls.
- Real Bachs sandbox calls (no sandbox key was available; the endpoints were confirmed to exist by unauthenticated requests returning 401 rather than 404).
- Real GitHub and Slack calls.
- Deployment.

## Next steps

1. Add `BACHS_API_KEY` (sandbox) and `BACHS_WEBHOOK_SECRET` to `.env`, and run one MoneyGuard investigation end to end.
2. Prepare demo data (see `docs/demo/demo-script.md`).
3. Deploy (see `docs/deployment.md`).
