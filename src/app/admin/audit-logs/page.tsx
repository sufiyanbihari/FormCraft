'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Laptop,
  Smartphone,
  Monitor,
  Tablet,
  Radio,
  X,
  Layers,
  Info,
} from 'lucide-react';

interface AuditLogChange {
  field: string;
  before: any;
  after: any;
}

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

interface SessionItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  deviceType: 'Desktop' | 'Laptop' | 'Mobile' | 'Tablet' | string;
  browser: string;
  os: string;
  userAgent: string;
  status: 'ACTIVE' | 'EXPIRED' | 'LOGGED_OUT' | 'TERMINATED';
  loginAt: string;
  lastActiveAt: string;
  logoutAt: string | null;
  expiresAt: string;
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
    case 'SESSION_TERMINATE':
      return {
        title: 'Session Terminated by Admin',
        tag: 'Security Alert',
        category: 'Security',
        color: 'rose',
        icon: ShieldAlert,
        summary: details.summary || `Admin terminated session (${details.terminatedSessionId || 'Session'})`,
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
    case 'SUBMISSION_EDIT':
      return {
        title: 'Response Edited',
        tag: 'Response Updated',
        category: 'Submissions',
        color: 'indigo',
        icon: Edit3,
        summary: details.summary || 'Respondent edited previous submission',
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
    case 'SECTION_CREATE':
      return {
        title: 'Section Created',
        tag: 'Section Added',
        category: 'Questions & Sections',
        color: 'purple',
        icon: Layers,
        summary: details.summary || `Added section "${details.sectionTitle || 'Section'}"`,
      };
    case 'SECTION_UPDATE':
      return {
        title: 'Section Updated',
        tag: 'Section Updated',
        category: 'Questions & Sections',
        color: 'indigo',
        icon: Edit3,
        summary: details.summary || `Updated section "${details.sectionTitle || 'Section'}"`,
      };
    case 'SECTION_DELETE':
      return {
        title: 'Section Deleted',
        tag: 'Delete',
        category: 'Questions & Sections',
        color: 'rose',
        icon: Trash,
        summary: details.summary || `Deleted section "${details.sectionTitle || 'Section'}"`,
      };
    case 'SYSTEM_LOGS_RESET':
      return {
        title: 'System Audit Logs Reset',
        tag: 'Compliance Reset',
        category: 'Security',
        color: 'rose',
        icon: ShieldAlert,
        summary: details.summary || 'Administrator reset audit logs history',
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

// User-friendly quick filter presets
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

function getDeviceIcon(deviceType: string) {
  switch (deviceType?.toLowerCase()) {
    case 'mobile':
      return Smartphone;
    case 'tablet':
      return Tablet;
    case 'laptop':
      return Laptop;
    case 'desktop':
    default:
      return Monitor;
  }
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Before & After Change Comparison Viewer Component
function ChangeDiffViewer({ changes }: { changes: AuditLogChange[] }) {
  if (!changes || !Array.isArray(changes) || changes.length === 0) return null;

  const renderVal = (v: any) => {
    if (v === null || v === undefined) {
      return <span className="text-slate-500 italic">null</span>;
    }
    if (typeof v === 'boolean') {
      return (
        <span className={v ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
          {v ? 'true' : 'false'}
        </span>
      );
    }
    if (typeof v === 'object') {
      return <span className="font-mono text-[10px] break-all">{JSON.stringify(v)}</span>;
    }
    return <span className="break-all">{String(v)}</span>;
  };

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2 mt-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400 uppercase tracking-wider">
        <Edit3 className="h-3.5 w-3.5 text-sky-400" />
        <span>Before-and-After Modifications ({changes.length} changed {changes.length === 1 ? 'field' : 'fields'})</span>
      </div>
      <div className="space-y-2 pt-1">
        {changes.map((ch, idx) => (
          <div
            key={idx}
            className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs"
          >
            <div className="md:w-1/4">
              <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 text-[11px]">
                {ch.field}
              </span>
            </div>
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 p-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300">
                <span className="text-[9px] uppercase font-bold text-rose-400 block mb-0.5">Previous Value (Before)</span>
                <div className="line-through text-xs">{renderVal(ch.before)}</div>
              </div>
              <div className="flex items-center justify-center text-slate-500 font-bold px-1">
                &rarr;
              </div>
              <div className="flex-1 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                <span className="text-[9px] uppercase font-bold text-emerald-400 block mb-0.5">New Value (After)</span>
                <div className="text-xs">{renderVal(ch.after)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAuditLogsPage() {
  const { user, isLoading: authLoading } = useAuth();

  // Navigation tab state: 'ACTIVITIES' or 'SESSIONS'
  const [activeTab, setActiveTab] = useState<'ACTIVITIES' | 'SESSIONS'>('ACTIVITIES');

  // Shared KPI Stats State
  const [stats, setStats] = useState<AuditStats>({
    totalLogs: 0,
    todayLogs: 0,
    activeUsersCount: 0,
    securityAlertsCount: 0,
  });

  // Activities Tab State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
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

  // Active Sessions Tab State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionRoleFilter, setSessionRoleFilter] = useState('ALL');
  const [sessionDeviceFilter, setSessionDeviceFilter] = useState('ALL');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('ALL');
  const [sessionSortBy, setSessionSortBy] = useState<'lastActiveAt' | 'loginAt'>('lastActiveAt');
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionTotalPages, setSessionTotalPages] = useState(1);
  const [sessionTotalRecords, setSessionTotalRecords] = useState(0);

  // Selected session for details modal
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<SessionItem | null>(null);

  // Selected session for termination confirmation dialog
  const [sessionToTerminate, setSessionToTerminate] = useState<SessionItem | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  // Audit Log Security Lock & Password Protection State
  const [isLocked, setIsLocked] = useState(false);
  const [unlockEmail, setUnlockEmail] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

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

  // Fetch Activity Logs
  const fetchLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', '25');

        const effectiveSearch = search.trim();
        const presetObj = ACTION_PRESETS.find((p) => p.id === actionPreset);
        if (presetObj && presetObj.matchAction) {
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

  // Fetch Active Sessions
  const fetchSessions = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshingSessions(true);
      else setIsSessionsLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('page', sessionPage.toString());
        params.set('limit', '25');
        if (sessionSearch.trim()) params.set('search', sessionSearch.trim());
        if (sessionRoleFilter !== 'ALL') params.set('role', sessionRoleFilter);
        if (sessionDeviceFilter !== 'ALL') params.set('device', sessionDeviceFilter);
        if (sessionStatusFilter !== 'ALL') params.set('status', sessionStatusFilter);
        params.set('sortBy', sessionSortBy);

        const res = await fetch(`/api/admin/sessions?${params.toString()}`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data.requiresPassword) {
            setIsLocked(true);
            return;
          }
        }
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          setSessionTotalPages(data.pagination?.totalPages || 1);
          setSessionTotalRecords(data.pagination?.total || 0);
          if (data.stats) {
            setStats((prev) => ({
              ...prev,
              activeUsersCount: data.stats.activeSessionsCount,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load active sessions:', err);
      } finally {
        setIsSessionsLoading(false);
        setIsRefreshingSessions(false);
      }
    },
    [sessionPage, sessionSearch, sessionRoleFilter, sessionDeviceFilter, sessionStatusFilter, sessionSortBy]
  );

  // Initial Auth Check & Verification
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
            fetchSessions();
          }
        })
        .catch(() => {
          fetchLogs();
          fetchSessions();
        });
    }
  }, [authLoading, user, fetchLogs, fetchSessions]);

  // Real-Time SSE Stream Subscription
  useEffect(() => {
    if (isLocked || authLoading || !user || user.role !== 'ADMIN') return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/admin/audit-logs/stream');

        eventSource.onopen = () => {
          // Connected
        };

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'CONNECTED' && data.stats) {
              setStats(data.stats);
            } else if (data.type === 'AUDIT_EVENT') {
              if (data.activeUsersCount !== undefined) {
                setStats((prev) => ({
                  ...prev,
                  activeUsersCount: data.activeUsersCount,
                  totalLogs: prev.totalLogs + 1,
                  todayLogs: prev.todayLogs + 1,
                  securityAlertsCount:
                    data.data?.status === 'FAILED' || data.data?.category === 'SECURITY'
                      ? prev.securityAlertsCount + 1
                      : prev.securityAlertsCount,
                }));
              }
              if (data.data) {
                setLogs((prev) => [data.data, ...prev.filter((l) => l.id !== data.data.id)].slice(0, 25));
              }
            } else if (data.type === 'SESSION_EVENT') {
              if (data.activeUsersCount !== undefined) {
                setStats((prev) => ({ ...prev, activeUsersCount: data.activeUsersCount }));
              }
              fetchSessions(false);
            }
          } catch (err) {
            console.error('Error parsing SSE event:', err);
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          reconnectTimeout = setTimeout(() => {
            connectSSE();
          }, 5000);
        };
      } catch (err) {
        console.error('Failed to establish EventSource:', err);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isLocked, authLoading, user, fetchSessions]);

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
        fetchSessions();
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
    setSessions([]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleSessionSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSessionPage(1);
    fetchSessions();
  };

  const handleResetFilters = () => {
    setSearch('');
    setActionPreset('ALL');
    setStatus('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleResetSessionFilters = () => {
    setSessionSearch('');
    setSessionRoleFilter('ALL');
    setSessionDeviceFilter('ALL');
    setSessionStatusFilter('ALL');
    setSessionSortBy('lastActiveAt');
    setSessionPage(1);
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm('Are you sure you want to delete and reset all audit logs? Active sessions will be preserved, and a reset audit record will be logged.')) {
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

  const handleTerminateSession = async (sessionId: string) => {
    setIsTerminating(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/terminate`, {
        method: 'POST',
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, status: 'TERMINATED', logoutAt: new Date().toISOString() } : s))
        );
        setStats((prev) => ({
          ...prev,
          activeUsersCount: Math.max(0, prev.activeUsersCount - 1),
        }));
        setSessionToTerminate(null);
        if (selectedSessionDetails?.id === sessionId) {
          setSelectedSessionDetails((prev) => (prev ? { ...prev, status: 'TERMINATED' } : null));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to terminate session.');
      }
    } catch (err) {
      console.error('Error terminating session:', err);
      alert('Failed to terminate session due to connection error.');
    } finally {
      setIsTerminating(false);
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
            You must be logged in as an Administrator to view and inspect system audit logs and active user sessions.
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

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
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
                System audit trails contain sensitive activity logs and active session data. Re-authentication is required to access compliance records.
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
                  <h1 className="text-base font-bold text-white tracking-tight">System Audit &amp; Sessions</h1>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Sync Connected
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Comprehensive activity monitoring &amp; persistent session management
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

            {activeTab === 'ACTIVITIES' && (
              <>
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
              </>
            )}

            {activeTab === 'SESSIONS' && (
              <Button
                onClick={() => fetchSessions(true)}
                variant="outline"
                size="sm"
                disabled={isRefreshingSessions}
                className="h-8 border-slate-700 bg-slate-800 text-slate-200 text-xs rounded-lg hover:bg-slate-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 text-sky-400 ${isRefreshingSessions ? 'animate-spin' : ''}`} />
                Refresh Sessions
              </Button>
            )}
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

          <Card
            onClick={() => setActiveTab('SESSIONS')}
            className={`bg-slate-900/90 border-slate-800 shadow-md rounded-xl cursor-pointer hover:border-indigo-500/50 transition-all ${
              activeTab === 'SESSIONS' ? 'ring-1 ring-indigo-500/50' : ''
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Sessions</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-2xl font-extrabold text-white">{stats.activeUsersCount.toLocaleString()}</p>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] text-indigo-400 mt-0.5 font-medium">Multi-device active logins</p>
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
                <p className="text-[10px] text-slate-500 mt-0.5">Failed attempts &amp; revocations</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation Header */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('ACTIVITIES')}
            className={`flex items-center gap-2 py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'ACTIVITIES'
                ? 'bg-[#004B6E] text-white shadow border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Activities &amp; Compliance</span>
            <Badge variant="outline" className="text-[10px] ml-1 border-slate-700 bg-slate-800/80 text-slate-300">
              {stats.totalLogs.toLocaleString()}
            </Badge>
          </button>

          <button
            onClick={() => {
              setActiveTab('SESSIONS');
              fetchSessions();
            }}
            className={`flex items-center gap-2 py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'SESSIONS'
                ? 'bg-[#004B6E] text-white shadow border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Active Sessions</span>
            <span className="flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {stats.activeUsersCount}
            </span>
          </button>
        </div>

        {/* TAB 1: ACTIVITIES & COMPLIANCE */}
        {activeTab === 'ACTIVITIES' && (
          <div className="space-y-4">
            {/* Action Presets & Filter Bar */}
            <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
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
                              <td className="py-3 px-3 text-slate-500">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-sky-400 transition-transform" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 transition-transform group-hover:text-slate-300" />
                                )}
                              </td>

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

                            {/* Inline Expandable Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-950/60 border-b border-slate-800/80">
                                <td colSpan={7} className="p-4 sm:p-5">
                                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-inner">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                                          {log.action}
                                        </span>
                                        <span className="text-xs text-slate-400 font-medium">
                                          {display.category}
                                        </span>
                                        {log.details.sessionId && (
                                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-sky-400 border border-slate-700">
                                            Session: {log.details.sessionId.slice(0, 10)}...
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono">
                                        Exact Time: {new Date(log.createdAt).toUTCString()}
                                      </div>
                                    </div>

                                    {/* 3-Column Info Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                      {/* Card 1: Activity Summary */}
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
                                      </div>

                                      {/* Card 2: Actor Details */}
                                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                                          <Users className="h-3.5 w-3.5" /> Actor / User Context
                                        </span>
                                        <div>
                                          <span className="text-slate-400 block text-[10px]">User Name</span>
                                          <span className="font-semibold text-slate-200">
                                            {log.user.name || log.details.userName || 'Anonymous Actor'}
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
                                          <span className="text-slate-400 block text-[10px]">Client Device</span>
                                          <span className="text-[10px] text-slate-300 block">
                                            {log.details.deviceType || 'Desktop'} &bull; {log.details.browser || 'Browser'} on {log.details.os || 'OS'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Dedicated Before-and-After Change Viewer */}
                                    {log.details.changes && Array.isArray(log.details.changes) && log.details.changes.length > 0 && (
                                      <ChangeDiffViewer changes={log.details.changes} />
                                    )}

                                    {/* Raw JSON Toggle */}
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
          </div>
        )}

        {/* TAB 2: ACTIVE SESSIONS */}
        {activeTab === 'SESSIONS' && (
          <div className="space-y-4">
            {/* Active Sessions Filter Bar */}
            <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-400" />
                    <span>Real-Time Device Sessions</span>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                      {stats.activeUsersCount} Active Now
                    </Badge>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Persistent tracking of every logged-in device. Inactive sessions expire after 90 seconds. Logging out terminates only that device&apos;s session.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetSessionFilters}
                    className="h-8 border-slate-700 text-slate-400 hover:text-white text-xs"
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                <form onSubmit={handleSessionSearchSubmit} className="md:col-span-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <Input
                    type="text"
                    placeholder="Search user, email, IP, ID, browser..."
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="pl-9 bg-slate-800/90 border-slate-700 text-white placeholder-slate-500 h-9 rounded-lg text-xs focus:border-sky-500"
                  />
                </form>

                {/* Device Filter */}
                <div className="md:col-span-2">
                  <select
                    value={sessionDeviceFilter}
                    onChange={(e) => {
                      setSessionDeviceFilter(e.target.value);
                      setSessionPage(1);
                    }}
                    className="w-full h-9 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-lg px-2.5 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="ALL">All Devices</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Laptop">Laptop</option>
                    <option value="Mobile">Mobile</option>
                    <option value="Tablet">Tablet</option>
                  </select>
                </div>

                {/* Role Filter */}
                <div className="md:col-span-2">
                  <select
                    value={sessionRoleFilter}
                    onChange={(e) => {
                      setSessionRoleFilter(e.target.value);
                      setSessionPage(1);
                    }}
                    className="w-full h-9 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-lg px-2.5 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="ADMIN">Admins Only</option>
                    <option value="USER">Users Only</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="md:col-span-2">
                  <select
                    value={sessionStatusFilter}
                    onChange={(e) => {
                      setSessionStatusFilter(e.target.value);
                      setSessionPage(1);
                    }}
                    className="w-full h-9 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-lg px-2.5 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active (Live)</option>
                    <option value="EXPIRED">Expired (&gt;90s)</option>
                    <option value="LOGGED_OUT">Logged Out</option>
                    <option value="TERMINATED">Terminated by Admin</option>
                  </select>
                </div>

                {/* Sort By */}
                <div className="md:col-span-2">
                  <select
                    value={sessionSortBy}
                    onChange={(e) => {
                      setSessionSortBy(e.target.value as any);
                      setSessionPage(1);
                    }}
                    className="w-full h-9 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-lg px-2.5 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="lastActiveAt">Sort: Latest Active</option>
                    <option value="loginAt">Sort: Login Time</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Active Sessions Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Device &amp; OS</th>
                      <th className="py-3 px-4">Browser</th>
                      <th className="py-3 px-4">IP Address</th>
                      <th className="py-3 px-4">Login Time</th>
                      <th className="py-3 px-4">Last Active</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {isSessionsLoading ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-400 mb-2" />
                          Loading active sessions...
                        </td>
                      </tr>
                    ) : sessions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400">
                          <Users className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                          <p className="text-base font-semibold text-slate-300">No sessions match your filter</p>
                          <p className="text-xs text-slate-500 mt-1">Try resetting the status or device filters.</p>
                          <Button
                            onClick={handleResetSessionFilters}
                            variant="outline"
                            size="sm"
                            className="mt-4 border-slate-700 text-slate-300 text-xs"
                          >
                            Reset Filters
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      sessions.map((sess) => {
                        const DeviceIcon = getDeviceIcon(sess.deviceType);
                        const isLive = sess.status === 'ACTIVE';

                        return (
                          <tr key={sess.id} className="hover:bg-slate-800/30 transition-colors">
                            {/* User & Email */}
                            <td className="py-3 px-4 max-w-[200px]">
                              <div>
                                <span className="font-semibold text-slate-100 block truncate">
                                  {sess.userName || sess.userEmail || 'Administrator'}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono block truncate">
                                  {sess.userEmail}
                                </span>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold ${
                                  sess.userRole === 'ADMIN'
                                    ? 'border-sky-500/40 text-sky-400 bg-sky-500/10'
                                    : 'border-slate-700 text-slate-300 bg-slate-800/80'
                                }`}
                              >
                                {sess.userRole || 'USER'}
                              </Badge>
                            </td>

                            {/* Device & OS */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  <DeviceIcon className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                  <span className="font-medium text-slate-200 block">{sess.deviceType}</span>
                                  <span className="text-[10px] text-slate-500 block">{sess.os}</span>
                                </div>
                              </div>
                            </td>

                            {/* Browser */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-slate-300 font-medium">{sess.browser}</span>
                            </td>

                            {/* IP Address */}
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <span>{sess.ipAddress}</span>
                                <button
                                  onClick={() => copyToClipboard(sess.ipAddress, `sess-ip-${sess.id}`)}
                                  className="text-slate-500 hover:text-slate-300"
                                  title="Copy IP"
                                >
                                  {copiedId === `sess-ip-${sess.id}` ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Login Time */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-slate-300 block">{formatRelativeTime(sess.loginAt)}</span>
                              <span className="text-[10px] text-slate-500 block">
                                {new Date(sess.loginAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>

                            {/* Last Active */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {isLive && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                                <div>
                                  <span className="text-slate-200 font-medium block">
                                    {formatRelativeTime(sess.lastActiveAt)}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">
                                    {new Date(sess.lastActiveAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              {sess.status === 'ACTIVE' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 className="h-3 w-3" /> Active
                                </span>
                              ) : sess.status === 'EXPIRED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <Clock className="h-3 w-3" /> Expired
                                </span>
                              ) : sess.status === 'TERMINATED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  <XCircle className="h-3 w-3" /> Terminated
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                  <LogOut className="h-3 w-3" /> Logged Out
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                              <Button
                                onClick={() => setSelectedSessionDetails(sess)}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-[11px] border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                Details
                              </Button>

                              <Button
                                onClick={() => setSessionToTerminate(sess)}
                                disabled={sess.status !== 'ACTIVE'}
                                variant="outline"
                                size="sm"
                                className={`h-7 px-2.5 text-[11px] ${
                                  sess.status === 'ACTIVE'
                                    ? 'border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 hover:text-white'
                                    : 'border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed opacity-50'
                                }`}
                              >
                                Terminate
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Sessions Pagination */}
              <div className="py-3 px-4 bg-slate-800/40 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <div>
                  Showing <span className="font-semibold text-slate-200">{sessions.length}</span> of{' '}
                  <span className="font-semibold text-slate-200">{sessionTotalRecords.toLocaleString()}</span> session records
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sessionPage <= 1 || isSessionsLoading}
                    onClick={() => setSessionPage((p) => Math.max(1, p - 1))}
                    className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 text-xs"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <span className="px-2 text-slate-400">
                    Page <span className="text-white font-medium">{sessionPage}</span> of {sessionTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sessionPage >= sessionTotalPages || isSessionsLoading}
                    onClick={() => setSessionPage((p) => p + 1)}
                    className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 text-xs"
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* SESSION DETAILS MODAL */}
      {selectedSessionDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-xs text-slate-300 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Session Information</h3>
                  <p className="text-[11px] text-slate-400">Detailed authentication &amp; device metadata</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSessionDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Session Metadata Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">User Name</span>
                <span className="text-sm font-semibold text-white block mt-0.5">
                  {selectedSessionDetails.userName || selectedSessionDetails.userEmail}
                </span>
                <span className="text-[11px] text-slate-400 font-mono block">
                  {selectedSessionDetails.userEmail}
                </span>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Session Status</span>
                <div className="mt-1 flex items-center gap-2">
                  {selectedSessionDetails.status === 'ACTIVE' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-1" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      {selectedSessionDetails.status}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-sky-400">
                    {selectedSessionDetails.userRole}
                  </Badge>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Client Device</span>
                <span className="text-sm font-semibold text-white block mt-0.5">
                  {selectedSessionDetails.deviceType} &bull; {selectedSessionDetails.browser}
                </span>
                <span className="text-[11px] text-slate-400 block">OS: {selectedSessionDetails.os}</span>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Network Origin</span>
                <div className="flex items-center gap-1.5 mt-0.5 font-mono text-slate-200 text-sm">
                  <span>{selectedSessionDetails.ipAddress}</span>
                  <button
                    onClick={() => copyToClipboard(selectedSessionDetails.ipAddress, 'modal-ip')}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    {copiedId === 'modal-ip' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Session ID</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-slate-300 text-xs select-all">
                    {selectedSessionDetails.id}
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedSessionDetails.id, 'modal-sess-id')}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    {copiedId === 'modal-sess-id' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 col-span-2 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Lifecycle Timeline</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-500 block">Login Time:</span>
                    <span className="text-slate-300 font-mono">{new Date(selectedSessionDetails.loginAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Last Active Time:</span>
                    <span className="text-slate-300 font-mono">{new Date(selectedSessionDetails.lastActiveAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Configured Expiration:</span>
                    <span className="text-slate-300 font-mono">{new Date(selectedSessionDetails.expiresAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Logout / Termination:</span>
                    <span className="text-slate-300 font-mono">
                      {selectedSessionDetails.logoutAt ? new Date(selectedSessionDetails.logoutAt).toLocaleString() : 'N/A (Active)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Raw User Agent</span>
                <div className="font-mono text-[10px] text-slate-400 break-all bg-slate-900 p-2 rounded border border-slate-800 max-h-20 overflow-y-auto">
                  {selectedSessionDetails.userAgent || 'None reported'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSessionDetails(null)}
                className="border-slate-700 text-slate-300"
              >
                Close
              </Button>

              {selectedSessionDetails.status === 'ACTIVE' && (
                <Button
                  onClick={() => {
                    setSessionToTerminate(selectedSessionDetails);
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
                  size="sm"
                >
                  <ShieldAlert className="h-4 w-4 mr-1.5" />
                  Terminate Session
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SESSION TERMINATION CONFIRMATION DIALOG */}
      {sessionToTerminate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirm Session Termination</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Are you sure you want to forcibly terminate this active session?
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Target User:</span>
                <span className="font-semibold text-slate-200">
                  {sessionToTerminate.userName || sessionToTerminate.userEmail}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Email:</span>
                <span className="font-mono text-slate-300">{sessionToTerminate.userEmail}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Device &amp; Browser:</span>
                <span className="text-slate-300">{sessionToTerminate.deviceType} &bull; {sessionToTerminate.browser}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">IP Address:</span>
                <span className="font-mono text-slate-300">{sessionToTerminate.ipAddress}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Session ID:</span>
                <span className="font-mono text-slate-400 text-[10px]">{sessionToTerminate.id.slice(0, 18)}...</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                The authentication token for this specific device will be revoked immediately. Other active sessions belonging to this user will remain unaffected.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isTerminating}
                onClick={() => setSessionToTerminate(null)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isTerminating}
                onClick={() => handleTerminateSession(sessionToTerminate.id)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {isTerminating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Terminating...
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                    Confirm Revocation
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
