'use client';

import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical,
  Copy,
  Trash2,
  MoreVertical,
  Plus,
  X,
  CheckCircle2,
  HelpCircle,
  Award,
  Circle,
  Square,
  ChevronDown,
  Calendar,
  Clock,
  Star,
  Upload,
  Hash,
  Mail,
  Phone,
  Globe,
  Heading,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Video,
  Loader2,
  ExternalLink,
  Database,
  Sparkles,
} from 'lucide-react';
import { getVideoEmbedUrl } from '@/lib/utils';

export const QUESTION_TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  SHORT_ANSWER: { label: 'Short answer', icon: AlignLeft },
  PARAGRAPH: { label: 'Paragraph', icon: AlignLeft },
  MULTIPLE_CHOICE: { label: 'Multiple choice', icon: Circle },
  CHECKBOXES: { label: 'Checkboxes', icon: Square },
  DROPDOWN: { label: 'Dropdown', icon: ChevronDown },
  LINEAR_SCALE: { label: 'Linear scale', icon: Hash },
  MULTIPLE_CHOICE_GRID: { label: 'Multiple choice grid', icon: Circle },
  CHECKBOX_GRID: { label: 'Checkbox grid', icon: Square },
  DATE: { label: 'Date', icon: Calendar },
  TIME: { label: 'Time', icon: Clock },
  RATING: { label: 'Rating', icon: Star },
  FILE_UPLOAD: { label: 'File upload', icon: Upload },
  NUMBER: { label: 'Number', icon: Hash },
  EMAIL: { label: 'Email', icon: Mail },
  PHONE: { label: 'Phone number', icon: Phone },
  WEBSITE: { label: 'Website URL', icon: Globe },
  SECTION_HEADER: { label: 'Title and description', icon: Heading },
  TEXT_BLOCK: { label: 'Text block', icon: AlignLeft },
  IMAGE_BLOCK: { label: 'Image', icon: ImageIcon },
  VIDEO_EMBED: { label: 'Video', icon: Video },
};

export interface QuestionData {
  id: string;
  sectionId: string;
  title: string;
  description?: string | null;
  type: string;
  isRequired: boolean;
  orderIndex: number;
  validation?: any;
  config?: any;
  quizPoints?: number;
  quizAnswer?: any;
  quizExplanation?: string | null;
  options: {
    id?: string;
    label: string;
    value?: string;
    orderIndex: number;
    isOther?: boolean;
    goToSectionId?: string | null;
  }[];
}

