---
title: "Athena: one agent skeleton, many agents"
subtitle: "Kiroween hackathon submission, Skeleton Crew category"
author: "Michael Dikandu"
---

# What Athena is

Athena is a reusable engine for building AI agents. Most teams that build an agent write the same parts again every time:

- calling tools
- checking permissions
- asking a person before risky actions
- remembering things between runs
- logging every step
- picking up again after a crash or a timeout

Athena does all of that once, in a shared runtime. An application on top of it only supplies an agent's instructions, its tools and its workflows. To prove the skeleton is reusable, two very different applications run on it:

- **MoneyGuard** investigates Bachs payments that failed, look risky, were underpaid or are disputed. It opens cases, and flags customers or issues refunds only after a person approves.
- **OpsGuard** watches services, GitHub Actions deploys and orders. It diagnoses incidents, opens and updates GitHub issues, and re-runs failed deploys only after a person approves.

One-line pitch: *Build the agent skeleton once, and ship as many agents as you need.*

# The problem

- AI agents are rebuilt from scratch for every use case.
- Payments, DevOps and support agents all need the same capabilities: tools, permissions, approvals, memory, audit logs.
- Letting an agent act on real systems is risky without a person in the loop.
- Serverless hosting stops long-running work, so agent runs that wait for a person or take several minutes break.

# What makes Athena stand out

## 1. It asks before it acts

An agent can investigate freely, but a refund, a customer flag or a deploy re-run stops and waits for a human decision. The approval request shows the agent's reasoning. Only the run's owner can decide, and only once. A rejection goes back to the agent, which explains and continues without retrying.

## 2. You can watch every step live

Every model turn, tool call, result, approval and status change appears on the run timeline as it happens, with inputs and outputs. Each run is a complete audit trail.

## 3. One engine, two different jobs

Payments and DevOps run on the same runtime, the same tool registry and the same approval queue. The Slack notification tool is one implementation shared by both apps. This is the Skeleton Crew idea in practice.

## 4. Anyone can extend it

- **Templates** create a working agent in a minute: Refund Reviewer, Dispute Responder, Daily Ops Digest, Deploy Guard and Uptime Alert Handler.
- **Permissions follow the tools** you pick, so agents get least privilege by default.
- **A simple workflow form** decides when an agent runs: on a Bachs or GitHub event, on a schedule, when another system calls a webhook, or when you click Run.
- **Custom tools** turn any HTTP API into something an agent can use. The secret header is encrypted, requests to private addresses are refused in production, and anything that changes data asks for approval first.

## 5. Each user brings their own accounts

Users connect their own Bachs key, GitHub token and repository, Slack webhook and monitored services in the dashboard. Keys are checked with the provider, encrypted with AES-256-GCM and shown only as masked hints. A run only ever uses its owner's accounts, and each user gets their own webhook URLs.

## 6. Runs survive serverless limits and crashes

Every run is saved to MongoDB after each step. It can pause for an approval without using any server, continue in a fresh function call when it reaches Vercel's time limit, and resume after a crash. Only one process advances a run at a time.

# How it works

1. **A trigger arrives:** a dashboard action, a Bachs or GitHub webhook, a signed workflow webhook, a custom event or a schedule.
2. **Athena loads the agent:** its prompt, model (Groq or Claude), permissions, tools and memory.
3. **The model chooses a tool.** Athena checks the tool is assigned, the agent holds its permissions, and the input matches the tool's schema.
4. **Sensitive tools pause the run** until a person approves or rejects.
5. **Every step is recorded** and appears in the dashboard within seconds.

# Technology

| Area | Choice |
|---|---|
| Language | TypeScript (strict), npm workspaces monorepo |
| Runtime | `packages/core`: agent loop, tool registry, permissions, approvals, memory, workflows, resumable runs |
| Applications | `apps/moneyguard`, `apps/opsguard` |
| API | Express, served from inside the Next.js app |
| Dashboard | Next.js 14, Tailwind CSS |
| AI models | Groq (`openai/gpt-oss-120b`) and Anthropic Claude |
| Database | MongoDB Atlas with Mongoose |
| Integrations | Bachs payments, GitHub Actions and Issues, Slack, any HTTP API |
| Hosting | One Vercel project |

# How Kiro was used

- **Specs:** `.kiro/specs/athena` holds the requirements (12 requirements with acceptance criteria), the design (architecture, run lifecycle, data models, API) and the task plan, plus the history of how the spec changed during the build.
- **Steering:** `.kiro/steering` holds the project conventions and the agent-development guide, so every new tool, route and app followed the same patterns.
- **Hooks:** `.kiro/hooks` type-checks the project when a TypeScript file is saved, asks for confirmation before Kiro edits a secrets file, and keeps the spec in sync after each spec task.
- **Vibe coding:** used for investigation and fixes, such as diagnosing MongoDB Atlas connection errors, Groq tool-call failures and Vercel deployment problems, with each fix tested before it was committed.

# Demo video script (under 3 minutes)

## 0:00–0:15 Hook

**Screen:** landing page.

> "Every company that wants an AI agent builds the same plumbing again: tool calls, permissions, approvals, memory, retries, logs. Athena is that plumbing, built once. Here are two completely different agents running on it."

## 0:15–0:30 The skeleton

**Screen:** Overview and the "One runtime, two agents" diagram.

> "One runtime in the middle. MoneyGuard handles payments, OpsGuard handles services and deploys. Same engine, same tools, same approval queue."

## 0:30–1:20 MoneyGuard

**Screen:** MoneyGuard. Click **Investigate** on a failed sandbox payment, and let the timeline fill in.

> "This is a real failed payment from the Bachs sandbox. MoneyGuard pulls the payment, finds the customer, checks their history and runs the risk rules."

**Screen:** the run stops at **Needs approval**. Approve it, then show the case and the Slack message.

> "When it wants to act, Athena stops it. Money doesn't move until a person approves."

## 1:20–1:55 OpsGuard

**Screen:** OpsGuard with a service that is down. Click **Investigate**, then show the GitHub issue it opens.

> "Same skeleton, different job. OpsGuard checks the service, looks at recent deploys and opens an incident with the likely cause."

## 1:55–2:30 Build your own

**Screen:** Create an agent, choose a template, then Custom tools, then **Send a real request**.

> "Anyone can start from a template, and any HTTP API becomes a tool, with its secret encrypted and an approval step before anything that changes data."

## 2:30–2:50 Kiro and the close

**Screen:** the `.kiro` folder, then the landing page with the URL.

> "I built Athena with Kiro, spec first, with steering and hooks. Athena: build the agent skeleton once, and ship as many agents as you need."

# Links

- Live app: https://athena-kappa-orcin.vercel.app
- Source code: the public GitHub repository (MIT license)
