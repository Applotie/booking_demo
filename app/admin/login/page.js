'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bus, LogIn, Eye, EyeOff, TriangleAlert, ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Misc';
import { BRAND_NAME } from '@/lib/constants';
import { withActivity } from '@/lib/activity';

// Only same-site admin paths are accepted as the page to return to.
function nextPath() {
  const value = new URLSearchParams(window.location.search).get('next');
  return value && /^\/admin(\/[A-Za-z0-9_\-/]*)?(\?[^\s]*)?$/.test(value) && !value.startsWith('/admin/login') ? value : '/admin';
}

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'expired') setNotice('Your session has ended. Please sign in again.');
    else if (params.get('reason') === 'signed-out') setNotice('You have been signed out.');
    usernameRef.current?.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await withActivity('save', 'Signing in…', () => fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: 'same-origin',
        cache: 'no-store',
      }));
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        // Full navigation so the new session cookie is used for every request.
        window.location.replace(nextPath());
        return;
      }
      setError(body?.message || 'Could not sign in. Please try again.');
      setPassword('');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bus size={22} aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold text-ink">{BRAND_NAME}</span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">Operations</span>
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink">Sign in to admin</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the operator username and password.</p>

          {notice ? (
            <Alert tone="info" className="mt-4">
              {notice}
            </Alert>
          ) : null}
          {error ? (
            <Alert tone="danger" icon={TriangleAlert} className="mt-4">
              {error}
            </Alert>
          ) : null}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Input
              ref={usernameRef}
              label="Username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
            <div className="relative">
              <Input
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                inputClassName="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-[30px] rounded p-1 text-slate-500 hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            <Button type="submit" block size="lg" icon={LogIn} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-ink">
            <ArrowLeft size={14} aria-hidden="true" /> Back to the booking site
          </Link>
        </p>
      </div>
    </div>
  );
}
