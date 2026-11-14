'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button, ErrorBanner } from '@/components/ui';
import { AuthFrame } from '@/components/auth-frame';
import { describeError } from '@/lib/api';

export default function RegisterPage() {
  const { register, user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/apps');
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(name, email, password);
      router.replace('/apps');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Create your console account" lead="The first account on a new install becomes the admin. You can install both agents right after.">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1.5 text-label text-muted">At least 8 characters with upper and lower case letters and a number.</p>
        </div>
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
        <p className="text-[15px] text-ink-soft">
          Already have an account? <Link href="/login" className="link font-medium">Sign in</Link>
        </p>
      </form>
    </AuthFrame>
  );
}
