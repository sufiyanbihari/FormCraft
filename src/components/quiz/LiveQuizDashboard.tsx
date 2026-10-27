'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Award,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface LiveQuizDashboardProps {
  formId: string;
}

interface SummaryMetrics {
  expected: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  timedOut: number;
  isRosterMode: boolean;
  notStartedIsEstimate: boolean;
}

interface ParticipantRow {
  id: string;
  participantIdentity: string;
  participantName?: string | null;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'TIMED_OUT' | 'NOT_STARTED';
  timeoutReason?: string | null;
  earnedScore?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds?: number | null;
}

function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatTimestamp(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export default function LiveQuizDashboard({ formId }: LiveQuizDashboardProps) {
  const [summary, setSummary] = useState<SummaryMetrics>({
    expected: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    timedOut: 0,
    isRosterMode: false,
    notStartedIsEstimate: false,
  });

  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('startTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchDashboardData = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) {
          setIsRefreshing(true);
        }
        setError(null);

        const params = new URLSearchParams({
          search: debouncedSearch,
          status: statusFilter,
          sortBy,
          sortOrder,
          page: String(page),
          limit: '25',
        });

        const res = await fetch(`/api/forms/${formId}/quiz/dashboard?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to fetch quiz dashboard data');
        }

        const data = await res.json();
        setSummary(data.summary);
        setParticipants(data.participants || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
        setLastUpdated(new Date());
      } catch (err: any) {
        if (!isBackground) {
          setError(err.message || 'Error updating dashboard');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [formId, debouncedSearch, statusFilter, sortBy, sortOrder, page]
  );

  // Initial fetch and dependency trigger
  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Visibility-aware live polling (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchDashboardData(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  return (
    <div className="space-y-6">
      {/* Top Header & Refresh Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-purple-900/10 via-indigo-900/10 to-sky-900/10 p-5 rounded-2xl border border-purple-200/50 dark:border-purple-800/40 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              Live Quiz Monitoring Dashboard
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Real-time participant tracking, countdown timers, scores, and authoritative finalization
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 font-medium">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboardData(false)}
            disabled={isRefreshing}
            className="text-xs font-semibold h-8 border-purple-200 hover:border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40"
          >
            <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 5 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Expected Participants */}
        <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-gradient-to-br from-purple-50 to-indigo-50/40 dark:from-purple-950/40 dark:to-indigo-950/20 shadow-sm">
          <div className="flex items-center justify-between text-purple-700 dark:text-purple-300">
            <span className="text-xs font-bold uppercase tracking-wider">Expected</span>
            <Users className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-purple-950 dark:text-purple-100 mt-2">
            {summary.expected}
          </p>
          <div className="mt-1 text-[11px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-medium">
            {summary.isRosterMode ? 'Authorized Roster' : 'Configured Target'}
          </div>
        </div>

        {/* In Progress */}
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-br from-amber-50 to-orange-50/40 dark:from-amber-950/40 dark:to-orange-950/20 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
            <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-amber-950 dark:text-amber-100 mt-2">
            {summary.inProgress}
          </p>
          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Currently attempting
          </div>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 to-teal-50/40 dark:from-emerald-950/40 dark:to-teal-950/20 shadow-sm">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
            <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-emerald-950 dark:text-emerald-100 mt-2">
            {summary.completed}
          </p>
          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            Successfully finalized
          </div>
        </div>

        {/* Timed Out */}
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-gradient-to-br from-rose-50 to-red-50/40 dark:from-rose-950/40 dark:to-red-950/20 shadow-sm">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
            <span className="text-xs font-bold uppercase tracking-wider">Timed Out</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-rose-950 dark:text-rose-100 mt-2">
            {summary.timedOut}
          </p>
          <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
            Deadline expired
          </div>
        </div>

        {/* Not Started */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-gray-50/40 dark:from-slate-900/60 dark:to-gray-900/30 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span className="text-xs font-bold uppercase tracking-wider">Not Started</span>
            <Users className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {summary.notStarted}
          </p>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {summary.notStartedIsEstimate ? 'Estimated remaining' : 'Roster pending'}
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by participant ID or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs w-[140px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="TIMED_OUT">Timed Out</SelectItem>
              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(val) => { setSortBy(val); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="startTime">Start Time</SelectItem>
              <SelectItem value="endTime">End Time</SelectItem>
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="duration">Duration</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
            className="h-9 px-2.5 text-xs"
            title={`Toggle order: current ${sortOrder.toUpperCase()}`}
          >
            {sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3 px-4">Participant</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Percentage</th>
                <th className="py-3 px-4">Started At</th>
                <th className="py-3 px-4">Completed At</th>
                <th className="py-3 px-4">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
              {isLoading && participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-600 mb-2" />
                    Loading live quiz participants...
                  </td>
                </tr>
              ) : participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <Users className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-700 mb-2" />
                    No participants found matching the selected filter.
                  </td>
                </tr>
              ) : (
                participants.map((p) => {
                  let statusBadge = null;
                  if (p.status === 'COMPLETED') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    );
                  } else if (p.status === 'IN_PROGRESS') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        In Progress
                      </span>
                    );
                  } else if (p.status === 'TIMED_OUT') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <AlertTriangle className="h-3 w-3" /> Timed Out
                      </span>
                    );
                  } else {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Not Started
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-purple-50/30 dark:hover:bg-purple-950/10 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">
                        <div className="flex flex-col">
                          <span className="font-mono text-purple-700 dark:text-purple-300 font-bold">
                            {p.participantIdentity}
                          </span>
                          {p.participantName && (
                            <span className="text-[11px] text-gray-500 font-normal">
                              {p.participantName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">{statusBadge}</td>
                      <td className="py-3 px-4">
                        {p.earnedScore !== null && p.maxScore !== null && p.maxScore !== undefined ? (
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {p.earnedScore} <span className="text-gray-400 font-normal">/ {p.maxScore}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {typeof p.percentage === 'number' ? (
                          <span
                            className={`font-extrabold ${
                              p.percentage >= 70
                                ? 'text-emerald-600'
                                : p.percentage >= 40
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                            }`}
                          >
                            {p.percentage}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                        {formatTimestamp(p.startTime)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                        {formatTimestamp(p.endTime)}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-300">
                        {formatDuration(p.durationSeconds)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="p-3 bg-gray-50/50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {participants.length} of {totalCount} participants
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-bold">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
