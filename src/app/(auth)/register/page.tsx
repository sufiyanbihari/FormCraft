'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    // Account creation is disabled - redirect to login
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[200px] text-gray-500 text-sm">
      Account registration is disabled. Redirecting to sign in...
    </div>
  );
}
