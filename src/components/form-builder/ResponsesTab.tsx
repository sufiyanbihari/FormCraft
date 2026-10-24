'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Users,
  Award,
  Calendar,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Loader2,
  ExternalLink,
} from 'lucide-react';

function renderSingleFileCard(val: any, idx?: number) {
  const isImg =
    val.mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(val.fileName || '') ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(val.publicUrl || '');

  return (
    <div
      key={idx ?? val.publicUrl}
      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-1 shadow-sm"
    >
      {isImg ? (
        <a href={val.publicUrl} target="_blank" rel="noopener noreferrer" className="block shrink-0 group">
          <img
            src={val.publicUrl}
            alt={val.fileName || 'Uploaded image'}
            className="h-20 w-32 rounded-lg object-contain border bg-gray-50 group-hover:opacity-90 shadow-sm"
          />
        </a>
      ) : (
        <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center shrink-0">
          <FileText className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{val.fileName || 'Uploaded file'}</p>
        {val.fileSize && (
          <p className="text-[11px] text-gray-400">{(val.fileSize / 1024).toFixed(1)} KB</p>
        )}
        <a
          href={val.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-600 hover:text-purple-700 font-semibold inline-flex items-center gap-1 mt-1 hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> View / Download file
        </a>
      </div>
    </div>
  );
}

export function extractFilesFromAnswers(answers: any[]): Array<{ fileName: string; publicUrl: string; fileSize?: number; mimeType?: string }> {
  const files: Array<{ fileName: string; publicUrl: string; fileSize?: number; mimeType?: string }> = [];
  if (!Array.isArray(answers)) return files;

  for (const ans of answers) {
    let val = ans.value;
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
      try {
        val = JSON.parse(val);
      } catch {}
    }

    const checkAndAdd = (item: any) => {
      if (!item || typeof item !== 'object') return;
      const url = item.publicUrl || item.url || item.fileUrl;
      if (url && typeof url === 'string') {
        const name = item.fileName || item.name || url.split('/').pop() || 'file';
        files.push({
          fileName: name,
          publicUrl: url,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
        });
      }
    };

    if (Array.isArray(val)) {
      val.forEach(checkAndAdd);
    } else {
      checkAndAdd(val);
    }
  }

  return files;
}

function renderAnswerValue(val: any) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-gray-400 italic text-xs">No response provided</span>;
  }
  if (typeof val === 'object' && !Array.isArray(val) && val.publicUrl) {
    return renderSingleFileCard(val);
  }
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0]?.publicUrl) {
    return (
      <div className="space-y-2 mt-1">
        {val.map((item: any, idx: number) => renderSingleFileCard(item, idx))}
      </div>
    );
  }
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(val).map(([r, c]) => (
          <div key={r} className="text-xs text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{r}:</span> {String(c)}
          </div>
        ))}
      </div>
    );
  }
  return String(val);
}
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface ResponsesTabProps {
  formId: string;
  isQuiz: boolean;
  isAcceptingResponses: boolean;
  onToggleAccepting: (accepting: boolean) => void;
  primaryColor?: string;
}

const CHART_COLORS = [
  '#673ab7',
  '#0284c7',
  '#059669',
  '#ea580c',
  '#db2777',
  '#eab308',
  '#8b5cf6',
  '#14b8a6',
];

