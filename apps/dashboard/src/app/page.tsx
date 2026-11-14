/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import './landing.css';
import { LettersAssemble } from '@/components/landing/moment';
import { LandingNav } from '@/components/landing/nav';

export const metadata: Metadata = {
  title: 'Athena · AI agents for payment and incident operations',
  description:
    'Athena runs MoneyGuard and OpsGuard on one agent runtime. They investigate failed payments and broken deploys, and wait for your approval before they refund, flag, or retry.',
  openGraph: {
    title: 'Athena · AI agents for payment and incident operations',
    description: 'Two agents, one runtime. Every refund, flag, and deploy retry waits for a person.',
    type: 'website',
  },
};

function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'action'; children: React.ReactNode }) {
  const cls = {
    ok: 'border-ok-line bg-ok-soft text-ok',
    warn: 'border-warn-line bg-warn-soft text-warn',
    bad: 'border-bad-line bg-bad-soft text-bad',
    neutral: 'border-line bg-surface text-ink-soft',
    action: 'border-action-line bg-action-soft text-action',
  }[tone];
  return <span className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-sm border px-1.5 text-[12px] font-medium ${cls}`}>{children}</span>;
}

function Line({ t, kind, children, dot }: { t: string; kind: string; children: React.ReactNode; dot: string }) {
  return (
    <li className="grid grid-cols-[62px_14px_minmax(0,1fr)] gap-x-2.5">
      <span className="mono pt-[1px] text-right text-[11.5px] text-muted">{t}<br />{kind}</span>
      <span className="relative flex justify-center"><span className={`mt-[5px] h-2 w-2 rounded-full ${dot}`} /></span>
      <span className="min-w-0 text-[13.5px] leading-snug text-ink">{children}</span>
    </li>
  );
}

/** The product's run view, as live HTML: a MoneyGuard investigation paused for approval */
function RunWindow() {
  return (
    <div className="lp-win" aria-hidden>
      <div className="lp-win__bar">
        <span className="lp-win__dots"><i /><i /><i /></span>
        <span>Athena · Runs</span>
      </div>
      <div className="grid h-full grid-cols-[1fr_190px] pr-[44px]">
        <div className="min-w-0 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Chip tone="warn">Needs approval</Chip>
            <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm border border-line px-1.5 text-[12px] font-medium text-ink-soft">
              <span className="h-2 w-2 rounded-[2px] bg-action" />MoneyGuard
            </span>
          </div>
          <div className="text-[17px] font-medium leading-snug tracking-[-0.02em]">Investigate Bachs payment ch_9f4c1d2e7b6a</div>
          <ol className="mt-5 space-y-3.5">
            <Line t="14:02:11" kind="tool" dot="bg-ok">get_transaction_details <span className="text-muted">· 2,500,000.00 NGN, 3 failed attempts</span></Line>
            <Line t="14:02:12" kind="tool" dot="bg-ok">search_transaction_history <span className="text-muted">· 1 open dispute</span></Line>
            <Line t="14:02:14" kind="tool" dot="bg-ok">check_risk_rules <span className="text-muted">· score 85, high</span></Line>
            <Line t="14:02:15" kind="agent" dot="bg-ink">The bank-transfer sender name does not match the customer. Flagging the customer so future payments are reviewed.</Line>
            <Line t="14:02:15" kind="approval" dot="bg-warn">flag_customer is waiting for a person</Line>
          </ol>
        </div>
        <div className="space-y-3 border-l border-line bg-bg p-4">
          <div className="text-[12px] font-medium text-muted">Risk rules</div>
          {[
            ['large_amount', 20],
            ['fraud_signal', 30],
            ['payer_mismatch', 15],
            ['prior_disputes', 30],
          ].map(([rule, w]) => (
            <div key={rule as string}>
              <div className="mono flex justify-between text-[11.5px] text-ink-soft"><span>{rule}</span><span>+{w}</span></div>
              <div className="mt-1 h-1 rounded-full bg-surface"><div className="h-1 rounded-full bg-action" style={{ width: `${(Number(w) / 30) * 100}%` }} /></div>
            </div>
          ))}
          <div className="border-t border-line pt-3">
            <div className="text-[12px] text-muted">Run</div>
            <div className="mono mt-1 text-[11.5px] leading-5 text-ink-soft">4 tool calls<br />5 model turns<br />18,420 tokens in</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalNote() {
  return (
    <div className="lp-note" aria-hidden>
      <div className="flex items-center justify-between">
        <span className="mono text-[13px] font-medium">flag_customer</span>
        <Chip tone="ok">Approved</Chip>
      </div>
      <ul className="mt-3 space-y-2 text-[13px] text-ink-soft">
        <li className="lp-step flex gap-2"><span className="text-warn">!</span>Asked at 14:02 with its reasons</li>
        <li className="lp-step flex gap-2"><span className="text-ok">✓</span>Read by Ada, approved 14:04</li>
        <li className="lp-step flex gap-2"><span className="text-ok">✓</span>Flag written to the customer</li>
        <li className="lp-step flex gap-2"><span className="text-ok">✓</span>Team notified in Slack</li>
      </ul>
    </div>
  );
}

function RiskPanel() {
  const rows: Array<[string, string, 'ok' | 'warn' | 'bad', string]> = [
    ['Tunde Adeyemi', '2,500,000.00 NGN', 'bad', 'High · 85'],
    ['Grace Okon', '50,000.00 of 75,000.00 NGN', 'warn', 'Underpaid'],
    ['Musa Bello', '18,400.00 NGN', 'ok', 'Low · 0'],
    ['Amara Eze', '120.00 USD', 'ok', 'Low · 10'],
  ];
  return (
    <div className="lp-panel-ui" aria-hidden>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="text-[15px] font-medium">Bachs payments</span>
        <Chip tone="warn">Sandbox</Chip>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(([name, amount, tone, risk]) => (
          <li key={name} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium">{name}</div>
              <div className="mono text-[12px] text-muted">{amount}</div>
            </div>
            <Chip tone={tone}>{risk}</Chip>
          </li>
        ))}
      </ul>
      <div className="border-t border-line bg-bg px-5 py-4">
        <div className="text-[12px] font-medium text-muted">Case opened by MoneyGuard</div>
        <div className="mt-1 text-[14px] font-medium">Payment after three failed attempts from a new sender</div>
        <div className="mt-1 text-[13px] text-ink-soft">Hold fulfilment until the sender is confirmed.</div>
      </div>
    </div>
  );
}

function IncidentPanel() {
  return (
    <div className="lp-panel-ui" aria-hidden>
      <div className="grid grid-cols-3 gap-2 border-b border-line p-4">
        {[
          ['checkout-api', true, '200 · 48 ms'],
          ['payments-worker', true, '200 · 61 ms'],
          ['search', false, 'ECONNREFUSED'],
        ].map(([name, ok, detail]) => (
          <div key={name as string} className={`rounded-md border p-3 ${ok ? 'border-line' : 'border-bad-line bg-bad-soft'}`}>
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              <span className={`h-2 w-2 rounded-full ${ok ? 'bg-ok' : 'bg-bad'}`} />{name}
            </div>
            <div className="mono mt-1 text-[11.5px] text-muted">{detail}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <img src="/icons/github.svg" alt="" width={16} height={16} />
          <span className="mono text-[12px] text-muted">acme/shop · issue #214</span>
          <Chip tone="bad">SEV2</Chip>
        </div>
        <div className="mt-2 text-[16px] font-medium leading-snug">Search returns no results after the 13:40 deploy</div>
        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-snug text-ink-soft">
          <li>Impact: search requests fail since 13:41.</li>
          <li>Evidence: run 9182 failed at “Migrate index”; logs show connection refused.</li>
          <li>Likely cause: the index migration left the service without a database.</li>
        </ul>
        <div className="mt-4 flex items-center justify-between rounded-md border border-warn-line bg-warn-soft px-3 py-2.5">
          <span className="text-[13px] text-warn">Re-run failed jobs of run 9182?</span>
          <span className="flex gap-1.5">
            <span className="btn btn-secondary btn-sm h-7 px-2.5 text-[12px]">Reject</span>
            <span className="btn btn-primary btn-sm h-7 px-2.5 text-[12px]">Approve</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Diagram() {
  return (
    <div className="card relative flex-1 p-6 md:p-10" aria-label="Triggers from Bachs, GitHub and health checks reach the Athena runtime, which runs MoneyGuard and OpsGuard">
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
        <g fill="none" strokeWidth="0.35">
          {[24, 50, 76].map((y) => (
            <g key={y}>
              <path d={`M31 ${y} C 36 ${y}, 36 50, 38 50`} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
              <path className="pulse-line" d={`M31 ${y} C 36 ${y}, 36 50, 38 50`} stroke="var(--action)" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {[34, 66].map((y) => (
            <g key={y}>
              <path d={`M62 50 C 65 50, 65 ${y}, 69 ${y}`} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
              <path className="pulse-line" d={`M62 50 C 65 50, 65 ${y}, 69 ${y}`} stroke="var(--action)" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      </svg>
      <div className="relative grid h-full gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] md:items-center">
        <div className="space-y-3">
          {[
            [<span key="b" className="mono text-[13px] font-semibold">B</span>, 'Bachs', 'collection.failed, dispute.created'],
            [<img key="g" src="/icons/github.svg" alt="" width={20} height={20} />, 'GitHub', 'workflow_run failed'],
            [<span key="h" className="h-2.5 w-2.5 rounded-full bg-ok" />, 'Health checks', 'every 15 minutes'],
          ].map(([icon, name, detail]) => (
            <div key={name as string} className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-bg">{icon}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{name}</span>
                <span className="mono block truncate text-[12px] text-muted">{detail}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-inv p-6 text-inv-ink">
          <div className="flex items-center justify-between text-[13px] text-inv-muted">
            <span>Shared runtime</span>
            <span className="flex items-center gap-1.5"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[#7fd3c9]" />running</span>
          </div>
          <div className="mt-2 text-[28px] font-medium tracking-[-0.03em]">Athena</div>
          <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2 text-[14px] text-inv-muted">
            <li>Tool registry</li><li>Permissions</li><li>Approvals</li><li>Memory</li><li>Workflows</li><li>Live monitor</li>
          </ul>
          <div className="mt-5 flex items-center gap-3 border-t border-inv-surface pt-4 text-[13px] text-inv-muted">
            Models
            <img src="/icons/anthropic.svg" alt="Anthropic" width={22} height={15} className="invert" />
            <img src="/icons/groq.svg" alt="Groq" width={48} height={13} className="invert" />
          </div>
        </div>
        <div className="space-y-3">
          {[
            ['MoneyGuard', '9 tools · payments, risk, refunds', 'bg-action'],
            ['OpsGuard', '11 tools · services, deploys, incidents', 'bg-ink'],
          ].map(([name, detail, bar]) => (
            <div key={name} className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-4">
              <span className={`h-9 w-1 rounded-full ${bar}`} />
              <span>
                <span className="block text-[16px] font-medium">{name}</span>
                <span className="block text-[13px] text-muted">{detail}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <img src="/icons/slack.svg" alt="" width={15} height={15} /> One notification tool, used by both
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeCard() {
  return (
    <div className="rounded-lg bg-inv p-6 md:p-8" aria-label="An Athena application definition in TypeScript">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-inv-muted">
        <span className="mono">apps/moneyguard/src/index.ts</span>
      </div>
      <pre className="lp-code overflow-x-auto">
        <span className="k">export const</span> moneyGuardApp: AthenaApplication = {'{'}{'\n'}
        {'  '}id: <span className="s">&apos;moneyguard&apos;</span>,{'\n'}
        {'  '}name: <span className="s">&apos;MoneyGuard&apos;</span>,{'\n'}
        {'  '}tools: moneyGuardTools,{'      '}<span className="c">{"// Zod schema, risk level, permissions"}</span>{'\n'}
        {'  '}agent: moneyGuardAgent,{'      '}<span className="c">{"// prompt, model, grants"}</span>{'\n'}
        {'  '}workflows: moneyGuardWorkflows, <span className="c">{"// bachs.collection.failed …"}</span>{'\n'}
        {'  '}env: [{'{'} name: <span className="s">&apos;BACHS_API_KEY&apos;</span> {'}'}],{'\n'}
        {'}'};{'\n'}{'\n'}
        registerApplication(moneyGuardApp);{'\n'}
        registerApplication(opsGuardApp);{'  '}<span className="c">{"// same runtime, no new loop"}</span>
      </pre>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <LandingNav />
      <main id="top">
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="wrap lp-hero__grid">
            <div className="lp-hero__text">
              <h1 id="hero-h" className="lp-h1">
                <span className="lp-rise"><span>AI agents for</span></span>
                <span className="lp-rise"><span>payments and</span></span>
                <span className="lp-rise"><span>incidents</span></span>
              </h1>
              <p className="lp-hero__lead lp-fade">
                MoneyGuard investigates failed and disputed Bachs payments. OpsGuard works out why a deploy or a service broke. Both run on one runtime, and every refund, flag, and retry waits for your approval.
              </p>
              <div className="lp-btns lp-fade lp-fade--2 mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn btn-md btn-primary">Open the console</Link>
                <a href="#how" className="btn btn-md btn-secondary">See how it works</a>
              </div>
              <p className="lp-hero__proof lp-fade lp-fade--3">
                Runs on
                <img src="/icons/anthropic.svg" alt="Anthropic Claude" width={18} height={12} />
                Claude or
                <img src="/icons/groq.svg" alt="Groq" width={40} height={11} />
                with Bachs, GitHub, and Slack.
              </p>
            </div>
            <div className="lp-hero__art lp-art-in" role="img" aria-label="A MoneyGuard run in the Athena console: four tool calls, a risk score of 85, and a customer flag waiting for approval">
              <RunWindow />
              <ApprovalNote />
            </div>
          </div>
        </section>

        <section id="how" className="lp-section lp-section--alt" aria-labelledby="how-h">
          <div className="wrap">
            <div className="lp-head">
              <h2 id="how-h" className="lp-h2">One runtime runs both agents. <span className="muted">Each app is a file of tools and a prompt.</span></h2>
              <p className="lp-lead">Webhooks, schedules, and your own reports start a run. The runtime checks every tool call against the agent’s permissions, pauses the risky ones for a person, and records each step.</p>
            </div>
            <Diagram />
          </div>
        </section>

        <section id="moneyguard" className="lp-section" aria-labelledby="mg-h">
          <div className="wrap">
            <div className="lp-split">
              <div className="lp-split__text">
                <h2 id="mg-h" className="lp-h2">MoneyGuard reads every Bachs payment.</h2>
                <p className="lp-lead">When a payment fails, comes up short, or gets disputed, MoneyGuard pulls the payment, the customer, and their history, then scores it against twelve risk rules.</p>
                <div className="lp-points">
                  <div className="lp-point"><b>Amounts stay exact</b><span>Bachs money stays a decimal string in its own currency, with a threshold per currency from NGN to USD.</span></div>
                  <div className="lp-point"><b>Cases with the evidence</b><span>Medium and high risk open a case that names the rules that fired.</span></div>
                  <div className="lp-point lp-hide-phone"><b>Refunds wait for you</b><span>A refund is checked against Bachs’ one-per-charge rule and sent once.</span></div>
                </div>
              </div>
              <div className="lp-split__art" role="img" aria-label="MoneyGuard's payment list with risk levels and a case it opened">
                <RiskPanel />
              </div>
            </div>
          </div>
        </section>

        <section id="opsguard" className="lp-section lp-section--alt" aria-labelledby="og-h">
          <div className="wrap">
            <div className="lp-split lp-split--flip">
              <div className="lp-split__text">
                <h2 id="og-h" className="lp-h2">OpsGuard finds why it broke.</h2>
                <p className="lp-lead">OpsGuard checks your services over HTTP, reads the logs you allow, and lines failed GitHub Actions runs up against the moment errors started.</p>
                <div className="lp-points">
                  <div className="lp-point"><b>An incident, written up</b><span>Impact, evidence, and likely cause in a GitHub issue, updated as it learns more.</span></div>
                  <div className="lp-point"><b>Only the URLs you list</b><span>It can reach the services in your config and nothing else.</span></div>
                  <div className="lp-point lp-hide-phone"><b>Retries on your word</b><span>Re-running a failed deploy goes through the same approval queue as a refund.</span></div>
                </div>
              </div>
              <div className="lp-split__art" role="img" aria-label="OpsGuard showing one service down and the incident issue it wrote">
                <IncidentPanel />
              </div>
            </div>
          </div>
        </section>

        <LettersAssemble
          statement="Nothing moves without you"
          sub="Agents read on their own. Refunds, customer flags, and deploy retries stop at the approval queue with the agent’s reasons, and a rejection goes back to the agent with your note."
        />

        <section id="build" className="lp-section lp-section--alt" aria-labelledby="build-h">
          <div className="wrap">
            <div className="lp-split">
              <div className="lp-split__text">
                <h2 id="build-h" className="lp-h2">A new agent is one file. <span className="muted">The runtime is already there.</span></h2>
                <p className="lp-lead">An application lists its tools, its prompt, its permissions, and the events that start it. Register it and it shows up in the console with approvals, memory, and the live timeline.</p>
                <div className="lp-points">
                  <div className="lp-point"><b>Typed tools</b><span>Each tool has a Zod schema the model sees as JSON Schema, a risk level, and the permissions it needs.</span></div>
                  <div className="lp-point lp-hide-phone"><b>Signed triggers</b><span>Bachs, GitHub, and per-workflow webhooks are verified and de-duplicated.</span></div>
                </div>
              </div>
              <div className="lp-split__art flex items-center p-6 md:p-12">
                <div className="w-full"><CodeCard /></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="lp-close" aria-labelledby="close-h">
        <div className="wrap flex flex-1 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <h2 id="close-h" className="max-w-[18ch] text-[clamp(28px,1.6vw+20px,40px)] leading-[1.1] tracking-[-0.035em]">
              Put an agent on your payments and deploys today.
            </h2>
            <Link href="/register" className="btn btn-md border-inv-ink bg-inv-ink text-inv hover:bg-white">Open the console</Link>
          </div>
          <div className="lp-close__word" aria-hidden>Athena</div>
          <div className="lp-footer mt-10 grid gap-6 border-t border-inv-surface pt-6 text-[14px] md:grid-cols-4">
            <div className="text-inv-muted">One runtime for AI agents that ask before they act.</div>
            <nav aria-label="Product" className="flex flex-col gap-2">
              <a href="#moneyguard">MoneyGuard</a>
              <a href="#opsguard">OpsGuard</a>
              <a href="#how">How it works</a>
            </nav>
            <nav aria-label="Console" className="flex flex-col gap-2">
              <Link href="/login">Sign in</Link>
              <Link href="/register">Create an account</Link>
            </nav>
            <div className="text-inv-muted">Product names and logos are trademarks of their owners.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
