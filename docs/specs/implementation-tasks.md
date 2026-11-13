# Athena Implementation Tasks

Status legend: [x] done, [ ] open.

## Phase 1: Foundation
- [x] npm workspace monorepo, TypeScript strict, ESLint, Prettier
- [x] Spec, steering files, task breakdown

## Phase 2: Database
- [x] Connection with retry and pooling
- [x] Schemas and models: User, Agent, Tool, AgentTool, Workflow, Execution, ExecutionEvent, Memory, Approval
- [x] Indexes (duplicates removed), TTL on memory expiry

## Phase 3: Shared utilities
- [x] Error hierarchy, logger with redaction, response helpers, Zod helpers, utilities

## Phase 4: Agent runtime core
- [x] Tool registry with validation, timeouts, JSON Schema export
- [x] Permission manager (`action:resource` grants with wildcards)
- [x] LLM adapters: Anthropic Claude, Groq
- [x] Agent runtime loop with permission, validation, approval, cancellation
- [x] Memory manager and built-in memory tools
- [x] Approval manager (owner-only, single-use, expiry, event-driven resume)
- [x] Event bus
- [x] Execution monitor

## Phase 5: Workflow engine
- [x] Step types: agent_task, tool_call, approval, condition
- [x] Triggers: event, webhook, schedule, manual; trigger conditions
- [x] Templating of step config from trigger payload and previous steps
- [ ] Resume a workflow after server restart (currently marked failed)

## Phase 6: Integration layer
- [x] REST client with retries and idempotency keys
- [x] Webhook verification: Bachs (V2 and legacy headers), GitHub, per-workflow HMAC
- [x] Legacy bridge: CSV/XML/JSON normalization
- [x] Connectors: Bachs, GitHub, Slack

## Phase 7: Backend API
- [x] Auth (register, login, logout, me, ws-token), rate limiting
- [x] Agents, tools, executions, approvals, workflows, apps, events, webhooks
- [x] WebSocket server with per-user fan-out
- [x] Error handling and request validation middleware

## Phase 8: Dashboard
- [x] Login and registration
- [x] Overview, applications, agents (list/new/detail/edit), executions (list/live detail), approvals, workflows (list/new/detail), tool registry
- [x] Live updates over WebSocket with reconnect

## Phase 9: MoneyGuard
- [x] Tools: get_transaction_details, get_customer_profile, search_transaction_history, get_disputes, check_risk_rules, flag_customer, refund_transaction, create_case, send_notification
- [x] Risk rules on live Bachs data (per-currency thresholds)
- [x] Workflows: failed payments, successful-payment risk review, underpaid payments, disputes
- [x] Dashboard page: live payments, investigate, cases

## Phase 10: OpsGuard
- [x] Tools: get_system_status, check_service_health, query_logs, list_workflow_runs, get_workflow_run, rerun_failed_jobs, get_order_details, search_tickets, create_ticket, update_incident, send_notification
- [x] Workflows: scheduled health check, failed deployments, abandoned orders (Bachs checkout.expired), external alerts
- [x] Dashboard page: live health, failed CI runs, report incident

## Phase 11: Demo and polish
- [x] Demo script, deployment guide, README, `.env.example`
- [ ] Run end to end with real LLM, Bachs, GitHub, Slack credentials
- [ ] Prepare demo data

## Phase 12: Deployment
- [ ] MongoDB Atlas
- [ ] API host
- [ ] Dashboard host
- [ ] Register Bachs and GitHub webhooks
- [ ] Record demo video and submit
