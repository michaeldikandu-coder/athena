'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ExecutionStatus } from '@/lib/types';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx('btn', size === 'sm' ? 'btn-sm' : 'btn-md', `btn-${variant}`, className)}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={clsx('btn', size === 'sm' ? 'btn-sm' : 'btn-md', `btn-${variant}`, className)}>
      {children}
    </Link>
  );
}

export function Arrow() {
  return (
    <svg className="arrow h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className ?? 'h-4 w-4')}
    />
  );
}

export function Card({
  children,
  className,
  title,
  actions,
  flush,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  /** No inner padding (for tables) */
  flush?: boolean;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex min-h-[56px] flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3 text-label font-medium text-muted">{eyebrow}</div>}
        <div className="overflow-hidden pb-1">
          <h1 className="enter-rise text-[clamp(28px,1.6vw+20px,40px)] leading-[1.08]">{title}</h1>
        </div>
        {description && <p className="enter-fade mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="enter-fade flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'action' | 'ok' | 'warn' | 'bad';

const TONE: Record<Tone, string> = {
  neutral: 'border-line bg-surface text-ink-soft',
  action: 'border-action-line bg-action-soft text-action',
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  bad: 'border-bad-line bg-bad-soft text-bad',
};

const STATUS_TONE: Record<string, Tone> = {
  pending: 'neutral',
  running: 'action',
  waiting_approval: 'warn',
  completed: 'ok',
  failed: 'bad',
  cancelled: 'neutral',
  approved: 'ok',
  rejected: 'bad',
  expired: 'neutral',
  active: 'ok',
  inactive: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  waiting_approval: 'Needs approval',
  pending: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  active: 'Active',
  inactive: 'Off',
};

export function StatusBadge({ status, kind }: { status: ExecutionStatus | string; kind?: 'approval' }) {
  // An approval that is pending is waiting on a person, not queued
  if (kind === 'approval' && status === 'pending') status = 'waiting_approval';
  const tone = STATUS_TONE[status] ?? 'neutral';
  const live = status === 'running' || status === 'waiting_approval';
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 text-label font-medium', TONE[tone])}>
      <span className={clsx('h-1.5 w-1.5 rounded-full bg-current', live && 'live-dot')} aria-hidden />
      {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone | 'low' | 'medium' | 'high';
  className?: string;
}) {
  const resolved: Tone = tone === 'low' ? 'neutral' : tone === 'medium' ? 'warn' : tone === 'high' ? 'bad' : tone;
  return (
    <span className={clsx('inline-flex h-[22px] items-center whitespace-nowrap rounded-sm border px-1.5 text-label font-medium', TONE[resolved], className)}>
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('mono text-[13px] text-ink-soft', className)}>{children}</span>;
}

const APP_NAME: Record<string, string> = { moneyguard: 'MoneyGuard', opsguard: 'OpsGuard' };

export function AppBadge({ application }: { application: string | null | undefined }) {
  if (!application) return <Badge>Custom</Badge>;
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm border border-line bg-card px-1.5 text-label font-medium text-ink-soft">
      <span className={clsx('h-2 w-2 rounded-[2px]', application === 'moneyguard' ? 'bg-action' : 'bg-ink')} aria-hidden />
      {APP_NAME[application] ?? application}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-5 flex gap-3 rounded-md border border-bad-line bg-bad-soft px-4 py-3 text-[15px] text-bad">
      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5v4M8 11v.01" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-bg px-6 py-10 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-[15px] text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={clsx('mono max-h-80 overflow-auto rounded-md border border-line bg-bg p-3 text-[12.5px] leading-relaxed text-ink-soft', className)}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="link text-[15px] font-medium">
      {children}
    </Link>
  );
}

export function Dl({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
