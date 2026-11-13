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
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-accent-600 text-white hover:bg-accent-500',
        variant === 'secondary' && 'border border-ink-700 bg-ink-850 text-ink-100 hover:bg-ink-800',
        variant === 'danger' && 'bg-red-600/90 text-white hover:bg-red-500',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-500',
        variant === 'ghost' && 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
        className
      )}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'h-4 w-4'
      )}
    />
  );
}

export function Card({
  children,
  className,
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={clsx('rounded-lg border border-ink-800 bg-ink-900', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-100">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-400">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-ink-700 text-ink-100',
  running: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  waiting_approval: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  cancelled: 'bg-ink-700 text-ink-300',
  approved: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  expired: 'bg-ink-700 text-ink-300',
  active: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  inactive: 'bg-ink-700 text-ink-300',
};

export function StatusBadge({ status }: { status: ExecutionStatus | string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-ink-700 text-ink-100'
      )}
    >
      {(status === 'running' || status === 'waiting_approval') && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {status.replace('_', ' ')}
    </span>
  );
}

const LEVEL_STYLES = {
  low: 'bg-ink-700 text-ink-300',
  medium: 'bg-amber-500/15 text-amber-300',
  high: 'bg-red-500/15 text-red-300',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'low' | 'medium' | 'high' | 'success';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-ink-800 text-ink-300',
        tone === 'accent' && 'bg-accent-600/20 text-accent-400',
        tone === 'success' && 'bg-emerald-500/15 text-emerald-300',
        (tone === 'low' || tone === 'medium' || tone === 'high') && LEVEL_STYLES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function AppBadge({ application }: { application: string | null | undefined }) {
  if (!application) return <Badge>custom</Badge>;
  return (
    <Badge
      className={clsx(
        application === 'moneyguard' && 'bg-emerald-500/15 text-emerald-300',
        application === 'opsguard' && 'bg-sky-500/15 text-sky-300'
      )}
    >
      {application}
    </Badge>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-700 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-300">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-400">{children}</div>}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-ink-400">
      <Spinner /> Loading…
    </div>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={clsx(
        'max-h-80 overflow-auto rounded-md bg-ink-950 p-3 font-mono text-xs leading-relaxed text-ink-300',
        className
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-accent-400 hover:text-accent-500 hover:underline">
      {children}
    </Link>
  );
}
