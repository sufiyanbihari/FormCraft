'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  UploadCloud,
  FileSpreadsheet,
  Check,
  X,
  RefreshCw,
  Download,
} from 'lucide-react';
import { QUESTION_TYPE_LABELS } from './QuestionCard';

interface SectionData {
  id: string;
  title: string;
  orderIndex: number;
}

interface ParsedOption {
  key: string;
  label: string;
  value: string;
  isCorrect: boolean;
}

interface ParsedQuestion {
  rowIndex: number;
  title: string;
  type: 'MULTIPLE_CHOICE';
  options: ParsedOption[];
  correctAnswerKey?: string;
  correctAnswerText?: string;
  marks: number;
  isValid: boolean;
  errors: string[];
}

interface ImportQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFormId: string;
  sections: SectionData[];
  activeSectionId?: string;
  onImportSuccess: (importedQuestions: any[], newSection?: any) => void;
  primaryColor?: string;
  isQuiz?: boolean;
  onEnableQuiz?: () => void;
}

export default function ImportQuestionsModal({
  isOpen,
  onClose,
  currentFormId,
  sections,
  activeSectionId,
  onImportSuccess,
  primaryColor = '#673ab7',
  isQuiz = false,
  onEnableQuiz,
}: ImportQuestionsModalProps) {
  // Main Source Tab: FormCraft vs Excel
  const [activeSource, setActiveSource] = useState<'FORMCRAFT' | 'EXCEL'>('FORMCRAFT');

  // ===========================================================================
  // FORMCRAFT IMPORT STATE (Existing)
  // ===========================================================================
  const [fcStep, setFcStep] = useState<'SELECT_FORM' | 'SELECT_QUESTIONS'>('SELECT_FORM');
  const [forms, setForms] = useState<any[]>([]);
  const [fcSearchQuery, setFcSearchQuery] = useState('');
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [isLoadingSourceQuestions, setIsLoadingSourceQuestions] = useState(false);
  const [sourceQuestions, setSourceQuestions] = useState<any[]>([]);
  const [selectedFcQuestionIds, setSelectedFcQuestionIds] = useState<Set<string>>(new Set());

  // ===========================================================================
  // EXCEL IMPORT STATE (New)
  // ===========================================================================
  const [excelStep, setExcelStep] = useState<'UPLOAD' | 'PREVIEW'>('UPLOAD');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelParseError, setExcelParseError] = useState<string | null>(null);

  // Excel parsed result
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [selectedExcelIndices, setSelectedExcelIndices] = useState<Set<number>>(new Set());
  const [excelSearchQuery, setExcelSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'VALID_ONLY' | 'INVALID_ONLY'>('ALL');

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===========================================================================
  // DESTINATION PLACEMENT STATE (Shared)
  // ===========================================================================
  const defaultSec = activeSectionId || sections[0]?.id || '';
  const [destinationMode, setDestinationMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [selectedTargetSectionId, setSelectedTargetSectionId] = useState<string>(defaultSec);
  const [newSectionTitle, setNewSectionTitle] = useState('Imported Questions');

  // Importing action state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Post-import Quiz Mode prompt state
  const [quizPromptData, setQuizPromptData] = useState<{
    show: boolean;
    count: number;
    totalMarks: number;
    importedQuestions: any[];
    newSection?: any;
  } | null>(null);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setFcStep('SELECT_FORM');
      setSelectedForm(null);
      setSourceQuestions([]);
      setSelectedFcQuestionIds(new Set());

      setExcelStep('UPLOAD');
      setUploadedFile(null);
      setExcelParseError(null);
      setParsedQuestions([]);
      setSelectedExcelIndices(new Set());

      setImportError(null);
      setQuizPromptData(null);
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

  // ===========================================================================
  // FORMCRAFT IMPORT HANDLERS
  // ===========================================================================
  const fetchAccessibleForms = async () => {
    setIsLoadingForms(true);
    setFormsError(null);
    try {
      const res = await fetch('/api/forms?filter=all');
      if (!res.ok) throw new Error('Failed to load forms');
      const data = await res.json();
      const filtered = (data.forms || []).filter((f: any) => f.id !== currentFormId);
      setForms(filtered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not fetch your forms';
      setFormsError(msg);
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
      setSelectedFcQuestionIds(new Set());
      setFcStep('SELECT_QUESTIONS');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load form details';
      setFormsError(msg);
    } finally {
      setIsLoadingSourceQuestions(false);
    }
  };

  const handleToggleFcQuestion = (id: string) => {
    setSelectedFcQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllFc = () => {
    if (selectedFcQuestionIds.size === sourceQuestions.length) {
      setSelectedFcQuestionIds(new Set());
    } else {
      setSelectedFcQuestionIds(new Set(sourceQuestions.map((q) => q.id)));
    }
  };

  const handleExecuteFcImport = async () => {
    if (selectedFcQuestionIds.size === 0) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const payload = {
        sourceFormId: selectedForm.id,
        questionIds: Array.from(selectedFcQuestionIds),
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  // ===========================================================================
  // EXCEL FILE PARSING & IMPORT HANDLERS
  // ===========================================================================
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const res = await fetch(`/api/forms/${currentFormId}/import-questions/template`);
      if (!res.ok) {
        throw new Error('Failed to download template');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Quiz_Question_Template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('Error downloading template:', err);
      setExcelParseError('Failed to download Excel template. Please try again.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (file: File, sheet?: string) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) {
      setExcelParseError('Please upload a valid Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }

    setUploadedFile(file);
    setIsParsingExcel(true);
    setExcelParseError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (sheet) {
        formData.append('sheetName', sheet);
      }

      const res = await fetch(`/api/forms/${currentFormId}/import-questions/parse-excel`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse Excel file');
      }

      setSheetNames(data.sheetNames || []);
      setActiveSheet(data.activeSheet || '');
      setParsedQuestions(data.questions || []);

      // By default, select all VALID questions
      const validIndices = new Set<number>();
      (data.questions || []).forEach((q: ParsedQuestion, idx: number) => {
        if (q.isValid) {
          validIndices.add(idx);
        }
      });
      setSelectedExcelIndices(validIndices);
      setExcelStep('PREVIEW');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      setExcelParseError(msg);
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleSwitchSheet = (sheetName: string) => {
    if (uploadedFile) {
      processSelectedFile(uploadedFile, sheetName);
    }
  };

  const handleToggleExcelQuestion = (idx: number) => {
    const q = parsedQuestions[idx];
    if (!q || !q.isValid) return; // Disallow selecting invalid rows
    setSelectedExcelIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAllExcel = () => {
    const validIndices = parsedQuestions
      .map((q, idx) => (q.isValid ? idx : -1))
      .filter((i) => i !== -1);

    if (selectedExcelIndices.size === validIndices.length) {
      setSelectedExcelIndices(new Set());
    } else {
      setSelectedExcelIndices(new Set(validIndices));
    }
  };

  const handleDeselectAllExcel = () => {
    setSelectedExcelIndices(new Set());
  };

  const handleExecuteExcelImport = async () => {
    if (selectedExcelIndices.size === 0) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const questionsToImport = Array.from(selectedExcelIndices)
        .sort((a, b) => a - b)
        .map((idx) => parsedQuestions[idx])
        .filter((q): q is ParsedQuestion => Boolean(q && q.isValid))
        .map((q) => ({
          title: q.title,
          type: 'MULTIPLE_CHOICE' as const,
          options: q.options.map((o) => ({
            label: o.label,
            value: o.label,
            isCorrect: o.isCorrect,
          })),
          marks: q.marks,
          correctAnswerText: q.correctAnswerText,
        }));

      const payload = {
        targetSectionId: destinationMode === 'EXISTING' ? selectedTargetSectionId : undefined,
        createNewSection: destinationMode === 'NEW',
        newSectionTitle: destinationMode === 'NEW' ? newSectionTitle : undefined,
        questions: questionsToImport,
      };

      const res = await fetch(`/api/forms/${currentFormId}/import-questions/from-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import Excel questions');
      }

      const hasQuizFeatures = questionsToImport.some((q) => q.marks > 0 || q.options.some((o) => o.isCorrect));
      const totalMarks = questionsToImport.reduce((sum, q) => sum + (q.marks || 0), 0);

      // If form is not in quiz mode, show the quiz mode prompt
      if (!isQuiz && hasQuizFeatures && onEnableQuiz) {
        setQuizPromptData({
          show: true,
          count: data.count || questionsToImport.length,
          totalMarks,
          importedQuestions: data.questions,
          newSection: data.newSection,
        });
      } else {
        onImportSuccess(data.questions, data.newSection);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered Excel questions for preview
  const filteredExcelQuestions = parsedQuestions
    .map((q, idx) => ({ q, originalIndex: idx }))
    .filter(({ q }) => {
      if (filterMode === 'VALID_ONLY' && !q.isValid) return false;
      if (filterMode === 'INVALID_ONLY' && q.isValid) return false;
      if (excelSearchQuery) {
        const query = excelSearchQuery.toLowerCase();
        const matchesTitle = q.title.toLowerCase().includes(query);
        const matchesOption = q.options.some((o) => o.label.toLowerCase().includes(query));
        return matchesTitle || matchesOption;
      }
      return true;
    });

  const totalPossibleMarks = parsedQuestions
    .filter((q) => q.isValid)
    .reduce((sum, q) => sum + (q.marks || 0), 0);

  const selectedMarks = Array.from(selectedExcelIndices).reduce((sum, idx) => {
    const q = parsedQuestions[idx];
    return sum + (q?.isValid ? q.marks : 0);
  }, 0);

  const filteredForms = forms.filter((f) =>
    (f.title || 'Untitled form').toLowerCase().includes(fcSearchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isImporting && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeSource === 'FORMCRAFT' && fcStep === 'SELECT_QUESTIONS' && (
                <button
                  type="button"
                  onClick={() => setFcStep('SELECT_FORM')}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 transition-colors"
                  title="Back to forms list"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              {activeSource === 'EXCEL' && excelStep === 'PREVIEW' && (
                <button
                  type="button"
                  onClick={() => setExcelStep('UPLOAD')}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 transition-colors"
                  title="Upload another spreadsheet"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                {activeSource === 'EXCEL' ? (
                  <FileSpreadsheet className="h-5 w-5" />
                ) : (
                  <ArrowDownToLine className="h-5 w-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {activeSource === 'EXCEL'
                    ? excelStep === 'UPLOAD'
                      ? 'Upload Excel Questions'
                      : `Preview Questions — ${uploadedFile?.name || 'Spreadsheet'}`
                    : fcStep === 'SELECT_FORM'
                      ? 'Import Questions from FormCraft'
                      : `Select Questions from "${selectedForm?.title || 'Form'}"`}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-0.5">
                  {activeSource === 'EXCEL'
                    ? excelStep === 'UPLOAD'
                      ? 'Upload an Excel or CSV file containing questions, options, answer keys, and marks'
                      : 'Select which questions to import into your form'
                    : fcStep === 'SELECT_FORM'
                      ? 'Choose an existing FormCraft form to reuse questions from'
                      : 'Select questions to insert into your form'}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Source Switch Tabs */}
          {!quizPromptData && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-200/60 dark:border-gray-800">
              <button
                type="button"
                onClick={() => {
                  setActiveSource('FORMCRAFT');
                  setImportError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                  activeSource === 'FORMCRAFT'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Import from FormCraft
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSource('EXCEL');
                  setImportError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                  activeSource === 'EXCEL'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Upload Excel File
              </button>
            </div>
          )}
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {importError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{importError}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* QUIZ MODE PROMPT MODAL OVERLAY                                    */}
          {/* ================================================================= */}
          {quizPromptData && (
            <div className="py-8 px-6 text-center space-y-5 animate-in fade-in zoom-in-95">
              <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 mx-auto flex items-center justify-center shadow-inner">
                <Award className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {quizPromptData.count} quiz questions imported!
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  The imported questions contain answer keys and a total of{' '}
                  <strong className="text-amber-700 dark:text-amber-400">
                    {quizPromptData.totalMarks} marks
                  </strong>
                  . Would you like to enable <strong>Quiz Mode</strong> for this form so
                  it automatically grades respondents?
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onImportSuccess(quizPromptData.importedQuestions, quizPromptData.newSection);
                    onClose();
                  }}
                  className="text-xs"
                >
                  Keep as Standard Form
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (onEnableQuiz) onEnableQuiz();
                    onImportSuccess(quizPromptData.importedQuestions, quizPromptData.newSection);
                    onClose();
                  }}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Award className="h-3.5 w-3.5" />
                  Enable Quiz Mode
                </Button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* OPTION 1: FORMCRAFT IMPORT                                        */}
          {/* ================================================================= */}
          {!quizPromptData && activeSource === 'FORMCRAFT' && (
            <>
              {/* STEP 1: FORM SELECTION */}
              {fcStep === 'SELECT_FORM' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search forms by title..."
                      value={fcSearchQuery}
                      onChange={(e) => setFcSearchQuery(e.target.value)}
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
                        {fcSearchQuery
                          ? 'Try a different search term'
                          : 'Create other forms first to import questions'}
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
              {fcStep === 'SELECT_QUESTIONS' && (
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
                      <Button size="sm" variant="outline" onClick={() => setFcStep('SELECT_FORM')}>
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
                              selectedFcQuestionIds.size === sourceQuestions.length &&
                              sourceQuestions.length > 0
                            }
                            onCheckedChange={handleToggleSelectAllFc}
                          />
                          <span>Select all ({sourceQuestions.length} questions)</span>
                        </label>
                        <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-full">
                          {selectedFcQuestionIds.size} selected
                        </span>
                      </div>

                      {/* Question Cards List */}
                      <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                        {sourceQuestions.map((q, idx) => {
                          const isChecked = selectedFcQuestionIds.has(q.id);
                          const qTypeInfo = QUESTION_TYPE_LABELS[q.type] || {
                            label: q.type,
                            icon: FileText,
                          };
                          const TypeIcon = qTypeInfo.icon;

                          return (
                            <div
                              key={q.id}
                              onClick={() => handleToggleFcQuestion(q.id)}
                              className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                isChecked
                                  ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-400 dark:border-purple-600 shadow-xs'
                                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => handleToggleFcQuestion(q.id)}
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
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Destination Placement */}
                      {renderDestinationPlacement()}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ================================================================= */}
          {/* OPTION 2: EXCEL UPLOAD & PREVIEW                                  */}
          {/* ================================================================= */}
          {!quizPromptData && activeSource === 'EXCEL' && (
            <>
              {/* STAGE A: FILE UPLOAD SCREEN */}
              {excelStep === 'UPLOAD' && (
                <div className="space-y-4">
                  {excelParseError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{excelParseError}</span>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />

                  {/* Drag and Drop Box */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      isDragging
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 scale-[0.99]'
                        : 'border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/20'
                    }`}
                  >
                    <div className="h-14 w-14 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shadow-xs">
                      {isParsingExcel ? (
                        <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
                      ) : (
                        <UploadCloud className="h-7 w-7" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {isParsingExcel
                          ? 'Parsing spreadsheet file...'
                          : 'Drag and drop your spreadsheet here'}
                      </h4>
                      <p className="text-xs text-gray-500">
                        Supported formats: <strong>.xlsx</strong> and <strong>.csv</strong> (Max 10MB)
                      </p>
                    </div>

                    <div
                      className="flex items-center gap-2 mt-2 flex-wrap justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        size="sm"
                        disabled={isParsingExcel}
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 h-8 flex items-center gap-2 shadow-xs cursor-pointer"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Choose Excel File
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isParsingExcel || isDownloadingTemplate}
                        onClick={handleDownloadTemplate}
                        className="text-xs font-semibold px-3.5 h-8 border-gray-300 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50/50 dark:hover:bg-purple-950/30 text-gray-700 dark:text-gray-200 flex items-center gap-2 shadow-xs cursor-pointer"
                      >
                        {isDownloadingTemplate ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                        ) : (
                          <Download className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        )}
                        <span>Download Excel Template</span>
                      </Button>
                    </div>
                  </div>

                  {/* Template Format Info Box */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-200">
                        <HelpCircle className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>Required Spreadsheet Columns</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        disabled={isDownloadingTemplate}
                        className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-semibold flex items-center gap-1 hover:underline text-[11px] cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download Blank Template (.xlsx)</span>
                      </button>
                    </div>
                    <p className="text-gray-500 text-[11px] leading-relaxed">
                      Your Excel sheet should contain headers matching:
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-purple-700 dark:text-purple-300 font-bold">
                        Question Text
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        Option A
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        Option B
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        Option C
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        Option D
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 font-bold">
                        Correct Answer
                      </span>
                      <span className="px-2 py-0.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-amber-700 dark:text-amber-400 font-bold">
                        Marks
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 pt-1">
                      * Multiple choice options (A, B, C, D) are converted to choices, Correct Answer (A, B, C, D) is linked to the answer key, and Marks are mapped to quiz points.
                    </p>
                  </div>
                </div>
              )}

              {/* STAGE B: PREVIEW & SELECTION SCREEN */}
              {excelStep === 'PREVIEW' && (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                          {uploadedFile?.name}
                        </span>
                      </div>

                      {/* Multi-sheet selection */}
                      {sheetNames.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500">Sheet:</span>
                          <Select value={activeSheet} onValueChange={handleSwitchSheet}>
                            <SelectTrigger className="h-7 text-xs w-44 bg-white dark:bg-gray-900">
                              <SelectValue placeholder="Select worksheet" />
                            </SelectTrigger>
                            <SelectContent>
                              {sheetNames.map((name) => (
                                <SelectItem key={name} value={name} className="text-xs">
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Stats Badges */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                      <span className="px-2.5 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-medium">
                        Total: <strong>{parsedQuestions.length}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Valid: <strong>{parsedQuestions.filter((q) => q.isValid).length}</strong>
                      </span>
                      {parsedQuestions.some((q) => !q.isValid) && (
                        <span className="px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-medium flex items-center gap-1">
                          <X className="h-3 w-3" />
                          Invalid: <strong>{parsedQuestions.filter((q) => !q.isValid).length}</strong>
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
                        <Award className="h-3 w-3" />
                        Total Marks: <strong>{totalPossibleMarks} pts</strong>
                      </span>
                      <span className="ml-auto text-purple-700 dark:text-purple-300 font-bold text-xs bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-md">
                        {selectedExcelIndices.size} selected ({selectedMarks} pts)
                      </span>
                    </div>
                  </div>

                  {/* Search and Selection Toolbar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search parsed questions or options..."
                        value={excelSearchQuery}
                        onChange={(e) => setExcelSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-xs rounded-lg bg-gray-50 dark:bg-gray-800/60"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSelectAllExcel}
                        className="h-8 text-[11px] px-2.5"
                      >
                        Select All Valid
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleDeselectAllExcel}
                        className="h-8 text-[11px] px-2.5"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  {/* Parsed Questions List */}
                  <div className="space-y-2.5 max-h-[38vh] overflow-y-auto pr-1">
                    {filteredExcelQuestions.length === 0 ? (
                      <div className="py-12 text-center text-xs text-gray-400">
                        No questions match your filter.
                      </div>
                    ) : (
                      filteredExcelQuestions.map(({ q, originalIndex }) => {
                        const isSelected = selectedExcelIndices.has(originalIndex);

                        return (
                          <div
                            key={originalIndex}
                            onClick={() => q.isValid && handleToggleExcelQuestion(originalIndex)}
                            className={`p-3.5 rounded-xl border text-xs transition-all ${
                              !q.isValid
                                ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900 cursor-not-allowed opacity-90'
                                : isSelected
                                  ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-400 dark:border-purple-600 shadow-xs cursor-pointer'
                                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isSelected}
                                disabled={!q.isValid}
                                onCheckedChange={() => handleToggleExcelQuestion(originalIndex)}
                                className="mt-0.5"
                              />

                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-semibold">
                                      Row {q.rowIndex}
                                    </span>
                                    <span className="font-bold text-gray-900 dark:text-gray-100">
                                      {q.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-700 text-[11px] font-semibold">
                                      <Award className="h-3 w-3" />
                                      {q.marks} {q.marks === 1 ? 'pt' : 'pts'}
                                    </span>
                                  </div>
                                </div>

                                {/* Options with Correct Answer Highlight */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                  {q.options.map((opt) => (
                                    <div
                                      key={opt.key}
                                      className={`p-2 rounded-lg text-[11px] flex items-center justify-between gap-2 border ${
                                        opt.isCorrect
                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-medium'
                                          : 'bg-gray-50/70 dark:bg-gray-800/40 border-gray-200/80 dark:border-gray-700/80 text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`h-5 w-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                            opt.isCorrect
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                          }`}
                                        >
                                          {opt.key}
                                        </span>
                                        <span className="truncate">{opt.label}</span>
                                      </div>

                                      {opt.isCorrect && (
                                        <span className="shrink-0 text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                          <Check className="h-3 w-3" /> Correct
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {/* Validation Errors for Invalid Rows */}
                                {q.errors.length > 0 && (
                                  <div className="p-2 rounded-lg bg-red-100/70 dark:bg-red-950/50 text-[11px] text-red-700 dark:text-red-300 space-y-0.5">
                                    {q.errors.map((err, eIdx) => (
                                      <div key={eIdx} className="flex items-center gap-1.5">
                                        <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
                                        <span>{err}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Destination Placement */}
                  {renderDestinationPlacement()}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!quizPromptData && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              disabled={isImporting}
              className="h-8 text-xs"
            >
              Cancel
            </Button>

            {activeSource === 'FORMCRAFT' && fcStep === 'SELECT_QUESTIONS' && (
              <Button
                size="sm"
                onClick={handleExecuteFcImport}
                disabled={selectedFcQuestionIds.size === 0 || isImporting}
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
                      Import {selectedFcQuestionIds.size}{' '}
                      {selectedFcQuestionIds.size === 1 ? 'question' : 'questions'}
                    </span>
                  </>
                )}
              </Button>
            )}

            {activeSource === 'EXCEL' && excelStep === 'PREVIEW' && (
              <Button
                size="sm"
                onClick={handleExecuteExcelImport}
                disabled={selectedExcelIndices.size === 0 || isImporting}
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
                      Import {selectedExcelIndices.size}{' '}
                      {selectedExcelIndices.size === 1 ? 'question' : 'questions'} ({selectedMarks} pts)
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // Helper function to render Destination Section selector
  function renderDestinationPlacement() {
    return (
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
    );
  }
}