export default function ResponsesTab({
  formId,
  isQuiz,
  isAcceptingResponses,
  onToggleAccepting,
  primaryColor = '#673ab7',
}: ResponsesTabProps) {
  const [subView, setSubView] = useState<'summary' | 'question' | 'individual'>('summary');
  const [analytics, setAnalytics] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [individualIndex, setIndividualIndex] = useState(0);

  const fetchResponsesData = async () => {
    try {
      setIsLoading(true);
      const [analyticsRes, submissionsRes] = await Promise.all([
        fetch(`/api/forms/${formId}/responses/analytics`),
        fetch(`/api/forms/${formId}/responses?limit=100`),
      ]);

      if (analyticsRes.ok) {
        const aData = await analyticsRes.json();
        setAnalytics(aData);
        if (aData.questionAnalytics?.length > 0) {
          setSelectedQuestionId(aData.questionAnalytics[0].questionId);
        }
      }

      if (submissionsRes.ok) {
        const sData = await submissionsRes.json();
        setSubmissions(sData.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load response data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResponsesData();
  }, [formId]);

  const handleDeleteResponse = async (responseId: string) => {
    if (!confirm('Are you sure you want to delete this response?')) return;
    try {
      const res = await fetch(`/api/forms/${formId}/responses/${responseId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchResponsesData();
        if (individualIndex > 0) {
          setIndividualIndex(individualIndex - 1);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const totalCount = analytics?.summary?.totalSubmissions ?? submissions.length;

  const totalUploadedFilesCount = submissions.reduce(
    (acc, sub) => acc + extractFilesFromAnswers(sub.answers || []).length,
    0
  );

  const currentSubmission = submissions[individualIndex];
  const currentSubmissionFiles = currentSubmission
    ? extractFilesFromAnswers(currentSubmission.answers || [])
    : [];

  const handleDownloadAllFormFiles = () => {
    window.open(`/api/forms/${formId}/responses/export?format=zip`, '_blank');
  };

  const handleDownloadSubmissionFiles = (submissionId: string) => {
    window.open(`/api/forms/${formId}/responses/export?format=zip&submissionId=${submissionId}`, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Top Banner: Response Count + Accepting Toggle + Export Actions */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>{totalCount}</span>
            <span className="text-base font-medium text-gray-500">
              {totalCount === 1 ? 'response' : 'responses'}
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time analytics and respondent submissions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          {/* Accepting responses switch */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {isAcceptingResponses ? 'Accepting responses' : 'Not accepting responses'}
            </span>
            <Switch
              checked={isAcceptingResponses}
              onCheckedChange={onToggleAccepting}
            />
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/forms/${formId}/responses/export?format=csv`, '_blank')}
              className="text-xs h-8"
              title="Download CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-600" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/forms/${formId}/responses/export?format=xlsx`, '_blank')}
              className="text-xs h-8"
              title="Download Excel spreadsheet"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-blue-600" /> XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/forms/${formId}/responses/export?format=json`, '_blank')}
              className="text-xs h-8"
              title="Download JSON data"
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-purple-600" /> JSON
            </Button>
            {totalUploadedFilesCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllFormFiles}
                className="text-xs h-8 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 font-medium"
                title="Download all files uploaded across all responses as ZIP"
              >
                <Download className="h-3.5 w-3.5 mr-1 text-purple-600" /> All Files ({totalUploadedFilesCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-view switcher: Summary | Question | Individual */}
      <div className="flex justify-center border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-8 -mb-px text-xs font-semibold">
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'question', label: 'Question' },
            { id: 'individual', label: 'Individual' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id as any)}
              className={`py-2 px-3 border-b-2 transition-all ${
                subView === tab.id
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : totalCount === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">
            Waiting for responses
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Once respondents fill out your published form, aggregate charts, analytics, and individual responses will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* VIEW 1: SUMMARY */}
          {subView === 'summary' && (
            <div className="space-y-6">
              {/* Quiz Score Card if Quiz */}
              {isQuiz && analytics?.summary?.avgScore !== undefined && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                    <Award className="h-5 w-5" />
                    <h3 className="font-bold text-sm">Quiz Insights</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Average Score</p>
                      <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200">
                        {analytics.summary.avgScore} / {analytics.summary.maxQuizScore} pts
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Graded</p>
                      <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200">
                        {totalCount} submissions
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submissions Over Time Chart */}
              {analytics?.timeline && analytics.timeline.length > 0 && (() => {
                // Process timeline data: if only 1 day or sparse, pad with adjacent dates so the curve renders beautifully
                let processedTimeline = [...analytics.timeline].sort(
                  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                );

                if (processedTimeline.length === 1) {
                  const singleDate = new Date(processedTimeline[0].date);
                  const padDays = [-2, -1, 1, 2];
                  const beforeList = padDays.slice(0, 2).map((offset) => {
                    const d = new Date(singleDate);
                    d.setDate(d.getDate() + offset);
                    return { date: d.toISOString().split('T')[0], count: 0 };
                  });
                  const afterList = padDays.slice(2).map((offset) => {
                    const d = new Date(singleDate);
                    d.setDate(d.getDate() + offset);
                    return { date: d.toISOString().split('T')[0], count: 0 };
                  });
                  processedTimeline = [...beforeList, processedTimeline[0], ...afterList];
                }

                // Stats calculations
                const maxCount = Math.max(...analytics.timeline.map((t: any) => t.count), 0);
                const peakEntry = analytics.timeline.find((t: any) => t.count === maxCount);
                const latestEntry = analytics.timeline[analytics.timeline.length - 1];

                const formatTickDate = (dStr: string) => {
                  try {
                    const parts = dStr.split('-');
                    if (parts.length === 3) {
                      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }
                    return dStr;
                  } catch {
                    return dStr;
                  }
                };

                const formatFullDate = (dStr: string) => {
                  try {
                    const parts = dStr.split('-');
                    if (parts.length === 3) {
                      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                    }
                    return dStr;
                  } catch {
                    return dStr;
                  }
                };

                return (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-purple-600" />
                          Submissions Timeline
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Daily submission volume and response pace
                        </p>
                      </div>

                      {/* Timeline quick stats */}
                      <div className="flex items-center gap-3 text-xs">
                        {peakEntry && (
                          <div className="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60">
                            <span className="text-gray-500 dark:text-gray-400 mr-1.5">Peak Day:</span>
                            <span className="font-bold text-purple-700 dark:text-purple-300">
                              {formatTickDate(peakEntry.date)} ({peakEntry.count})
                            </span>
                          </div>
                        )}
                        {latestEntry && (
                          <div className="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            <span className="text-gray-500 mr-1.5">Latest:</span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {formatTickDate(latestEntry.date)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-60 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={processedTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorSub" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={primaryColor} stopOpacity={0.45} />
                              <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatTickDate}
                            tick={{ fontSize: 11, fill: '#888888' }}
                            stroke="#e5e7eb"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: '#888888' }}
                            stroke="#e5e7eb"
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const item = payload[0].payload;
                                return (
                                  <div className="bg-gray-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-gray-700 text-xs">
                                    <p className="text-gray-400 font-medium">{formatFullDate(item.date)}</p>
                                    <p className="text-sm font-bold text-white mt-1">
                                      {item.count} {item.count === 1 ? 'submission' : 'submissions'}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            name="Submissions"
                            stroke={primaryColor}
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorSub)"
                            dot={{ r: 4, fill: primaryColor, stroke: '#ffffff', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: primaryColor, stroke: '#ffffff', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Question Level Charts */}
              {analytics?.questionAnalytics?.map((q: any) => {
                const isChoiceQuestion = q.type === 'MULTIPLE_CHOICE' || q.type === 'DROPDOWN';
                const allDistribution = q.distribution || [];
                // Filter out 0-count items for the Pie chart to eliminate collision and scrambled labels at angle 0
                const activeDistribution = allDistribution.filter((d: any) => d.count > 0);

                return (
                  <div
                    key={q.questionId}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {q.title}
                        </h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {q.answeredCount} {q.answeredCount === 1 ? 'response' : 'responses'}
                          {q.average !== undefined ? ` • Average: ${q.average}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Distribution Section: Unscrambled Pie / Donut + Complete Breakdown List */}
                    {allDistribution.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-1">
                        {/* Left Column: Visual Chart */}
                        <div className="h-64 w-full flex items-center justify-center relative">
                          {isChoiceQuestion ? (
                            activeDistribution.length === 0 ? (
                              <div className="flex flex-col items-center justify-center text-gray-400 text-xs">
                                <div className="h-28 w-28 rounded-full border-4 border-dashed border-gray-200 dark:border-gray-800 mb-2 flex items-center justify-center">
                                  <span className="text-[11px] font-medium">0 responses</span>
                                </div>
                                <p>No selections recorded yet</p>
                              </div>
                            ) : (
                              <div className="w-full h-full relative flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={activeDistribution}
                                      dataKey="count"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={activeDistribution.length === 1 ? 50 : 45}
                                      outerRadius={80}
                                      paddingAngle={activeDistribution.length > 1 ? 3 : 0}
                                      // Only show outer labels if there are multiple active slices and slice is at least 10%
                                      label={
                                        activeDistribution.length > 1
                                          ? ({ name, percentage }: any) =>
                                              percentage >= 10 ? `${percentage}%` : ''
                                          : false
                                      }
                                      labelLine={activeDistribution.length > 1}
                                    >
                                      {activeDistribution.map((entry: any) => {
                                        // Match color to the option's original index in allDistribution
                                        const originalIndex = allDistribution.findIndex(
                                          (item: any) => item.name === entry.name
                                        );
                                        const colorIdx =
                                          originalIndex >= 0 ? originalIndex : 0;
                                        return (
                                          <Cell
                                            key={`cell-${entry.name}`}
                                            fill={CHART_COLORS[colorIdx % CHART_COLORS.length]}
                                          />
                                        );
                                      })}
                                    </Pie>
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                          const data = payload[0].payload;
                                          return (
                                            <div className="bg-gray-900 text-white px-3 py-2 rounded-xl shadow-xl border border-gray-700 text-xs">
                                              <p className="font-semibold text-white">{data.name}</p>
                                              <p className="text-gray-300 mt-0.5">
                                                {data.count} {data.count === 1 ? 'response' : 'responses'} ({data.percentage}%)
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>

                                {/* When only 1 response/slice exists, show clean badge in donut center */}
                                {activeDistribution.length === 1 && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
                                      100%
                                    </span>
                                    <span className="text-[11px] font-semibold text-gray-500 max-w-[120px] truncate text-center px-2">
                                      {activeDistribution[0].name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={allDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <XAxis
                                  dataKey="name"
                                  tick={{ fontSize: 10 }}
                                  interval={0}
                                  angle={-20}
                                  textAnchor="end"
                                />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-gray-900 text-white px-3 py-2 rounded-xl shadow-xl border border-gray-700 text-xs">
                                          <p className="font-semibold text-white">{data.name}</p>
                                          <p className="text-gray-300 mt-0.5">
                                            {data.count} selections ({data.percentage || 0}%)
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar
                                  dataKey="count"
                                  name="Selections"
                                  fill={primaryColor}
                                  radius={[4, 4, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>

                        {/* Right Column: Complete Options Breakdown List (All options including 0-count ones!) */}
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Responses Breakdown ({allDistribution.length} options)
                          </p>
                          {allDistribution.map((item: any, idx: number) => {
                            const color = CHART_COLORS[idx % CHART_COLORS.length];
                            const hasResponses = item.count > 0;
                            return (
                              <div
                                key={item.name}
                                className={`p-2.5 rounded-xl border transition-all ${
                                  hasResponses
                                    ? 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 shadow-xs'
                                    : 'bg-gray-50/70 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800/60 opacity-75'
                                }`}
                              >
                                <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className="h-3 w-3 rounded-full shrink-0 shadow-xs"
                                      style={{ backgroundColor: color }}
                                    />
                                    <span
                                      className={`truncate ${
                                        hasResponses
                                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                                          : 'font-medium text-gray-500 dark:text-gray-400'
                                      }`}
                                      title={item.name}
                                    >
                                      {item.name}
                                    </span>
                                  </div>
                                  <span
                                    className={`shrink-0 text-right ${
                                      hasResponses
                                        ? 'font-bold text-purple-600 dark:text-purple-400'
                                        : 'font-normal text-gray-400'
                                    }`}
                                  >
                                    {item.count} ({item.percentage || 0}%)
                                  </span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700/60 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.max(item.percentage || 0, item.count > 0 ? 4 : 0)}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : q.recentAnswers ? (
                      /* Text answers list */
                      <div className="space-y-2 max-h-52 overflow-y-auto pt-2">
                        {q.recentAnswers.map((ans: string, i: number) => (
                          <div
                            key={i}
                            className="p-3 text-xs bg-gray-50 dark:bg-gray-800/60 rounded-lg text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800"
                          >
                            {ans}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: QUESTION */}
          {subView === 'question' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                <label className="text-xs font-semibold text-gray-500 mb-2 block uppercase tracking-wider">
                  Select Question
                </label>
                <Select
                  value={selectedQuestionId}
                  onValueChange={setSelectedQuestionId}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {analytics?.questionAnalytics?.map((q: any) => (
                      <SelectItem key={q.questionId} value={q.questionId}>
                        {q.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Answers for selected question */}
              {submissions.map((sub) => {
                const answer = sub.answers.find((a: any) => a.questionId === selectedQuestionId);
                if (!answer) return null;

                return (
                  <div
                    key={sub.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs text-gray-400 mb-1">
                        Respondent: {sub.respondentEmail || 'Anonymous'} •{' '}
                        {new Date(sub.submittedAt).toLocaleString()}
                      </p>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {renderAnswerValue(answer.value)}
                      </div>
                    </div>

                    {answer.isCorrect !== null && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          answer.isCorrect
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {answer.score || 0} pts
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 3: INDIVIDUAL */}
          {subView === 'individual' && submissions.length > 0 && (
            <div className="space-y-4">
              {/* Pagination bar */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIndividualIndex(Math.max(0, individualIndex - 1))}
                    disabled={individualIndex === 0}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {individualIndex + 1} of {submissions.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setIndividualIndex(Math.min(submissions.length - 1, individualIndex + 1))
                    }
                    disabled={individualIndex === submissions.length - 1}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  {currentSubmissionFiles.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadSubmissionFiles(submissions[individualIndex].id)}
                      className="text-xs h-8 font-semibold text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 shadow-sm"
                      title="Download all files uploaded in this response as ZIP"
                    >
                      <Download className="h-3.5 w-3.5 mr-1 text-purple-600" />
                      Download all files ({currentSubmissionFiles.length})
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteResponse(submissions[individualIndex].id)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete response
                  </Button>
                </div>
              </div>

              {/* Response Details Card */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 flex-wrap gap-3">
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                      {submissions[individualIndex].respondentEmail || 'Anonymous Respondent'}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Submitted at {new Date(submissions[individualIndex].submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {currentSubmissionFiles.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadSubmissionFiles(submissions[individualIndex].id)}
                        className="text-xs h-8 font-semibold text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 shadow-sm"
                        title="Download all files uploaded in this response as ZIP"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                        Download all files ({currentSubmissionFiles.length})
                      </Button>
                    )}
                    {isQuiz && (
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-purple-600">
                          Score: {submissions[individualIndex].totalScore ?? 0} /{' '}
                          {submissions[individualIndex].maxScore ?? 0}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Repeatable Cattle Owners Viewer */}
                {submissions[individualIndex].cattleOwners && submissions[individualIndex].cattleOwners.length > 0 && (
                  <div className="space-y-3 p-4 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center gap-2">
                        <Users className="h-4 w-4 text-sky-600" />
                        <span>Registered Cattle Owners ({submissions[individualIndex].cattleOwners.length}) – પશુપાલકોની વિગતો</span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {submissions[individualIndex].cattleOwners.map((owner: any, oIdx: number) => (
                        <div
                          key={owner.id || oIdx}
                          className="p-3.5 rounded-lg border border-sky-100 dark:border-sky-900/40 bg-white dark:bg-gray-900 space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-1.5">
                            <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                              Cattle Owner {owner.orderIndex !== undefined ? owner.orderIndex + 1 : oIdx + 1}
                            </span>
                            <span className="text-[11px] font-mono text-gray-500">{owner.ownerMobile}</span>
                          </div>
                          <div className="text-xs space-y-1">
                            <p><span className="text-gray-500">Full Name:</span> <strong className="text-gray-900 dark:text-gray-100">{owner.ownerName}</strong></p>
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-gray-600 dark:text-gray-300">
                              <div><span className="text-gray-400">Large Cattle:</span> <strong className="text-gray-800 dark:text-gray-200">{owner.largeCattleCount}</strong></div>
                              <div><span className="text-gray-400">Small Cattle:</span> <strong className="text-gray-800 dark:text-gray-200">{owner.smallCattleCount}</strong></div>
                              <div><span className="text-gray-400">Flooring:</span> <strong className="text-gray-800 dark:text-gray-200">{owner.flooringType}</strong></div>
                              <div><span className="text-gray-400">Supply Dung:</span> <strong className="text-gray-800 dark:text-gray-200">{owner.supplyDung}</strong></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Answers List */}
                <div className="space-y-4">
                  {submissions[individualIndex].answers.map((ans: any) => (
                    <div
                      key={ans.id}
                      className="p-4 rounded-xl bg-gray-50/70 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                          {ans.question?.title || 'Question'}
                        </h5>
                        {ans.isCorrect !== null && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              ans.isCorrect
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {ans.score || 0} pts
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {renderAnswerValue(ans.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
