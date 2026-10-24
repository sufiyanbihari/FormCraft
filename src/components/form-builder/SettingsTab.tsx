'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Mail, Clock, Eye, ShieldCheck, Sliders, Calendar } from 'lucide-react';

interface SettingsTabProps {
  isQuiz: boolean;
  onToggleQuiz: (isQuiz: boolean) => void;
  settings: any;
  onChangeSettings: (updated: any) => void;
  primaryColor?: string;
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
}: SettingsTabProps) {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* 1. Quiz Settings */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
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
      </Card>

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

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Limit to 1 response per person
              </p>
              <p className="text-gray-500 text-[11px]">
                Prevents duplicate responses from the same respondent account
              </p>
            </div>
            <Switch
              checked={settings?.restrictOneResponse || false}
              onCheckedChange={(checked) => onChangeSettings({ restrictOneResponse: checked, requireAuth: checked ? true : settings?.requireAuth })}
            />
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">
                Allow response editing
              </p>
              <p className="text-gray-500 text-[11px]">
                Respondents can modify their answers after submission
              </p>
            </div>
            <Switch
              checked={settings?.allowResponseEditing || false}
              onCheckedChange={(checked) => onChangeSettings({ allowResponseEditing: checked })}
            />
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
