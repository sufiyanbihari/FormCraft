'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  ArrowLeft,
  ArrowDownToLine,
  FileText,
  Layers,
  Award,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { QUESTION_TYPE_LABELS } from './QuestionCard';

interface SectionData {
  id: string;
  title: string;
  orderIndex: number;
}

interface ImportQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFormId: string;
  sections: SectionData[];
  activeSectionId?: string;
  onImportSuccess: (importedQuestions: any[], newSection?: any) => void;
  primaryColor?: string;
}

export default function ImportQuestionsModal({
  isOpen,
  onClose,
  currentFormId,
  sections,
  activeSectionId,
  onImportSuccess,
  primaryColor = '#673ab7',
}: ImportQuestionsModalProps) {
  // Step 1: Form Selection, Step 2: Question Selection
  const [step, setStep] = useState<'SELECT_FORM' | 'SELECT_QUESTIONS'>('SELECT_FORM');

  // Forms state
  const [forms, setForms] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);

  // Selected source form state
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [isLoadingSourceQuestions, setIsLoadingSourceQuestions] = useState(false);
  const [sourceQuestions, setSourceQuestions] = useState<any[]>([]);

  // Question selection state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  // Destination section placement
  const defaultSec = activeSectionId || sections[0]?.id || '';
  const [destinationMode, setDestinationMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [selectedTargetSectionId, setSelectedTargetSectionId] = useState<string>(defaultSec);
  const [newSectionTitle, setNewSectionTitle] = useState('Imported Questions');

  // Importing action state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Load accessible forms when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('SELECT_FORM');
      setSelectedForm(null);
      setSourceQuestions([]);
      setSelectedQuestionIds(new Set());
      setImportError(null);
      fetchAccessibleForms();
    }
  }, [isOpen]);

  // Keep targetSectionId valid if sections change
  useEffect(() => {
    if (activeSectionId && sections.some((s) => s.id === activeSectionId)) {
      setSelectedTargetSectionId(activeSectionId);
    } else if (sections.length > 0 && !sections.some((s) => s.id === selectedTargetSectionId)) {
      setSelectedTargetSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  const fetchAccessibleForms = async () => {
    setIsLoadingForms(true);
    setFormsError(null);
    try {
      const res = await fetch('/api/forms?filter=all');
      if (!res.ok) throw new Error('Failed to load forms');
      const data = await res.json();
      // Filter out current active form
      const filtered = (data.forms || []).filter((f: any) => f.id !== currentFormId);
      setForms(filtered);
    } catch (err: any) {
      setFormsError(err.message || 'Could not fetch your forms');
    } finally {
      setIsLoadingForms(false);
    }
  };

  const handleSelectForm = async (formItem: any) => {
    setSelectedForm(formItem);
    setIsLoadingSourceQuestions(true);
    setFormsError(null);
    try {
      const res = await fetch(`/api/forms/${formItem.id}`);
      if (!res.ok) throw new Error('Failed to load questions from selected form');
      const data = await res.json();
      const formDetails = data.form;

      // Extract all questions across sections
      const allQ: any[] = [];
      if (formDetails?.sections) {
        formDetails.sections.forEach((sec: any) => {
          if (sec.questions) {
            sec.questions.forEach((q: any) => {
              allQ.push({
                ...q,
                sectionTitle: sec.title || 'Untitled Section',
              });
            });
          }
        });
      }
      setSourceQuestions(allQ);
      setSelectedQuestionIds(new Set()); // start with empty selection
      setStep('SELECT_QUESTIONS');
    } catch (err: any) {
      setFormsError(err.message || 'Failed to load form details');
    } finally {
      setIsLoadingSourceQuestions(false);
    }
  };

  const handleToggleQuestion = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedQuestionIds.size === sourceQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(sourceQuestions.map((q) => q.id)));
    }
  };

  const handleExecuteImport = async () => {
    if (selectedQuestionIds.size === 0) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const payload: any = {
        sourceFormId: selectedForm.id,
        questionIds: Array.from(selectedQuestionIds),
        createNewSection: destinationMode === 'NEW',
        newSectionTitle: destinationMode === 'NEW' ? newSectionTitle : undefined,
        targetSectionId: destinationMode === 'EXISTING' ? selectedTargetSectionId : undefined,
      };

      const res = await fetch(`/api/forms/${currentFormId}/import-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import questions');
      }

      onImportSuccess(data.questions, data.newSection);
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredForms = forms.filter((f) =>
    (f.title || 'Untitled form').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 'SELECT_QUESTIONS' && (
                <button
                  type="button"
                  onClick={() => setStep('SELECT_FORM')}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 transition-colors"
                  title="Back to forms list"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {step === 'SELECT_FORM' ? 'Import Questions' : `Select Questions from "${selectedForm?.title || 'Form'}"`}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-0.5">
                  {step === 'SELECT_FORM'
                    ? 'Choose an existing FormCraft form to reuse questions from'
                    : 'Select questions to insert into your form'}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {importError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{importError}</span>
            </div>
          )}

          {/* STEP 1: FORM SELECTION */}
          {step === 'SELECT_FORM' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search forms by title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700"
                />
              </div>

              {isLoadingForms ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                  <p className="text-xs">Loading your forms...</p>
                </div>
              ) : formsError ? (
                <div className="py-12 text-center text-xs text-red-600 space-y-2">
                  <p>{formsError}</p>
                  <Button size="sm" variant="outline" onClick={fetchAccessibleForms}>
                    Try Again
                  </Button>
                </div>
              ) : filteredForms.length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-1">
                  <FileText className="h-8 w-8 mx-auto opacity-40 mb-2" />
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    No matching forms found
                  </p>
                  <p className="text-xs text-gray-400">
                    {searchQuery ? 'Try a different search term' : 'Create other forms first to import questions'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredForms.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => handleSelectForm(f)}
                      className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 group-hover:text-purple-700 transition-colors">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-purple-700 dark:group-hover:text-purple-300">
                            {f.title || 'Untitled form'}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                            <span>Status: {f.status}</span>
                            {f.isQuiz && (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                                <Award className="h-3 w-3" /> Quiz
                              </span>
                            )}
                            {f._count?.questions !== undefined && (
                              <span>• {f._count.questions} questions</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-purple-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Select →
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: QUESTION SELECTION */}
          {step === 'SELECT_QUESTIONS' && (
            <div className="space-y-4">
              {isLoadingSourceQuestions ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                  <p className="text-xs">Loading questions from {selectedForm?.title}...</p>
                </div>
              ) : sourceQuestions.length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-2">
                  <HelpCircle className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    This form has no questions
                  </p>
                  <p className="text-xs text-gray-500">
                    Choose a different form that has questions.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setStep('SELECT_FORM')}>
                    Choose another form
                  </Button>
                </div>
              ) : (
                <>
                  {/* Select All Toggle Bar */}
                  <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800 text-xs">
                    <label className="flex items-center gap-2.5 cursor-pointer font-medium text-gray-700 dark:text-gray-300 select-none">
                      <Checkbox
                        checked={
                          selectedQuestionIds.size === sourceQuestions.length &&
                          sourceQuestions.length > 0
                        }
                        onCheckedChange={handleToggleSelectAll}
                      />
                      <span>Select all ({sourceQuestions.length} questions)</span>
                    </label>
                    <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-full">
                      {selectedQuestionIds.size} selected
                    </span>
                  </div>

                  {/* Question Cards List */}
                  <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                    {sourceQuestions.map((q, idx) => {
                      const isChecked = selectedQuestionIds.has(q.id);
                      const qTypeInfo = QUESTION_TYPE_LABELS[q.type] || {
                        label: q.type,
                        icon: FileText,
                      };
                      const TypeIcon = qTypeInfo.icon;

                      return (
                        <div
                          key={q.id}
                          onClick={() => handleToggleQuestion(q.id)}
                          className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-400 dark:border-purple-600 shadow-xs'
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => handleToggleQuestion(q.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900 dark:text-gray-100">
                                  {idx + 1}. {q.title || 'Untitled question'}
                                </span>
                                {q.isRequired && (
                                  <span className="text-red-500 font-bold">*</span>
                                )}
                              </div>

                              {q.description && (
                                <p className="text-[11px] text-gray-500 line-clamp-2">
                                  {q.description}
                                </p>
                              )}

                              {/* Question Meta badges */}
                              <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px]">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
                                  <TypeIcon className="h-3 w-3" />
                                  {qTypeInfo.label}
                                </span>

                                {q.sectionTitle && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500">
                                    <Layers className="h-3 w-3" />
                                    {q.sectionTitle}
                                  </span>
                                )}

                                {q.quizPoints > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-700 font-semibold">
                                    <Award className="h-3 w-3" />
                                    {q.quizPoints} pts
                                  </span>
                                )}

                                {Boolean(q.config?.imageUrl) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                                    <ImageIcon className="h-3 w-3" /> Image
                                  </span>
                                )}

                                {q.options && q.options.length > 0 && (
                                  <span className="text-gray-400">
                                    ({q.options.length} options)
                                  </span>
                                )}
                              </div>

                              {/* Preview of options if choices */}
                              {q.options && q.options.length > 0 && (
                                <div className="mt-2 pl-2 border-l-2 border-gray-200 dark:border-gray-800 space-y-1">
                                  {q.options.slice(0, 3).map((opt: any, oIdx: number) => (
                                    <div
                                      key={oIdx}
                                      className="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5"
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-700 shrink-0" />
                                      <span className="truncate">{opt.label}</span>
                                      {opt.imageUrl && (
                                        <ImageIcon className="h-3 w-3 text-purple-500 shrink-0" />
                                      )}
                                    </div>
                                  ))}
                                  {q.options.length > 3 && (
                                    <p className="text-[10px] text-gray-400 italic">
                                      + {q.options.length - 3} more options
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Destination Placement Section */}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                      Import Destination:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div
                        onClick={() => setDestinationMode('EXISTING')}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          destinationMode === 'EXISTING'
                            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 text-purple-900 dark:text-purple-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="font-semibold">Existing Section</span>
                        <Select
                          value={selectedTargetSectionId}
                          onValueChange={(val) => {
                            setDestinationMode('EXISTING');
                            setSelectedTargetSectionId(val);
                          }}
                          disabled={destinationMode !== 'EXISTING'}
                        >
                          <SelectTrigger className="h-7 text-xs w-36 bg-white dark:bg-gray-900">
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                          <SelectContent>
                            {sections.map((sec, sIdx) => (
                              <SelectItem key={sec.id} value={sec.id} className="text-xs">
                                {sec.title || `Section ${sIdx + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div
                        onClick={() => setDestinationMode('NEW')}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          destinationMode === 'NEW'
                            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 text-purple-900 dark:text-purple-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="font-semibold">New Section</span>
                        <Input
                          type="text"
                          value={newSectionTitle}
                          onChange={(e) => {
                            setDestinationMode('NEW');
                            setNewSectionTitle(e.target.value);
                          }}
                          placeholder="Section name"
                          disabled={destinationMode !== 'NEW'}
                          className="h-7 text-xs w-36 bg-white dark:bg-gray-900"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={onClose} disabled={isImporting} className="h-8 text-xs">
            Cancel
          </Button>

          {step === 'SELECT_QUESTIONS' && (
            <Button
              size="sm"
              onClick={handleExecuteImport}
              disabled={selectedQuestionIds.size === 0 || isImporting}
              className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  <span>
                    Import {selectedQuestionIds.size}{' '}
                    {selectedQuestionIds.size === 1 ? 'question' : 'questions'}
                  </span>
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
