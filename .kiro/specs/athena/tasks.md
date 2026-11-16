# Implementation Plan

- [x] 1. Set up the monorepo and project conventions
  - npm workspaces, TypeScript strict with a root solution `tsconfig.json` and project references, ESLint, Prettier
  - Steering files in `.kiro/steering` (project conventions, agent development)
  - _Requirements: 1, 11_

- [x] 2. Build the database layer
  - [x] 2.1 Connection with pooling, retries, and explained errors (Atlas IP access list, auth, DNS)
  - [x] 2.2 Schemas and models: User, Agent, Tool, AgentTool, Workflow, Execution, ExecutionEvent, Memory, Approval, Connection, WebhookDelivery, SystemLock
  - [x] 2.3 Indexes, TTL on memory and webhook deliveries, models reused across Next.js dev reloads
  - _Requirements: 1, 4, 6_

- [x] 3. Build shared utilities
  - Error hierarchy, logger with secret redaction, response helpers, Zod helpers
  - AES-256-GCM secret box and AsyncLocalStorage user scope for connections
  - _Requirements: 6, 9_

- [x] 4. Build the agent runtime core
  - [x] 4.1 Tool registry: Zod validation, timeouts, JSON Schema export, shared-tool registration
  - [x] 4.2 Permission manager with `action:resource` grants and wildcards
  - [x] 4.3 LLM adapters for Anthropic Claude (adaptive thinking, signed thinking replay) and Groq
  - [x] 4.4 Agent loop with permission checks, validation, approvals and cancellation
  - [x] 4.5 Memory manager and built-in `remember_fact` / `recall_memory` tools
  - [x] 4.6 Approval manager: owner-only, single decision, expiry
  - [x] 4.7 Event bus and execution monitor (timeline events)
  - _Requirements: 1, 2, 3_

- [x] 5. Build the workflow engine
  - [x] 5.1 Steps: `agent_task`, `tool_call`, `approval`, `condition`, with branching and templating
  - [x] 5.2 Triggers: event, webhook, schedule, manual, with trigger conditions
  - [x] 5.3 Definition validation and a step-run limit
  - _Requirements: 5_

- [x] 6. Make runs resumable
  - [x] 6.1 Checkpoint agent and workflow state after every model turn, tool call and step
  - [x] 6.2 Lease-based run driver so one process advances a run at a time
  - [x] 6.3 Approvals pause runs without holding a process; decisions resume them
  - [x] 6.4 Time slices with signed continuations and a one-unit-of-work guarantee
  - [x] 6.5 Maintenance: expire approvals, resume stalled runs, claim due schedules once
  - _Requirements: 3, 4, 5, 11_

- [x] 7. Build the integration layer
  - [x] 7.1 REST client with retries, backoff and idempotency keys
  - [x] 7.2 Webhook verification: Bachs (V2 and legacy headers), GitHub, per-workflow HMAC
  - [x] 7.3 Connectors: Bachs (sandbox and live by key prefix), GitHub (repo URL or `owner/repo`), Slack
  - [x] 7.4 CSV/XML/JSON normalization bridge
  - _Requirements: 6, 7, 8_

- [x] 8. Add per-user connections
  - [x] 8.1 Connections service: verify with the provider, encrypt, mask, test, delete
  - [x] 8.2 Connectors read the run owner's connection; clear "not connected" errors
  - [x] 8.3 Per-user Bachs and GitHub webhook URLs; old shared URLs return 410
  - [x] 8.4 Private-address guard for health checks in production; Slack host allowlist
  - _Requirements: 6_

- [x] 9. Build the API
  - [x] 9.1 Auth with bcrypt and HTTP-only JWT cookie; registration switch; rate limiting
  - [x] 9.2 Routes: agents, tools, executions, approvals, workflows, apps, events, connections, webhooks
  - [x] 9.3 Realtime polling endpoint, run continuation endpoint, cron tick
  - [x] 9.4 Template sync for installed applications on startup
  - [x] 9.5 Serverless handler and standalone server sharing one bootstrap
  - _Requirements: 4, 5, 9, 11_

- [x] 10. Build MoneyGuard
  - [x] 10.1 Nine tools on live Bachs data, approvals on `flag_customer` and `refund_transaction`
  - [x] 10.2 Per-currency risk rules, customer history by email
  - [x] 10.3 Workflows for failed, successful (risk review), underpaid and disputed payments
  - [x] 10.4 Dashboard page: payments, investigate a charge, cases
  - _Requirements: 7_

- [x] 11. Build OpsGuard
  - [x] 11.1 Eleven tools: health, logs, GitHub Actions and issues, Bachs orders, notifications
  - [x] 11.2 Workflows: scheduled health check, failed deployments, abandoned orders, external alerts
  - [x] 11.3 Dashboard page: service health, failed CI runs, report an incident
  - _Requirements: 8_

- [x] 12. Build the dashboard
  - [x] 12.1 Product landing page, sign-in and registration
  - [x] 12.2 Console: overview, runs and live run detail, approvals, agents, workflows, tool registry, applications
  - [x] 12.3 Connections page and setup checklists on app pages
  - [x] 12.4 Live updates by polling; back navigation to the previous page
  - [x] 12.5 Serve the API from `pages/api/[...path].ts`
  - _Requirements: 10, 11_

- [x] 13. Verify
  - [x] 13.1 Runtime, Bachs, sync, API smoke, connections, resumable-run and address-guard test scripts against in-memory MongoDB
  - [x] 13.2 Simulated Vercel run with tiny slices completing through HTTP continuations
  - [x] 13.3 Browser checks of pages, navigation and responsive layout
  - _Requirements: 1–11_

- [x] 14. Make Athena easier to use and extend
  - [x] 14.1 Getting-started checklist on the overview, ticked off from real data
  - [x] 14.2 Agent templates (Refund Reviewer, Dispute Responder, Daily Ops Digest, Deploy Guard, Uptime Alert Handler) that can also create their workflow
  - [x] 14.3 Permissions set from the chosen tools; model, iterations, memory and extra permissions under Advanced
  - [x] 14.4 Simple workflow form (when / what / ask me first) next to the JSON editor
  - [x] 14.5 Custom HTTP tools: per-user, encrypted secret header, test request, private-address guard, approval by default for changes
  - _Requirements: 10, 12_

- [ ] 15. Deploy and submit
  - [ ] 15.1 Allow `0.0.0.0/0` in the MongoDB Atlas IP access list
  - [ ] 15.2 Create the Vercel project (root `apps/dashboard`) with production secrets
  - [ ] 15.3 Connect Bachs, GitHub and Slack in the deployed app and register their webhooks
  - [ ] 15.4 Set up a cron for `/api/internal/cron/tick`
  - [ ] 15.5 Run the demo end to end with real credentials, record the video, submit
  - _Requirements: 11_
