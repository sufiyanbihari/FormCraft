'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Award, Clock, Lock, ArrowRight, ShieldCheck, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

interface QuizStartCardProps {
  formTitle: string;
  formDescription?: string | null;
  identityFieldTitle?: string;
  identityFieldRequired?: boolean;
  isRosterEnforced?: boolean;
  overallDurationMinutes?: number | null;
  hasQuestionTimers?: boolean;
  navigationPolicy?: string;
  onStartAttempt: (identity: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  primaryColor?: string;
}

export default function QuizStartCard({
  formTitle,
  formDescription,
  identityFieldTitle = 'Participant Identity (e.g. Employee ID / Student ID)',
  identityFieldRequired = true,
  isRosterEnforced = false,
  overallDurationMinutes,
  hasQuestionTimers = false,
  navigationPolicy = 'BACKWARD_ENABLED',
  onStartAttempt,
  primaryColor = '#673ab7',
}: QuizStartCardProps) {
  const [identity, setIdentity] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (identityFieldRequired && !identity.trim()) {
      setError('Please enter your participant identity to begin.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await onStartAttempt(identity.trim(), name.trim() || undefined);
      if (!res.success) {
        setError(res.error || 'Failed to start quiz attempt. Please try again.');
      }
    } catch {
      setError('A connection error occurred. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <Card className="border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden text-left">
        {/* Top accent bar */}
        <div className="h-2.5 w-full" style={{ backgroundColor: primaryColor }} />

        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-800">
              <Award className="h-3.5 w-3.5" /> Official Quiz Assessment
            </span>
          </div>

          <CardTitle className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 leading-snug">
            {formTitle}
          </CardTitle>

          {formDescription && (
            <CardDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {formDescription}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-6 pt-0 text-xs">
          {/* Quiz Rules & Instructions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80">
            {overallDurationMinutes && overallDurationMinutes > 0 ? (
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">Total Quiz Time</p>
                  <p className="text-[11px] text-gray-500">{overallDurationMinutes} minutes overall countdown</p>
                </div>
              </div>
            ) : null}

            {hasQuestionTimers ? (
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">Per-Question Limits</p>
                  <p className="text-[11px] text-gray-500">Individual question timers apply</p>
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-gray-900 dark:text-gray-100">Navigation Policy</p>
                <p className="text-[11px] text-gray-500">
                  {navigationPolicy === 'FORWARD_ONLY'
                    ? 'Forward-only (earlier questions lock upon advancing)'
                    : 'Free backward and forward navigation'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-gray-900 dark:text-gray-100">Timeout Policy</p>
                <p className="text-[11px] text-gray-500">Automatic submission & grading upon expiry</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs font-semibold">{error}</div>
            </div>
          )}

          {/* Identification Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-bold text-gray-800 dark:text-gray-200 mb-1 text-xs">
                {identityFieldTitle} {identityFieldRequired && <span className="text-red-500">*</span>}
              </label>
              <Input
                type="text"
                placeholder={isRosterEnforced ? 'Enter your authorized ID (e.g. EMP101)' : 'Enter your identifier'}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="h-10 text-xs sm:text-sm font-semibold"
                required={identityFieldRequired}
                autoFocus
              />
              {isRosterEnforced && (
                <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-medium">
                  * Authorized roster enforced. Only registered participant IDs may access this quiz.
                </p>
              )}
            </div>

            <div>
              <label className="block font-bold text-gray-800 dark:text-gray-200 mb-1 text-xs">
                Full Name (Optional)
              </label>
              <Input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-xs sm:text-sm"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 text-xs sm:text-sm font-extrabold text-white shadow-xl hover:shadow-2xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] rounded-xl flex items-center justify-center gap-2 cursor-pointer mt-2"
              style={{ backgroundColor: primaryColor }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying & Initializing Quiz...
                </>
              ) : (
                <>
                  Begin Quiz Assessment <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
