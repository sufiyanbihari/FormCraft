'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Mail, Clock, Eye, ShieldCheck, Sliders, Calendar, Users, Hourglass, Navigation, AlertTriangle, ArrowRight, ExternalLink, Edit3, Key, Lock, CheckCircle2, Link2, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import QuizRosterModal from './QuizRosterModal';

interface SettingsTabProps {
  isQuiz: boolean;
  onToggleQuiz: (isQuiz: boolean) => void;
  settings: any;
  onChangeSettings: (updated: any) => void;
  primaryColor?: string;
  questions?: Array<{ id: string; title: string; type: string }>;
  formId?: string;
  onOpenLiveDashboard?: () => void;
}

function toLocalInputString(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function SettingsTab({
  isQuiz,
  onToggleQuiz,
  settings,
  onChangeSettings,
  primaryColor = '#673ab7',
  questions = [],
  formId,
  onOpenLiveDashboard,
}: SettingsTabProps) {
  const [isRosterModalOpen, setIsRosterModalOpen] = React.useState(false);
  const [rosterCount, setRosterCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (formId) {
      fetch(`/api/forms/${formId}/quiz/roster`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.totalCount !== undefined) {
            setRosterCount(data.totalCount);
          }
        })
        .catch(() => {});
    }
  }, [formId]);

  React.useEffect(() => {
    if (isQuiz && settings?.quizRosterMode !== 'ROSTER') {
      onChangeSettings({ quizRosterMode: 'ROSTER' });
    }
  }, [isQuiz, settings?.quizRosterMode]);
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* 1. Quiz Settings */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 bg-gradient-to-r from-amber-50/40 to-transparent dark:from-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Make this a quiz</CardTitle>
              <CardDescription className="text-xs">
                Assign point values, set correct answers, and provide automatic feedback
              </CardDescription>
            </div>
          </div>
          <Switch checked={isQuiz} onCheckedChange={onToggleQuiz} />
        </CardHeader>

        {isQuiz && (
          <CardContent className="space-y-5 pt-3 text-xs border-t border-gray-100 dark:border-gray-800">
            {/* Release Grades Setting */}
            <div className="space-y-2">
              <label className="font-bold text-gray-800 dark:text-gray-200 block">
                Release Grades
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  onClick={() => onChangeSettings({ quizReleaseGrade: 'IMMEDIATE' })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                    (settings?.quizReleaseGrade ?? 'IMMEDIATE') === 'IMMEDIATE'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Immediately after each submission
                    </span>
                    {(settings?.quizReleaseGrade ?? 'IMMEDIATE') === 'IMMEDIATE' && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Respondents view their score and results instantly upon submitting
                  </p>
                </div>

                <div
                  onClick={() => onChangeSettings({ quizReleaseGrade: 'AFTER_REVIEW' })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                    settings?.quizReleaseGrade === 'AFTER_REVIEW'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Later, after manual review
                    </span>
                    {settings?.quizReleaseGrade === 'AFTER_REVIEW' && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Withhold scores until you manually review and release grades from the Responses tab
                  </p>
                </div>
              </div>
            </div>

            {/* Respondent Review Settings */}
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="font-bold text-gray-800 dark:text-gray-200 block">
                Respondent Results Display
              </label>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Show points earned</p>
                  <p className="text-gray-500 text-[11px]">
                    Display total points and points received for each question
                  </p>
                </div>
                <Switch
                  checked={settings?.quizShowPointsEarned ?? true}
                  onCheckedChange={(checked) => onChangeSettings({ quizShowPointsEarned: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Show correct answers</p>
                  <p className="text-gray-500 text-[11px]">
                    Identify correct answers after grades are released
                  </p>
                </div>
                <Switch
                  checked={settings?.quizShowCorrectAnswers ?? true}
                  onCheckedChange={(checked) => onChangeSettings({ quizShowCorrectAnswers: checked })}
                />
              </div>
            </div>

            {/* Default Points & Passing Threshold */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                  Default Points per Question
                </label>
                <Input
                  type="number"
                  min="0"
                  value={settings?.quizDefaultPoints ?? 1}
                  onChange={(e) =>
                    onChangeSettings({ quizDefaultPoints: parseInt(e.target.value, 10) || 0 })
                  }
                  className="h-8 text-xs w-28"
                />
                <p className="text-[10px] text-gray-400 mt-1">Default assigned to newly added questions</p>
              </div>

              <div>
                <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                  Passing Score Threshold (%)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 70"
                    value={settings?.quizPassPercentage ?? ''}
                    onChange={(e) =>
                      onChangeSettings({
                        quizPassPercentage: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="h-8 text-xs w-28"
                  />
                  <span className="text-xs text-gray-500 font-medium">%</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Leave empty to disable pass/fail grading</p>
              </div>
            </div>

            {/* Custom Pass/Fail Messages */}
            {settings?.quizPassPercentage !== null && settings?.quizPassPercentage !== undefined && (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                    Custom Pass Message
                  </label>
                  <Input
                    type="text"
                    value={settings?.quizPassMessage || 'Congratulations! You passed the quiz.'}
                    onChange={(e) => onChangeSettings({ quizPassMessage: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                    Custom Fail Message
                  </label>
                  <Input
                    type="text"
                    value={
                      settings?.quizFailMessage ||
                      'Unfortunately, you did not reach the passing score.'
                    }
                    onChange={(e) => onChangeSettings({ quizFailMessage: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Live Monitoring Dashboard Banner */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-200 dark:border-purple-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-gray-900 dark:text-gray-100">Live Quiz Monitoring</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Monitor live participant attempts, timers, completion statuses, and real-time scores
                  </p>
                </div>
                {onOpenLiveDashboard && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onOpenLiveDashboard}
                    className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white shrink-0 shadow-xs"
                  >
                    Open Live Dashboard <ArrowRight className="h-3 w-3 ml-1.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Participant Identity Configuration */}
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div>
                <label className="font-bold text-gray-800 dark:text-gray-200 block">
                  Participant Identity Field
                </label>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  Select a form question used to uniquely identify each participant (e.g. Employee ID, Student ID, Email, Registration Number)
                </p>
              </div>

              <div className="max-w-md">
                <Select
                  value={settings?.quizIdentityQuestionId || 'NONE'}
                  onValueChange={(val) =>
                    onChangeSettings({ quizIdentityQuestionId: val === 'NONE' ? null : val })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select identity question..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE" className="text-xs">
                      -- None (Use respondent email or anonymous identity) --
                    </SelectItem>
                    {questions
                      .filter((q) => q.type !== 'SECTION_HEADER' && q.type !== 'TEXT_BLOCK' && q.type !== 'IMAGE_BLOCK' && q.type !== 'VIDEO_EMBED')
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id} className="text-xs">
                          {q.title || 'Untitled Question'} ({q.type.replace('_', ' ')})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expected Participants & Authorized Roster */}
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div>
                <label className="font-bold text-gray-800 dark:text-gray-200 block">
                  Expected Participants & Access Authorization
                </label>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  Enforce strict roster authorization. Only registered participant IDs will be allowed to access and submit this quiz.
                </p>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                      Authorized Participant Roster (Method B)
                    </p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                      {rosterCount !== null ? `${rosterCount} Registered` : 'Roster Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {rosterCount !== null
                      ? `${rosterCount} authorized participant(s) uploaded and verified`
                      : 'Upload spreadsheets (.xlsx, .csv) or add participant IDs individually'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsRosterModalOpen(true)}
                  className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white shadow-xs shrink-0"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Manage Roster
                </Button>
              </div>
            </div>

            {/* Quiz Timers Configuration */}
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div>
                <label className="font-bold text-gray-800 dark:text-gray-200 block">
                  Timer Configuration
                </label>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  Configure server-enforced countdown timers. Timers remain valid across browser refreshes and cannot be manipulated.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'NONE', label: 'No Timers', desc: 'Untimed quiz' },
                  { id: 'QUESTION', label: 'Per-Question', desc: 'Individual question timers' },
                  { id: 'OVERALL', label: 'Overall Duration', desc: 'Total quiz time limit' },
                  { id: 'BOTH', label: 'Both Timers', desc: 'Overall + Question limits' },
                ].map((mode) => (
                  <div
                    key={mode.id}
                    onClick={() => onChangeSettings({ quizTimerMode: mode.id })}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-0.5 ${
                      (settings?.quizTimerMode ?? 'NONE') === mode.id
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-[11px]">
                      {mode.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{mode.desc}</span>
                  </div>
                ))}
              </div>

              {((settings?.quizTimerMode === 'OVERALL') || (settings?.quizTimerMode === 'BOTH')) && (
                <div className="pt-2 flex items-center gap-3">
                  <label className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                    Total Quiz Duration (Minutes):
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="1440"
                      placeholder="e.g. 30"
                      value={settings?.quizDurationMinutes ?? ''}
                      onChange={(e) =>
                        onChangeSettings({
                          quizDurationMinutes: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      className="h-8 text-xs w-28"
                    />
                    <span className="text-xs text-gray-500 font-medium">min</span>
                  </div>
                </div>
              )}

              {((settings?.quizTimerMode === 'QUESTION') || (settings?.quizTimerMode === 'BOTH')) && (
                <div className="pt-2 flex items-center gap-3">
                  <label className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                    Per-Question Time Limit (Seconds):
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="5"
                      max="3600"
                      placeholder="e.g. 60"
                      value={settings?.quizQuestionTimeLimitSeconds ?? ''}
                      onChange={(e) =>
                        onChangeSettings({
                          quizQuestionTimeLimitSeconds: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      className="h-8 text-xs w-28"
                    />
                    <span className="text-xs text-gray-500 font-medium">sec</span>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Policy */}
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div>
                <label className="font-bold text-gray-800 dark:text-gray-200 block">
                  Question Navigation Policy
                </label>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  Control whether participants can revisit earlier questions
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  onClick={() => onChangeSettings({ quizNavigationPolicy: 'BACKWARD_ENABLED' })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                    (settings?.quizNavigationPolicy ?? 'BACKWARD_ENABLED') === 'BACKWARD_ENABLED'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Allow Backward Navigation
                    </span>
                    {(settings?.quizNavigationPolicy ?? 'BACKWARD_ENABLED') === 'BACKWARD_ENABLED' && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Respondents can move freely between questions and modify answers while time allows
                  </p>
                </div>

                <div
                  onClick={() => onChangeSettings({ quizNavigationPolicy: 'FORWARD_ONLY' })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                    settings?.quizNavigationPolicy === 'FORWARD_ONLY'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Forward-Only Navigation
                    </span>
                    {settings?.quizNavigationPolicy === 'FORWARD_ONLY' && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Once respondents advance to the next question, previous questions are locked permanently
                  </p>
                </div>
              </div>
            </div>

            {/* Automatic Timeout Behavior Info */}
            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <Hourglass className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Secure Server-Side Timeout Policy</p>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                  When the overall quiz timer or question deadline expires, FormCraft automatically finalizes and scores the attempt, saving all valid responses submitted before the cutoff.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Roster Modal */}
      {formId && (
        <QuizRosterModal
          isOpen={isRosterModalOpen}
          onClose={() => setIsRosterModalOpen(false)}
          formId={formId}
          onRosterUpdated={(cnt) => setRosterCount(cnt)}
        />
      )}

      {/* 2. Responses Settings */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm font-bold">Responses & Identification</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Manage respondent identity, authentication, and submission rules
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Collect email addresses
              </p>
              <p className="text-gray-500 text-[11px]">
                Require respondents to provide a valid email before submitting
              </p>
            </div>
            <Switch
              checked={settings?.collectEmail || false}
              onCheckedChange={(checked) => onChangeSettings({ collectEmail: checked })}
            />
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Require sign-in
              </p>
              <p className="text-gray-500 text-[11px]">
                Respondents must be logged in to access and submit this form
              </p>
            </div>
            <Switch
              checked={settings?.requireAuth || false}
              onCheckedChange={(checked) => onChangeSettings({ requireAuth: checked })}
            />
          </div>

          {/* Duplicate Response Prevention Section */}
          <div className="py-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  Duplicate response prevention
                </p>
                <p className="text-gray-500 text-[11px]">
                  Restrict respondents from submitting this form multiple times
                </p>
              </div>
              <Switch
                checked={settings?.restrictOneResponse || false}
                onCheckedChange={(checked) => onChangeSettings({ restrictOneResponse: checked })}
              />
            </div>

            {settings?.restrictOneResponse && (
              <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/70 dark:border-purple-800/60 space-y-3 text-xs animate-in fade-in">
                {/* Identification Method */}
                <div>
                  <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                    Participant Identification Method
                  </label>
                  <Select
                    value={settings?.duplicateIdentifierMethod || 'AUTH_USER'}
                    onValueChange={(val) => {
                      const updates: any = { duplicateIdentifierMethod: val };
                      if (val === 'AUTH_USER') updates.requireAuth = true;
                      if (val === 'VERIFIED_EMAIL') updates.collectEmail = true;
                      onChangeSettings(updates);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select identification method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTH_USER">
                        Signed-in Account (Requires login, matches user ID)
                      </SelectItem>
                      <SelectItem value="VERIFIED_EMAIL">
                        Email Address (Requires email collection or login)
                      </SelectItem>
                      <SelectItem value="QUESTION_FIELD">
                        Specific Question (e.g. Employee ID, Student ID, Mobile)
                      </SelectItem>
                      <SelectItem value="IP_ADDRESS">
                        Client Device / IP (Best-effort anonymous protection)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Identity Question Field Selector */}
                {settings?.duplicateIdentifierMethod === 'QUESTION_FIELD' && (
                  <div>
                    <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                      Identity Question
                    </label>
                    <Select
                      value={settings?.duplicateIdentifierQuestionId || ''}
                      onValueChange={(val) => onChangeSettings({ duplicateIdentifierQuestionId: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select the identity question..." />
                      </SelectTrigger>
                      <SelectContent>
                        {questions
                          .filter((q) => q.type !== 'SECTION_HEADER' && q.type !== 'TEXT_BLOCK')
                          .map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.title || 'Untitled Question'} ({q.type})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Submissions with matching responses to this field will be rejected as duplicates.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controlled Response Editing Section */}
          <div className="py-4 space-y-3.5 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  Allow response editing
                </p>
                <p className="text-gray-500 text-[11px]">
                  Permit respondents to modify their previously submitted response
                </p>
              </div>
              <Switch
                checked={settings?.allowResponseEditing || false}
                onCheckedChange={(checked) => onChangeSettings({ allowResponseEditing: checked })}
              />
            </div>

            {settings?.allowResponseEditing && (
              <div className="p-3.5 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/70 dark:border-sky-800/60 space-y-3 text-xs animate-in fade-in">
                {/* Editing Authorization Method */}
                <div>
                  <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                    Editing Authorization Method
                  </label>
                  <Select
                    value={settings?.editingAuthMethod || 'SECURE_EDIT_LINK'}
                    onValueChange={(val) => {
                      const updates: any = { editingAuthMethod: val };
                      if (val === 'AUTH_USER') updates.requireAuth = true;
                      onChangeSettings(updates);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select editing authorization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECURE_EDIT_LINK">
                        Secure Edit Link (Unique token on confirmation screen)
                      </SelectItem>
                      <SelectItem value="AUTH_USER">
                        Signed-in Account Only (Must be logged in to original account)
                      </SelectItem>
                      <SelectItem value="BOTH_LINK_AND_AUTH">
                        Both (Secure link or signed-in account)
                      </SelectItem>
                      <SelectItem value="ADMIN_ONLY">
                        Administrator Only (Owner / editor reviews only)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Editing Window & Restriction Scope Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                      Editing Availability
                    </label>
                    <Select
                      value={settings?.editingWindowMode || 'ALWAYS'}
                      onValueChange={(val) => onChangeSettings({ editingWindowMode: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select editing window" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALWAYS">
                          Always allowed (Until form closes)
                        </SelectItem>
                        <SelectItem value="WITHIN_WINDOW">
                          Within time limit after submission
                        </SelectItem>
                        <SelectItem value="UNTIL_DEADLINE">
                          Until specific deadline cutoff
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {settings?.editingWindowMode === 'WITHIN_WINDOW' && (
                      <div className="mt-2">
                        <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                          Time Allowed to Edit
                        </label>
                        <Select
                          value={String(settings?.editingWindowMinutes ?? 1440)}
                          onValueChange={(val) => onChangeSettings({ editingWindowMinutes: parseInt(val, 10) })}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                            <SelectItem value="720">12 hours</SelectItem>
                            <SelectItem value="1440">24 hours (1 day)</SelectItem>
                            <SelectItem value="2880">48 hours (2 days)</SelectItem>
                            <SelectItem value="10080">7 days (1 week)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {settings?.editingWindowMode === 'UNTIL_DEADLINE' && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-gray-800 dark:text-gray-200">
                            Editing Cutoff Date & Time
                          </label>
                          {settings?.editingDeadline && (
                            <button
                              type="button"
                              onClick={() => onChangeSettings({ editingDeadline: null })}
                              className="text-[11px] text-red-500 hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <Input
                          type="datetime-local"
                          value={toLocalInputString(settings?.editingDeadline)}
                          onChange={(e) =>
                            onChangeSettings({
                              editingDeadline: e.target.value ? new Date(e.target.value).toISOString() : null,
                            })
                          }
                          className="h-9 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                      Restriction Scope
                    </label>
                    <Select
                      value={settings?.duplicateRestrictionScope || 'ONCE_PER_FORM'}
                      onValueChange={(val) => onChangeSettings({ duplicateRestrictionScope: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select restriction scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ONCE_PER_FORM">
                          Once per form (Permanent)
                        </SelectItem>
                        <SelectItem value="PERIODIC">
                          Time-based window (Periodic)
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {settings?.duplicateRestrictionScope === 'PERIODIC' && (
                      <div className="mt-2">
                        <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                          Restriction Frequency
                        </label>
                        <Select
                          value={settings?.duplicateRestrictionPeriod || 'DAILY'}
                          onValueChange={(val) => onChangeSettings({ duplicateRestrictionPeriod: val })}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAILY">Once per calendar day (UTC)</SelectItem>
                            <SelectItem value="WEEKLY">Once per calendar week</SelectItem>
                            <SelectItem value="MONTHLY">Once per calendar month</SelectItem>
                            <SelectItem value="CUSTOM_HOURS">Custom rolling duration</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {settings?.duplicateRestrictionScope === 'PERIODIC' && settings?.duplicateRestrictionPeriod === 'CUSTOM_HOURS' && (
                      <div className="mt-2">
                        <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
                          Custom Duration (Hours)
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max="8760"
                          value={settings?.duplicateCustomHours ?? 24}
                          onChange={(e) => onChangeSettings({ duplicateCustomHours: parseInt(e.target.value, 10) || 24 })}
                          className="h-9 text-xs"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          Respondents can submit again only after this duration has elapsed since their last submission.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/70 dark:bg-gray-900/60 border border-sky-200/60 dark:border-sky-900/40 text-[11px] text-sky-900 dark:text-sky-300 flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-600 mt-0.5" />
                  <span>
                    Concurrent submissions are serialized and verified atomically on the server. If response editing is enabled, blocked participants will be offered an option to edit their previous response.
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white/70 dark:bg-gray-900/60 border border-sky-200/60 dark:border-sky-900/40 text-[11px] text-sky-900 dark:text-sky-300 flex items-start gap-2">
                  <Edit3 className="h-3.5 w-3.5 shrink-0 text-sky-600 mt-0.5" />
                  <span>
                    Edits update the original response in-place, preserving the response record and updating responses analytics and exports without creating duplicate entries.
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Presentation */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm font-bold">Presentation</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Control the visual flow and confirmation messages shown to respondents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Show progress bar</p>
              <p className="text-gray-500 text-[11px]">
                Displays section progress percentage at the bottom of multi-section forms
              </p>
            </div>
            <Switch
              checked={settings?.showProgressBar ?? true}
              onCheckedChange={(checked) => onChangeSettings({ showProgressBar: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Shuffle question order
              </p>
              <p className="text-gray-500 text-[11px]">
                Randomize the order of questions for each respondent
              </p>
            </div>
            <Switch
              checked={settings?.shuffleQuestions || false}
              onCheckedChange={(checked) => onChangeSettings({ shuffleQuestions: checked })}
            />
          </div>

          <div className="pt-2">
            <label className="font-semibold text-gray-800 dark:text-gray-200 block mb-1">
              Confirmation Message
            </label>
            <Input
              type="text"
              value={settings?.confirmationMessage || 'Your response has been recorded.'}
              onChange={(e) => onChangeSettings({ confirmationMessage: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Deadlines & Quotas */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm font-bold">Deadlines & Response Quotas</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Automatically control form availability based on dates, times, or response quotas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          {/* Master Accepting Responses Switch */}
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Accepting Responses
              </p>
              <p className="text-gray-500 text-[11px]">
                Turn off to immediately close the form to all respondents
              </p>
            </div>
            <Switch
              checked={settings?.isAcceptingResponses ?? true}
              onCheckedChange={(checked) => onChangeSettings({ isAcceptingResponses: checked })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Start Schedule */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">
                  Start Date & Time (Optional)
                </label>
                {settings?.startDate && (
                  <button
                    type="button"
                    onClick={() => onChangeSettings({ startDate: null })}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                type="datetime-local"
                value={toLocalInputString(settings?.startDate)}
                onChange={(e) =>
                  onChangeSettings({
                    startDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-gray-400 mt-1">Form remains closed until this time</p>
            </div>

            {/* Deadline (End Date) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">
                  Response Deadline (Optional)
                </label>
                {settings?.endDate && (
                  <button
                    type="button"
                    onClick={() => onChangeSettings({ endDate: null })}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                type="datetime-local"
                value={toLocalInputString(settings?.endDate)}
                onChange={(e) =>
                  onChangeSettings({
                    endDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-gray-400 mt-1">Automatically closes form after this deadline</p>
            </div>
          </div>

          <div>
            <label className="text-gray-700 dark:text-gray-300 font-medium block mb-1">
              Maximum Responses Limit (Optional)
            </label>
            <div className="flex items-center gap-2 max-w-xs">
              <Input
                type="number"
                placeholder="e.g. 100"
                min="1"
                value={settings?.maxResponses || ''}
                onChange={(e) =>
                  onChangeSettings({
                    maxResponses: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                className="h-9 text-xs"
              />
              {settings?.maxResponses && (
                <button
                  type="button"
                  onClick={() => onChangeSettings({ maxResponses: null })}
                  className="text-xs text-red-500 hover:underline whitespace-nowrap"
                >
                  Clear limit
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Form will close automatically once this limit is reached</p>
          </div>

          <div>
            <label className="text-gray-700 dark:text-gray-300 font-medium block mb-1">
              Custom Closed Form Message
            </label>
            <Input
              type="text"
              value={settings?.closedMessage || 'This form is no longer accepting responses.'}
              onChange={(e) => onChangeSettings({ closedMessage: e.target.value })}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-gray-400 mt-1">Shown to respondents if the form is closed or past deadline</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
