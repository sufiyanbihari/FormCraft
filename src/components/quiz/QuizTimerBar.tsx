'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, ShieldCheck, Lock, User, ArrowRight } from 'lucide-react';

interface QuizTimerBarProps {
  overallDeadline: string | null;
  currentQuestionDeadline: string | null;
  serverTime: string | null;
  participantIdentity?: string | null;
  participantName?: string | null;
  navigationPolicy?: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  onOverallTimeout?: () => void;
  onQuestionTimeout?: () => void;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function QuizTimerBar({
  overallDeadline,
  currentQuestionDeadline,
  serverTime,
  participantIdentity,
  participantName,
  navigationPolicy = 'BACKWARD_ENABLED',
  currentQuestionIndex,
  totalQuestions,
  onOverallTimeout,
  onQuestionTimeout,
}: QuizTimerBarProps) {
  // Clock skew between server and client
  const skewMsRef = useRef<number>(0);
  useEffect(() => {
    if (serverTime) {
      const serverDate = new Date(serverTime).getTime();
      const localDate = Date.now();
      skewMsRef.current = serverDate - localDate;
    }
  }, [serverTime]);

  const [overallRemaining, setOverallRemaining] = useState<number | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);

  const overallTimeoutTriggered = useRef(false);
  const questionTimeoutTriggered = useRef(false);

  useEffect(() => {
    questionTimeoutTriggered.current = false;
  }, [currentQuestionDeadline]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now() + skewMsRef.current;

      // Overall deadline
      if (overallDeadline) {
        const oDeadline = new Date(overallDeadline).getTime();
        const diffSecs = Math.max(0, Math.floor((oDeadline - now) / 1000));
        setOverallRemaining(diffSecs);

        if (diffSecs <= 0 && !overallTimeoutTriggered.current) {
          overallTimeoutTriggered.current = true;
          onOverallTimeout?.();
        }
      } else {
        setOverallRemaining(null);
      }

      // Question deadline
      if (currentQuestionDeadline) {
        const qDeadline = new Date(currentQuestionDeadline).getTime();
        const diffSecs = Math.max(0, Math.floor((qDeadline - now) / 1000));
        setQuestionRemaining(diffSecs);

        if (diffSecs <= 0 && !questionTimeoutTriggered.current) {
          questionTimeoutTriggered.current = true;
          onQuestionTimeout?.();
        }
      } else {
        setQuestionRemaining(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [overallDeadline, currentQuestionDeadline, onOverallTimeout, onQuestionTimeout]);

  // Determine low time warning (< 60s or < 15s)
  const isOverallLow = overallRemaining !== null && overallRemaining < 60;
  const isOverallCritical = overallRemaining !== null && overallRemaining < 15;
  const isQuestionLow = questionRemaining !== null && questionRemaining < 15;

  return (
    <div className="sticky top-0 z-40 w-full bg-slate-900/95 text-white backdrop-blur-md border-b border-slate-800 shadow-xl py-2.5 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Participant & Progress */}
        <div className="flex items-center gap-3">
          {participantIdentity && (
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-sky-300">
              <User className="h-3.5 w-3.5 text-sky-400" />
              <span>{participantIdentity}</span>
              {participantName && (
                <span className="text-slate-400 font-sans font-normal ml-1 hidden sm:inline truncate max-w-[120px]">
                  ({participantName})
                </span>
              )}
            </div>
          )}

          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
            {navigationPolicy === 'FORWARD_ONLY' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                <Lock className="h-2.5 w-2.5" /> Forward-Only
              </span>
            )}
          </div>
        </div>

        {/* Right: Authoritative Timers */}
        <div className="flex items-center gap-2.5 ml-auto">
          {/* Question Countdown Timer */}
          {questionRemaining !== null && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                isQuestionLow
                  ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50 animate-pulse'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
              title="Time remaining for this question"
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[11px] font-sans font-medium text-slate-300 mr-0.5 hidden xs:inline">
                Question:
              </span>
              <span>{formatTime(questionRemaining)}</span>
            </div>
          )}

          {/* Overall Quiz Timer */}
          {overallRemaining !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                isOverallCritical
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 animate-bounce'
                  : isOverallLow
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
              }`}
              title="Total time remaining for the quiz"
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[11px] font-sans font-medium text-slate-300 mr-0.5 hidden xs:inline">
                Total Time:
              </span>
              <span>{formatTime(overallRemaining)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