interface QuestionCardProps {
  question: QuestionData;
  isActive: boolean;
  onSelect: () => void;
  onChange: (updated: Partial<QuestionData>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  sections: { id: string; title: string; orderIndex: number }[];
  isQuiz: boolean;
  primaryColor?: string;
  borderRadius?: string;
  lookupMappings?: any[];
  onOpenLookup?: () => void;
}

export default function QuestionCard({
  question,
  isActive,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  sections,
  isQuiz,
  primaryColor = '#673ab7',
  borderRadius = 'rounded-xl',
  lookupMappings,
  onOpenLookup,
}: QuestionCardProps) {
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [showDescription, setShowDescription] = useState(Boolean(question.description));
  const [showBranching, setShowBranching] = useState(
    question.options.some((opt) => opt.goToSectionId !== null && opt.goToSectionId !== undefined)
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    setImageError(null);
    const maxMb = question.config?.maxImageSizeMb || 10;
    if (file.size > maxMb * 1024 * 1024) {
      setImageError(`Image size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds allowed limit of ${maxMb} MB`);
      setIsUploadingImage(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('maxSizeMb', String(maxMb));
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.publicUrl) {
        onChange({
          config: {
            ...question.config,
            imageUrl: data.publicUrl,
            fileName: data.fileName,
          },
        });
      } else {
        setImageError(data.error || 'Failed to upload image');
      }
    } catch {
      setImageError('Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    setIsUploadingVideo(true);
    setVideoError(null);
    const maxMb = question.config?.maxVideoSizeMb || 50;
    if (file.size > maxMb * 1024 * 1024) {
      setVideoError(`Video size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds allowed limit of ${maxMb} MB`);
      setIsUploadingVideo(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('maxSizeMb', String(maxMb));
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.publicUrl) {
        onChange({
          config: {
            ...question.config,
            videoUrl: data.publicUrl,
            embedUrl: data.publicUrl,
            fileName: data.fileName,
          },
        });
      } else {
        setVideoError(data.error || 'Failed to upload video');
      }
    } catch {
      setVideoError('Failed to upload video');
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Option operations
  const handleOptionChange = (idx: number, newLabel: string) => {
    const newOptions = [...question.options];
    newOptions[idx] = {
      ...newOptions[idx],
      label: newLabel,
      value: newLabel,
    };
    onChange({ options: newOptions });
  };

  const handleAddOption = (isOther = false) => {
    const nextOrder = question.options.length;
    const newOptions = [
      ...question.options,
      {
        label: isOther ? 'Other...' : `Option ${nextOrder + 1}`,
        value: isOther ? 'Other' : `Option ${nextOrder + 1}`,
        orderIndex: nextOrder,
        isOther,
        goToSectionId: null,
      },
    ];
    onChange({ options: newOptions });
  };

  const handleDeleteOption = (idx: number) => {
    if (question.options.length <= 1) return;
    const newOptions = question.options.filter((_, i) => i !== idx);
    onChange({ options: newOptions });
  };

  const handleBranchingChange = (optIdx: number, targetSectionId: string | null) => {
    const newOptions = [...question.options];
    newOptions[optIdx] = {
      ...newOptions[optIdx],
      goToSectionId: targetSectionId,
    };
    onChange({ options: newOptions });
  };

  // Quiz correct answer selection
  const handleToggleCorrectOption = (optLabel: string) => {
    if (question.type === 'MULTIPLE_CHOICE' || question.type === 'DROPDOWN') {
      onChange({
        quizAnswer: { correctValue: optLabel },
      });
    } else if (question.type === 'CHECKBOXES') {
      const currentVals: string[] = question.quizAnswer?.correctValues || [];
      const updated = currentVals.includes(optLabel)
        ? currentVals.filter((v) => v !== optLabel)
        : [...currentVals, optLabel];
      onChange({
        quizAnswer: { correctValues: updated },
      });
    }
  };

  const qType = question.type;
  const isChoiceType =
    qType === 'MULTIPLE_CHOICE' || qType === 'CHECKBOXES' || qType === 'DROPDOWN';

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      className={`relative bg-white dark:bg-gray-900 ${borderRadius || 'rounded-xl'} border transition-all duration-200 mb-4 shadow-sm ${
        isActive
          ? 'border-l-4 shadow-md'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
      }`}
      style={{
        ...style,
        borderLeftColor: isActive ? primaryColor : undefined,
      }}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="w-full flex justify-center py-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
      >
        <GripVertical className="h-4 w-4 rotate-90" />
      </div>

      {/* Lookup Badges */}
      {(() => {
        const triggerMapping = (lookupMappings || []).find((m) => m.triggerQuestionId === question.id);
        const targetMappings = (lookupMappings || []).flatMap((m) =>
          (m.mappings || [])
            .filter((fm: any) => fm.targetQuestionId === question.id)
            .map((fm: any) => ({ ...fm, datasetName: m.dataset?.fileName, keyColumn: m.keyColumn }))
        );

        if (triggerMapping) {
          return (
            <div className="flex items-center gap-1.5 px-6 py-1.5 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span className="font-semibold">Lookup Trigger:</span>
              <span>{triggerMapping.lookupType === 'DROPDOWN' ? 'Dynamic Dropdown' : 'Unique-Key Text'} (matches "{triggerMapping.keyColumn}")</span>
              {onOpenLookup && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLookup();
                  }}
                  className="ml-auto text-[10px] underline hover:text-blue-900 dark:hover:text-blue-100 font-medium"
                >
                  Configure Rule
                </button>
              )}
            </div>
          );
        }

        if (targetMappings.length > 0) {
          return (
            <div className="flex items-center gap-1.5 px-6 py-1.5 bg-purple-50/80 dark:bg-purple-950/40 border-b border-purple-100 dark:border-purple-900/50 text-[11px] text-purple-700 dark:text-purple-300">
              <Database className="h-3.5 w-3.5 text-purple-600 shrink-0" />
              <span className="font-semibold">Autofilled Field:</span>
              <span>Populated from column "{targetMappings[0].column}" ({targetMappings[0].isReadOnly ? '🔒 Read-Only / Locked' : '✏️ Editable'})</span>
            </div>
          );
        }

        return null;
      })()}

      <div className="p-6 pt-2 space-y-4">
        {/* Top Row: Title & Type Selector */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 w-full">
            <Input
              type="text"
              value={question.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Question title"
              className="text-base font-semibold border-b border-t-0 border-x-0 rounded-none px-1 h-10 focus:border-purple-600 focus:ring-0 bg-transparent"
            />
          </div>

          <div className="w-full sm:w-56 shrink-0">
            <Select
              value={question.type}
              onValueChange={(val) => {
                const isTargetChoice =
                  val === 'MULTIPLE_CHOICE' || val === 'CHECKBOXES' || val === 'DROPDOWN';
                if (isTargetChoice && (!question.options || question.options.length === 0)) {
                  onChange({
                    type: val,
                    options: [{ label: 'Option 1', value: 'Option 1', orderIndex: 0, isOther: false }],
                  });
                } else {
                  onChange({ type: val });
                }
              }}
            >
              <SelectTrigger className="h-10 text-xs bg-gray-50/80 dark:bg-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(QUESTION_TYPE_LABELS).map(([key, info]) => {
                  const Icon = info.icon;
                  return (
                    <SelectItem key={key} value={key} className="text-xs">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-gray-500" />
                        <span>{info.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Optional Description */}
        {showDescription && (
          <Input
            type="text"
            value={question.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Description or guidance for respondents"
            className="text-xs text-gray-500 border-none px-1 h-7 focus:ring-0 bg-transparent -mt-2"
          />
        )}

        {/* Question Type Body Renderers */}

        {/* 1. Short Answer */}
        {qType === 'SHORT_ANSWER' && (
          <div className="py-2">
            <div className="w-full max-w-sm border-b border-gray-300 dark:border-gray-700 py-1 text-sm text-gray-400">
              Short-answer text
            </div>
          </div>
        )}

        {/* 2. Paragraph */}
        {qType === 'PARAGRAPH' && (
          <div className="py-2">
            <div className="w-full max-w-md border-b border-gray-300 dark:border-gray-700 py-2 text-sm text-gray-400">
              Long-answer text
            </div>
          </div>
        )}

        {/* 3. Multiple Choice, Checkboxes, Dropdown */}
        {isChoiceType && (
          <div className="space-y-2 py-2">
            {question.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-3 group">
                {qType === 'MULTIPLE_CHOICE' ? (
                  <Circle className="h-4 w-4 text-gray-400 shrink-0" />
                ) : qType === 'CHECKBOXES' ? (
                  <Square className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <span className="text-xs text-gray-400 font-semibold w-4 text-center">
                    {idx + 1}.
                  </span>
                )}

                {opt.isOther ? (
                  <div className="flex items-center gap-2 flex-1 px-2 py-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Other...
                    </span>
                    <span className="text-[11px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 px-2 py-0.5 rounded-md font-medium">
                      Respondent text input enabled
                    </span>
                  </div>
                ) : (
                  <Input
                    type="text"
                    value={opt.label}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    onBlur={() => {
                      if (!opt.label.trim()) {
                        handleOptionChange(idx, `Option ${idx + 1}`);
                      }
                    }}
                    className="h-8 text-sm border-transparent hover:border-gray-200 focus:border-purple-600 rounded-md px-2 flex-1"
                  />
                )}

                {/* Conditional Branching dropdown */}
                {showBranching && (
                  <div className="w-44">
                    <Select
                      value={opt.goToSectionId || 'CONTINUE'}
                      onValueChange={(val) =>
                        handleBranchingChange(idx, val === 'CONTINUE' ? null : val)
                      }
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-gray-50">
                        <SelectValue placeholder="Continue to next" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CONTINUE">Continue to next</SelectItem>
                        <SelectItem value="SUBMIT">Submit form</SelectItem>
                        {sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            Go to {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Delete option button */}
                {question.options.length > 1 && (
                  <button
                    onClick={() => handleDeleteOption(idx)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {/* Add Option Toolbar */}
            <div className="flex items-center gap-2 pt-2 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAddOption(false)}
                className="text-purple-600 hover:text-purple-700 h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add option
              </Button>
              {!question.options.some((o) => o.isOther) && (
                <>
                  <span className="text-gray-400">or</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddOption(true)}
                    className="text-gray-600 hover:text-gray-900 h-8"
                  >
                    Add "Other"
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 4. Linear Scale */}
        {qType === 'LINEAR_SCALE' && (
          <div className="space-y-3 py-2 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500">From</span>
              <Select
                value={String(question.config?.scaleMin ?? 1)}
                onValueChange={(v) =>
                  onChange({ config: { ...question.config, scaleMin: Number(v) } })
                }
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs font-medium text-gray-500">to</span>
              <Select
                value={String(question.config?.scaleMax ?? 5)}
                onValueChange={(v) =>
                  onChange({ config: { ...question.config, scaleMax: Number(v) } })
                }
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] text-gray-400">Lowest scale label (optional)</label>
                <Input
                  type="text"
                  placeholder="e.g. Strongly Disagree"
                  value={question.config?.scaleMinLabel || ''}
                  onChange={(e) =>
                    onChange({ config: { ...question.config, scaleMinLabel: e.target.value } })
                  }
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400">Highest scale label (optional)</label>
                <Input
                  type="text"
                  placeholder="e.g. Strongly Agree"
                  value={question.config?.scaleMaxLabel || ''}
                  onChange={(e) =>
                    onChange({ config: { ...question.config, scaleMaxLabel: e.target.value } })
                  }
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. Rating */}
        {qType === 'RATING' && (
          <div className="flex items-center gap-4 py-2">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="h-6 w-6 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <span className="text-xs text-gray-400">Star Rating Scale (1 to 5)</span>
          </div>
        )}

        {/* 6. Grids (Multiple choice grid / Checkbox grid) */}
        {(qType === 'MULTIPLE_CHOICE_GRID' || qType === 'CHECKBOX_GRID') && (
          <div className="grid grid-cols-2 gap-4 py-2 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl">
            {/* Rows */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Rows (Questions)
              </label>
              {(question.config?.rows || ['Row 1']).map((row: string, rIdx: number) => (
                <div key={rIdx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{rIdx + 1}.</span>
                  <Input
                    type="text"
                    value={row}
                    onChange={(e) => {
                      const updatedRows = [...(question.config?.rows || ['Row 1'])];
                      updatedRows[rIdx] = e.target.value;
                      onChange({ config: { ...question.config, rows: updatedRows } });
                    }}
                    className="h-7 text-xs flex-1"
                  />
                  {(question.config?.rows || []).length > 1 && (
                    <button
                      onClick={() => {
                        const updatedRows = question.config.rows.filter(
                          (_: any, i: number) => i !== rIdx
                        );
                        onChange({ config: { ...question.config, rows: updatedRows } });
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const updatedRows = [...(question.config?.rows || ['Row 1'])];
                  updatedRows.push(`Row ${updatedRows.length + 1}`);
                  onChange({ config: { ...question.config, rows: updatedRows } });
                }}
                className="text-xs text-purple-600 h-7"
              >
                + Add row
              </Button>
            </div>

            {/* Columns */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Columns (Options)
              </label>
              {(question.config?.cols || ['Col 1', 'Col 2']).map((col: string, cIdx: number) => (
                <div key={cIdx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{cIdx + 1}.</span>
                  <Input
                    type="text"
                    value={col}
                    onChange={(e) => {
                      const updatedCols = [...(question.config?.cols || ['Col 1', 'Col 2'])];
                      updatedCols[cIdx] = e.target.value;
                      onChange({ config: { ...question.config, cols: updatedCols } });
                    }}
                    className="h-7 text-xs flex-1"
                  />
                  {(question.config?.cols || []).length > 1 && (
                    <button
                      onClick={() => {
                        const updatedCols = question.config.cols.filter(
                          (_: any, i: number) => i !== cIdx
                        );
                        onChange({ config: { ...question.config, cols: updatedCols } });
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const updatedCols = [...(question.config?.cols || ['Col 1', 'Col 2'])];
                  updatedCols.push(`Col ${updatedCols.length + 1}`);
                  onChange({ config: { ...question.config, cols: updatedCols } });
                }}
                className="text-xs text-purple-600 h-7"
              >
                + Add column
              </Button>
            </div>
          </div>
        )}

        {/* 7. File Upload Configuration */}
        {qType === 'FILE_UPLOAD' && (
          <div className="space-y-4 py-2 border border-purple-100 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-600" />
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100">File Upload Settings</h4>
                <p className="text-[11px] text-gray-500">Configure file size limits and accepted file categories for respondents</p>
              </div>
            </div>

            {/* Max File Size in MB */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Maximum File Size Limit:
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={question.config?.maxFileSizeMb || 10}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
                      onChange({
                        config: { ...question.config, maxFileSizeMb: val },
                      });
                    }}
                    className="w-16 h-7 text-xs font-bold text-center"
                  />
                  <span className="text-xs font-semibold text-gray-500">MB</span>
                </div>
              </div>

              {/* Quick size presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-gray-400 mr-1">Presets:</span>
                {[5, 10, 25, 50, 100].map((mb) => {
                  const isCur = (question.config?.maxFileSizeMb || 10) === mb;
                  return (
                    <button
                      key={mb}
                      type="button"
                      onClick={() =>
                        onChange({
                          config: { ...question.config, maxFileSizeMb: mb },
                        })
                      }
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                        isCur
                          ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      {mb} MB
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Allowed File Types */}
            <div className="space-y-2 pt-2 border-t border-purple-100 dark:border-purple-900/30">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Allowed File Categories:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'image', label: 'Images (JPG, PNG, GIF, WebP)', accept: 'image/*' },
                  { id: 'video', label: 'Videos (MP4, WebM, MOV)', accept: 'video/*' },
                  { id: 'pdf', label: 'PDF Documents (.pdf)', accept: '.pdf' },
                  { id: 'doc', label: 'Word (.doc, .docx)', accept: '.doc,.docx' },
                  { id: 'spreadsheet', label: 'Spreadsheets (Excel, CSV)', accept: '.xlsx,.xls,.csv' },
                  { id: 'audio', label: 'Audio (.mp3, .wav)', accept: 'audio/*' },
                ].map((cat) => {
                  const currentTypes: string[] = question.config?.allowedFileTypes || [];
                  const isChecked = currentTypes.includes(cat.accept);
                  return (
                    <label
                      key={cat.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 font-semibold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...currentTypes, cat.accept]
                            : currentTypes.filter((t) => t !== cat.accept);
                          onChange({
                            config: { ...question.config, allowedFileTypes: updated },
                          });
                        }}
                        className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                      />
                      <span className="truncate">{cat.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                {(question.config?.allowedFileTypes || []).length === 0
                  ? 'All file types accepted by default (up to ' + (question.config?.maxFileSizeMb || 10) + ' MB)'
                  : 'Restricted to selected categories only.'}
              </p>
            </div>
          </div>
        )}

        {/* 8. Number */}
        {qType === 'NUMBER' && (
          <div className="space-y-3 py-2">
            <div className="w-full max-w-sm border-b border-gray-300 dark:border-gray-700 py-1 text-sm text-gray-400 flex items-center gap-2">
              <Hash className="h-4 w-4 text-purple-600" />
              <span>Number answer (strictly digits only, rejects text)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-sm pt-1">
              <div>
                <label className="text-[11px] text-gray-500 font-medium">Min value (optional)</label>
                <Input
                  type="number"
                  placeholder="e.g. 0"
                  value={question.validation?.minVal ?? ''}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...question.validation,
                        minVal: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 font-medium">Max value (optional)</label>
                <Input
                  type="number"
                  placeholder="e.g. 100"
                  value={question.validation?.maxVal ?? ''}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...question.validation,
                        maxVal: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* 9. Phone */}
        {qType === 'PHONE' && (
          <div className="py-2 space-y-1">
            <div className="w-full max-w-sm border-b border-gray-300 dark:border-gray-700 py-1 text-sm text-gray-400 flex items-center gap-2">
              <Phone className="h-4 w-4 text-purple-600" />
              <span>Phone number (10 to 15 digits enforced)</span>
            </div>
            <p className="text-[11px] text-gray-400">Strictly blocks non-phone characters and rejects short inputs (e.g. 1, 2 digits).</p>
          </div>
        )}

        {/* 10. Email */}
        {qType === 'EMAIL' && (
          <div className="py-2">
            <div className="w-full max-w-sm border-b border-gray-300 dark:border-gray-700 py-1 text-sm text-gray-400 flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-600" />
              <span>Email address (validated email format)</span>
            </div>
          </div>
        )}

        {/* 11. Website */}
        {qType === 'WEBSITE' && (
          <div className="py-2">
            <div className="w-full max-w-sm border-b border-gray-300 dark:border-gray-700 py-1 text-sm text-gray-400 flex items-center gap-2">
              <Globe className="h-4 w-4 text-purple-600" />
              <span>Website URL (https://...)</span>
            </div>
          </div>
        )}

        {/* 12. Date & Time */}
        {(qType === 'DATE' || qType === 'TIME') && (
          <div className="py-2 flex items-center gap-2 text-sm text-gray-400 border-b border-gray-200 dark:border-gray-800 w-56 pb-1">
            {qType === 'DATE' ? (
              <>
                <Calendar className="h-4 w-4 text-purple-600" />
                <span>Date input (Format: YYYY-MM-DD)</span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-purple-600" />
                <span>Time input (Format: HH:MM)</span>
              </>
            )}
          </div>
        )}

        {/* 13. Image Block */}
        {qType === 'IMAGE_BLOCK' && (
          <div className="space-y-4 py-2">
            {/* Max Image Size Setting */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Image Size Limit:
                </span>
                <p className="text-[10px] text-gray-400">Maximum allowed file size for image upload</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[2, 5, 10, 25].map((mb) => {
                  const isCur = (question.config?.maxImageSizeMb || 10) === mb;
                  return (
                    <button
                      key={mb}
                      type="button"
                      onClick={() =>
                        onChange({
                          config: { ...question.config, maxImageSizeMb: mb },
                        })
                      }
                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-all ${
                        isCur
                          ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      {mb}MB
                    </button>
                  );
                })}
              </div>
            </div>

            {question.config?.imageUrl ? (
              <div className="space-y-3">
                <div
                  className={`flex ${
                    question.config.imageAlignment === 'left'
                      ? 'justify-start'
                      : question.config.imageAlignment === 'right'
                        ? 'justify-end'
                        : 'justify-center'
                  }`}
                >
                  <div className="relative group max-w-md">
                    <img
                      src={question.config.imageUrl}
                      alt={question.title || 'Block image'}
                      className="rounded-xl max-h-72 w-auto object-contain border border-gray-200 dark:border-gray-800 shadow-md bg-gray-50"
                    />
                    <a
                      href={question.config.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center text-xs font-semibold transition-opacity gap-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View original
                    </a>
                  </div>
                </div>

                {/* Alignment & Replace controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium mr-1">Align:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ config: { ...question.config, imageAlignment: 'left' } })
                      }
                      className={`p-1.5 rounded-lg border text-xs ${
                        question.config.imageAlignment === 'left'
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                      title="Align Left"
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ config: { ...question.config, imageAlignment: 'center' } })
                      }
                      className={`p-1.5 rounded-lg border text-xs ${
                        !question.config.imageAlignment || question.config.imageAlignment === 'center'
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                      title="Align Center"
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ config: { ...question.config, imageAlignment: 'right' } })
                      }
                      className={`p-1.5 rounded-lg border text-xs ${
                        question.config.imageAlignment === 'right'
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                      title="Align Right"
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                        <Upload className="h-3.5 w-3.5" /> Replace image
                      </span>
                    </label>
                    <span className="text-gray-300">•</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          config: { ...question.config, imageUrl: undefined, fileName: undefined },
                        })
                      }
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-purple-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/60 dark:bg-gray-800/40 group">
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.target.value = '';
                    }}
                  />
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-2 text-purple-600 py-2">
                      <Loader2 className="h-7 w-7 animate-spin" />
                      <span className="text-xs font-semibold">Uploading image...</span>
                    </div>
                  ) : (
                    <>
                      <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                        Click to upload an image (Max {question.config?.maxImageSizeMb || 10} MB)
                      </span>
                      <span className="text-[11px] text-gray-400 mt-0.5">
                        PNG, JPG, WebP, GIF supported
                      </span>
                    </>
                  )}
                </label>

                {imageError && (
                  <p className="text-xs text-red-500 font-medium">{imageError}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-400 shrink-0">Or image URL:</span>
                  <Input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={question.config?.imageUrl || ''}
                    onChange={(e) =>
                      onChange({
                        config: { ...question.config, imageUrl: e.target.value },
                      })
                    }
                    className="h-8 text-xs flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 14. Video Block & Embed */}
        {qType === 'VIDEO_EMBED' && (
          <div className="space-y-4 py-2">
            {/* Max Video Size Setting */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Video Upload Limit:
                </span>
                <p className="text-[10px] text-gray-400">Maximum allowed file size for video uploads</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[10, 25, 50, 100].map((mb) => {
                  const isCur = (question.config?.maxVideoSizeMb || 50) === mb;
                  return (
                    <button
                      key={mb}
                      type="button"
                      onClick={() =>
                        onChange({
                          config: { ...question.config, maxVideoSizeMb: mb },
                        })
                      }
                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-all ${
                        isCur
                          ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      {mb}MB
                    </button>
                  );
                })}
              </div>
            </div>

            {question.config?.videoUrl || question.config?.embedUrl ? (
              <div className="space-y-3">
                {(() => {
                  const videoTarget = question.config?.videoUrl || question.config?.embedUrl || '';
                  const parsed = getVideoEmbedUrl(videoTarget);
                  return (
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-md bg-black">
                      {parsed?.isDirectVideo ? (
                        <video
                          src={parsed.url}
                          controls
                          className="w-full max-h-80 mx-auto"
                        />
                      ) : (
                        <iframe
                          src={parsed?.url || videoTarget}
                          className="w-full aspect-video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="sr-only"
                        accept="video/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleVideoUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-semibold">
                        <Upload className="h-3.5 w-3.5" /> Replace video file
                      </span>
                    </label>
                    <span className="text-gray-300">•</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          config: {
                            ...question.config,
                            videoUrl: undefined,
                            embedUrl: undefined,
                            fileName: undefined,
                          },
                        })
                      }
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-purple-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/60 dark:bg-gray-800/40 group">
                  <input
                    type="file"
                    className="sr-only"
                    accept="video/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleVideoUpload(f);
                      e.target.value = '';
                    }}
                  />
                  {isUploadingVideo ? (
                    <div className="flex flex-col items-center gap-2 text-purple-600 py-2">
                      <Loader2 className="h-7 w-7 animate-spin" />
                      <span className="text-xs font-semibold">Uploading video...</span>
                    </div>
                  ) : (
                    <>
                      <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Video className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                        Click to upload a video (Max {question.config?.maxVideoSizeMb || 50} MB)
                      </span>
                      <span className="text-[11px] text-gray-400 mt-0.5">
                        MP4, WebM, MOV supported
                      </span>
                    </>
                  )}
                </label>

                {videoError && (
                  <p className="text-xs text-red-500 font-medium">{videoError}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-400 shrink-0">Or video URL:</span>
                  <Input
                    type="url"
                    placeholder="YouTube, Vimeo, or direct video link"
                    value={question.config?.embedUrl || question.config?.videoUrl || ''}
                    onChange={(e) =>
                      onChange({
                        config: {
                          ...question.config,
                          embedUrl: e.target.value,
                          videoUrl: e.target.value,
                        },
                      })
                    }
                    className="h-8 text-xs flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quiz Answer Key Drawer / Panel */}
        {isQuiz && showAnswerKey && (
          <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                  Answer Key & Scoring
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Points:</span>
                <Input
                  type="number"
                  min="0"
                  value={question.quizPoints || 0}
                  onChange={(e) => onChange({ quizPoints: parseInt(e.target.value, 10) || 0 })}
                  className="w-16 h-7 text-xs font-bold text-center"
                />
              </div>
            </div>

            {/* Choice selection for correct answers */}
            {isChoiceType && (
              <div>
                <p className="text-xs text-purple-700 dark:text-purple-300 mb-2 font-medium">
                  Select the correct answer(s):
                </p>
                <div className="space-y-1.5">
                  {question.options.map((opt, i) => {
                    const isCorrect =
                      qType === 'CHECKBOXES'
                        ? (question.quizAnswer?.correctValues || []).includes(opt.label)
                        : question.quizAnswer?.correctValue === opt.label;

                    return (
                      <div
                        key={i}
                        onClick={() => handleToggleCorrectOption(opt.label)}
                        className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer border text-xs font-medium transition-all ${
                          isCorrect
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 shadow-sm'
                            : 'bg-white dark:bg-gray-900 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <CheckCircle2
                          className={`h-4 w-4 ${isCorrect ? 'text-emerald-600' : 'text-gray-300'}`}
                        />
                        <span>{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Answer Explanation */}
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">
                Answer Feedback / Explanation (shown after submission)
              </label>
              <Input
                type="text"
                placeholder="Explain why this answer is correct..."
                value={question.quizExplanation || ''}
                onChange={(e) => onChange({ quizExplanation: e.target.value })}
                className="h-8 text-xs bg-white dark:bg-gray-900"
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAnswerKey(false)}
                className="h-7 text-xs bg-white text-purple-700"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Bottom Card Toolbar */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
          {/* Quiz Mode Trigger */}
          {isQuiz ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className="text-xs text-purple-600 hover:text-purple-700 h-8"
            >
              <Award className="h-3.5 w-3.5 mr-1.5" />
              Answer key ({question.quizPoints || 0} pts)
            </Button>
          ) : (
            <div />
          )}

          {/* Action Icons & Required Switch */}
          <div className="flex items-center gap-3">
            <button
              onClick={onDuplicate}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </button>

            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Delete question"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-gray-200 dark:border-gray-800 mx-1" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Required</span>
              <Switch
                checked={question.isRequired}
                onCheckedChange={(checked) => onChange({ isRequired: checked })}
              />
            </div>

            {/* Context menu for extra configs */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-gray-400 hover:text-gray-600 p-1 rounded-md">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuItem onClick={() => setShowDescription(!showDescription)}>
                  {showDescription ? 'Hide description' : 'Show description'}
                </DropdownMenuItem>
                {isChoiceType && (
                  <DropdownMenuItem onClick={() => setShowBranching(!showBranching)}>
                    {showBranching ? 'Hide section navigation' : 'Go to section based on answer'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
