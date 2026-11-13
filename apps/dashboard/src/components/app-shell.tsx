'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { LoadingBlock } from './ui';
import { api } from '@/lib/api';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/apps', label: 'Applications' },
  { href: '/apps/moneyguard', label: 'MoneyGuard', indent: true },
  { href: '/apps/opsguard', label: 'OpsGuard', indent: true },
  { href: '/agents', label: 'Agents' },
  { href: '/executions', label: 'Executions' },
  { href: '/approvals', label: 'Approvals', badge: true },
  { href: '/workflows', label: 'Workflows' },
  { href: '/tools', label: 'Tool Registry' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/apps') return pathname === '/apps';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const connected = useRealtimeStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  const loadPending = () =>
    api<unknown[]>('/approvals?status=pending')
      .then(({ data }) => setPending(data.length))
      .catch(() => undefined);

  useEffect(() => {
    if (user) void loadPending();
  }, [user]);

  useRealtime((message) => {
    if (message.type === 'approval.requested' || message.type === 'approval.decided') void loadPending();
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="px-4 py-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-sm font-bold text-white">
              A
            </span>
            <span className="text-sm font-semibold tracking-wide">Athena</span>
          </Link>
          <p className="mt-1 text-[11px] text-ink-400">One skeleton, many agents</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm',
                item.indent && 'ml-3 text-[13px]',
                isActive(pathname, item.href)
                  ? 'bg-ink-800 text-ink-100'
                  : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100'
              )}
            >
              {item.label}
              {item.badge && pending > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-ink-950">
                  {pending}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-ink-800 p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 text-ink-400">
            <span className={clsx('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-ink-600')} />
            {connected ? 'Live updates on' : 'Connecting…'}
          </div>
          <div className="truncate text-ink-300">{user.name}</div>
          <div className="truncate text-ink-400">{user.email}</div>
          <button
            onClick={() => void logout().then(() => router.replace('/login'))}
            className="mt-2 text-ink-400 hover:text-ink-100"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
