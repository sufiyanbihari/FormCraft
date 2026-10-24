'use client';

import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/shared/AppLogo';
import { useAuth } from '@/lib/auth/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Search, User as UserIcon, LogOut, Plus, Sparkles, X, ShieldCheck } from 'lucide-react';

interface DashboardHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateBlank: () => void;
}

export default function DashboardHeader({
  searchQuery,
  onSearchChange,
  onCreateBlank,
}: DashboardHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <AppLogo href="/" size="md" />
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-xl mx-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search forms, templates, or descriptions..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-9 bg-gray-50/80 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 h-10 w-full rounded-full focus:bg-white dark:focus:bg-gray-900 transition-all text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Actions & Profile */}
        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <Link href="/admin/audit-logs">
              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex items-center gap-1.5 border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 rounded-full h-9 font-semibold text-xs shadow-sm"
              >
                <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                Audit Logs
              </Button>
            </Link>
          )}

          <Button
            onClick={onCreateBlank}
            className="hidden sm:inline-flex bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm rounded-full px-4 h-9"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Blank Form
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-purple-400 transition-all focus:outline-none">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name || user.email}
                      className="h-9 w-9 rounded-full object-cover border border-purple-200 dark:border-purple-800"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-semibold flex items-center justify-center text-sm border border-purple-200">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {user.name || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                    {user.role}
                  </span>
                </div>
                <DropdownMenuSeparator />

                {user.role === 'ADMIN' && (
                  <>
                    <Link href="/admin/audit-logs">
                      <DropdownMenuItem className="cursor-pointer font-medium text-sky-700 dark:text-sky-400">
                        <ShieldCheck className="h-4 w-4 mr-2 text-sky-600 dark:text-sky-400" /> System Audit Logs
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400 cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login">
              <Button size="sm" variant="outline" className="rounded-full">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
