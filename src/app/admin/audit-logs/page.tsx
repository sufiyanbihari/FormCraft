'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Search,
  RefreshCw,
  Download,
  Clock,
  Activity,
  FileText,
  KeyRound,
  FileUp,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Globe,
  Lock,
  PlusCircle,
  Edit3,
  Trash2,
  Send,
  Inbox,
  Trash,
  LogIn,
  LogOut,
  UserPlus,
  HelpCircle,
  UserCheck,
  ExternalLink,
  Code2,
  FileCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  action: string;
  createdAt: string;
  category: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  ipAddress: string;
  userAgent: string;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
    avatarUrl: string | null;
  };
  form: {
    id: string | null;
    title: string | null;
    publicId: string | null;
    status: string | null;
  };
  details: Record<string, any>;
}

interface AuditStats {
  totalLogs: number;
  todayLogs: number;
  activeUsersCount: number;
  securityAlertsCount: number;
}

// User-friendly action mapping
function getActionDisplay(action: string, details: Record<string, any> = {}) {
  switch (action) {
    case 'USER_LOGIN':
      return {
        title: 'User Logged In',
        tag: 'Login',
        category: 'Authentication',
        color: 'emerald',
        icon: LogIn,
        summary: details.summary || `${details.userName || details.userEmail || 'User'} signed in successfully`,
      };
    case 'USER_LOGOUT':
      return {
        title: 'User Logged Out',
        tag: 'Logout',
        category: 'Authentication',
        color: 'slate',
        icon: LogOut,
        summary: details.summary || `${details.userName || details.userEmail || 'User'} signed out of the session`,
      };
    case 'USER_LOGIN_FAILED':
      return {
        title: 'Failed Login Attempt',
        tag: 'Security Alert',
        category: 'Security',
        color: 'rose',
        icon: ShieldAlert,
        summary: details.summary || `Failed login attempt (${details.reason || 'Invalid credentials'})`,
      };
    case 'USER_REGISTER':
      return {
        title: 'New User Registered',
        tag: 'Register',
        category: 'Authentication',
        color: 'blue',
        icon: UserPlus,
        summary: details.summary || 'A new user account was created',
      };
    case 'FORM_CREATE':
      return {
        title: 'Create Form',
        tag: 'Form Created',
        category: 'Form Management',
        color: 'emerald',
        icon: PlusCircle,
        summary: details.summary || `Created new form "${details.title || details.formTitle || 'Untitled'}"`,
      };
    case 'FORM_PUBLISH':
    case 'PUBLISH_FORM':
      return {
        title: 'Form Published',
        tag: 'Published',
        category: 'Form Management',
        color: 'sky',
        icon: Send,
        summary: details.summary || `Form published and open for submissions (Version #${details.versionNumber || 1})`,
      };
    case 'FORM_CLOSED':
    case 'FORM_UNPUBLISH':
    case 'UNPUBLISH_FORM':
      return {
        title: 'Form Closed',
        tag: 'Closed',
        category: 'Form Management',
        color: 'amber',
        icon: Lock,
        summary: details.summary || 'Form was closed from accepting new responses',
      };
    case 'FORM_UPDATE':
    case 'UPDATE_FORM':
      return {
        title: 'Changes in Form',
        tag: 'Updated',
        category: 'Form Management',
        color: 'indigo',
        icon: Edit3,
        summary: details.summary || `Changes saved to form (${details.updatedFields?.join(', ') || 'settings'})`,
      };
    case 'FORM_DELETE':
      return {
        title: details.permanent ? 'Form Permanently Deleted' : 'Delete Form (Moved to Trash)',
        tag: 'Delete',
        category: 'Form Management',
        color: 'rose',
        icon: Trash2,
        summary: details.summary || (details.permanent ? 'Form permanently removed from database' : 'Form archived to trash'),
      };
    case 'FORM_DUPLICATE':
      return {
        title: 'Form Duplicated',
        tag: 'Duplicate',
        category: 'Form Management',
        color: 'cyan',
        icon: Copy,
        summary: details.summary || `Form duplicated into a new copy`,
      };
    case 'SUBMISSION_CREATE':
      return {
        title: 'Response Received',
        tag: 'Form Submitted',
        category: 'Submissions',
        color: 'emerald',
        icon: Inbox,
        summary: details.summary || `New response received (${details.answerCount || 0} answers submitted)`,
      };
    case 'SUBMISSION_DELETE':
      return {
        title: 'Delete Response',
        tag: 'Response Deleted',
        category: 'Submissions',
        color: 'rose',
        icon: Trash,
        summary: details.summary || `Deleted respondent submission record`,
      };
    case 'SUBMISSION_EXPORT':
      return {
        title: 'Responses Exported',
        tag: 'Export',
        category: 'Submissions',
        color: 'sky',
        icon: Download,
        summary: `Exported responses in ${details.format?.toUpperCase() || 'CSV'} format`,
      };
    case 'QUESTION_CREATE':
      return {
        title: 'Question Added',
        tag: 'Question Added',
        category: 'Questions & Sections',
        color: 'purple',
        icon: HelpCircle,
        summary: `Added question "${details.questionTitle || 'Question'}"`,
      };
    case 'QUESTION_UPDATE':
      return {
        title: 'Changes in Form (Question Updated)',
        tag: 'Question Updated',
        category: 'Questions & Sections',
        color: 'indigo',
        icon: Edit3,
        summary: `Updated question "${details.questionTitle || 'Question'}"`,
      };
    case 'QUESTION_DELETE':
      return {
        title: 'Question Deleted',
        tag: 'Delete',
        category: 'Questions & Sections',
        color: 'rose',
        icon: Trash,
        summary: `Deleted question "${details.questionTitle || 'Question'}"`,
      };
    case 'FILE_UPLOAD':
      return {
        title: 'File Uploaded',
        tag: 'File Upload',
        category: 'Files',
        color: 'amber',
        icon: FileUp,
        summary: details.fileName ? `Uploaded file "${details.fileName}" (${Math.round((details.fileSize || 0) / 1024)} KB)` : 'New file uploaded',
      };
    case 'FILE_UPLOAD_FAILED':
      return {
        title: 'File Upload Failed',
        tag: 'Upload Error',
        category: 'Files',
        color: 'rose',
        icon: AlertTriangle,
        summary: details.error || 'File upload encountered an issue',
      };
    case 'COLLABORATOR_ADD':
      return {
        title: 'Collaborator Added',
        tag: 'Collaborator',
        category: 'Collaborators',
        color: 'cyan',
        icon: UserCheck,
        summary: `Added ${details.collaboratorEmail} as ${details.role}`,
      };
    default:
      return {
        title: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        tag: 'Activity',
        category: 'General',
        color: 'slate',
        icon: Activity,
        summary: details.summary || 'System activity recorded',
      };
  }
}

