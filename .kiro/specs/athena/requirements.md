# Requirements Document

## Introduction

Athena is a reusable AI-agent runtime. Developers define an agent's purpose, tools, permissions, memory, triggers and workflows, and the same runtime executes it. Two applications run on one shared runtime to prove the skeleton is reusable:

- **MoneyGuard** investigates Bachs payments (failed, suspicious, underpaid, disputed), opens cases, and flags customers or refunds after human approval.
- **OpsGuard** watches services, CI/CD runs and orders, diagnoses incidents, opens and updates GitHub issues, and re-runs failed jobs after human approval.

Built for the Kiroween hackathon (Skeleton Crew category). Constraints: the product is named Athena; the LLM is Claude (Anthropic) or Groq; the database is MongoDB; the monorepo uses npm workspaces; integrations call real APIs (no mocks); there is full user authentication; payments use Bachs (https://bachs.io); the whole product deploys as one Vercel project.

## Glossary

- **Runtime**: the shared agent execution engine in `packages/core`.
- **Application**: a package that contributes an agent template, tools and workflow templates (MoneyGuard, OpsGuard).
- **Run (execution)**: one agent task or workflow execution, with its timeline.
- **Tool**: a named, schema-validated action an agent may call.
- **Approval**: a human decision required before a sensitive tool or workflow step proceeds.
- **Connection**: a user's credentials for an external service (Bachs, GitHub, Slack) or their list of monitored services.
- **Checkpoint**: the saved state of a run (messages, workflow position) that lets any process continue it.
- **Slice**: the part of a run one serverless function invocation advances before handing over.

## Requirements

### Requirement 1: Shared agent runtime

**User Story:** As a developer, I want every agent to run on the same runtime, so that a new application only needs configuration and tools.

#### Acceptance Criteria

1. WHEN a run starts THE Runtime SHALL load the agent's prompt, model, permissions, assigned tools and memory, and run a model/tool loop until the model returns a final answer or the agent's iteration limit is reached.
2. THE Runtime SHALL support Anthropic Claude and Groq as model providers, selected per agent.
3. WHEN an application is registered THE Runtime SHALL register its tools once, reuse a tool object shared by several applications, and reject two different tools with the same id.
4. THE Runtime SHALL record every model turn, tool call, tool result, approval and status change as a timeline event of the run.
5. WHEN the iteration limit is reached without a final answer THE Runtime SHALL complete the run marked incomplete with an explanatory summary.

### Requirement 2: Tool safety

**User Story:** As an operator, I want tools to be validated and permission-checked, so that an agent cannot act beyond what it was granted.

#### Acceptance Criteria

1. WHEN the model calls a tool that is not assigned to the agent THE Runtime SHALL refuse it and return the reason to the model.
2. WHEN the agent lacks a tool's required permissions THE Runtime SHALL refuse the call, record a permission-denied event, and not create an approval.
3. THE Runtime SHALL validate tool input against the tool's Zod schema before execution and return validation errors to the model.
4. THE Runtime SHALL apply a timeout to every tool execution.
5. IF a tool fails THEN THE Runtime SHALL return the error to the model as a tool result instead of failing the run.

### Requirement 3: Human approval

**User Story:** As a reviewer, I want sensitive actions to wait for my decision, so that refunds, customer flags and deploy retries never happen without a person.

#### Acceptance Criteria

1. WHEN an agent calls an approval-gated or high-risk tool THE Runtime SHALL create an approval with the action, input and the agent's reasoning, set the run to `waiting_approval`, and pause the run without holding a process.
2. WHEN the run's owner approves THE Runtime SHALL resume the run and execute the tool.
3. WHEN the owner rejects, or the approval expires (default 30 minutes), THE Runtime SHALL resume the run and return the outcome to the model without executing the tool.
4. THE Runtime SHALL let only the run's owner decide an approval, and only once.
5. WHEN a run is cancelled while waiting THE Runtime SHALL close its pending approvals.
6. THE Workflow engine SHALL support explicit approval steps with the same behaviour.

### Requirement 4: Resumable runs

**User Story:** As an operator, I want runs to survive restarts and serverless time limits, so that long investigations and approval waits always finish.

#### Acceptance Criteria

1. THE Runtime SHALL checkpoint each run in MongoDB after every model turn, tool call and workflow step.
2. WHILE a process advances a run THE Runtime SHALL hold an exclusive lease that each checkpoint renews, so no two processes advance the same run.
3. WHEN a slice's time budget is used up THE Runtime SHALL hand the run to a new invocation through a signed continuation request; every slice SHALL complete at least one unit of work.
4. WHEN a run is unleased and has not progressed for 30 seconds, or its approval was decided or expired while no process was listening, THE maintenance task SHALL resume it.
5. IF a run has no saved checkpoint THEN THE Runtime SHALL fail it with a clear reason.
6. WHEN cancellation is requested THE Runtime SHALL stop the run at its next model turn or tool call, or immediately if no process holds it.

### Requirement 5: Workflows and triggers

**User Story:** As a developer, I want multi-step workflows started by events, webhooks, schedules or people, so that agents react without manual prompting.

#### Acceptance Criteria

1. THE Workflow engine SHALL support `agent_task`, `tool_call`, `approval` and `condition` steps, with branching and template values from the trigger payload and earlier steps.
2. THE Workflow engine SHALL support `event`, `webhook`, `schedule` and `manual` triggers, with optional trigger conditions.
3. WHEN a definition references an unknown step, repeats a step id, or a schedule lacks an interval THE API SHALL reject it.
4. THE Workflow engine SHALL stop a workflow that exceeds 50 step runs.
5. WHEN several maintenance ticks overlap THE Workflow engine SHALL start a due scheduled workflow only once.
6. WHEN an application is installed THE API SHALL create its agent and workflow templates for that user, and on startup SHALL upgrade installed templates while keeping the user's model, on/off state and custom workflows.

### Requirement 6: Per-user connections

**User Story:** As a user, I want to connect my own Bachs, GitHub and Slack accounts in the dashboard, so that I never edit server files and my keys are used only for my runs.

#### Acceptance Criteria

1. WHEN a user saves a connection THE API SHALL verify it with the provider (Bachs key, GitHub token and repository) before storing it.
2. THE API SHALL encrypt connection secrets with AES-256-GCM using `ENCRYPTION_KEY`, and SHALL only return masked hints to the browser.
3. WHEN a tool or API request uses a connector THE system SHALL use the connection of the user who owns the run or request, and SHALL report "not connected" otherwise.
4. THE API SHALL give each user a personal Bachs and GitHub webhook URL, verify deliveries with that user's secret, and start only that user's workflows.
5. THE API SHALL accept only `hooks.slack.com` URLs for Slack and only http(s) URLs for monitored services.
6. WHILE running in production THE health checker SHALL refuse private, loopback and cloud-metadata addresses, including hostnames that resolve to them.
7. IF stored secrets cannot be decrypted THEN THE system SHALL mark the connection broken and ask the user to reconnect.

### Requirement 7: MoneyGuard

**User Story:** As a finance operator, I want an agent to investigate Bachs payments, so that failed, risky, underpaid and disputed payments get a reasoned recommendation.

#### Acceptance Criteria

1. THE MoneyGuard application SHALL provide the tools `get_transaction_details`, `get_customer_profile`, `search_transaction_history`, `get_disputes`, `check_risk_rules`, `flag_customer`, `refund_transaction`, `create_case` and `send_notification`.
2. THE risk rules SHALL use live Bachs data, decimal amounts with currency, and per-currency large-payment thresholds.
3. THE `flag_customer` and `refund_transaction` tools SHALL require approval; refunds SHALL send an idempotency key derived from the run and charge.
4. THE MoneyGuard workflows SHALL start on `bachs.collection.failed`, `bachs.collection.succeeded` (risk review), `bachs.collection.underpaid` and `bachs.dispute.created`.
5. THE dashboard SHALL list the user's recent Bachs payments with sandbox/live labelling, start an investigation for any charge, and list cases.

### Requirement 8: OpsGuard

**User Story:** As an on-call engineer, I want an agent to diagnose incidents across services, CI/CD and orders, so that I get a ticket and notification with the likely cause.

#### Acceptance Criteria

1. THE OpsGuard application SHALL provide `get_system_status`, `check_service_health`, `query_logs`, `list_workflow_runs`, `get_workflow_run`, `rerun_failed_jobs`, `get_order_details`, `search_tickets`, `create_ticket`, `update_incident` and `send_notification`.
2. THE agent SHALL only reach services the user listed and log files the operator listed, selected by name.
3. THE `rerun_failed_jobs` tool SHALL require approval, and GitHub tools SHALL only use the connected repository.
4. THE OpsGuard workflows SHALL cover a scheduled health check (off by default), failed GitHub workflow runs, abandoned Bachs checkouts, and signed external alerts.
5. WHEN logs are not configured THE `query_logs` tool SHALL tell the model so it does not retry.

### Requirement 9: Authentication and API security

**User Story:** As an operator, I want accounts and a hardened API, so that each user only sees and controls their own agents.

#### Acceptance Criteria

1. THE API SHALL support registration, login and logout with bcrypt password hashing and a JWT in an HTTP-only cookie, and `ALLOW_REGISTRATION=false` SHALL close sign-up.
2. THE API SHALL scope agents, workflows, runs, approvals, cases and connections to their owner.
3. THE API SHALL validate request bodies with Zod and return `{ success, data, error }` responses.
4. IF `JWT_SECRET` or `ENCRYPTION_KEY` is shorter than 32 characters in production THEN THE API SHALL refuse to serve requests and report a configuration error.
5. THE API SHALL rate-limit user traffic, de-duplicate webhook deliveries across instances, and never log secrets.

### Requirement 10: Dashboard

**User Story:** As a user, I want a console to set up, watch and control agents, so that I can see each run as it happens.

#### Acceptance Criteria

1. THE dashboard SHALL provide a public product landing page, sign-in and registration, and console pages for overview, MoneyGuard, OpsGuard, runs, run detail, approvals, agents, workflows, tool registry, applications and connections.
2. WHEN a run changes THE dashboard SHALL update the run list, run timeline, counters and approval badge within a few seconds, by polling `/api/realtime`.
3. THE app pages SHALL show a setup checklist until required connections exist.
4. THE dashboard SHALL show a "Back to …" link on pages outside the main navigation that returns to the page the user came from.
5. WHEN the database or server configuration is broken THE dashboard SHALL show the reason in a banner.

### Requirement 11: Deployment

**User Story:** As the team, I want one deployment, so that the demo and judges use a single URL.

#### Acceptance Criteria

1. THE dashboard SHALL serve the API from the same Next.js app, so the UI and API share one origin and one Vercel project.
2. THE maintenance tick (scheduled workflows, expired approvals, stalled runs) SHALL run from a cron endpoint protected by `CRON_SECRET`, and at most once a minute while the dashboard is open.
3. THE API SHALL also run as a standalone long-lived Node server with a one-minute maintenance timer.

### Requirement 12: Easy to start, open to extend

**User Story:** As a new user, I want to get a first result without learning the whole system, and later connect my own APIs, so that Athena grows with what I need.

#### Acceptance Criteria

1. THE overview SHALL show a getting-started checklist (connect an account, install an agent, run an investigation, make your own agent) that ticks off from real data and can be hidden.
2. THE agent builder SHALL offer ready-made templates that fill every field, and SHALL offer to create the template's workflow.
3. WHEN a user ticks or unticks a tool THE agent builder SHALL add or remove the permissions that tool needs.
4. THE workflow builder SHALL offer a form with a trigger list, a task and an "ask me first" option, and keep the JSON editor as an advanced option.
5. THE system SHALL let a user define HTTP tools (method, URL with placeholders, inputs, headers, one encrypted secret header) that only that user's agents can use.
6. WHILE running in production custom tools SHALL refuse private addresses, never follow redirects, time out after 15 seconds and read at most 1 MB.
7. THE system SHALL require `write:http` and, by default, approval for custom tools that use POST, PUT, PATCH or DELETE.
