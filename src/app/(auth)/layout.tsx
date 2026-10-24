'use client';

import React, { useEffect } from 'react';
import AppLogo from '@/components/shared/AppLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const original = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#004B6E';
    return () => {
      document.body.style.backgroundColor = original;
    };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 transition-colors duration-300"
      style={{ backgroundColor: '#004B6E' }}
    >
      <div className="mb-8 flex items-center justify-center [&_span]:!text-white [&_span.text-sky-600]:!text-sky-300 [&_span.text-gray-500]:!text-sky-100">
        <AppLogo href="/" size="lg" />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
