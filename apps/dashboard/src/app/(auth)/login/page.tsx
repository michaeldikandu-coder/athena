'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button, ErrorBanner } from '@/components/ui';
import { AuthFrame } from '@/components/auth-frame';
import { describeError } from '@/lib/api';

function safeNext(value: string | null): string {
  // Only allow same-site relative paths
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      <p className="text-[15px] text-ink-soft">
        No account? <Link href="/register" className="link font-medium">Create one</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame title="Sign in to the agent console" lead="Watch MoneyGuard and OpsGuard work, and approve refunds, flags, and deploy retries before they happen.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
