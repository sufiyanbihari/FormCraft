'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Database,
  Table,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowRight,
  Lock,
  Unlock,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  X,
  Sparkles,
} from 'lucide-react';
import { QuestionData } from './QuestionCard';
import { LookupDatasetSummary, FieldMapping, LookupType } from '@/lib/lookup/lookupTypes';

interface LookupConfigModalProps {
  formId: string;
  isOpen: boolean;
  onClose: () => void;
  questions: QuestionData[];
  onMappingsChange?: (mappings: any[]) => void;
}

export default function LookupConfigModal({
  formId,
  isOpen,
  onClose,
  questions,
  onMappingsChange,
}: LookupConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'rules' | 'datasets'>('rules');
  const [datasets, setDatasets] = useState<LookupDatasetSummary[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dataset Upload State
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [targetReplaceDatasetId, setTargetReplaceDatasetId] = useState<string | null>(null);

  // Data Preview State
  const [previewData, setPreviewData] = useState<{
    dataset: LookupDatasetSummary;
    sampleRows: Record<string, any>[];
  } | null>(null);

  // Rule Editor State
  const [isEditingRule, setIsEditingRule] = useState(false);
  const [ruleId, setRuleId] = useState<string | undefined>(undefined);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedTriggerQId, setSelectedTriggerQId] = useState<string>('');
  const [lookupType, setLookupType] = useState<LookupType>('DROPDOWN');
  const [keyColumn, setKeyColumn] = useState<string>('');
  const [noMatchMessage, setNoMatchMessage] = useState<string>('No matching record found.');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [isSavingRule, setIsSavingRule] = useState(false);

  // Fetch datasets and mappings on modal open
  useEffect(() => {
    if (isOpen) {
      loadData();
      setError(null);
      setSuccess(null);
      setIsEditingRule(false);
    }
  }, [isOpen, formId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [dsRes, mapRes] = await Promise.all([
        fetch(`/api/forms/${formId}/lookup/datasets`),
        fetch(`/api/forms/${formId}/lookup/mappings`),
      ]);

      if (dsRes.ok) {
        const dsData = await dsRes.json();
        setDatasets(dsData.datasets || []);
      }
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        const loadedMappings = mapData.mappings || [];
        setMappings(loadedMappings);
        if (onMappingsChange) onMappingsChange(loadedMappings);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load lookup data');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload Dataset Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, replaceId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setError(null);
      setSuccess(null);

      const formData = new FormData();
      formData.append('file', file);
      if (replaceId) {
        formData.append('datasetId', replaceId);
      }

      const res = await fetch(`/api/forms/${formId}/lookup/datasets`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload spreadsheet');
      }

      setSuccess(
        replaceId
          ? `Dataset "${data.dataset.fileName}" successfully replaced (v${data.dataset.version})!`
          : `Dataset "${data.dataset.fileName}" uploaded successfully (${data.dataset.rowCount.toLocaleString()} rows)!`
      );

      await loadData();
      if (!replaceId && datasets.length === 0) {
        // Automatically switch to rules tab and start rule creation with the new dataset
        setActiveTab('rules');
        handleOpenCreateRule(data.dataset.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      setTargetReplaceDatasetId(null);
    }
  };

  // Preview Dataset
  const handlePreviewDataset = async (datasetId: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/forms/${formId}/lookup/datasets/${datasetId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to preview dataset');
      }
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch preview');
    }
  };

  // Delete Dataset
  const handleDeleteDataset = async (datasetId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete dataset "${fileName}"? Any active lookup rules linked to it will also be deleted.`)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/forms/${formId}/lookup/datasets/${datasetId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete dataset');
      }
      setSuccess(`Dataset "${fileName}" deleted.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete dataset');
    } finally {
      setIsLoading(false);
    }
  };

  // Rule Editor Helpers
  const handleOpenCreateRule = (defaultDatasetId?: string) => {
    setRuleId(undefined);
    const dsId = defaultDatasetId || datasets[0]?.id || '';
    setSelectedDatasetId(dsId);
    const ds = datasets.find((d) => d.id === dsId);
    setKeyColumn(ds?.columns[0] || '');

    // Select candidate trigger question
    const candidateQ = questions.find((q) => q.type === 'DROPDOWN' || q.type === 'SHORT_ANSWER');
    const triggerQ = candidateQ || questions[0];
    setSelectedTriggerQId(triggerQ?.id || '');
    setLookupType(triggerQ?.type === 'SHORT_ANSWER' ? 'TEXT_KEY' : 'DROPDOWN');
    setNoMatchMessage('No matching record found.');
    setFieldMappings([]);
    setIsEditingRule(true);
  };

  const handleTriggerQuestionChange = (newQId: string) => {
    setSelectedTriggerQId(newQId);
    const q = questions.find((item) => item.id === newQId);
    if (q) {
      if (q.type === 'DROPDOWN') {
        setLookupType('DROPDOWN');
      } else if (q.type === 'SHORT_ANSWER') {
        setLookupType('TEXT_KEY');
      }

      // If active dataset exists, check if any column closely matches question title
      const ds = datasets.find((d) => d.id === selectedDatasetId);
      if (ds && q.title) {
        const qClean = q.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedCol = ds.columns.find((col) => {
          const colClean = col.toLowerCase().replace(/[^a-z0-9]/g, '');
          return colClean === qClean || qClean.includes(colClean) || colClean.includes(qClean);
        });
        if (matchedCol) {
          setKeyColumn(matchedCol);
        }
      }
    }
  };

  const handleAutoMapFields = () => {
    const activeDataset = datasets.find((d) => d.id === selectedDatasetId);
    if (!activeDataset) return;

    const matched: FieldMapping[] = [];
    for (const col of activeDataset.columns) {
      const colClean = col.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetQ = questions.find((q) => {
        if (q.id === selectedTriggerQId) return false;
        const qClean = (q.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return qClean === colClean || qClean.includes(colClean) || colClean.includes(qClean);
      });
      if (targetQ) {
        if (!matched.some((m) => m.targetQuestionId === targetQ.id)) {
          matched.push({
            column: col,
            targetQuestionId: targetQ.id,
            isReadOnly: true,
          });
        }
      }
    }

    if (matched.length > 0) {
      setFieldMappings(matched);
      setSuccess(`Auto-mapped ${matched.length} matching field(s)!`);
    } else {
      setError('No matching question titles found for spreadsheet columns. Please add mappings manually below.');
    }
  };

  const handleOpenEditRule = (rule: any) => {
    setRuleId(rule.id);
    setSelectedDatasetId(rule.datasetId);
    setSelectedTriggerQId(rule.triggerQuestionId);
    setLookupType(rule.lookupType as LookupType);
    setKeyColumn(rule.keyColumn);
    setNoMatchMessage(rule.noMatchMessage || 'No matching record found.');
    setFieldMappings(rule.mappings || []);
    setIsEditingRule(true);
  };

  const handleDatasetChangeInRule = (newDsId: string) => {
    setSelectedDatasetId(newDsId);
    const ds = datasets.find((d) => d.id === newDsId);
    if (ds && !ds.columns.includes(keyColumn)) {
      setKeyColumn(ds.columns[0] || '');
    }
    // Filter out field mappings whose columns don't exist in the new dataset
    if (ds) {
      setFieldMappings((prev) => prev.filter((m) => ds.columns.includes(m.column)));
    }
  };

  const handleAddFieldMapping = () => {
    const activeDataset = datasets.find((d) => d.id === selectedDatasetId);
    if (!activeDataset) return;

    // Pick first unused column and first unused target question
    const usedCols = new Set(fieldMappings.map((m) => m.column));
    const availableCol = activeDataset.columns.find((c) => !usedCols.has(c)) || activeDataset.columns[0];

    const usedTargets = new Set(fieldMappings.map((m) => m.targetQuestionId));
    usedTargets.add(selectedTriggerQId); // Trigger cannot be target
    const availableTarget = questions.find((q) => !usedTargets.has(q.id)) || questions.find((q) => q.id !== selectedTriggerQId);

    if (!availableTarget) {
      setError('No available form questions left to map. Add more questions to your form first.');
      return;
    }

    setFieldMappings((prev) => [
      ...prev,
      {
        column: availableCol || '',
        targetQuestionId: availableTarget.id,
        isReadOnly: true,
      },
    ]);
  };

  const handleRemoveFieldMapping = (index: number) => {
    setFieldMappings((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateFieldMapping = (index: number, updates: Partial<FieldMapping>) => {
    setFieldMappings((prev) =>
      prev.map((m, idx) => (idx === index ? { ...m, ...updates } : m))
    );
  };

  const handleSaveRule = async () => {
    try {
      setIsSavingRule(true);
      setError(null);

      if (!selectedDatasetId) throw new Error('Please select a dataset.');
      if (!selectedTriggerQId) throw new Error('Please select a trigger question.');
      if (!keyColumn) throw new Error('Please select a lookup key column.');
      if (fieldMappings.length === 0) throw new Error('Please add at least one field mapping to autofill.');

      // Validation
      const seenTargets = new Set<string>();
      for (const m of fieldMappings) {
        if (!m.column) throw new Error('All mappings must select a spreadsheet column.');
        if (!m.targetQuestionId) throw new Error('All mappings must select a target form question.');
        if (m.targetQuestionId === selectedTriggerQId) {
          throw new Error('A question cannot be mapped to autofill itself.');
        }
        if (seenTargets.has(m.targetQuestionId)) {
          throw new Error('Multiple columns cannot map to the same target form question.');
        }
        seenTargets.add(m.targetQuestionId);
      }

      const payload = {
        id: ruleId,
        formId,
        datasetId: selectedDatasetId,
        triggerQuestionId: selectedTriggerQId,
        lookupType,
        keyColumn,
        noMatchMessage,
        mappings: fieldMappings,
      };

      const res = await fetch(`/api/forms/${formId}/lookup/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save lookup rule');
      }

      setSuccess('Lookup rule saved successfully!');
      setIsEditingRule(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rule');
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleDeleteRule = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this lookup rule?')) return;

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/forms/${formId}/lookup/mappings/${mappingId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete rule');
      }
      setSuccess('Lookup rule deleted.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete rule');
    } finally {
      setIsLoading(false);
    }
  };

  const activeDatasetForEditing = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl">
          {/* Header */}
          <DialogHeader className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50/50 via-white to-purple-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#004B6E] to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Universal Data Lookup & Dynamic Autofill
                    <Badge variant="outline" className="text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200">
                      FormCraft Pro
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Connect Excel/CSV datasets to form questions to enable real-time dynamic autofill.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Feedback alerts */}
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="p-0.5 hover:bg-red-100 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {success && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="flex-1">{success}</span>
              <button onClick={() => setSuccess(null)} className="p-0.5 hover:bg-emerald-100 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {isEditingRule ? (
              /* ================= RULE EDITOR ================= */
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingRule(false)}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      ← Back to rules
                    </Button>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {ruleId ? 'Edit Lookup Rule' : 'New Lookup Rule'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingRule(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveRule}
                      disabled={isSavingRule}
                      className="text-xs bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                    >
                      {isSavingRule && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save Rule
                    </Button>
                  </div>
                </div>

                {/* Guidance Banner */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 text-xs text-blue-950 dark:text-blue-200 flex items-start gap-3">
                  <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      Two simple ways to configure Dynamic Lookup & Autofill:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-blue-800 dark:text-blue-300">
                      <li><strong>Dropdown Mode:</strong> Set trigger question to a <em>Dropdown</em> (e.g. <em>Plant Name</em>) and key column to <em>PlantName</em>. Respondents select an option, and all dependent fields fill automatically.</li>
                      <li><strong>Unique-Key Text Mode:</strong> Set trigger question to a <em>Short Answer</em> (e.g. <em>Plant Code</em>) and key column to <em>PlantCode</em>. Respondents type an ID/code (e.g. <em>PLT001</em>), and all dependent fields fill automatically.</li>
                    </ul>
                  </div>
                </div>

                {/* Step 1: Dataset & Key Column */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      1. Select Dataset
                    </label>
                    <Select value={selectedDatasetId} onValueChange={handleDatasetChangeInRule}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-gray-800">
                        <SelectValue placeholder="Select dataset..." />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="text-xs">
                            {d.fileName} ({d.rowCount.toLocaleString()} rows, v{d.version})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      2. Lookup Key Column (in spreadsheet)
                    </label>
                    <Select value={keyColumn} onValueChange={setKeyColumn} disabled={!activeDatasetForEditing}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-gray-800">
                        <SelectValue placeholder="Select key column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeDatasetForEditing?.columns.map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Step 2: Trigger Question & Mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      3. Trigger Question (in form)
                    </label>
                    <Select value={selectedTriggerQId} onValueChange={handleTriggerQuestionChange}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-gray-800">
                        <SelectValue placeholder="Select trigger question..." />
                      </SelectTrigger>
                      <SelectContent>
                        {questions.map((q) => (
                          <SelectItem key={q.id} value={q.id} className="text-xs">
                            {q.title || 'Untitled Question'} ({q.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
                      <span>4. Trigger Mode</span>
                      {(() => {
                        const curQ = questions.find((q) => q.id === selectedTriggerQId);
                        if (curQ?.type === 'DROPDOWN') {
                          return <span className="text-[10px] text-blue-600 font-normal">Matches Dropdown</span>;
                        }
                        if (curQ?.type === 'SHORT_ANSWER') {
                          return <span className="text-[10px] text-blue-600 font-normal">Matches Short Answer</span>;
                        }
                        return null;
                      })()}
                    </label>
                    <Select value={lookupType} onValueChange={(val) => setLookupType(val as LookupType)}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-gray-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DROPDOWN" className="text-xs">
                          Dropdown Selection (loads dataset options)
                        </SelectItem>
                        <SelectItem value="TEXT_KEY" className="text-xs">
                          Unique-Key Text (respondent types code/ID)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Step 3: No-Match Feedback */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    No-Match Feedback Message
                  </label>
                  <Input
                    value={noMatchMessage}
                    onChange={(e) => setNoMatchMessage(e.target.value)}
                    placeholder="e.g. No matching record found."
                    className="h-8 text-xs"
                  />
                </div>

                {/* Step 4: Field Mapping Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        5. Mapped Form Fields ({fieldMappings.length})
                      </span>
                      <p className="text-[11px] text-gray-500">
                        When the trigger matches, FormCraft automatically populates these questions from spreadsheet columns.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAutoMapFields}
                        disabled={!activeDatasetForEditing}
                        className="text-xs h-7 gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Auto-map Fields
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddFieldMapping}
                        disabled={!activeDatasetForEditing}
                        className="text-xs h-7 gap-1 border-dashed"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Field Mapping
                      </Button>
                    </div>
                  </div>

                  {fieldMappings.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                      <Table className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        No field mappings added yet.
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Click "Add Field Mapping" to map a spreadsheet column to a question in this form.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddFieldMapping}
                        disabled={!activeDatasetForEditing}
                        className="mt-3 text-xs h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add First Field
                      </Button>
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                      <div className="bg-gray-50 dark:bg-gray-800/80 px-4 py-2 text-[11px] font-semibold text-gray-500 grid grid-cols-12 gap-3">
                        <div className="col-span-4">Spreadsheet Column</div>
                        <div className="col-span-1 text-center"></div>
                        <div className="col-span-4">Target Form Question</div>
                        <div className="col-span-2 text-center">Behavior</div>
                        <div className="col-span-1 text-right">Action</div>
                      </div>

                      {fieldMappings.map((m, idx) => {
                        const targetQ = questions.find((q) => q.id === m.targetQuestionId);

                        return (
                          <div key={idx} className="px-4 py-2.5 bg-white dark:bg-gray-900 grid grid-cols-12 gap-3 items-center text-xs">
                            {/* Column Selector */}
                            <div className="col-span-4">
                              <Select
                                value={m.column}
                                onValueChange={(val) => handleUpdateFieldMapping(idx, { column: val })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select column..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeDatasetForEditing?.columns.map((c) => (
                                    <SelectItem key={c} value={c} className="text-xs">
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Arrow Indicator */}
                            <div className="col-span-1 flex justify-center text-gray-400">
                              <ArrowRight className="h-4 w-4" />
                            </div>

                            {/* Target Question Selector */}
                            <div className="col-span-4">
                              <Select
                                value={m.targetQuestionId}
                                onValueChange={(val) => handleUpdateFieldMapping(idx, { targetQuestionId: val })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select form question..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {questions
                                    .filter((q) => q.id !== selectedTriggerQId)
                                    .map((q) => (
                                      <SelectItem key={q.id} value={q.id} className="text-xs">
                                        {q.title || 'Untitled Question'} ({q.type})
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Read-Only Toggle */}
                            <div className="col-span-2 flex items-center justify-center gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUpdateFieldMapping(idx, { isReadOnly: !m.isReadOnly })}
                                className={`h-7 px-2 text-[11px] rounded-full gap-1 ${
                                  m.isReadOnly
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300'
                                }`}
                              >
                                {m.isReadOnly ? (
                                  <>
                                    <Lock className="h-3 w-3" /> Locked
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="h-3 w-3" /> Editable
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Remove button */}
                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveFieldMapping(idx)}
                                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ================= MAIN TABS ================= */
              <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <TabsList className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <TabsTrigger value="rules" className="text-xs px-3.5 py-1.5 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 shadow-sm gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                      Lookup Rules ({mappings.length})
                    </TabsTrigger>
                    <TabsTrigger value="datasets" className="text-xs px-3.5 py-1.5 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 shadow-sm gap-1.5">
                      <Database className="h-3.5 w-3.5 text-purple-600" />
                      Datasets ({datasets.length})
                    </TabsTrigger>
                  </TabsList>

                  {activeTab === 'rules' && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenCreateRule()}
                      disabled={datasets.length === 0}
                      className="text-xs h-8 bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Lookup Rule
                    </Button>
                  )}

                  {activeTab === 'datasets' && (
                    <Button
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="text-xs h-8 bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                    >
                      {isUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Upload Spreadsheet
                    </Button>
                  )}
                </div>

                {/* Hidden file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleFileUpload(e)}
                />
                <input
                  type="file"
                  ref={replaceFileInputRef}
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (targetReplaceDatasetId) {
                      handleFileUpload(e, targetReplaceDatasetId);
                    }
                  }}
                />

                {/* TAB 1: LOOKUP RULES */}
                <TabsContent value="rules" className="m-0 space-y-4">
                  {datasets.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                      <Database className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        No Datasets Uploaded
                      </h4>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                        To set up dynamic autofill, first upload an Excel (.xlsx) or CSV (.csv) file containing your records.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-xs bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload Your First Spreadsheet
                      </Button>
                    </div>
                  ) : mappings.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                      <Sparkles className="h-10 w-10 text-blue-400 mx-auto mb-3 animate-pulse" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        No Lookup Rules Configured
                      </h4>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                        You have {datasets.length} dataset{datasets.length > 1 ? 's' : ''} uploaded. Create a lookup rule to connect form questions to your dataset.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleOpenCreateRule()}
                        className="text-xs bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create First Lookup Rule
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mappings.map((rule) => {
                        const triggerQ = questions.find((q) => q.id === rule.triggerQuestionId);
                        const dataset = datasets.find((d) => d.id === rule.datasetId) || rule.dataset;
                        const ruleMappings = (rule.mappings as FieldMapping[]) || [];

                        return (
                          <div
                            key={rule.id}
                            className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 transition-all shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 text-[11px] font-semibold">
                                    {rule.lookupType === 'DROPDOWN' ? 'Dropdown Trigger' : 'Unique-Key Text Trigger'}
                                  </Badge>
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                                    "{triggerQ?.title || 'Trigger Question'}"
                                  </span>
                                  <span className="text-xs text-gray-400">matches</span>
                                  <Badge variant="secondary" className="text-[11px] font-mono">
                                    {rule.keyColumn}
                                  </Badge>
                                  <span className="text-xs text-gray-400">in</span>
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                    <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                                    {dataset?.fileName || 'Dataset'}
                                  </span>
                                </div>

                                {/* Mapped Fields Badges */}
                                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                  <span className="text-[11px] text-gray-400">Autofills:</span>
                                  {ruleMappings.map((m, idx) => {
                                    const targetQ = questions.find((q) => q.id === m.targetQuestionId);
                                    return (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                                      >
                                        <span className="font-mono text-purple-600 dark:text-purple-400">{m.column}</span>
                                        <ArrowRight className="h-2.5 w-2.5 text-gray-400" />
                                        <span className="font-medium">{targetQ?.title || 'Target'}</span>
                                        {m.isReadOnly ? (
                                          <span title="Locked / Read-Only"><Lock className="h-2.5 w-2.5 text-amber-500" /></span>
                                        ) : (
                                          <span title="Editable"><Unlock className="h-2.5 w-2.5 text-blue-500" /></span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditRule(rule)}
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                                  title="Edit Rule"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteRule(rule.id)}
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-red-500 hover:bg-red-50"
                                  title="Delete Rule"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* TAB 2: DATASETS */}
                <TabsContent value="datasets" className="m-0 space-y-4">
                  {datasets.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                      <FileSpreadsheet className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        No Datasets Uploaded Yet
                      </h4>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                        Upload an Excel (.xlsx, .xls) or CSV (.csv) file. FormCraft supports up to 50,000 rows and 100 columns per dataset.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-xs bg-[#004B6E] hover:bg-[#003853] text-white gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Choose File to Upload
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {datasets.map((d) => (
                        <div
                          key={d.id}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 transition-all shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {d.fileName}
                                </span>
                                <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                  v{d.version}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {d.rowCount.toLocaleString()} rows
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {d.columns.length} columns
                                </Badge>
                              </div>

                              {/* Column pill tags */}
                              <div className="flex items-center gap-1 flex-wrap pt-1">
                                {d.columns.slice(0, 10).map((col) => (
                                  <span
                                    key={col}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono"
                                  >
                                    {col}
                                  </span>
                                ))}
                                {d.columns.length > 10 && (
                                  <span className="text-[10px] text-gray-400">
                                    +{d.columns.length - 10} more
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePreviewDataset(d.id)}
                                className="text-xs h-8 gap-1"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Preview Data
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTargetReplaceDatasetId(d.id);
                                  replaceFileInputRef.current?.click();
                                }}
                                className="text-xs h-8 gap-1 text-blue-600 hover:text-blue-700"
                                title="Safely replace with updated version"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Replace
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDataset(d.id, d.fileName)}
                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dataset Preview Sub-Dialog */}
      {previewData && (
        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-2xl">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Data Preview: {previewData.dataset.fileName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Showing sample records from dataset ({previewData.dataset.rowCount.toLocaleString()} total rows).
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded-xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-gray-400 font-mono text-[10px] w-12">#</th>
                    {previewData.dataset.columns.map((col) => (
                      <th key={col} className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {previewData.sampleRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{rIdx + 1}</td>
                      {previewData.dataset.columns.map((col) => (
                        <td key={col} className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <Button size="sm" onClick={() => setPreviewData(null)} className="text-xs">
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
