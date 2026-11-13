# Athena demo script (about 10 minutes)

## Before the demo

- API and dashboard running with an LLM key, a Stripe test key, a GitHub token + repo, a Slack webhook, and `OPSGUARD_SERVICES` including one service that is down (for example a stopped staging URL).
- Create test charges in Stripe so MoneyGuard has data. A failed, high-risk one: in test mode, pay with card `4100000000000019` (always blocked as fraud) and a normal one with `4242424242424242`.
- At least one failed GitHub Actions run in the repo.
- Both applications installed. Keep the Approvals page open in a second tab.

## 1. The idea (30s)

"Every AI agent gets rebuilt from scratch. Athena is the reusable skeleton: one runtime for tools, permissions, approvals, memory, workflows, and monitoring. Applications are just configuration."

Show the **Applications** page: two apps, their tools, and the purple `send_notification` tool they share.

## 2. Build an agent (1–2 min)

**Agents → New agent.** Pick a few tools from the registry. The form flags permissions the tools need and the agent lacks. Point out that the agent is only data: a prompt, a model, tools, and permission grants.

Open the **Tool Registry**: each tool has a JSON schema (sent to the LLM), a risk level, and required permissions.

## 3. MoneyGuard (3 min)

**MoneyGuard** page lists live Stripe charges with Radar risk. Click **Investigate** on the blocked charge.

On the execution page, narrate the live timeline: agent reasoning, `get_transaction_details`, `get_customer_profile`, `check_risk_rules` (evidence per rule), `create_case`. The agent then asks to `flag_transaction`, and the execution waits for approval.

Approve it in the card at the top. The run resumes, writes metadata to the real Stripe charge, and sends the Slack notification. Show the case on the MoneyGuard page and the `moneyguard_flag` badge on the charge.

Optional: run again and **reject** a refund request with a comment, and show the agent acknowledging the rejection in its final report.

## 4. Same skeleton (1 min)

**Overview** page: both apps' executions in one place. **Executions** filtered by application. Show `packages/core/src/agent/agent-runtime.ts` next to `apps/opsguard/src/index.ts`: the application is configuration, the runtime is shared.

## 5. OpsGuard (3 min)

**OpsGuard** page shows real HTTP checks. Click **Investigate** on the unhealthy service, or a failed CI run.

Timeline: `get_system_status`, `check_service_health`, `list_workflow_runs` / `get_workflow_run` (finds the failed step), `search_tickets`, `create_ticket` (a real GitHub issue; open it), `send_notification`. If the failure looks transient, the agent requests `rerun_failed_jobs`, which goes through the same approval queue as MoneyGuard refunds.

Show an automatic trigger: re-run a failing GitHub Action, or `stripe trigger charge.failed`. A new execution appears without anyone clicking.

## 6. Close (30s)

"Two different domains, one runtime, one approval queue, one audit trail. A new application is a tools file and a prompt."

Mention Kiro: the spec (`athena-spec.md`), steering files in `.kiro/steering`, and the task breakdown in `docs/specs`.
