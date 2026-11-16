'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * In-app navigation history, kept in sessionStorage so it survives reloads
 * within the tab. Used to send "Back" to the page the user actually came from.
 */
const KEY = 'athena:nav-history';
const MAX = 30;

function read(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Record a visit. Arriving at the entry before the current one is treated as
 * going back (browser button or our button), so the stack mirrors history.
 */
function record(path: string): string[] {
  const stack = read();
  if (stack[stack.length - 1] === path) return stack;
  if (stack[stack.length - 2] === path) stack.pop();
  else stack.push(path);
  const trimmed = stack.slice(-MAX);
  sessionStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

/** Pages reachable from the main nav, which never show a back button */
const TOP_LEVEL = new Set(['/overview', '/apps/moneyguard', '/apps/opsguard', '/executions', '/approvals']);

const LABELS: Array<[RegExp, string]> = [
  [/^\/overview$/, 'Overview'],
  [/^\/apps\/moneyguard$/, 'MoneyGuard'],
  [/^\/apps\/opsguard$/, 'OpsGuard'],
  [/^\/apps$/, 'Applications'],
  [/^\/executions$/, 'Runs'],
  [/^\/executions\/[^/]+$/, 'run'],
  [/^\/approvals$/, 'Approvals'],
  [/^\/agents$/, 'Agents'],
  [/^\/agents\/new$/, 'new agent'],
  [/^\/agents\/[^/]+$/, 'agent'],
  [/^\/workflows$/, 'Workflows'],
  [/^\/workflows\/new$/, 'new workflow'],
  [/^\/workflows\/[^/]+$/, 'workflow'],
  [/^\/tools$/, 'Tool registry'],
  [/^\/custom-tools$/, 'Custom tools'],
  [/^\/settings\/connections$/, 'Connections'],
];

function labelFor(path: string): string {
  const pathname = path.split(/[?#]/)[0];
  return LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'previous page';
}

/** Where Back goes when the page was opened directly (new tab, shared link) */
function parentOf(pathname: string): string {
  if (/^\/executions\/./.test(pathname)) return '/executions';
  if (/^\/agents\/./.test(pathname)) return '/agents';
  if (/^\/workflows\/./.test(pathname)) return '/workflows';
  return '/overview';
}

function ArrowLeft() {
  return (
    <svg className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CLASS =
  'group inline-flex h-9 items-center gap-2 rounded-sm pr-2 text-[14px] font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action';

/**
 * Tracks navigation and renders "Back to …" on pages outside the main nav.
 */
export function BackButton({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    // Keep the query string (e.g. /executions?application=opsguard) so Back restores filters
    const stack = record(`${pathname}${window.location.search}`);
    setPrevious(stack.length > 1 ? stack[stack.length - 2] : null);
  }, [pathname]);

  if (TOP_LEVEL.has(pathname)) return null;

  if (previous) {
    return (
      <button type="button" className={CLASS} onClick={() => router.back()}>
        <ArrowLeft />
        Back to {labelFor(previous)}
      </button>
    );
  }
  const parent = parentOf(pathname);
  return (
    <Link href={parent} className={CLASS}>
      <ArrowLeft />
      Back to {labelFor(parent)}
    </Link>
  );
}
