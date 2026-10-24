import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface AppLogoProps {
  href?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export default function AppLogo({
  href = '/',
  className = '',
  size = 'md',
  showSubtitle = true,
}: AppLogoProps) {
  const heights = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
  };

  const content = (
    <div className={`flex items-center gap-3 group ${className}`}>
      <div className={`relative ${heights[size]} w-auto flex items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-sm border border-gray-100 dark:border-gray-800`}>
        <img
          src="/logo.png"
          alt="FormCraft Logo"
          className={`${heights[size]} w-auto object-contain transition-transform group-hover:scale-105`}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-none">
          Form<span className="text-sky-600">Craft</span>
        </span>
        {showSubtitle && (
          <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium tracking-normal mt-0.5 whitespace-nowrap">
            Digital Form Builder &amp; Management Platform
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="focus:outline-none">{content}</Link>;
  }

  return content;
}
