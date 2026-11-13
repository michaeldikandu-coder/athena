# Athena

**One skeleton, many agents.**

Athena is a reusable AI agent runtime. Applications plug into it as configuration (an agent template, tools, and workflow templates) and never ship their own execution logic. Two applications demonstrate it:

- **MoneyGuard** investigates failed, suspicious, underpaid, and disputed [Bachs](https://bachs.io) payments, scores them against risk rules, opens cases, and flags customers or refunds payments after a human approves.
- **OpsGuard** checks live service health, reads logs, inspects GitHub Actions failures, opens and updates incident tickets (GitHub Issues), and re-runs failed deployments after approval.

Both run on the same agent loop, tool registry, permission checks, approval queue, memory, workflow engine, and execution monitor. They also share one tool implementation: `send_notification` (Slack).

## Architecture

```
apps/dashboard (Next.js) ──/api proxy──▶ apps/api (Express + WebSocket)
                                            │
          ┌─────────────────────────────────┼─────────────────────────────┐
          │                         packages/core                          │
          │  AgentRuntime ─ ToolRegistry ─ PermissionManager ─ Approvals   │
          │  WorkflowEngine ─ EventBus ─ ExecutionMonitor ─ Memory ─ LLM   │
          └───────────────┬───────────────────────────────┬───────────────┘
                          │                               │
                 apps/moneyguard                   apps/opsguard
                 (Bachs tools, risk rules)         (health, logs, GitHub)
                          └──── packages/integrations ────┘
                       REST client · webhook signatures · CSV/XML bridge
                       Bachs · GitHub · Slack connectors · shared tools
```

| Package | Purpose |
|---|---|
| `packages/shared` | Errors, logger with secret redaction, response helpers, validation |
| `packages/database` | Mongoose connection and models |
| `packages/core` | Runtime, tools, permissions, approvals, memory, events, monitor, workflows, LLM adapters, application contract |
| `packages/integrations` | REST client with retries, Bachs/GitHub/HMAC signature checks, legacy CSV/XML normalization, connectors |
| `apps/moneyguard`, `apps/opsguard` | Applications built on the `AthenaApplication` contract |
| `apps/api` | Auth, REST API, webhooks, WebSocket |
| `apps/dashboard` | Web UI |

### How an execution runs

1. A trigger arrives: a dashboard action, a Bachs or GitHub webhook, a signed per-workflow webhook, a custom event (`POST /api/events`), or a schedule.
2. The runtime loads the agent (prompt, model, permissions, tools) and its memory.
3. The LLM picks a tool. Before it runs, the runtime checks that the tool is assigned, that the agent holds the tool's `requiredPermissions`, and validates the input with the tool's Zod schema.
4. High-risk or approval-flagged tools pause the execution (`waiting_approval`). A reviewer approves or rejects in the dashboard; a rejection is returned to the agent, which explains and continues.
5. Every step is stored as an execution event and streamed to the dashboard over WebSocket.

### LLM providers

- **Anthropic Claude** (default model `claude-sonnet-5-5`). Uses adaptive thinking with summarized display, so reasoning shows in the timeline. Signed thinking blocks are replayed unchanged with tool results, as the API requires. Claude 5.x rejects `temperature`, so it is not sent.
- **Groq** (default model `openai/gpt-oss-120b`), OpenAI-compatible function calling.

Model and provider are set per agent; defaults come from `ANTHROPIC_MODEL` / `GROQ_MODEL`.

## Getting started

Requirements: Node.js 20+, npm 10+, MongoDB 6+ (local or Atlas), and an Anthropic or Groq API key.

```bash
npm install
cp .env.example .env        # fill in MONGODB_URI, JWT_SECRET, an LLM key, and integration keys
npm run build:backend
npm run dev:api             # API on :3001
npm run dev:dashboard       # dashboard on :3000 (second terminal)
```

Open http://localhost:3000, create an account (the first account is admin), go to **Applications**, and install MoneyGuard and/or OpsGuard.

### Integration setup

All integrations use real APIs. Each tool reports a clear error when its service is not configured.

| Feature | Settings |
|---|---|
| MoneyGuard payments, customers, disputes, flags, refunds | `BACHS_API_KEY` (an `sk_sandbox_` key uses the Bachs sandbox) |
| MoneyGuard webhook workflows | Bachs webhook endpoint `<API_URL>/api/webhooks/bachs` subscribed to `collection.failed`, `collection.succeeded`, `collection.underpaid`, `dispute.created` (and `checkout.expired` for OpsGuard); set `BACHS_WEBHOOK_SECRET` |
| OpsGuard health checks | `OPSGUARD_SERVICES` JSON list. The agent can only reach these URLs. |
| OpsGuard logs | `OPSGUARD_LOG_FILES` JSON map of name to path. Only these files are readable. |
| OpsGuard CI/CD and incidents | `GITHUB_TOKEN`, `GITHUB_REPO` |
| OpsGuard failed-deployment workflow | GitHub repo webhook (event `workflow_run`) to `<API_URL>/api/webhooks/github`; set `GITHUB_WEBHOOK_SECRET` |
| OpsGuard abandoned-order workflow | Bachs webhook event `checkout.expired` |
| Notifications (both apps) | `SLACK_WEBHOOK_URL` |

With the [Bachs CLI](https://docs.bachs.io/developer-portal/local-testing) you can forward sandbox events locally:

```bash
bachs listen --forward-to localhost:3001/api/webhooks/bachs   # prints the signing secret for BACHS_WEBHOOK_SECRET
bachs trigger collection.failed
```

Bachs money is a decimal string with a currency (`"75000.00"` NGN), never minor units. Payments carry the customer's name and email but no customer id, so MoneyGuard finds the customer and their history by email. Large-payment thresholds are per currency (`MONEYGUARD_LARGE_AMOUNTS`).

### Custom webhooks

Workflows with a `webhook` trigger and no event name get their own URL and signing secret (shown on the workflow page). Sign the raw body:

```bash
BODY='{"event":"uptime.down","service":"api"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST "$URL" -H 'content-type: application/json' -H "x-athena-signature: sha256=$SIG" -d "$BODY"
```

## Building a new application

An application is an object implementing `AthenaApplication` from `@athena/core`:

```ts
export const myApp: AthenaApplication = {
  id: 'myapp',
  name: 'MyApp',
  tagline: '…',
  description: '…',
  tools: [myTool, sendNotificationTool],   // Tool objects with Zod schemas
  agent: { name, description, systemPrompt, permissions, tools: ['my_tool', 'send_notification'] },
  workflows: [/* WorkflowTemplate[] */],
  env: [{ name: 'MYAPP_API_KEY', description: '…' }],
};
```

Register it in `apps/api/src/index.ts` with `registerApplication(myApp)`. It then appears in the dashboard and can be installed.

## Security

- Passwords hashed with bcrypt (12 rounds). Sessions are JWTs in httpOnly cookies. Login and registration are rate limited.
- All resources are scoped to their owner; other users get 404.
- Tools declare required permissions; the runtime denies calls the agent is not granted.
- `permissionLevel: 'high'` tools always need human approval. Approvals are owner-only, single-use, and expire after 30 minutes.
- Webhooks are verified (Bachs `X-Bachs-Signature-V2` with timestamp tolerance and secret rotation, GitHub HMAC, per-workflow HMAC) and de-duplicated.
- OpsGuard can only reach configured URLs (no redirects) and read configured log files.
- Refunds and customer flags send idempotency keys, and refunds check for an existing refund first (Bachs allows one per charge). Bank-transfer sender account numbers are masked before the agent sees them.
- The logger redacts keys containing password, token, secret, apikey, authorization, or cookie.

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Build all packages and the dashboard, in dependency order |
| `npm run build:backend` | Build everything except the dashboard |
| `npm run dev:api` / `npm run dev:dashboard` | Development servers |
| `npm run start:api` / `npm run start:dashboard` | Run production builds |
| `npm run type-check` / `npm run lint` | Checks |

See [docs/deployment.md](docs/deployment.md) for deployment and [docs/demo/demo-script.md](docs/demo/demo-script.md) for the demo walkthrough.

## Known limitations

- Executions run in the API process. If the API restarts mid-execution, in-flight executions are marked failed on startup. There is no job queue.
- Run a single API instance: the event bus and webhook de-duplication are in memory.
- Integration credentials are server-wide environment variables, not per user.
- No automated test suite is checked in yet.

Built with [Kiro](https://kiro.dev) for the Kiro Skeleton Crew hackathon.
