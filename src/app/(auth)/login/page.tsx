'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';

function getSafeRedirectUrl(target: string | null): string {
  if (!target) return '/';
  const trimmed = target.trim();
  // Ensure relative path starting with single slash to prevent open redirect vulnerabilities
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  return '/';
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawRedirect =
    searchParams.get('redirect') ||
    searchParams.get('callbackUrl') ||
    searchParams.get('returnUrl') ||
    '';
  const redirectTarget = getSafeRedirectUrl(rawRedirect);

  // If already authenticated, redirect immediately to target destination
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirectTarget);
    }
  }, [authLoading, user, redirectTarget, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      router.push(redirectTarget);
      router.refresh();
    } else {
      setError(result.error || 'Failed to sign in');
    }
  };

  return (
    <Card className="border-gray-200/80 dark:border-gray-800 shadow-2xl bg-white dark:bg-gray-900 backdrop-blur-sm" suppressHydrationWarning>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Sign in to FormCraft</CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-400">
          Enter your administrator credentials to access your forms and audit logs
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} suppressHydrationWarning>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Email address
            </label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
            </div>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4 pt-2">
          <Button
            type="submit"
            className="w-full text-white font-semibold shadow-lg transition-all hover:brightness-110 active:scale-[0.99]"
            style={{ backgroundColor: '#004B6E' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...
              </>
            ) : (
              <>
                Sign in <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="border-gray-200/80 dark:border-gray-800 shadow-xl p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
