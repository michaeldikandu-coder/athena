'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';

const WORDS = [
  { href: '#how', label: 'Runtime' },
  { href: '#moneyguard', label: 'MoneyGuard' },
  { href: '#opsguard', label: 'OpsGuard' },
  { href: '#build', label: 'Developers' },
];

export function LandingNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="lp-nav">
      <div className="wrap flex h-full items-center gap-8">
        <a href="#top" className="sr-only rounded-sm bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50">
          Skip to content
        </a>
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Athena home">
          <span className="mark-dots" aria-hidden />
          <span className="text-[20px] font-medium tracking-[-0.03em]">Athena</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Page">
          {WORDS.map((w) => (
            <a key={w.href} href={w.href} className="nav-word inline-flex h-10 items-center rounded-sm px-3 text-[15px] font-medium text-ink-soft hover:text-ink">
              {w.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {user ? (
            <Link href="/overview" className="btn btn-md btn-primary">Open the console</Link>
          ) : (
            <>
              <Link href="/login" className="nav-word inline-flex h-10 items-center px-3 text-[15px] font-medium text-ink-soft hover:text-ink">Sign in</Link>
              <Link href="/register" className="btn btn-md btn-primary">Open the console</Link>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <Link href={user ? '/overview' : '/register'} className="btn btn-md btn-primary hidden sm:inline-flex">Open the console</Link>
          <button
            type="button"
            className="btn btn-secondary h-11 w-11 p-0"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              {open ? <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /> : <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 top-14 z-20 bg-bg lg:hidden" onClick={() => setOpen(false)}>
          <nav className="wrap flex flex-col py-4" aria-label="Page">
            {WORDS.map((w) => (
              <a key={w.href} href={w.href} className="flex h-14 items-center border-b border-line text-[17px] font-medium">{w.label}</a>
            ))}
            <Link href="/login" className="flex h-14 items-center border-b border-line text-[17px] font-medium">Sign in</Link>
            <Link href={user ? '/overview' : '/register'} className="btn btn-md btn-primary mt-6 w-full">Open the console</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
