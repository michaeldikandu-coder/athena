# Athena

**One skeleton, many agents.**

Live demo: https://athena-kappa-orcin.vercel.app · License: [MIT](LICENSE) · Built with [Kiro](https://kiro.dev) for Kiroween 2026 (Skeleton Crew)

Athena is a reusable AI agent runtime. Applications plug into it as configuration (an agent template, tools, and workflow templates) and never ship their own execution logic. Two applications demonstrate it:

- **MoneyGuard** investigates failed, suspicious, underpaid, and disputed [Bachs](https://bachs.io) payments, scores them against risk rules, opens cases, and flags customers or refunds payments after a human approves.
- **OpsGuard** checks live service health, reads logs, inspects GitHub Actions failures, opens and updates incident tickets (GitHub Issues), and re-runs failed deployments after approval.

Both run on the same agent loop, tool registry, permission checks, approval queue, memory, workflow engine, and execution monitor. They also share one tool implementation: `send_notification` (Slack).

Beyond the two apps, anyone can build their own agents in the dashboard: start from a template, pick tools (permissions follow automatically), choose when it runs, and turn any HTTP API into a tool.

## Architecture

```
apps/dashboard (Next.js) ── src/pages/api ──▶ apps/api (Express, served in-process)
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
| `apps/api` | Auth, REST API, webhooks, realtime polling, run continuations |
| `apps/dashboard` | Web UI, and the host that serves the API |

### How an execution runs

1. A trigger arrives: a dashboard action, a Bachs or GitHub webhook, a signed per-workflow webhook, a custom event (`POST /api/events`), or a schedule.
2. The runtime loads the agent (prompt, model, permissions, tools) and its memory.
3. The LLM picks a tool. Before it runs, the runtime checks that the tool is assigned, that the agent holds the tool's `requiredPermissions`, and validates the input with the tool's Zod schema.
4. High-risk or approval-flagged tools pause the execution (`waiting_approval`). A reviewer approves or rejects in the dashboard; a rejection is returned to the agent, which explains and continues.
5. Every step is stored as an execution event; the dashboard polls `/api/realtime` for changes.
6. The run is checkpointed in MongoDB after each model turn and tool call, so it can pause for approval, continue in a new serverless invocation, or resume after a crash.

### LLM providers

- **Anthropic Claude** (default model `claude-sonnet-5-5`). Uses adaptive thinking with summarized display, so reasoning shows in the timeline. Signed thinking blocks are replayed unchanged with tool results, as the API requires. Claude 5.x rejects `temperature`, so it is not sent.
- **Groq** (default model `openai/gpt-oss-120b`), OpenAI-compatible function calling.

Model and provider are set per agent; defaults come from `ANTHROPIC_MODEL` / `GROQ_MODEL`.

## Getting started

Requirements: Node.js 20+, npm 10+, MongoDB 6+ (local or Atlas), and an Anthropic or Groq API key.

```bash
npm install
cp .env.example .env        # fill in MONGODB_URI, the secrets, and GROQ_API_KEY (free) or ANTHROPIC_API_KEY
npm run dev                 # dashboard and API together on :3000
```

Open http://localhost:3000 and create an account (the first account is admin). The **Get started** checklist on the overview walks you through the rest: connect an account, install MoneyGuard or OpsGuard, run a first investigation, and make your own agent.

### Connecting accounts

All integrations use real APIs, and every user connects their own accounts in the dashboard under **Build > Connections**. Nothing per-user goes in `.env`. Keys are verified with the provider before saving, encrypted with AES-256-GCM (`ENCRYPTION_KEY`), shown only as masked hints, and loaded only for that user's requests and runs.

| Connection | Used by | What to enter |
|---|---|---|
| Bachs | MoneyGuard (required), OpsGuard order lookups | Secret key (`sk_sandbox_` uses the sandbox). For automatic runs, point a Bachs webhook at your personal URL from the Connections page (events `collection.failed`, `collection.succeeded`, `collection.underpaid`, `dispute.created`, `checkout.expired`) and paste its signing secret. |
| Monitored services | OpsGuard (required) | Name and health-check URL per service. The agent can only check these URLs. In production, private and localhost addresses are refused (`OPSGUARD_ALLOW_PRIVATE_URLS` overrides). |
| GitHub | OpsGuard (required) | A fine-grained token and one repository. Add the repository webhook (event `workflow_run`) with the URL and secret shown on the page. |
| Slack | Both (optional) | An incoming webhook URL on `hooks.slack.com`. |

Server-only settings stay in `.env`: `OPSGUARD_LOG_FILES` (log files on the server the agent may read), `MONEYGUARD_LARGE_AMOUNTS`, and `BACHS_BASE_URL`.

With the [Bachs CLI](https://docs.bachs.io/developer-portal/local-testing) you can forward sandbox events to your personal URL locally. The Connections page shows the exact command:

```bash
bachs listen --forward-to localhost:3000/api/webhooks/bachs/<your-token> --events collection.failed,dispute.created
# paste the signing secret it prints into Connections > Bachs > Webhook signing secret
```

Bachs money is a decimal string with a currency (`"75000.00"` NGN), never minor units. Payments carry the customer's name and email but no customer id, so MoneyGuard finds the customer and their history by email. Large-payment thresholds are per currency (`MONEYGUARD_LARGE_AMOUNTS`).

### Building your own agents (no code)

- **Templates** (Build > Agents > Create an agent): Refund Reviewer, Dispute Responder, Daily Ops Digest, Deploy Guard, Uptime Alert Handler, or a blank agent. Templates that start on their own also create their workflow.
- **Permissions follow the tools** you tick. Model, iterations, memory and extra permissions are under *Advanced*.
- **Workflows** (Build > Workflows): choose *when* (click Run, a schedule, a Bachs or GitHub event, or a signed webhook), *what* the agent should do, and optionally *ask me first*. The JSON editor is still available for branching steps.
- **Custom tools** (Build > Custom tools): describe one HTTP request, e.g. `GET https://api.example.com/orders/{orderId}`, with inputs, headers and one encrypted secret header, and try it with a real request. Custom tools belong to their creator. In production they cannot reach private addresses, never follow redirects, time out after 15 s and read at most 1 MB. POST, PUT, PATCH and DELETE tools need `write:http` and ask for approval by default.

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
  connections: [{ provider: 'github', description: '…' }],   // per-user services it needs
  env: [],                                                     // optional server-only settings
};
```

Register it in `apps/api/src/bootstrap.ts` with `registerApplication(myApp)`. It then appears in the dashboard and can be installed. Tools that need a user's account read it with `requireConnection(provider)` from `@athena/shared`.

## Security

- Passwords hashed with bcrypt (12 rounds). Sessions are JWTs in httpOnly cookies. Login and registration are rate limited.
- All resources are scoped to their owner; other users get 404.
- Tools declare required permissions; the runtime denies calls the agent is not granted.
- `permissionLevel: 'high'` tools always need human approval. Approvals are owner-only, single-use, and expire after 30 minutes.
- Webhooks are verified (Bachs `X-Bachs-Signature-V2` with timestamp tolerance and secret rotation, GitHub HMAC, per-workflow HMAC) and de-duplicated.
- Users' keys (Bachs, GitHub, Slack, custom tool secrets) are encrypted with AES-256-GCM and only shown as masked hints; a run only uses its owner's keys.
- OpsGuard and custom tools only reach URLs the user listed, without redirects, and refuse private and cloud-metadata addresses in production. OpsGuard reads only log files the operator listed.
- Refunds and customer flags send idempotency keys, and refunds check for an existing refund first (Bachs allows one per charge). Bank-transfer sender account numbers are masked before the agent sees them.
- The logger redacts keys containing password, token, secret, apikey, authorization, or cookie.

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Build all packages and the dashboard, in dependency order |
| `npm run build:backend` | Build everything except the dashboard |
| `npm run dev` | Dashboard and API on one dev server (:3000) |
| `npm start` | Run the production build |
| `npm run dev:api` / `npm run start:api` | API alone as a long-lived Node server (:3001) |
| `npm run type-check` / `npm run lint` | Checks |

See [docs/deployment.md](docs/deployment.md) for deployment, [docs/athena-overview.md](docs/athena-overview.md) for the project overview and demo script, and [docs/demo/demo-script.md](docs/demo/demo-script.md) for the longer demo walkthrough.

## Known limitations

- Live updates poll every 2.5 seconds instead of streaming.
- On Vercel Hobby, scheduled workflows only run as often as the dashboard is open or a cron calls the tick (see docs/deployment.md).
- A run interrupted mid tool call repeats that call when it resumes; tools that change things (refunds) use idempotency keys.
- No automated test suite is checked in yet; the features were verified with scripted end-to-end checks during development.

## Built with Kiro

- Spec: [`.kiro/specs/athena`](.kiro/specs/athena) ([requirements](.kiro/specs/athena/requirements.md), [design](.kiro/specs/athena/design.md), [tasks](.kiro/specs/athena/tasks.md); earlier versions in `history/`)
- Steering: [`.kiro/steering`](.kiro/steering) (project conventions, agent development)
- Hooks: [`.kiro/hooks`](.kiro/hooks): type-check on save, confirm before editing secrets files, keep the spec in sync after each task

## License

[MIT](LICENSE)
