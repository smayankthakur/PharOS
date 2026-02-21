'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const LoginPage = (): React.JSX.Element => {
  const router = useRouter();
  const [email, setEmail] = useState('owner@shakti.test');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? 'Login failed');
        return;
      }

      const host =
        typeof window !== 'undefined' ? (window.location.host.toLowerCase().split(':')[0] ?? '') : '';
      const hasTenantSubdomain = host.endsWith('.pharos.local') && host !== 'pharos.local';
      router.replace(hasTenantSubdomain ? '/dashboard' : '/reseller');
    } catch {
      setError('Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Tenant Login</h2>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded px-4 py-2 text-white"
          style={{ background: 'var(--primary)' }}
        >
          {submitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </section>
  );
};

export default LoginPage;
