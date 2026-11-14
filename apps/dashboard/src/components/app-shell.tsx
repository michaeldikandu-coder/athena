'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { LoadingBlock } from './ui';
import { api } from '@/lib/api';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';

const PRIMARY = [
  { href: '/overview', label: 'Overview' },
  { href: '/apps/moneyguard', label: 'MoneyGuard' },
  { href: '/apps/opsguard', label: 'OpsGuard' },
  { href: '/executions', label: 'Runs' },
  { href: '/approvals', label: 'Approvals', badge: true },
];

const BUILD = [
  { href: '/agents', label: 'Agents', text: 'Prompts, models, tools, and permissions for each agent.', icon: 'agent' },
  { href: '/workflows', label: 'Workflows', text: 'Webhook, event, and schedule triggers with their steps.', icon: 'flow' },
  { href: '/tools', label: 'Tool registry', text: 'Every tool, its risk level, and the permissions it needs.', icon: 'tool' },
  { href: '/apps', label: 'Applications', text: 'Install MoneyGuard and OpsGuard on the shared runtime.', icon: 'apps' },
  { href: '/settings/connections', label: 'Connections', text: 'Your Bachs, GitHub and Slack accounts, and the services to watch.', icon: 'plug' },
] as const;

function isActive(pathname: string, href: string): boolean {
  // /apps is the Applications list only; /apps/moneyguard and /apps/opsguard have their own words
  if (href === '/apps') return pathname === '/apps';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Glyph({ name }: { name: (typeof BUILD)[number]['icon'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...common}>
      {name === 'agent' && (<><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" /></>)}
      {name === 'flow' && (<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8M18 8l-5 8" /></>)}
      {name === 'tool' && (<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17v3h3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" />)}
      {name === 'plug' && (<><path d="M9 3v4M15 3v4" /><path d="M6 7h12v3a6 6 0 0 1-12 0z" /><path d="M12 16v5" /></>)}
      {name === 'apps' && (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>)}
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/overview" className="flex shrink-0 items-center gap-2.5" aria-label="Athena overview">
      <span className="mark-dots" aria-hidden />
      <span className="text-[20px] font-medium tracking-[-0.03em]">Athena</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const connected = useRealtimeStatus();
  const [pending, setPending] = useState(0);
  const [buildOpen, setBuildOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dbIssue, setDbIssue] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    setBuildOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const loadPending = useCallback(
    () =>
      api<unknown[]>('/approvals?status=pending')
        .then(({ data }) => setPending(data.length))
        .catch(() => undefined),
    []
  );

  // Database and API health, shown as a strip under the header when something is wrong
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      setApiDown(!body);
      setDbIssue(body && body.data && !body.data.database ? body.data.databaseReason ?? 'The database is not connected.' : null);
    } catch {
      setApiDown(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadPending();
    void checkHealth();
    const timer = setInterval(() => void checkHealth(), 15000);
    return () => clearInterval(timer);
  }, [user, loadPending, checkHealth]);

  useRealtime((message) => {
    if (message.type === 'approval.requested' || message.type === 'approval.decided') void loadPending();
  });

  const openBuild = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setBuildOpen(true), 150);
  };
  const closeBuild = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    setBuildOpen(false);
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  const buildActive = BUILD.some((b) => isActive(pathname, b.href));

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-sm bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <header className="fixed inset-x-0 top-0 z-30 border-b border-line bg-bg" onMouseLeave={closeBuild}>
        <div className="wrap flex h-[var(--nav)] items-center gap-6">
          <Logo />
          <nav className="hidden h-full flex-1 items-center gap-1 lg:flex" aria-label="Main">
            {PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={clsx(
                  'nav-word inline-flex h-10 items-center gap-2 rounded-sm px-3 text-[15px] font-medium',
                  isActive(pathname, item.href) ? 'text-ink' : 'text-ink-soft hover:text-ink'
                )}
              >
                {item.label}
                {item.badge && pending > 0 && (
                  <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-warn px-1 text-[12px] font-semibold text-white">
                    {pending}
                  </span>
                )}
              </Link>
            ))}
            <div className="flex h-full items-center" onMouseEnter={openBuild}>
              <button
                type="button"
                aria-expanded={buildOpen}
                aria-controls="build-panel"
                onClick={() => setBuildOpen((v) => !v)}
                className={clsx(
                  'nav-word inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-[15px] font-medium',
                  buildActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                )}
                {...(buildActive ? { 'aria-current': 'page' as const } : {})}
              >
                Build
                <svg viewBox="0 0 12 12" className={clsx('h-3 w-3 opacity-60 transition-transform', buildOpen && 'rotate-180')} aria-hidden>
                  <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </nav>

          <div className="ml-auto hidden items-center gap-4 lg:flex">
            <span className="flex items-center gap-2 text-label font-medium text-muted" title={connected ? 'Live updates connected' : 'Reconnecting live updates'}>
              <span className={clsx('h-2 w-2 rounded-full', connected ? 'live-dot bg-ok' : 'bg-line-strong')} />
              {connected ? 'Live' : 'Offline'}
            </span>
            <div className="h-6 w-px bg-line" />
            <div className="text-right leading-tight">
              <div className="text-[14px] font-medium">{user.name}</div>
              <div className="text-label text-muted">{user.email}</div>
            </div>
            <button
              onClick={() => void logout().then(() => router.replace('/login'))}
              className="btn btn-secondary btn-sm"
            >
              Sign out
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary ml-auto h-11 w-11 p-0 lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              {menuOpen ? <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /> : <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />}
            </svg>
          </button>
        </div>

        {buildOpen && (
          <div id="build-panel" className="nav-panel hidden border-t border-line bg-bg lg:block">
            <div className="wrap grid grid-cols-5 gap-4 py-5">
              {BUILD.map((item) => (
                <Link key={item.href} href={item.href} className="card-link group flex gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink">
                    <Glyph name={item.icon} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-medium text-ink">{item.label}</span>
                    <span className="mt-1 block text-[14px] leading-snug text-ink-soft">{item.text}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {(apiDown || dbIssue) && (
          <div className="border-t border-bad-line bg-bad-soft" role="alert">
            <div className="wrap flex items-start gap-3 py-2.5 text-[14px] text-bad">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bad" aria-hidden />
              <span>
                {apiDown ? (
                  <><strong className="font-medium">The Athena API is not answering.</strong> Start it with <span className="mono">npm run dev:api</span> and check its terminal.</>
                ) : (
                  <><strong className="font-medium">Database unavailable.</strong> {dbIssue}</>
                )}
              </span>
            </div>
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-20 overflow-y-auto bg-bg pt-[var(--nav)] lg:hidden" onClick={() => setMenuOpen(false)}>
          <nav className="wrap flex flex-col py-4" aria-label="Main">
            {[...PRIMARY, ...BUILD].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className="flex h-14 items-center justify-between border-b border-line text-[17px] font-medium"
              >
                {item.label}
                {'badge' in item && item.badge && pending > 0 && (
                  <span className="rounded-sm bg-warn px-1.5 text-[12px] font-semibold text-white">{pending}</span>
                )}
              </Link>
            ))}
            <div className="mt-6 flex items-center justify-between text-[14px]">
              <span className="text-muted">{user.email}</span>
              <button onClick={() => void logout().then(() => router.replace('/login'))} className="btn btn-secondary btn-md">
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}

      <main id="main" className={clsx('wrap pb-24', apiDown || dbIssue ? 'pt-[calc(var(--nav)+88px)]' : 'pt-[calc(var(--nav)+48px)]')}>
        {children}
      </main>
    </div>
  );
}
