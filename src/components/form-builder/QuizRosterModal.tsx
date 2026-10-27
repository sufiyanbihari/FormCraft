'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Users, Upload, Trash2, Search, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';

interface QuizRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  formId: string;
  onRosterUpdated?: (count: number) => void;
}

export default function QuizRosterModal({
  isOpen,
  onClose,
  formId,
  onRosterUpdated,
}: QuizRosterModalProps) {
  const [participants, setParticipants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'bulk'>('list');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [newPid, setNewPid] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const fetchRoster = async () => {
    if (!formId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.roster || []);
        onRosterUpdated?.(data.totalCount || 0);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load roster data' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRoster();
      setFeedback(null);
    }
  }, [isOpen, formId]);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPid.trim()) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [
            {
              participantId: newPid.trim(),
              name: newName.trim() || undefined,
              email: newEmail.trim() || undefined,
            },
          ],
        }),
      });
      if (res.ok) {
        setNewPid('');
        setNewName('');
        setNewEmail('');
        setFeedback({ type: 'success', message: 'Participant added successfully!' });
        await fetchRoster();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', message: err.error || 'Failed to add participant' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error adding participant' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkInput.trim()) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      // Parse CSV, TSV, or newline separated list: ID [, Name [, Email]]
      const lines = bulkInput.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const items: { participantId: string; name?: string; email?: string }[] = [];

      for (const line of lines) {
        // Support comma, tab, or semicolon delimiters
        const parts = line.split(/[,\t;]/).map((p) => p.trim());
        const pid = parts[0];
        const name = parts[1] || undefined;
        const email = parts[2] || undefined;

        if (pid) {
          items.push({ participantId: pid, name, email });
        }
      }

      if (items.length === 0) {
        setFeedback({ type: 'error', message: 'No valid participant IDs found in input.' });
        setIsSaving(false);
        return;
      }

      const res = await fetch(`/api/forms/${formId}/quiz/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: items }),
      });

      if (res.ok) {
        const data = await res.json();
        setBulkInput('');
        setActiveTab('list');
        setFeedback({ type: 'success', message: data.message || `Imported ${items.length} participants!` });
        await fetchRoster();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', message: err.error || 'Failed to import roster' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Error processing bulk import' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOne = async (participantId: string) => {
    try {
      const res = await fetch(
        `/api/forms/${formId}/quiz/roster?participantId=${encodeURIComponent(participantId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setParticipants((prev) => prev.filter((p) => p.participantId !== participantId));
        onRosterUpdated?.(participants.length - 1);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to delete participant' });
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear the entire participant roster?')) return;
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster?all=true`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setParticipants([]);
        onRosterUpdated?.(0);
        setFeedback({ type: 'success', message: 'Roster cleared.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to clear roster' });
    }
  };

  const filtered = participants.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.participantId.toLowerCase().includes(q) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Authorized Participant Roster</DialogTitle>
              <DialogDescription className="text-xs">
                Restrict quiz access strictly to verified participant IDs (e.g. Employee ID, Student ID).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {feedback && (
          <div
            className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Tab switch: View Roster vs Bulk Upload */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'list'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Roster List ({participants.length})
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'bulk'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Bulk Paste / Upload
            </button>
          </div>

          {participants.length > 0 && activeTab === 'list' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Roster
            </Button>
          )}
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Quick Add Form */}
            <form onSubmit={handleAddSingle} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
              <Input
                placeholder="ID (e.g. EMP101)*"
                value={newPid}
                onChange={(e) => setNewPid(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
              <Input
                placeholder="Full Name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Email (optional)"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="submit" disabled={isSaving || !newPid.trim()} size="sm" className="h-8 text-xs">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Add
              </Button>
            </form>

            {/* Search Filter */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-gray-400" />
              <Input
                placeholder="Search by ID, name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Participants Table */}
            <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl divide-y text-xs">
              {isLoading ? (
                <div className="py-8 flex justify-center items-center text-purple-600 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-gray-500">Loading roster...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  {participants.length === 0
                    ? 'No participants in roster. Add IDs individually or use bulk upload.'
                    : 'No matching participants found.'}
                </div>
              ) : (
                filtered.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px]">
                          {p.participantId}
                        </span>
                        {p.name && <span className="font-medium text-gray-800 dark:text-gray-200">{p.name}</span>}
                      </div>
                      {p.email && <p className="text-[11px] text-gray-400 mt-0.5">{p.email}</p>}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          p.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : p.status === 'IN_PROGRESS'
                              ? 'bg-amber-100 text-amber-700'
                              : p.status === 'TIMED_OUT'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {p.status}
                      </span>
                      <button
                        onClick={() => handleDeleteOne(p.participantId)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Remove participant"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col pt-2">
            <div>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Paste Participant Records (one per line)
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Format: <code className="bg-gray-100 px-1 py-0.5 rounded">ID</code> or{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded">ID, Name, Email</code>
              </p>
            </div>

            <Textarea
              placeholder={`EMP101, Rajesh Patel, rajesh@example.com\nEMP102, Priya Sharma, priya@example.com\nEMP103`}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              className="flex-1 min-h-[180px] font-mono text-xs"
            />

            <Button
              onClick={handleBulkImport}
              disabled={isSaving || !bulkInput.trim()}
              className="w-full text-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Importing Roster...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1.5" /> Parse & Import Roster
                </>
              )}
            </Button>
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