// User-friendly quick filter presets matching the user's explicit list
const ACTION_PRESETS = [
  { id: 'ALL', label: 'All Activities' },
  { id: 'CREATE_FORM', label: 'Create Form', matchAction: 'FORM_CREATE' },
  { id: 'CHANGES_IN_FORM', label: 'Changes in Form', matchAction: 'FORM_UPDATE' },
  { id: 'FORM_PUBLISHED', label: 'Form Published', matchAction: 'FORM_PUBLISH' },
  { id: 'FORM_CLOSED', label: 'Form Closed', matchAction: 'FORM_CLOSED' },
  { id: 'RESPONSE_RECEIVED', label: 'Response Received', matchAction: 'SUBMISSION_CREATE' },
  { id: 'DELETE_RESPONSE', label: 'Delete Response', matchAction: 'SUBMISSION_DELETE' },
  { id: 'DELETE_FORM', label: 'Delete Form', matchAction: 'FORM_DELETE' },
  { id: 'AUTH_EVENTS', label: 'Login / Logout', matchAction: 'USER_' },
];

export default function AdminAuditLogsPage() {
  const { user, isLoading: authLoading } = useAuth();

  // State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    totalLogs: 0,
    todayLogs: 0,
    activeUsersCount: 0,
    securityAlertsCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [actionPreset, setActionPreset] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Audit Log Security Lock & Password Protection State
  const [isLocked, setIsLocked] = useState(false);
  const [unlockEmail, setUnlockEmail] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Expanded rows state (keeps table neat, shows details on demand)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRawJson = (id: string) => {
    setShowRawJson((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch logs
  const fetchLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', '25');

        let effectiveSearch = search.trim();
        const presetObj = ACTION_PRESETS.find((p) => p.id === actionPreset);
        if (presetObj && presetObj.matchAction) {
          // If a preset is picked, filter by action keyword
          params.set('search', presetObj.matchAction);
        } else if (effectiveSearch) {
          params.set('search', effectiveSearch);
        }

        if (status !== 'ALL') params.set('status', status);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);

        const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data.requiresPassword) {
            setIsLocked(true);
            return;
          }
        }
        if (res.ok) {
          setIsLocked(false);
          const data = await res.json();
          setLogs(data.logs || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalRecords(data.pagination?.total || 0);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, search, actionPreset, status, startDate, endDate]
  );

  useEffect(() => {
    if (!authLoading && user && user.role === 'ADMIN') {
      fetch('/api/admin/audit-logs/verify-access')
        .then((res) => res.json())
        .then((data) => {
          if (!data.verified) {
            setIsLocked(true);
          } else {
            setIsLocked(false);
            fetchLogs();
          }
        })
        .catch(() => {
          fetchLogs();
        });
    }
  }, [authLoading, user, fetchLogs]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError('');
    setIsUnlocking(true);

    try {
      const res = await fetch('/api/admin/audit-logs/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: unlockEmail,
          password: unlockPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsLocked(false);
        setUnlockPassword('');
        setUnlockError('');
        fetchLogs();
      } else {
        setUnlockError(data.error || 'Invalid credentials. Audit log access denied.');
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setUnlockError('Connection error while verifying credentials.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLockLogs = async () => {
    try {
      await fetch('/api/admin/audit-logs/verify-access', { method: 'DELETE' });
    } catch {}
    setIsLocked(true);
    setLogs([]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const [isClearing, setIsClearing] = useState(false);

  const handleResetFilters = () => {
    setSearch('');
    setActionPreset('ALL');
    setStatus('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm('Are you sure you want to delete and reset all audit logs? This action will permanently remove all activity history.')) {
      return;
    }
    try {
      setIsClearing(true);
      const res = await fetch('/api/admin/audit-logs', { method: 'DELETE' });
      if (res.ok) {
        await fetchLogs(true);
      } else {
        alert('Failed to reset audit logs. Please try again.');
      }
    } catch (err) {
      console.error('Error resetting audit logs:', err);
      alert('An error occurred while resetting audit logs.');
    } finally {
      setIsClearing(false);
    }
  };

  const exportCsvUrl = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    const presetObj = ACTION_PRESETS.find((p) => p.id === actionPreset);
    if (presetObj?.matchAction) params.set('search', presetObj.matchAction);
    if (status !== 'ALL') params.set('status', status);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/admin/audit-logs/export?${params.toString()}`;
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  // Auth Protection Check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <RefreshCw className="h-8 w-8 animate-spin text-sky-400 mb-3" />
        <p className="text-slate-400 text-sm">Verifying Admin Permissions...</p>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="h-14 w-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Admin Access Required</h2>
          <p className="text-slate-400 text-sm mb-6">
            You must be logged in as an Administrator to view and inspect system audit logs.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/">
              <Button variant="outline" className="border-slate-700 text-slate-300">
                Back to Dashboard
              </Button>
            </Link>
            <Link href="/login">
              <Button className="bg-[#004B6E] hover:bg-[#003853] text-white">
                Sign in as Admin
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Audit Log Password Protection Lock Screen
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* Top Header */}
        <header className="w-full border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                Security Protection Active
              </span>
            </div>
          </div>
        </header>

        {/* Lock Screen Center Card */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#004B6E]/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-sky-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/10">
                <Lock className="h-8 w-8 text-amber-300" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                Audit Logs Protection
              </span>

              <h2 className="text-2xl font-bold text-white tracking-tight">Superadmin Verification</h2>
              <p className="text-slate-400 text-xs mt-2 mb-6 leading-relaxed">
                System audit trails contain sensitive activity logs. Re-authentication is required to access or export compliance records.
              </p>

              <form onSubmit={handleUnlock} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Authorized Administrator Email
                  </label>
                  <Input
                    type="email"
                    value={unlockEmail}
                    onChange={(e) => setUnlockEmail(e.target.value)}
                    required
                    placeholder="admin@example.com"
                    className="h-11 bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-sky-500 text-sm rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Superadmin Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showUnlockPassword ? 'text' : 'password'}
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      required
                      placeholder="Enter superadmin password"
                      className="h-11 bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-sky-500 text-sm rounded-xl pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showUnlockPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {unlockError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{unlockError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isUnlocking}
                  className="w-full h-11 bg-[#004B6E] hover:bg-[#003853] text-white font-semibold rounded-xl shadow-lg transition mt-2"
                >
                  {isUnlocking ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin text-sky-400" />
                      Verifying Access...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4 mr-2 text-sky-300" />
                      Unlock Audit Logs
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-800 flex justify-center">
                <Link
                  href="/"
                  className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-medium pr-3 border-r border-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-[#004B6E] border border-sky-400/30 text-white shadow-sm">
                <ShieldCheck className="h-5 w-5 text-sky-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-white tracking-tight">System Audit Logs</h1>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Activity Tracking
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Comprehensive activity and compliance monitoring for FormCraft
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleLockLogs}
              variant="outline"
              size="sm"
              className="h-8 border-amber-900/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-white text-xs rounded-lg transition"
              title="Lock audit logs and require password verification again"
            >
              <Lock className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
              Lock Logs
            </Button>

            <Button
              onClick={handleClearAllLogs}
              variant="outline"
              size="sm"
              disabled={isClearing}
              className="h-8 border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 hover:text-white text-xs rounded-lg transition"
              title="Reset and delete all audit logs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5 text-rose-400" />
              {isClearing ? 'Resetting...' : 'Reset Logs'}
            </Button>

            <a
              href={exportCsvUrl()}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Download filtered logs as CSV"
            >
              <Download className="h-3.5 w-3.5 text-sky-400" />
              <span>Export CSV</span>
            </a>

            <Button
              onClick={() => fetchLogs(true)}
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              className="h-8 border-slate-700 bg-slate-800 text-slate-200 text-xs rounded-lg hover:bg-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-slate-900/90 border-slate-800 shadow-md rounded-xl">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Activities</p>
                <p className="text-2xl font-extrabold text-white mt-0.5">{stats.totalLogs.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Recorded user &amp; admin events</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Activity className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/90 border-slate-800 shadow-md rounded-xl">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Today&apos;s Events</p>
                <p className="text-2xl font-extrabold text-white mt-0.5">{stats.todayLogs.toLocaleString()}</p>
                <p className="text-[10px] text-emerald-400 mt-0.5 font-medium">Recorded since 00:00</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/90 border-slate-800 shadow-md rounded-xl">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Users</p>
                <p className="text-2xl font-extrabold text-white mt-0.5">{stats.activeUsersCount.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Distinct user accounts</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/90 border-slate-800 shadow-md rounded-xl">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Security &amp; Alerts</p>
                <p className={`text-2xl font-extrabold mt-0.5 ${stats.securityAlertsCount > 0 ? 'text-rose-400' : 'text-white'}`}>
                  {stats.securityAlertsCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Failed attempts &amp; warnings</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Presets & Filter Bar */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
          {/* Quick Action Selector Chips */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider mb-2">
              Filter by Action Type:
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {ACTION_PRESETS.map((preset) => {
                const isActive = actionPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setActionPreset(preset.id);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-[#004B6E] text-white shadow border border-sky-400/40'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search, Status, Date Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1 border-t border-slate-800/80">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="md:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                type="text"
                placeholder="Search by action, user, form, or IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-800/90 border-slate-700 text-white placeholder-slate-500 h-9 rounded-lg text-xs focus:border-sky-500"
              />
            </form>

            {/* Status Filter */}
            <div className="md:col-span-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-lg px-2.5 text-xs focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success Only</option>
                <option value="FAILED">Failed / Alerts</option>
                <option value="WARNING">Warnings</option>
              </select>
            </div>

            {/* Start Date */}
            <div className="md:col-span-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="h-9 bg-slate-800/90 border-slate-700 text-slate-200 text-xs rounded-lg"
              />
            </div>

            {/* End Date */}
            <div className="md:col-span-2">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="h-9 bg-slate-800/90 border-slate-700 text-slate-200 text-xs rounded-lg"
              />
            </div>

            {/* Reset */}
            <div className="md:col-span-1 flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 w-full text-slate-400 hover:text-white text-xs"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Organized Clean Audit Logs Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-10"></th>
                  <th className="py-3 px-4">Action &amp; Activity</th>
                  <th className="py-3 px-4">Form / Target</th>
                  <th className="py-3 px-4">User (Actor)</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-400 mb-2" />
                      Loading activity audit logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <ShieldCheck className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                      <p className="text-base font-semibold text-slate-300">No logs found</p>
                      <p className="text-xs text-slate-500 mt-1">Try clearing your filters or changing date ranges.</p>
                      <Button
                        onClick={handleResetFilters}
                        variant="outline"
                        size="sm"
                        className="mt-4 border-slate-700 text-slate-300 text-xs"
                      >
                        Reset All Filters
                      </Button>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const display = getActionDisplay(log.action, log.details);
                    const ActionIcon = display.icon;
                    const isExpanded = Boolean(expandedIds[log.id]);
                    const isRawOpen = Boolean(showRawJson[log.id]);

                    return (
                      <React.Fragment key={log.id}>
                        {/* Main visible row */}
                        <tr
                          onClick={() => toggleExpand(log.id)}
                          className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-slate-800/30' : ''
                          }`}
                        >
                          {/* Chevron expander */}
                          <td className="py-3 px-3 text-slate-500">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-sky-400 transition-transform" />
                            ) : (
                              <ChevronRight className="h-4 w-4 transition-transform group-hover:text-slate-300" />
                            )}
                          </td>

                          {/* Action Title & Short Description */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-1.5 rounded-lg flex-shrink-0 ${
                                  display.color === 'emerald'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : display.color === 'rose'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : display.color === 'sky'
                                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                    : display.color === 'amber'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : display.color === 'indigo'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                <ActionIcon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-semibold text-slate-100 flex items-center gap-2">
                                  <span>{display.title}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-slate-800 text-slate-400 border border-slate-700">
                                    {display.tag}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate max-w-[280px]">
                                  {display.summary}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Target Form */}
                          <td className="py-3 px-4 max-w-[200px]">
                            {log.form.title ? (
                              <div className="truncate">
                                <span className="font-medium text-slate-200 truncate block hover:text-sky-400">
                                  {log.form.title}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {log.form.id?.slice(0, 8)}...
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px] italic">System / Global</span>
                            )}
                          </td>

                          {/* Actor */}
                          <td className="py-3 px-4 max-w-[180px]">
                            <div className="flex items-center gap-2">
                              {log.user.avatarUrl ? (
                                <img
                                  src={log.user.avatarUrl}
                                  alt="avatar"
                                  className="h-6 w-6 rounded-full object-cover border border-slate-700 flex-shrink-0"
                                />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                                  {log.user.name?.[0] || (log.user.email ? log.user.email[0].toUpperCase() : 'A')}
                                </div>
                              )}
                              <div className="truncate">
                                <span className="font-medium text-slate-200 truncate block">
                                  {log.user.name || log.user.email || 'Anonymous'}
                                </span>
                                {log.user.role && (
                                  <span className="text-[9px] uppercase font-bold text-sky-400">
                                    {log.user.role}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Time */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-slate-200 font-medium">
                              {formatRelativeTime(log.createdAt)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {new Date(log.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {log.status === 'SUCCESS' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Success
                              </span>
                            ) : log.status === 'FAILED' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <XCircle className="h-3 w-3" /> Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <AlertTriangle className="h-3 w-3" /> Warning
                              </span>
                            )}
                          </td>

                          {/* Action button */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1">
                              {isExpanded ? 'Hide' : 'Expand'}
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </td>
                        </tr>

                        {/* Inline Expandable Drawer (Revealed smoothly on demand) */}
                        {isExpanded && (
                          <tr className="bg-slate-950/60 border-b border-slate-800/80">
                            <td colSpan={7} className="p-4 sm:p-5">
                              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-inner">
                                {/* Top Description Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                                      {log.action}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">
                                      {display.category}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    Exact Time: {new Date(log.createdAt).toUTCString()}
                                  </div>
                                </div>

                                {/* Organized 3-Column Info Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                  {/* Card 1: Event Summary & What Changed */}
                                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                                      <FileCheck className="h-3.5 w-3.5" /> Activity Summary
                                    </span>
                                    <p className="text-slate-200 text-xs leading-relaxed">
                                      {display.summary}
                                    </p>
                                    {log.details.updatedFields && Array.isArray(log.details.updatedFields) && (
                                      <div className="pt-1">
                                        <span className="text-[10px] text-slate-400 block mb-1">
                                          Modified Fields:
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                          {log.details.updatedFields.map((f: string) => (
                                            <span
                                              key={f}
                                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-mono"
                                            >
                                              {f}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {log.details.isQuiz && log.details.score && (
                                      <div className="pt-1 text-[11px] text-emerald-400 font-medium">
                                        Quiz Score: {log.details.score.total} / {log.details.score.max} pts
                                      </div>
                                    )}
                                    {log.details.fileName && (
                                      <div className="pt-1 text-[11px] text-slate-300">
                                        File: <span className="font-semibold">{log.details.fileName}</span> (
                                        {Math.round((log.details.fileSize || 0) / 1024)} KB)
                                      </div>
                                    )}
                                  </div>

                                  {/* Card 2: Actor Details */}
                                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                                      <Users className="h-3.5 w-3.5" /> Actor / User Context
                                    </span>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">User Name</span>
                                      <span className="font-semibold text-slate-200">
                                        {log.user.name || log.details.userName || 'Anonymous Respondent'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">Email Address</span>
                                      <span className="text-slate-300 font-mono text-[11px]">
                                        {log.user.email || log.details.userEmail || 'Not Provided'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">User Role</span>
                                      <Badge variant="outline" className="text-[9px] border-slate-700 text-sky-400">
                                        {log.user.role || log.details.userRole || 'ANONYMOUS'}
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* Card 3: Target Resource & Network */}
                                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                                      <Globe className="h-3.5 w-3.5" /> Resource &amp; Origin
                                    </span>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">Form Resource</span>
                                      <span className="font-semibold text-slate-200">
                                        {log.form.title || log.details.formTitle || 'System Level Action'}
                                      </span>
                                      {log.form.id && (
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[10px] font-mono text-slate-500">
                                            ID: {log.form.id}
                                          </span>
                                          {log.form.publicId && (
                                            <Link
                                              href={`/f/${log.form.publicId}`}
                                              target="_blank"
                                              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5"
                                            >
                                              <ExternalLink className="h-2.5 w-2.5" /> View Form
                                            </Link>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">Origin IP Address</span>
                                      <div className="flex items-center gap-1.5 font-mono text-slate-300">
                                        <span>{log.ipAddress}</span>
                                        <button
                                          onClick={() => copyToClipboard(log.ipAddress, `ip-${log.id}`)}
                                          className="text-slate-500 hover:text-slate-300"
                                          title="Copy IP"
                                        >
                                          {copiedId === `ip-${log.id}` ? (
                                            <Check className="h-3 w-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="h-3 w-3" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px]">User Agent</span>
                                      <span className="text-[10px] text-slate-400 block truncate" title={log.userAgent}>
                                        {log.userAgent}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Raw Technical JSON Toggle (Organized & hidden by default) */}
                                <div className="border-t border-slate-800 pt-3">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => toggleRawJson(log.id)}
                                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 font-medium"
                                    >
                                      <Code2 className="h-3.5 w-3.5 text-sky-400" />
                                      <span>{isRawOpen ? 'Hide' : 'View'} Raw Event JSON Payload</span>
                                      {isRawOpen ? (
                                        <ChevronUp className="h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </button>

                                    {isRawOpen && (
                                      <button
                                        onClick={() =>
                                          copyToClipboard(JSON.stringify(log.details, null, 2), `raw-${log.id}`)
                                        }
                                        className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                                      >
                                        {copiedId === `raw-${log.id}` ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-400" /> Copied
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3" /> Copy JSON
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {isRawOpen && (
                                    <pre className="mt-2.5 p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-52 leading-relaxed">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="py-3 px-4 bg-slate-800/40 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Showing <span className="font-semibold text-slate-200">{logs.length}</span> of{' '}
              <span className="font-semibold text-slate-200">{totalRecords.toLocaleString()}</span> activities
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 text-xs"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="px-2 text-slate-400">
                Page <span className="text-white font-medium">{page}</span> of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 text-xs"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
