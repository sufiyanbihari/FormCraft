'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Palette,
  Eye,
  Send,
  RotateCcw,
  RotateCw,
  CloudCheck,
  CloudUpload,
  AlertCircle,
  Copy,
  ExternalLink,
  Check,
  Database,
  Loader2,
} from 'lucide-react';

interface BuilderHeaderProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  activeTab: 'questions' | 'responses' | 'settings';
  onTabChange: (tab: 'questions' | 'responses' | 'settings') => void;
  saveStatus: 'saved' | 'saving' | 'error';
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenTheme: () => void;
  onOpenLookup?: () => void;
  lookupCount?: number;
  onOpenShare?: () => void;
  onPublish: () => void;
  isPublishing?: boolean;
  isPublished: boolean;
  publicId: string;
  responseCount: number;
  primaryColor?: string;
}

export default function BuilderHeader({
  title,
  onTitleChange,
  activeTab,
  onTabChange,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenTheme,
  onOpenLookup,
  lookupCount,
  onOpenShare,
  onPublish,
  isPublishing = false,
  isPublished,
  publicId,
  responseCount,
  primaryColor = '#673ab7',
}: BuilderHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/f/${publicId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
      {/* Top action row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand icon + Editable Title + Save status */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/" title="Back to dashboard" className="shrink-0 flex items-center">
            <div className="h-9 w-auto flex items-center rounded-lg bg-white dark:bg-gray-800 px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 shadow-sm transition-transform hover:scale-105">
              <img
                src="/logo.png"
                alt="FormCraft Logo"
                className="h-7 w-auto object-contain"
              />
            </div>
          </Link>

          <div className="flex items-center gap-2 max-w-md min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled form"
              className="font-semibold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-purple-600 focus:outline-none px-1 py-0.5 rounded transition-all truncate"
            />

            {/* Cloud Auto-save badge */}
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
              {saveStatus === 'saving' ? (
                <>
                  <CloudUpload className="h-3.5 w-3.5 animate-pulse text-purple-600" />
                  <span>Saving...</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-red-500">Save failed</span>
                </>
              ) : (
                <>
                  <CloudCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>All changes saved in cloud</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Actions: Undo/Redo, Theme, Preview, Share, Publish */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Undo / Redo */}
          <div className="hidden md:flex items-center gap-1 border-r border-gray-200 dark:border-gray-800 pr-2 mr-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>

          {/* Theme customizer button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenTheme}
            className="h-9 w-9 text-gray-600 dark:text-gray-300 relative group"
            title="Customize theme & appearance"
          >
            <Palette className="h-4 w-4 group-hover:scale-110 transition-transform" />
            <span
              className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full border border-white dark:border-gray-900 shadow-sm"
              style={{ backgroundColor: primaryColor || '#004B6E' }}
            />
          </Button>

          {/* Data Lookup & Autofill Engine button */}
          {onOpenLookup && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenLookup}
              className="h-9 px-2.5 text-xs text-gray-700 dark:text-gray-200 hover:text-[#004B6E] dark:hover:text-blue-400 gap-1.5 rounded-lg border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-xs"
              title="Universal Data Lookup & Dynamic Autofill Engine"
            >
              <Database className="h-3.5 w-3.5 text-[#004B6E] dark:text-blue-400" />
              <span className="hidden sm:inline font-medium">Data Lookup</span>
              {typeof lookupCount === 'number' && lookupCount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                  {lookupCount}
                </span>
              )}
            </Button>
          )}

          {/* Preview button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.open(`/f/${publicId}`, '_blank')}
            className="h-9 w-9 text-gray-600 dark:text-gray-300"
            title="Preview form"
          >
            <Eye className="h-4 w-4" />
          </Button>

          {/* Publish / Link Button */}
          {isPublished && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="h-9 text-xs rounded-full border-gray-200 dark:border-gray-700 hidden sm:inline-flex"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Link copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            onClick={onPublish}
            disabled={isPublishing}
            className="h-9 rounded-full text-white font-medium shadow-sm px-4 disabled:opacity-75 transition-all cursor-pointer"
            style={{ backgroundColor: primaryColor }}
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {isPublished ? 'Republishing...' : 'Publishing...'}
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {isPublished ? 'Republish' : 'Publish'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Builder Tabs Row */}
      <div className="flex justify-center border-t border-gray-100 dark:border-gray-800">
        <nav aria-label="Form editor views" className="flex items-center gap-8 -mb-px">
          {[
            { id: 'questions', label: 'Questions' },
            {
              id: 'responses',
              label: (
                <div className="flex items-center gap-1.5">
                  <span>Responses</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {responseCount}
                  </span>
                </div>
              ),
            },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as any)}
              className={`py-3 px-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
              style={{
                borderColor: activeTab === tab.id ? primaryColor : 'transparent',
                color: activeTab === tab.id ? primaryColor : undefined,
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
