'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import {
  Users,
  Upload,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  FileSpreadsheet,
  Download,
  FileText,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface QuizRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  formId: string;
  onRosterUpdated?: (count: number) => void;
}

interface ParsedParticipant {
  participantId: string;
  name?: string;
  email?: string;
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
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list');
  const [uploadSubTab, setUploadSubTab] = useState<'file' | 'paste'>('file');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Single Add State
  const [newPid, setNewPid] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Bulk Upload State
  const [bulkInput, setBulkInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedParticipant[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchRoster = async () => {
    if (!formId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.roster || []);
        onRosterUpdated?.(data.totalCount ?? data.roster?.length ?? 0);
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
      setSelectedFile(null);
      setParsedPreview([]);
      setBulkInput('');
    }
  }, [isOpen, formId]);

  // Single Add Participant
  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = newPid.trim();
    if (!pid) {
      setFeedback({ type: 'error', message: 'Participant ID is required.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const emailVal = newEmail.trim() || null;
      const nameVal = newName.trim() || null;

      const res = await fetch(`/api/forms/${formId}/quiz/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [
            {
              participantId: pid,
              name: nameVal,
              email: emailVal,
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewPid('');
        setNewName('');
        setNewEmail('');
        setFeedback({ type: 'success', message: `Participant ${pid} added successfully!` });
        if (data.totalCount !== undefined) {
          onRosterUpdated?.(data.totalCount);
        }
        await fetchRoster();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', message: err.error || err.details?.formErrors?.[0] || 'Failed to add participant' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error adding participant' });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to parse rows of arrays into ParsedParticipant[]
  const parseRowsToParticipants = (rawRows: any[][]): ParsedParticipant[] => {
    if (!rawRows || rawRows.length === 0) return [];

    let startIdx = 0;
    const firstRow = rawRows[0].map((cell) => String(cell || '').trim().toLowerCase());

    // Check if first row is a header row
    const isHeader = firstRow.some((col) =>
      ['id', 'participant', 'participantid', 'emp', 'roll', 'email', 'name', 'student'].some((k) =>
        col.includes(k)
      )
    );

    let idColIdx = 0;
    let nameColIdx = 1;
    let emailColIdx = 2;

    if (isHeader) {
      startIdx = 1;
      const foundId = firstRow.findIndex((c) =>
        ['id', 'participant', 'emp', 'roll', 'reg', 'student'].some((k) => c.includes(k))
      );
      const foundName = firstRow.findIndex((c) => c.includes('name'));
      const foundEmail = firstRow.findIndex((c) => c.includes('email') || c.includes('mail'));

      if (foundId !== -1) idColIdx = foundId;
      if (foundName !== -1) nameColIdx = foundName;
      if (foundEmail !== -1) emailColIdx = foundEmail;
    }

    const results: ParsedParticipant[] = [];
    const seen = new Set<string>();

    for (let i = startIdx; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawId = String(row[idColIdx] ?? '').trim();
      if (!rawId) continue;

      const normId = rawId.toLowerCase();
      if (seen.has(normId)) continue;
      seen.add(normId);

      let nameVal = row[nameColIdx] !== undefined ? String(row[nameColIdx]).trim() : '';
      let emailVal = row[emailColIdx] !== undefined ? String(row[emailColIdx]).trim() : '';

      // If name looks like an email and email is empty, swap
      if (nameVal.includes('@') && !emailVal) {
        emailVal = nameVal;
        nameVal = '';
      }

      results.push({
        participantId: rawId,
        name: nameVal || undefined,
        email: emailVal || undefined,
      });
    }

    return results;
  };

  // File Upload Handling (.xlsx, .xls, .csv, .txt)
  const processUploadedFile = async (file: File) => {
    setSelectedFile(file);
    setFeedback(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setFeedback({ type: 'error', message: 'No sheets found in the uploaded file.' });
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const parsed = parseRowsToParticipants(rawRows);

      if (parsed.length === 0) {
        setFeedback({
          type: 'error',
          message: 'No valid participant records found in file. Please ensure at least one ID column exists.',
        });
        setParsedPreview([]);
      } else {
        setParsedPreview(parsed);
        setFeedback({
          type: 'success',
          message: `Parsed ${parsed.length} participant(s) from "${file.name}". Click 'Import Participants' to save.`,
        });
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setFeedback({ type: 'error', message: 'Could not read spreadsheet file. Please check file format.' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // Parse Text Paste
  const handleParseText = () => {
    if (!bulkInput.trim()) {
      setFeedback({ type: 'error', message: 'Please paste participant records first.' });
      return;
    }
    const lines = bulkInput.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const rawRows = lines.map((line) => line.split(/[,\t;]/).map((p) => p.trim()));
    const parsed = parseRowsToParticipants(rawRows);

    if (parsed.length === 0) {
      setFeedback({ type: 'error', message: 'No valid participant IDs found in pasted text.' });
      setParsedPreview([]);
    } else {
      setParsedPreview(parsed);
      setFeedback({
        type: 'success',
        message: `Parsed ${parsed.length} participant(s) from text. Click 'Import Participants' to save.`,
      });
    }
  };

  // Send Parsed Participants to Server
  const handleExecuteImport = async () => {
    if (parsedPreview.length === 0) {
      setFeedback({ type: 'error', message: 'No participants to import. Please upload a file or paste records.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: parsedPreview }),
      });

      if (res.ok) {
        const data = await res.json();
        setParsedPreview([]);
        setSelectedFile(null);
        setBulkInput('');
        setActiveTab('list');
        setFeedback({
          type: 'success',
          message: data.message || `Successfully imported ${parsedPreview.length} participants into roster!`,
        });
        if (data.totalCount !== undefined) {
          onRosterUpdated?.(data.totalCount);
        }
        await fetchRoster();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', message: err.error || 'Failed to save roster to server' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error saving roster to server' });
    } finally {
      setIsSaving(false);
    }
  };

  // Download Sample Spreadsheet Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      ['Participant ID', 'Full Name', 'Email'],
      ['EMP101', 'Rajesh Patel', 'rajesh.patel@example.com'],
      ['EMP102', 'Priya Sharma', 'priya.sharma@example.com'],
      ['EMP103', 'Amit Kumar', 'amit.kumar@example.com'],
      ['EMP104', 'Sneha Desai', 'sneha.desai@example.com'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RosterTemplate');
    XLSX.writeFile(wb, 'FormCraft_Quiz_Roster_Template.xlsx');
  };

  // Delete Individual Participant
  const handleDeleteOne = async (participantId: string) => {
    try {
      const res = await fetch(
        `/api/forms/${formId}/quiz/roster?participantId=${encodeURIComponent(participantId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const updated = participants.filter((p) => p.participantId !== participantId);
        setParticipants(updated);
        onRosterUpdated?.(updated.length);
        setFeedback({ type: 'success', message: `Participant ${participantId} removed.` });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to delete participant' });
    }
  };

  // Clear Entire Roster
  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear the entire participant roster?')) return;
    try {
      const res = await fetch(`/api/forms/${formId}/quiz/roster?all=true`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setParticipants([]);
        onRosterUpdated?.(0);
        setFeedback({ type: 'success', message: 'Roster cleared completely.' });
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Authorized Participant Roster (Method B)</DialogTitle>
                <DialogDescription className="text-xs">
                  Enforce strict roster authorization. Only registered participant IDs can access this quiz.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {feedback && (
          <div
            className={`p-3 rounded-xl flex items-center justify-between gap-2 text-xs transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Tab switch: View Roster vs Bulk Upload */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'list'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Roster List ({participants.length})
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload & Bulk Add
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs h-7 gap-1 border-gray-300 dark:border-gray-700"
              title="Download Excel template for roster"
            >
              <Download className="h-3 w-3" /> Template (.xlsx)
            </Button>
            {participants.length > 0 && activeTab === 'list' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-7"
              >
                <Trash2 className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Quick Add Form */}
            <form onSubmit={handleAddSingle} className="p-3 bg-gray-50/70 dark:bg-gray-800/40 rounded-xl border border-gray-200/80 dark:border-gray-800 space-y-2">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 block">
                Add Participant Individually:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <Input
                  placeholder="Participant ID (e.g. EMP101)*"
                  value={newPid}
                  onChange={(e) => setNewPid(e.target.value)}
                  className="h-8 text-xs font-mono bg-white dark:bg-gray-900"
                  required
                />
                <Input
                  placeholder="Full Name (optional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-gray-900"
                />
                <Input
                  placeholder="Email (optional)"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-gray-900"
                />
                <Button
                  type="submit"
                  disabled={isSaving || !newPid.trim()}
                  size="sm"
                  className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Add to Roster
                </Button>
              </div>
            </form>

            {/* Search Filter */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-gray-400" />
              <Input
                placeholder="Search roster by ID, name, or email..."
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
                    ? 'No participants in roster yet. Add IDs above or use Upload & Bulk Add.'
                    : 'No matching participants found.'}
                </div>
              ) : (
                filtered.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
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
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
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
          <div className="space-y-4 flex-1 flex flex-col pt-1 overflow-y-auto">
            {/* Sub-tab selection: File Upload vs Text Paste */}
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <button
                onClick={() => setUploadSubTab('file')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  uploadSubTab === 'file'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" /> Spreadsheet Upload (.xlsx / .csv)
              </button>
              <button
                onClick={() => setUploadSubTab('paste')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  uploadSubTab === 'paste'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5 inline mr-1" /> Paste Text (CSV / TSV)
              </button>
            </div>

            {uploadSubTab === 'file' ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, .txt"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30'
                      : 'border-gray-300 dark:border-gray-700 hover:border-purple-400 bg-gray-50/50 dark:bg-gray-800/20'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {selectedFile ? selectedFile.name : 'Click to select or drag & drop spreadsheet'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Supports Excel (.xlsx, .xls) and CSV (.csv). Headers: Participant ID, Full Name, Email
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    Paste Participant Records (one per line)
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Format: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">ID</code> or{' '}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">ID, Name, Email</code>
                  </p>
                </div>

                <Textarea
                  placeholder={`EMP101, Rajesh Patel, rajesh@example.com\nEMP102, Priya Sharma, priya@example.com\nEMP103, Amit Kumar, amit@example.com`}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  className="min-h-[140px] font-mono text-xs"
                />

                <Button
                  onClick={handleParseText}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  disabled={!bulkInput.trim()}
                >
                  Parse Pasted Records
                </Button>
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedPreview.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    Ready to Import: {parsedPreview.length} Record(s)
                  </span>
                  <button
                    onClick={() => {
                      setParsedPreview([]);
                      setSelectedFile(null);
                    }}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    Clear Preview
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl divide-y text-xs">
                  {parsedPreview.slice(0, 50).map((item, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between bg-white dark:bg-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded text-[11px]">
                          {item.participantId}
                        </span>
                        {item.name && <span className="font-medium text-gray-800">{item.name}</span>}
                      </div>
                      {item.email && <span className="text-[11px] text-gray-400">{item.email}</span>}
                    </div>
                  ))}
                  {parsedPreview.length > 50 && (
                    <div className="p-2 text-center text-[11px] text-gray-400 bg-gray-50">
                      ...and {parsedPreview.length - 50} more records
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleExecuteImport}
                  disabled={isSaving}
                  className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white mt-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving to Roster...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1.5" /> Import {parsedPreview.length} Participant(s)
                    </>
                  )}
                </Button>
              </div>
            )}
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
