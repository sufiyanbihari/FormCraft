'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Check,
  CheckCircle2,
  AlertCircle,
  Upload,
  Calendar,
  Clock,
  Star,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Award,
  Sparkles,
  RotateCcw,
  Phone,
  Hash,
  Image as ImageIcon,
  Globe,
  Mail,
  ExternalLink,
  X,
  Video,
  ShieldCheck,
  Lock,
  Database,
  Search,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { getVideoEmbedUrl, formatBytes, formatSizeMb, isLikelyImageSource, isLikelyVideoSource } from '@/lib/utils';
import { useAuth } from '@/lib/auth/useAuth';
import { uploadFile } from '@/lib/storage/clientUpload';

function isDarkColor(hexColor?: string): boolean {
  if (!hexColor || !hexColor.startsWith('#')) return true;
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return true;
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 155;
}

function PublicFormContent() {
  const params = useParams();
  const publicId = params.publicId as string;
  const { user } = useAuth();

  const [formData, setFormData] = useState<any>(null);
  const [isClosed, setIsClosed] = useState(false);
  const [closedReason, setClosedReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Authentication & respondent identity
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [respondentEmail, setRespondentEmail] = useState('');

  // Ensure body background is #004B6E
  useEffect(() => {
    const original = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#004B6E';
    return () => {
      document.body.style.backgroundColor = original;
    };
  }, []);

  // Sync client auth state if available
  useEffect(() => {
    if (user) {
      setIsAuthenticated(true);
      if (user.email) {
        setCurrentUserEmail(user.email);
        setRespondentEmail((prev) => prev || user.email);
      }
    }
  }, [user]);

  // Respondent answers: { [questionId: string]: any }
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [otherTextMap, setOtherTextMap] = useState<Record<string, string>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionHistory, setSectionHistory] = useState<number[]>([0]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string | null>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [brokenVideos, setBrokenVideos] = useState<Record<string, boolean>>({});
  const [brokenBanner, setBrokenBanner] = useState(false);

  // Dynamic Lookup & Autofill Engine State
  const [lookupDropdownOptions, setLookupDropdownOptions] = useState<
    Record<string, { label: string; value: string }[]>
  >({});
  const [loadingDropdowns, setLoadingDropdowns] = useState<Record<string, boolean>>({});
  const [lookupStatus, setLookupStatus] = useState<
    Record<string, { isLookingUp: boolean; error: string | null; matched: boolean }>
  >({});
  const lookupSeqRef = useRef<Record<string, number>>({});
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Repeatable Cattle Owners State
  interface CattleOwnerItem {
    id: string;
    ownerName: string;
    ownerMobile: string;
    largeCattleCount: string | number;
    smallCattleCount: string | number;
    flooringType: string;
    supplyDung: string;
  }

  const createInitialOwner = (): CattleOwnerItem => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `owner-${Date.now()}-${Math.random()}`,
    ownerName: '',
    ownerMobile: '',
    largeCattleCount: '',
    smallCattleCount: '',
    flooringType: '',
    supplyDung: '',
  });

  const [cattleOwners, setCattleOwners] = useState<CattleOwnerItem[]>([createInitialOwner()]);
  const [cattleOwnerErrors, setCattleOwnerErrors] = useState<Record<string, Record<string, string>>>({});

  const handleClearForm = () => {
    setAnswers({});
    setOtherTextMap({});
    setCattleOwners([createInitialOwner()]);
    setCattleOwnerErrors({});
    setShowClearConfirm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchPublicForm = async (showLoading = true) => {
    try {
      if (showLoading && !formData) setIsLoading(true);
      const res = await fetch(`/api/public/forms/${publicId}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok) {
        setIsClosed(true);
        setClosedReason(data.error || 'This form does not exist or has not been published.');
      } else {
        let loadedForm = data.form;
        if (loadedForm?.settings?.shuffleQuestions && loadedForm.sections) {
          loadedForm = {
            ...loadedForm,
            sections: loadedForm.sections.map((sec: any) => {
              const nonInteractiveTypes = ['SECTION_HEADER', 'TEXT_BLOCK', 'IMAGE_BLOCK', 'VIDEO_EMBED'];
              const headers = sec.questions.filter((q: any) => nonInteractiveTypes.includes(q.type));
              const interactive = sec.questions.filter((q: any) => !nonInteractiveTypes.includes(q.type));
              // Stable randomized order for this session
              const shuffled = [...interactive].sort(() => Math.random() - 0.5);
              return {
                ...sec,
                questions: [...headers, ...shuffled],
              };
            }),
          };
        }
        setFormData(loadedForm);
        setIsClosed(data.isClosed);
        setClosedReason(data.closedReason || '');
        if (data.isAuthenticated) {
          setIsAuthenticated(true);
        }
        if (data.currentUserEmail) {
          setCurrentUserEmail(data.currentUserEmail);
          setRespondentEmail(data.currentUserEmail);
        }
      }
    } catch (err) {
      setIsClosed(true);
      setClosedReason('Failed to load form. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicForm(true);
  }, [publicId]);

  // When tab regains focus, quietly check if user logged in via another tab WITHOUT re-fetching or unmounting the form
  useEffect(() => {
    const handleFocus = async () => {
      if (!isAuthenticated && formData?.settings?.requireAuth) {
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            if (data?.user) {
              setIsAuthenticated(true);
              if (data.user.email) {
                setCurrentUserEmail(data.user.email);
                setRespondentEmail((prev) => prev || data.user.email);
              }
            }
          }
        } catch {
          // Ignore background auth check failures
        }
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAuthenticated, formData?.settings?.requireAuth]);

  // Answer change handlers
  const handleAnswerChange = (qId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    setValidationError(null);
  };

  // Fetch dropdown options for all DROPDOWN lookup mappings
  useEffect(() => {
    if (!formData?.lookupMappings || !Array.isArray(formData.lookupMappings)) return;

    const allQuestions = (formData?.sections || []).flatMap((s: any) => s.questions || []);
    for (const mapping of formData.lookupMappings) {
      const targetQ = allQuestions.find((q: any) => q.id === mapping.triggerQuestionId);
      const isDropdown = mapping.lookupType === 'DROPDOWN' || targetQ?.type === 'DROPDOWN';
      if (isDropdown) {
        const qId = mapping.triggerQuestionId;
        setLoadingDropdowns((prev) => ({ ...prev, [qId]: true }));
        fetch(`/api/public/forms/${publicId}/lookup?action=options&mappingId=${mapping.id}&limit=250`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.options && data.options.length > 0) {
              setLookupDropdownOptions((prev) => ({
                ...prev,
                [qId]: data.options,
              }));
            }
          })
          .catch((err) => console.error('Failed to load dropdown options:', err))
          .finally(() => {
            setLoadingDropdowns((prev) => ({ ...prev, [qId]: false }));
          });
      }
    }
  }, [formData?.lookupMappings, formData?.sections, publicId]);

  // Execute lookup query and autofill dependent fields
  const triggerLookup = async (mapping: any, rawKey: string) => {
    const qId = mapping.triggerQuestionId;
    lookupSeqRef.current[qId] = (lookupSeqRef.current[qId] || 0) + 1;
    const seq = lookupSeqRef.current[qId];

    const trimmedKey = (rawKey || '').trim();
    if (!trimmedKey) {
      const cleared: Record<string, any> = {};
      for (const fm of mapping.mappings || []) {
        cleared[fm.targetQuestionId] = '';
      }
      setAnswers((prev) => ({ ...prev, ...cleared }));
      setLookupStatus((prev) => ({
        ...prev,
        [qId]: { isLookingUp: false, error: null, matched: false },
      }));
      return;
    }

    setLookupStatus((prev) => ({
      ...prev,
      [qId]: { isLookingUp: true, error: null, matched: false },
    }));

    try {
      const res = await fetch(
        `/api/public/forms/${publicId}/lookup?action=query&mappingId=${mapping.id}&key=${encodeURIComponent(
          trimmedKey
        )}`
      );
      if (seq !== lookupSeqRef.current[qId]) return;

      const data = await res.json();
      if (res.ok && data.found) {
        setAnswers((prev) => ({
          ...prev,
          ...data.data,
        }));
        setLookupStatus((prev) => ({
          ...prev,
          [qId]: { isLookingUp: false, error: null, matched: true },
        }));
      } else {
        const cleared: Record<string, any> = {};
        for (const fm of mapping.mappings || []) {
          cleared[fm.targetQuestionId] = '';
        }
        setAnswers((prev) => ({ ...prev, ...cleared }));
        setLookupStatus((prev) => ({
          ...prev,
          [qId]: {
            isLookingUp: false,
            error: data.noMatchMessage || mapping.noMatchMessage || 'No matching record found.',
            matched: false,
          },
        }));
      }
    } catch {
      if (seq !== lookupSeqRef.current[qId]) return;
      setLookupStatus((prev) => ({
        ...prev,
        [qId]: { isLookingUp: false, error: 'Network error during lookup', matched: false },
      }));
    }
  };

  const handleUniqueKeyTextChange = (mapping: any, val: string) => {
    const qId = mapping.triggerQuestionId;
    handleAnswerChange(qId, val);

    if (debounceTimerRef.current[qId]) {
      clearTimeout(debounceTimerRef.current[qId]);
    }

    debounceTimerRef.current[qId] = setTimeout(() => {
      triggerLookup(mapping, val);
    }, 350);
  };

  const getFieldLookupMeta = (questionId: string) => {
    const mappings = (formData?.lookupMappings as any[]) || [];
    for (const m of mappings) {
      const target = (m.mappings || []).find((fm: any) => fm.targetQuestionId === questionId);
      if (target) {
        return {
          isTarget: true,
          isReadOnly: Boolean(target.isReadOnly),
          column: target.column,
          triggerQuestionId: m.triggerQuestionId,
        };
      }
    }
    return { isTarget: false, isReadOnly: false };
  };

  const handleCheckboxToggle = (qId: string, optLabel: string) => {
    const current: string[] = Array.isArray(answers[qId]) ? answers[qId] : [];
    const updated = current.includes(optLabel)
      ? current.filter((v) => v !== optLabel)
      : [...current, optLabel];
    handleAnswerChange(qId, updated);
  };

  const handleGridChange = (qId: string, row: string, col: string) => {
    const current = answers[qId] || {};
    handleAnswerChange(qId, { ...current, [row]: col });
  };

  const isFileTypeAllowed = (file: File, allowedTypes?: string[]) => {
    if (!allowedTypes || allowedTypes.length === 0) return true;
    const name = (file.name || '').toLowerCase();
    const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
    const mime = (file.type || '').toLowerCase();

    return allowedTypes.some((raw) => {
      if (!raw) return true;
      const target = raw.trim().toLowerCase();
      if (target === '*/*' || target === '*') return true;

      // 1. Images (including mobile camera HEIC/HEIF)
      if (target === 'image/*' || target.includes('image')) {
        if (mime.startsWith('image/')) return true;
        if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tif|tiff|heic|heif|avif)$/i.test(name)) return true;
      }

      // 2. Videos
      if (target === 'video/*' || target.includes('video')) {
        if (mime.startsWith('video/')) return true;
        if (/\.(mp4|webm|mov|avi|mkv|m4v|wmv|flv|3gp)$/i.test(name)) return true;
      }

      // 3. Audio
      if (target === 'audio/*' || target.includes('audio')) {
        if (mime.startsWith('audio/')) return true;
        if (/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i.test(name)) return true;
      }

      // 4. PDF
      if (target === 'application/pdf' || target === '.pdf' || target === 'pdf') {
        if (mime === 'application/pdf' || mime.includes('pdf') || ext === '.pdf') return true;
      }

      // 5. Documents (Word, etc.)
      if (target.includes('doc') || target.includes('word')) {
        if (ext === '.doc' || ext === '.docx' || mime.includes('word') || mime.includes('officedocument.wordprocessingml')) return true;
      }

      // 6. Spreadsheets (Excel, CSV)
      if (target.includes('xls') || target.includes('csv') || target.includes('sheet')) {
        if (['.xls', '.xlsx', '.csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) return true;
      }

      // 7. General comma-separated or individual extensions
      const parts = target.split(',').map((p) => p.trim());
      for (const p of parts) {
        if (p.startsWith('.') && p === ext) return true;
        if (p && !p.startsWith('.') && !p.includes('/') && '.' + p === ext) return true;
        if (mime && p === mime) return true;
      }

      return false;
    });
  };

  const getAcceptAttribute = (allowedTypes?: string[]) => {
    if (!allowedTypes || allowedTypes.length === 0) return undefined;
    const acceptList: string[] = [];

    for (const raw of allowedTypes) {
      const target = raw.trim().toLowerCase();
      if (target === 'image/*' || target.includes('image')) {
        acceptList.push('image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.svg');
      } else if (target === 'video/*' || target.includes('video')) {
        acceptList.push('video/*,.mp4,.mov,.webm,.avi');
      } else if (target === 'audio/*' || target.includes('audio')) {
        acceptList.push('audio/*,.mp3,.wav,.m4a,.aac');
      } else if (target === 'application/pdf' || target === '.pdf' || target === 'pdf') {
        acceptList.push('.pdf,application/pdf');
      } else if (target.includes('doc')) {
        acceptList.push('.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else if (target.includes('xls') || target.includes('sheet') || target.includes('csv')) {
        acceptList.push('.xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        acceptList.push(raw);
      }
    }

    return acceptList.join(',');
  };

  const handleFileUpload = async (qId: string, file: File, targetInput?: HTMLInputElement) => {
    if (!file) return;

    console.log('[FormCraft File Upload] Selected file:', file.name, 'size:', file.size, 'type:', file.type);

    const allQuestions = formData?.sections?.flatMap((s: any) => s.questions) || [];
    const q = allQuestions.find((item: any) => item.id === qId);
    const maxMb = q?.config?.maxFileSizeMb || 10;
    const maxBytes = maxMb * 1024 * 1024;

    setFileErrors((prev) => ({ ...prev, [qId]: null }));

    if (file.size > maxBytes) {
      const msg = `File "${file.name}" (${formatBytes(file.size)}) exceeds maximum allowed size of ${formatSizeMb(maxMb)}.`;
      console.warn('[FormCraft File Upload] Size limit exceeded:', msg);
      setFileErrors((prev) => ({ ...prev, [qId]: msg }));
      if (targetInput) targetInput.value = '';
      return;
    }

    const allowedTypes = q?.config?.allowedFileTypes as string[] | undefined;
    if (!isFileTypeAllowed(file, allowedTypes)) {
      const allowedStr = allowedTypes && allowedTypes.length > 0 ? allowedTypes.join(', ') : 'valid formats';
      const msg = `File "${file.name}" is not an accepted format for this question. Accepted: ${allowedStr}.`;
      console.warn('[FormCraft File Upload] Type not allowed:', msg);
      setFileErrors((prev) => ({ ...prev, [qId]: msg }));
      if (targetInput) targetInput.value = '';
      return;
    }

    setUploadingFiles((prev) => ({ ...prev, [qId]: true }));
    setFileErrors((prev) => ({ ...prev, [qId]: null }));

    try {
      console.log('[FormCraft File Upload] Initiating upload via universal uploadFile...');
      const data = await uploadFile(file, {
        formId: formData?.id,
        maxSizeMb: maxMb,
      });

      console.log('[FormCraft File Upload] Upload succeeded:', data);

      handleAnswerChange(qId, {
        fileName: data.fileName || file.name,
        fileSize: data.fileSize || file.size,
        mimeType: data.mimeType || file.type,
        publicUrl: data.publicUrl,
      });
      setFileErrors((prev) => ({ ...prev, [qId]: null }));
    } catch (err: any) {
      console.error('[FormCraft File Upload] Upload failed:', err);
      setFileErrors((prev) => ({
        ...prev,
        [qId]: err?.message || 'File upload failed. Please check your connection and try again.',
      }));
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [qId]: false }));
      if (targetInput) {
        targetInput.value = '';
      }
    }
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 transition-colors"
        style={{ backgroundColor: '#004B6E' }}
      >
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm font-medium text-sky-100">Loading form...</p>
        </div>
      </div>
    );
  }

  if (isClosed || !formData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 transition-colors"
        style={{ backgroundColor: '#004B6E' }}
      >
        <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 mx-auto flex items-center justify-center shadow-sm">
            <Clock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Form Closed
          </h2>
          <p className="text-sm text-gray-500">{closedReason}</p>
        </div>
      </div>
    );
  }

  const { theme, sections, settings } = formData;
  const currentSection = sections[currentSectionIndex] || sections[0];
  const isLastSection = currentSectionIndex === sections.length - 1;
  const questionsInCurrentSection = currentSection.questions || [];

  const isCattleSurvey = Boolean(
    formData?.title?.includes('Cattle Owner') ||
    formData?.title?.includes('પશુપાલન') ||
    (
      formData?.sections?.some((s: any) =>
        s.questions?.some((q: any) => q.title?.includes('Cattle Owner') || q.title?.includes('પશુ માલિકનું'))
      ) &&
      formData?.sections?.some((s: any) =>
        s.questions?.some((q: any) => q.title?.includes('Surveyor') || q.title?.includes('સર્વે કરનાર'))
      )
    )
  );

  const allFormQuestions = (formData?.sections || []).flatMap((s: any) => s.questions || []);

  const societyQuestions = allFormQuestions.filter((q: any) =>
    q.title.includes('Society') ||
    q.title.includes('મંડળી') ||
    q.title.includes('Taluka') ||
    q.title.includes('તાલુકો') ||
    q.title.includes('District') ||
    q.title.includes('જીલ્લો')
  );

  const surveyorQuestions = allFormQuestions.filter((q: any) =>
    q.title.includes('Surveyor') || q.title.includes('સર્વે કરનાર')
  );

  const ownerNameQ = allFormQuestions.find((q: any) =>
    q.title.includes('Cattle Owner Full Name') || q.title.includes('પશુ માલિકનું પૂરું નામ')
  );
  const ownerMobileQ = allFormQuestions.find((q: any) =>
    (q.title.includes('Owner Mobile') || q.title.includes('માલિકનો મોબાઇલ')) && !q.title.includes('Surveyor')
  );
  const largeCattleQ = allFormQuestions.find((q: any) =>
    q.title.includes('Large Cattle') || q.title.includes('મોટા પશુ')
  );
  const smallCattleQ = allFormQuestions.find((q: any) =>
    q.title.includes('Small Cattle') || q.title.includes('નાના પશુ')
  );
  const flooringQ = allFormQuestions.find((q: any) =>
    q.title.includes('Flooring') || q.title.includes('ભોંયતળિયું')
  );
  const dungQ = allFormQuestions.find((q: any) =>
    q.title.includes('Supply Dung') || q.title.includes('છાણ આપવા')
  );

  const handleOwnerFieldChange = (ownerId: string, field: keyof CattleOwnerItem, value: any) => {
    setCattleOwners((prev) =>
      prev.map((item) => (item.id === ownerId ? { ...item, [field]: value } : item))
    );
    if (cattleOwnerErrors[ownerId]?.[field]) {
      setCattleOwnerErrors((prev) => {
        const copy = { ...prev };
        if (copy[ownerId]) {
          const ownerCopy = { ...copy[ownerId] };
          delete ownerCopy[field];
          copy[ownerId] = ownerCopy;
        }
        return copy;
      });
    }
  };

  const handleAddOwner = () => {
    setCattleOwners((prev) => [...prev, createInitialOwner()]);
  };

  const handleRemoveOwner = (ownerId: string) => {
    if (cattleOwners.length <= 1) return;
    setCattleOwners((prev) => prev.filter((item) => item.id !== ownerId));
    setCattleOwnerErrors((prev) => {
      const copy = { ...prev };
      delete copy[ownerId];
      return copy;
    });
  };

  const validateCattleSurvey = () => {
    if (formData?.settings?.collectEmail) {
      const cleanEmail = respondentEmail.trim();
      if (!cleanEmail) {
        setValidationError('Please enter your email address to continue.');
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setValidationError('Please enter a valid email address.');
        return false;
      }
    }

    if (formData?.settings?.requireAuth && !isAuthenticated) {
      setValidationError('Sign-in required: You must be signed in to submit this form.');
      return false;
    }

    // 1. Validate Society Questions
    for (const q of societyQuestions) {
      const val = answers[q.id];
      if (q.isRequired && (!val || String(val).trim() === '')) {
        setValidationError(`"${q.title}" is required.`);
        return false;
      }
    }

    // 2. Validate Surveyor Questions
    for (const q of surveyorQuestions) {
      const val = answers[q.id];
      if (q.isRequired && (!val || String(val).trim() === '')) {
        setValidationError(`"${q.title}" is required.`);
        return false;
      }
      if (q.type === 'PHONE' && val) {
        const digits = String(val).replace(/\D/g, '');
        if (digits.length !== 10) {
          setValidationError(`"${q.title}" requires a valid 10-digit mobile number.`);
          return false;
        }
      }
    }

    // 3. Validate each Cattle Owner independently
    const newErrors: Record<string, Record<string, string>> = {};
    let hasOwnerErrors = false;

    cattleOwners.forEach((owner, idx) => {
      const errs: Record<string, string> = {};

      if (!owner.ownerName || !owner.ownerName.trim()) {
        errs.ownerName = 'Cattle Owner Full Name is required (પશુ માલિકનું પૂરું નામ જરૂરી છે).';
        hasOwnerErrors = true;
      }

      const cleanMobile = (owner.ownerMobile || '').replace(/\D/g, '');
      if (!cleanMobile) {
        errs.ownerMobile = 'Owner Mobile Number is required (માલિકનો મોબાઇલ નં. જરૂરી છે).';
        hasOwnerErrors = true;
      } else if (cleanMobile.length !== 10) {
        errs.ownerMobile = 'Mobile Number must be exactly 10 digits (મોબાઇલ નં. પૂરા ૧૦ અંક હોવો જોઈએ).';
        hasOwnerErrors = true;
      }

      if (owner.largeCattleCount === '' || owner.largeCattleCount === undefined || isNaN(Number(owner.largeCattleCount)) || Number(owner.largeCattleCount) < 0) {
        errs.largeCattleCount = 'Valid non-negative count required (મોટા પશુઓની સંખ્યા જરૂરી છે).';
        hasOwnerErrors = true;
      }

      if (owner.smallCattleCount === '' || owner.smallCattleCount === undefined || isNaN(Number(owner.smallCattleCount)) || Number(owner.smallCattleCount) < 0) {
        errs.smallCattleCount = 'Valid non-negative count required (નાના પશુઓની સંખ્યા જરૂરી છે).';
        hasOwnerErrors = true;
      }

      if (!owner.flooringType || !owner.flooringType.trim()) {
        errs.flooringType = 'Please select flooring type (ભોંયતળિયું પસંદ કરવું જરૂરી છે).';
        hasOwnerErrors = true;
      }

      if (!owner.supplyDung || !owner.supplyDung.trim()) {
        errs.supplyDung = 'Please select dung supply agreement (છાણ આપવા સંમતિ જરૂરી છે).';
        hasOwnerErrors = true;
      }

      if (Object.keys(errs).length > 0) {
        newErrors[owner.id] = errs;
      }
    });

    setCattleOwnerErrors(newErrors);

    if (hasOwnerErrors) {
      setValidationError('Please correct the errors in the Cattle Owner section(s) before submitting.');
      return false;
    }

    return true;
  };

  // Validate required questions and formats in current section before moving forward
  const validateCurrentSection = () => {
    // If collectEmail is enabled, require valid email address
    if (formData?.settings?.collectEmail) {
      const cleanEmail = respondentEmail.trim();
      if (!cleanEmail) {
        setValidationError('Please enter your email address to continue.');
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setValidationError('Please enter a valid email address.');
        return false;
      }
    }

    // If requireAuth is enabled and user is not signed in
    if (formData?.settings?.requireAuth && !isAuthenticated) {
      setValidationError('Sign-in required: You must be signed in to submit this form.');
      return false;
    }

    for (const q of questionsInCurrentSection) {
      // Non-interactive block types don't require validation
      if (q.type === 'SECTION_HEADER' || q.type === 'TEXT_BLOCK' || q.type === 'IMAGE_BLOCK' || q.type === 'VIDEO_EMBED') {
        continue;
      }

      const ans = answers[q.id];
      const isEmpty =
        ans === undefined ||
        ans === null ||
        ans === '' ||
        (Array.isArray(ans) && ans.length === 0);

      if (q.isRequired && isEmpty) {
        setValidationError(`"${q.title}" is required.`);
        return false;
      }

      // Format validations when an answer is provided
      if (!isEmpty) {
        if (q.type === 'NUMBER') {
          const strVal = String(ans).trim();
          if (isNaN(Number(strVal)) || !/^-?\d+(\.\d+)?$/.test(strVal)) {
            setValidationError(`Please enter a valid number without characters for "${q.title}".`);
            return false;
          }
          const num = Number(strVal);
          if (q.validation?.minVal !== undefined && num < q.validation.minVal) {
            setValidationError(`"${q.title}" must be at least ${q.validation.minVal}.`);
            return false;
          }
          if (q.validation?.maxVal !== undefined && num > q.validation.maxVal) {
            setValidationError(`"${q.title}" must be at most ${q.validation.maxVal}.`);
            return false;
          }
        } else if (q.type === 'PHONE') {
          const digits = String(ans).replace(/\D/g, '');
          if (digits.length < 10) {
            setValidationError(`Please enter a valid phone number with at least 10 digits for "${q.title}".`);
            return false;
          }
          if (digits.length > 15) {
            setValidationError(`Phone number cannot exceed 15 digits for "${q.title}".`);
            return false;
          }
        } else if (q.type === 'DATE') {
          const strVal = String(ans).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(strVal) || isNaN(Date.parse(strVal))) {
            setValidationError(`Please select a valid date (YYYY-MM-DD) for "${q.title}".`);
            return false;
          }
        } else if (q.type === 'TIME') {
          const strVal = String(ans).trim();
          if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(strVal)) {
            setValidationError(`Please enter a valid time (HH:MM) for "${q.title}".`);
            return false;
          }
        } else if (q.type === 'EMAIL') {
          const strVal = String(ans).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
            setValidationError(`Please enter a valid email address for "${q.title}".`);
            return false;
          }
        } else if (q.type === 'FILE_UPLOAD') {
          if (q.isRequired && (!ans || !ans.publicUrl)) {
            setValidationError(`Please upload a file for "${q.title}".`);
            return false;
          }
        }
      }
    }
    return true;
  };

  // Next Section / Branching navigation
  const handleNext = () => {
    if (!validateCurrentSection()) return;

    // Check if any question has conditional section routing
    let targetSectionId: string | null = null;
    for (const q of questionsInCurrentSection) {
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'DROPDOWN') {
        const selectedVal = answers[q.id];
        const matchingOpt = q.options?.find((o: any) => o.label === selectedVal);
        if (matchingOpt?.goToSectionId) {
          targetSectionId = matchingOpt.goToSectionId;
          break;
        }
      }
    }

    if (targetSectionId === 'SUBMIT') {
      handleSubmit();
      return;
    }

    if (targetSectionId) {
      const targetIdx = sections.findIndex((s: any) => s.id === targetSectionId);
      if (targetIdx !== -1) {
        setSectionHistory((prev) => [...prev, targetIdx]);
        setCurrentSectionIndex(targetIdx);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // Otherwise check section's nextSectionId rule
    if (currentSection.nextSectionId === 'SUBMIT') {
      handleSubmit();
      return;
    }

    if (currentSection.nextSectionId && currentSection.nextSectionId !== 'NEXT') {
      const targetIdx = sections.findIndex((s: any) => s.id === currentSection.nextSectionId);
      if (targetIdx !== -1) {
        setSectionHistory((prev) => [...prev, targetIdx]);
        setCurrentSectionIndex(targetIdx);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // Default to next linear section
    if (currentSectionIndex < sections.length - 1) {
      setSectionHistory((prev) => [...prev, currentSectionIndex + 1]);
      setCurrentSectionIndex(currentSectionIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (sectionHistory.length > 1) {
      const newHistory = [...sectionHistory];
      newHistory.pop();
      const prevIdx = newHistory[newHistory.length - 1];
      setSectionHistory(newHistory);
      setCurrentSectionIndex(prevIdx);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Submit Form
  const handleSubmit = async () => {
    if (isCattleSurvey) {
      if (!validateCattleSurvey()) return;
    } else {
      if (!validateCurrentSection()) return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    const formattedAnswers = Object.entries(answers).map(([questionId, value]) => ({
      questionId,
      value,
    }));

    // If cattle survey, ensure owner 1's fields are in formattedAnswers for backward compatibility
    if (isCattleSurvey && cattleOwners.length > 0) {
      const first = cattleOwners[0];
      const setOrUpdate = (q: any, val: any) => {
        if (!q) return;
        const existing = formattedAnswers.find((a) => a.questionId === q.id);
        if (existing) {
          existing.value = val;
        } else {
          formattedAnswers.push({ questionId: q.id, value: val });
        }
      };
      setOrUpdate(ownerNameQ, first.ownerName);
      setOrUpdate(ownerMobileQ, first.ownerMobile);
      setOrUpdate(largeCattleQ, Number(first.largeCattleCount) || 0);
      setOrUpdate(smallCattleQ, Number(first.smallCattleCount) || 0);
      setOrUpdate(flooringQ, first.flooringType);
      setOrUpdate(dungQ, first.supplyDung);
    }

    const payloadCattleOwners = isCattleSurvey
      ? cattleOwners.map((o) => ({
          id: o.id,
          ownerName: o.ownerName.trim(),
          ownerMobile: o.ownerMobile.trim(),
          largeCattleCount: Math.max(0, Math.floor(Number(o.largeCattleCount) || 0)),
          smallCattleCount: Math.max(0, Math.floor(Number(o.smallCattleCount) || 0)),
          flooringType: o.flooringType.trim(),
          supplyDung: o.supplyDung.trim(),
        }))
      : undefined;

    try {
      const res = await fetch(`/api/public/forms/${publicId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: formattedAnswers,
          cattleOwners: payloadCattleOwners,
          respondentEmail: respondentEmail.trim() || undefined,
          idempotencyKey: `${publicId}-${Date.now()}-${Math.random()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setValidationError(data.error || 'Failed to submit response');
      } else {
        setIsSubmitted(true);
        setSubmissionResult(data);
        // Trigger celebratory confetti!
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch {
      setValidationError('Failed to submit response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submitted Success Screen
  if (isSubmitted) {
    const effectiveBg =
      theme.backgroundColor && theme.backgroundColor !== '#f0ebf8'
        ? theme.backgroundColor
        : '#004B6E';

    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 transition-colors"
        style={{
          backgroundColor: effectiveBg,
          fontFamily: theme.fontFamily || 'Inter',
        }}
      >
        <div
          className={`max-w-lg w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 shadow-xl text-center space-y-6 ${
            theme.borderRadius || 'rounded-2xl'
          }`}
        >
          {/* Top banner color */}
          <div
            className="h-2.5 -mx-8 -mt-8 rounded-t-2xl mb-6"
            style={{ backgroundColor: theme.primaryColor || '#673ab7' }}
          />

          <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-md shadow-emerald-500/20">
            <CheckCircle2 className="h-9 w-9" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
              {formData.title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              {submissionResult?.message ||
                settings?.confirmationMessage ||
                'Your response has been recorded.'}
            </p>
          </div>

          {/* Delayed Grade Release Message */}
          {submissionResult?.isGradeReleased === false && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold">
                <Clock className="h-4 w-4" />
                <span>Grades Under Review</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Your response has been saved. Your final grade and feedback will be released by the instructor after manual review.
              </p>
            </div>
          )}

          {/* Quiz Score Box & Details */}
          {submissionResult?.score && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 text-center">
                <div className="flex items-center justify-center gap-1.5 text-purple-700 dark:text-purple-300 text-xs font-semibold mb-1">
                  <Award className="h-4 w-4" />
                  <span>Quiz Score</span>
                </div>
                <p className="text-3xl font-black text-purple-900 dark:text-purple-100">
                  {submissionResult.score.total}{' '}
                  <span className="text-lg font-semibold text-gray-400">
                    / {submissionResult.score.max} pts ({submissionResult.score.percentage ?? 0}%)
                  </span>
                </p>

                {/* Pass/Fail Status Banner */}
                {submissionResult.score.isPassed !== null && submissionResult.score.isPassed !== undefined && (
                  <div className="mt-2.5 pt-2.5 border-t border-purple-200/60 dark:border-purple-800/60">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                        submissionResult.score.isPassed
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                      }`}
                    >
                      {submissionResult.score.isPassed ? 'PASSED' : 'NOT PASSED'}
                    </span>
                    {submissionResult.score.customMessage && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 font-medium">
                        {submissionResult.score.customMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Question-level Review Breakdown */}
              {submissionResult.score.breakdown && submissionResult.score.breakdown.length > 0 && (
                <div className="text-left space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Question Review
                  </h4>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {submissionResult.score.breakdown.map((item: any, iIdx: number) => (
                      <div
                        key={iIdx}
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          item.isCorrect
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {item.questionTitle || `Question ${iIdx + 1}`}
                          </span>
                          {item.score !== undefined && (
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                item.isCorrect
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {item.score} / {item.maxPoints} pts
                            </span>
                          )}
                        </div>

                        <div>
                          <span className="text-gray-400">Your answer: </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {Array.isArray(item.submittedValue)
                              ? item.submittedValue.join(', ')
                              : String(item.submittedValue ?? 'None')}
                          </span>
                        </div>

                        {item.correctAnswer !== undefined && !item.isCorrect && (
                          <div className="text-emerald-700 dark:text-emerald-300">
                            <span className="font-semibold">Correct answer: </span>
                            <span>
                              {Array.isArray(item.correctAnswer)
                                ? item.correctAnswer.join(', ')
                                : typeof item.correctAnswer === 'object' && item.correctAnswer !== null
                                  ? JSON.stringify(item.correctAnswer)
                                  : String(item.correctAnswer)}
                            </span>
                          </div>
                        )}

                        {item.feedback && (
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 italic bg-white/70 dark:bg-gray-900/60 p-1.5 rounded">
                            💬 Feedback: {item.feedback}
                          </p>
                        )}

                        {item.explanation && (
                          <p className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50/70 dark:bg-purple-950/30 p-1.5 rounded">
                            💡 Explanation: {item.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Link to submit another response if not restricted */}
          {!settings?.restrictOneResponse && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnswers({});
                setOtherTextMap({});
                if (!currentUserEmail) {
                  setRespondentEmail('');
                }
                setIsSubmitted(false);
                setCurrentSectionIndex(0);
                setSectionHistory([0]);
              }}
              className="text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Submit another response
            </Button>
          )}

          <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
            <img
              src="/logo.png"
              alt="FormCraft"
              className="h-6 w-auto object-contain"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              FormCraft – Digital Form Builder &amp; Management Platform
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Progress Percentage
  const progressPercentage = Math.round(
    ((currentSectionIndex + 1) / sections.length) * 100
  );

  const effectiveBg =
    !theme.backgroundColor ||
    theme.backgroundColor.trim() === '' ||
    theme.backgroundColor.toLowerCase() === '#f0ebf8'
      ? '#004B6E'
      : theme.backgroundColor;

  const isDarkBg = isDarkColor(effectiveBg);

  const isPrimarySameAsBg =
    theme.primaryColor &&
    effectiveBg &&
    theme.primaryColor.toLowerCase().trim() === effectiveBg.toLowerCase().trim();

  const submitButtonBg = isPrimarySameAsBg
    ? (isDarkBg ? '#0284c7' : '#004B6E')
    : (theme.primaryColor || '#004B6E');

  return (
    <div
      className="min-h-screen py-10 pb-20 px-4 transition-colors"
      style={{
        backgroundColor: effectiveBg,
        fontFamily: theme.fontFamily || 'Inter',
      }}
    >
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Form Title & Banner Card */}
        <div
          className={`bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm ${
            theme.borderRadius || 'rounded-xl'
          }`}
        >
          {Boolean(theme.headerImageUrl && isLikelyImageSource(theme.headerImageUrl)) && !brokenBanner ? (
            <div className="w-full overflow-hidden relative bg-white border-b border-gray-100 dark:border-gray-800">
              <img
                src={theme.headerImageUrl!}
                alt="Form Banner"
                onError={() => setBrokenBanner(true)}
                className="w-full h-auto object-cover max-h-56"
              />
            </div>
          ) : (
            <div
              className="h-2.5 w-full"
              style={{ backgroundColor: theme.primaryColor || '#004B6E' }}
            />
          )}

          <div className="p-6 sm:p-8 space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              {formData.title}
            </h1>
            {formData.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed">
                {formData.description}
              </p>
            )}
            {sections.length > 1 && !isCattleSurvey && (
              <div className="pt-2 text-xs font-semibold text-purple-600">
                Section {currentSectionIndex + 1} of {sections.length}: {currentSection.title}
              </div>
            )}
          </div>
        </div>

        {/* Require Sign-in Notice Banner */}
        {formData.settings?.requireAuth && !isAuthenticated && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-200">
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-sm">Sign-in Required</p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  You must be signed in with a FormCraft account to submit this form.
                </p>
              </div>
            </div>
            <a
              href={`/login?redirect=/f/${publicId}`}
              className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 transition-colors shadow-sm"
            >
              Sign In to Continue
            </a>
          </div>
        )}

        {/* Email Collection Card */}
        {formData.settings?.collectEmail && (
          <div
            className={`bg-white dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3 ${
              theme.borderRadius || 'rounded-2xl'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-purple-600" />
                <span>Email address</span>
                <span className="text-red-500 font-bold">*</span>
              </label>
              {currentUserEmail && (
                <span className="text-[11px] text-gray-400">
                  Signed in as {currentUserEmail}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              The form owner requires a valid email address with your response.
            </p>
            <Input
              type="email"
              placeholder="your.email@example.com"
              value={respondentEmail}
              onChange={(e) => {
                setRespondentEmail(e.target.value);
                setValidationError(null);
              }}
              className="h-10 text-sm max-w-md"
            />
          </div>
        )}

        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-red-600 dark:text-red-400 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
            {formData?.settings?.requireAuth && !isAuthenticated && (
              <a
                href={`/login?redirect=/f/${publicId}`}
                className="underline font-bold text-red-700 dark:text-red-300 hover:opacity-80 shrink-0 self-start sm:self-auto"
              >
                Sign in now
              </a>
            )}
          </div>
        )}

        {/* Questions in Current Section or Cattle Survey */}
        {(() => {
          const renderQuestionCard = (q: any) => {
            const val = answers[q.id];
            const lookupMeta = getFieldLookupMeta(q.id);
            const triggerMapping = (formData?.lookupMappings || []).find((m: any) => m.triggerQuestionId === q.id);

          return (
            <div
              key={q.id}
              className={`bg-white dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4 ${
                theme.borderRadius || 'rounded-xl'
              }`}
            >
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                  {q.title}{' '}
                  {q.isRequired && <span className="text-red-500 font-bold">*</span>}
                </h3>
                {q.description && (
                  <p className="text-xs text-gray-500 mt-1">{q.description}</p>
                )}
                {formData.isQuiz && q.quizPoints > 0 && (
                  <span className="inline-block mt-1 text-[11px] font-bold text-purple-600">
                    {q.quizPoints} {q.quizPoints === 1 ? 'point' : 'points'}
                  </span>
                )}

                {/* Inline Question Image (if configured on standard question types) */}
                {q.config?.imageUrl && q.type !== 'IMAGE_BLOCK' && (
                  <div
                    className={`pt-2 flex flex-col ${
                      q.config.imageAlignment === 'left'
                        ? 'items-start'
                        : q.config.imageAlignment === 'right'
                          ? 'items-end'
                          : 'items-center'
                    }`}
                  >
                    <img
                      src={q.config.imageUrl}
                      alt={q.config.imageAlt || q.title || 'Question image'}
                      className="rounded-xl max-h-80 w-auto max-w-full object-contain border border-gray-200 dark:border-gray-800 shadow-sm"
                    />
                  </div>
                )}

                {/* Autofill / Target Indicator Badge */}
                {lookupMeta.isTarget && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {lookupMeta.isReadOnly ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/50">
                        <Lock className="h-3 w-3" /> Autofilled from dataset (Locked)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/50">
                        <Sparkles className="h-3 w-3" /> Autofilled from dataset (Editable)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* INPUT RENDERERS */}

              {/* 1. Short Answer */}
              {q.type === 'SHORT_ANSWER' && (
                triggerMapping && triggerMapping.lookupType === 'TEXT_KEY' ? (
                  <div className="space-y-1.5 max-w-md">
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 h-4 w-4 text-gray-400 select-none pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="Enter unique key to lookup (e.g. ID, code)..."
                        value={val || ''}
                        onChange={(e) => handleUniqueKeyTextChange(triggerMapping, e.target.value)}
                        onBlur={() => triggerLookup(triggerMapping, val || '')}
                        className="pl-9 pr-9 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:border-purple-600 focus:ring-0"
                      />
                      {lookupStatus[q.id]?.isLookingUp && (
                        <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-blue-600 pointer-events-none" />
                      )}
                      {lookupStatus[q.id]?.matched && !lookupStatus[q.id]?.isLookingUp && (
                        <CheckCircle2 className="absolute right-3 h-4 w-4 text-emerald-600 pointer-events-none" />
                      )}
                    </div>
                    {lookupStatus[q.id]?.matched && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <Check className="h-3 w-3" /> Record matched. Dependent fields autofilled below.
                      </p>
                    )}
                    {lookupStatus[q.id]?.error && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium">
                        <AlertCircle className="h-3 w-3" /> {lookupStatus[q.id]?.error}
                      </p>
                    )}
                  </div>
                ) : (
                  <Input
                    type="text"
                    placeholder={lookupMeta.isReadOnly ? 'Auto-filled upon lookup' : 'Your answer'}
                    value={val || ''}
                    readOnly={lookupMeta.isReadOnly}
                    disabled={lookupMeta.isReadOnly}
                    onChange={(e) => !lookupMeta.isReadOnly && handleAnswerChange(q.id, e.target.value)}
                    className={`max-w-md h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none px-1 focus:border-purple-600 focus:ring-0 ${
                      lookupMeta.isReadOnly
                        ? 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 cursor-not-allowed font-medium border-amber-200'
                        : ''
                    }`}
                  />
                )
              )}

              {/* 2. Number: Strictly prevent non-numeric characters */}
              {q.type === 'NUMBER' && (
                <div className="space-y-1.5 max-w-md">
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm font-bold text-purple-600 select-none">
                      #
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 42 or 3.14"
                      value={val ?? ''}
                      onKeyDown={(e) => {
                        // Allow navigation, delete, backspace, tab, shortcuts
                        if (
                          ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
                          (e.ctrlKey || e.metaKey)
                        ) {
                          return;
                        }
                        // Allow digits 0-9
                        if (/^[0-9]$/.test(e.key)) return;
                        // Allow minus sign at first position
                        if (e.key === '-' && (!e.currentTarget.value || e.currentTarget.selectionStart === 0)) return;
                        // Allow single decimal point
                        if (e.key === '.' && !e.currentTarget.value.includes('.')) return;
                        // Block all other keys (letters, symbols)
                        e.preventDefault();
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Strip any character that is not a digit, minus, or dot
                        let sanitized = raw.replace(/[^0-9.-]/g, '');
                        // Ensure at most one minus sign at start
                        if (sanitized.indexOf('-') > 0) {
                          sanitized = sanitized[0] === '-' ? '-' + sanitized.slice(1).replace(/-/g, '') : sanitized.replace(/-/g, '');
                        }
                        // Ensure at most one dot
                        const parts = sanitized.split('.');
                        if (parts.length > 2) {
                          sanitized = parts[0] + '.' + parts.slice(1).join('');
                        }
                        handleAnswerChange(q.id, sanitized);
                      }}
                      className="pl-8 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:border-purple-600 focus:ring-0"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Numbers only (integers or decimals)</span>
                    {q.validation?.minVal !== undefined && (
                      <span>Min: {q.validation.minVal}</span>
                    )}
                    {q.validation?.maxVal !== undefined && (
                      <span>Max: {q.validation.maxVal}</span>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Phone: Strictly validate phone characters and length */}
              {q.type === 'PHONE' && (
                <div className="space-y-1.5 max-w-md">
                  <div className="relative flex items-center">
                    <Phone className="absolute left-3 h-4 w-4 text-purple-600 select-none pointer-events-none" />
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="e.g. +91 98765 43210 or 10-digit number"
                      value={val ?? ''}
                      onKeyDown={(e) => {
                        if (
                          ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
                          (e.ctrlKey || e.metaKey)
                        ) {
                          return;
                        }
                        // Allow digits, +, -, (, ), space
                        if (/^[0-9+\-()\s]$/.test(e.key)) return;
                        // Block alphabet characters and invalid symbols
                        e.preventDefault();
                      }}
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(/[^0-9+\-()\s]/g, '');
                        handleAnswerChange(q.id, sanitized);
                      }}
                      className="pl-9 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:border-purple-600 focus:ring-0"
                    />
                  </div>
                  {(() => {
                    const digits = (String(val) || '').replace(/\D/g, '');
                    if (!digits) {
                      return (
                        <p className="text-[11px] text-gray-400">
                          Please enter a valid 10 to 15 digit mobile or telephone number
                        </p>
                      );
                    }
                    if (digits.length < 10) {
                      return (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          {digits.length}/10 digits entered — minimum 10 digits required (cannot be 1 or 2 digits)
                        </p>
                      );
                    }
                    if (digits.length > 15) {
                      return (
                        <p className="text-[11px] text-red-500 font-medium">
                          Phone number too long ({digits.length}/15 digits max)
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid phone number length ({digits.length} digits)
                      </p>
                    );
                  })()}
                </div>
              )}

              {/* 4. Email */}
              {q.type === 'EMAIL' && (
                <div className="space-y-1.5 max-w-md">
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 h-4 w-4 text-purple-600 select-none pointer-events-none" />
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      value={val || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className="pl-9 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:border-purple-600 focus:ring-0"
                    />
                  </div>
                  {val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim()) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Please enter a complete email address (e.g. user@domain.com)
                    </p>
                  )}
                </div>
              )}

              {/* 5. Website URL */}
              {q.type === 'WEBSITE' && (
                <div className="space-y-1.5 max-w-md">
                  <div className="relative flex items-center">
                    <Globe className="absolute left-3 h-4 w-4 text-purple-600 select-none pointer-events-none" />
                    <Input
                      type="url"
                      placeholder="https://example.com"
                      value={val || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className="pl-9 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:border-purple-600 focus:ring-0"
                    />
                  </div>
                </div>
              )}

              {/* 6. Image Block */}
              {q.type === 'IMAGE_BLOCK' && (
                <div className="py-2 space-y-3">
                  {q.config?.imageUrl ? (
                    <div className={`flex flex-col ${
                      q.config.imageAlignment === 'left'
                        ? 'items-start'
                        : q.config.imageAlignment === 'right'
                          ? 'items-end'
                          : 'items-center'
                    }`}>
                      {brokenImages[q.id] || !isLikelyImageSource(q.config.imageUrl) ? (
                        <div className="p-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs bg-gray-50/60 dark:bg-gray-800/30 max-w-md w-full">
                          <ImageIcon className="h-8 w-8 mb-2 text-gray-400 dark:text-gray-500" />
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Picture is currently unavailable</span>
                          <span className="text-[11px] text-gray-400 mt-0.5">The image could not be loaded from the server</span>
                        </div>
                      ) : (
                        <img
                          src={q.config.imageUrl}
                          alt={q.title || 'Form image'}
                          onLoad={() => setBrokenImages((prev) => ({ ...prev, [q.id]: false }))}
                          onError={() => setBrokenImages((prev) => ({ ...prev, [q.id]: true }))}
                          className="rounded-xl max-h-96 w-auto max-w-full object-contain border border-gray-200 dark:border-gray-800 shadow-md bg-white"
                        />
                      )}
                      {q.description && (
                        <p className="text-xs text-gray-500 italic mt-2 text-center max-w-md">
                          {q.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs">
                      <ImageIcon className="h-8 w-8 mb-2 text-gray-300" />
                      <span>No image provided for this block</span>
                    </div>
                  )}
                </div>
              )}

              {/* Video Embed / Player */}
              {q.type === 'VIDEO_EMBED' && (
                <div className="py-2 space-y-3">
                  {(() => {
                    const videoTarget = q.config?.videoUrl || q.config?.embedUrl;
                    if (!videoTarget) {
                      return (
                        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs">
                          <Video className="h-8 w-8 mb-2 text-gray-300" />
                          <span>No video provided for this block</span>
                        </div>
                      );
                    }
                    if (brokenVideos[q.id] || !isLikelyVideoSource(videoTarget)) {
                      return (
                        <div className="p-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs bg-gray-50/60 dark:bg-gray-800/30 max-w-md mx-auto w-full">
                          <Video className="h-8 w-8 mb-2 text-gray-400 dark:text-gray-500" />
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Video is currently unavailable</span>
                          <span className="text-[11px] text-gray-400 mt-0.5">The video could not be loaded from the server</span>
                        </div>
                      );
                    }
                    const parsed = getVideoEmbedUrl(videoTarget);
                    return (
                      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-md bg-black max-w-2xl mx-auto">
                        {parsed?.isDirectVideo ? (
                          <video
                            src={parsed.url}
                            controls
                            onError={() => setBrokenVideos((prev) => ({ ...prev, [q.id]: true }))}
                            className="w-full max-h-96 mx-auto"
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
                  {q.description && (
                    <p className="text-xs text-gray-500 italic text-center max-w-md mx-auto mt-2">
                      {q.description}
                    </p>
                  )}
                </div>
              )}

              {/* Paragraph */}
              {q.type === 'PARAGRAPH' && (
                <Textarea
                  placeholder="Your answer"
                  value={val || ''}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  className="min-h-[100px] text-sm"
                />
              )}

              {/* Multiple Choice */}
              {q.type === 'MULTIPLE_CHOICE' && (
                <div className={`space-y-2.5 ${q.options && q.options.length <= 3 && !q.options.some((o: any) => o.isOther) ? 'sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0' : ''}`}>
                  {q.options?.map((opt: any) => {
                    const isOtherOption =
                      opt.isOther ||
                      opt.label.trim().toLowerCase().startsWith('other') ||
                      opt.label.trim().toLowerCase() === 'other...';

                    const isSelected = isOtherOption
                      ? typeof val === 'string' &&
                        (val === opt.label ||
                          val === 'Other' ||
                          val === 'Other...' ||
                          val.startsWith('Other:') ||
                          val.startsWith('other:'))
                      : val === opt.label;

                    const currentOtherText =
                      otherTextMap[q.id] ??
                      (typeof val === 'string' && (val.startsWith('Other: ') || val.startsWith('other: '))
                        ? val.replace(/^other:\s*/i, '')
                        : '');

                    return (
                      <div
                        key={opt.id || opt.label}
                        onClick={() => {
                          if (isOtherOption) {
                            const text = otherTextMap[q.id] || '';
                            handleAnswerChange(q.id, text ? `Other: ${text}` : opt.label);
                          } else {
                            handleAnswerChange(q.id, opt.label);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 font-medium text-purple-950 dark:text-purple-200'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-purple-600 bg-purple-600'
                              : 'border-gray-400'
                          }`}
                        >
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>

                        {isOtherOption ? (
                          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="shrink-0">{opt.label.replace(/\.+$/, '')}:</span>
                            <Input
                              type="text"
                              placeholder="Please specify..."
                              value={currentOtherText}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => {
                                const text = otherTextMap[q.id] || '';
                                handleAnswerChange(q.id, text ? `Other: ${text}` : opt.label);
                              }}
                              onChange={(e) => {
                                const text = e.target.value;
                                setOtherTextMap((prev) => ({ ...prev, [q.id]: text }));
                                handleAnswerChange(q.id, text ? `Other: ${text}` : opt.label);
                              }}
                              className="h-8 text-sm flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 focus:border-purple-600"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between gap-3">
                            <span>{opt.label}</span>
                            {opt.imageUrl && (
                              <img
                                src={opt.imageUrl}
                                alt={opt.label}
                                className="h-14 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs shrink-0"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Checkboxes */}
              {q.type === 'CHECKBOXES' && (
                <div className="space-y-2.5">
                  {q.options?.map((opt: any) => {
                    const isOtherOption =
                      opt.isOther ||
                      opt.label.trim().toLowerCase().startsWith('other') ||
                      opt.label.trim().toLowerCase() === 'other...';

                    const isChecked = isOtherOption
                      ? Array.isArray(val) &&
                        val.some(
                          (v: string) =>
                            v === opt.label ||
                            v === 'Other' ||
                            v === 'Other...' ||
                            v.startsWith('Other:') ||
                            v.startsWith('other:')
                        )
                      : Array.isArray(val) && val.includes(opt.label);

                    const existingOtherVal = Array.isArray(val)
                      ? val.find(
                          (v: string) =>
                            v === opt.label ||
                            v === 'Other' ||
                            v === 'Other...' ||
                            v.startsWith('Other:') ||
                            v.startsWith('other:')
                        )
                      : null;

                    const currentOtherText =
                      otherTextMap[q.id] ??
                      (existingOtherVal && (existingOtherVal.startsWith('Other: ') || existingOtherVal.startsWith('other: '))
                        ? existingOtherVal.replace(/^other:\s*/i, '')
                        : '');

                    const toggleOther = () => {
                      const current: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      if (isChecked) {
                        const updated = current.filter(
                          (v) =>
                            v !== opt.label &&
                            v !== 'Other' &&
                            v !== 'Other...' &&
                            !v.startsWith('Other:') &&
                            !v.startsWith('other:')
                        );
                        handleAnswerChange(q.id, updated);
                      } else {
                        const text = otherTextMap[q.id] || '';
                        const newVal = text ? `Other: ${text}` : opt.label;
                        handleAnswerChange(q.id, [...current, newVal]);
                      }
                    };

                    const handleOtherTextChange = (text: string) => {
                      setOtherTextMap((prev) => ({ ...prev, [q.id]: text }));
                      const current: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const newVal = text ? `Other: ${text}` : opt.label;
                      const hasOther = current.some(
                        (v) =>
                          v === opt.label ||
                          v === 'Other' ||
                          v === 'Other...' ||
                          v.startsWith('Other:') ||
                          v.startsWith('other:')
                      );
                      if (hasOther) {
                        const updated = current.map((v) =>
                          v === opt.label ||
                          v === 'Other' ||
                          v === 'Other...' ||
                          v.startsWith('Other:') ||
                          v.startsWith('other:')
                            ? newVal
                            : v
                        );
                        handleAnswerChange(q.id, updated);
                      } else {
                        handleAnswerChange(q.id, [...current, newVal]);
                      }
                    };

                    return (
                      <div
                        key={opt.id || opt.label}
                        onClick={() => {
                          if (isOtherOption) {
                            toggleOther();
                          } else {
                            handleCheckboxToggle(q.id, opt.label);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                          isChecked
                            ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 font-medium text-purple-950 dark:text-purple-200'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? 'border-purple-600 bg-purple-600 text-white'
                              : 'border-gray-400'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="h-3 w-3" />}
                        </div>

                        {isOtherOption ? (
                          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="shrink-0">{opt.label.replace(/\.+$/, '')}:</span>
                            <Input
                              type="text"
                              placeholder="Please specify..."
                              value={currentOtherText}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => {
                                if (!isChecked) {
                                  toggleOther();
                                }
                              }}
                              onChange={(e) => handleOtherTextChange(e.target.value)}
                              className="h-8 text-sm flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 focus:border-purple-600"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between gap-3">
                            <span>{opt.label}</span>
                            {opt.imageUrl && (
                              <img
                                src={opt.imageUrl}
                                alt={opt.label}
                                className="h-14 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs shrink-0"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dropdown */}
              {q.type === 'DROPDOWN' && (
                triggerMapping ? (
                  <div className="max-w-md space-y-1.5">
                    <Select
                      value={val || ''}
                      onValueChange={(v) => {
                        handleAnswerChange(q.id, v);
                        triggerLookup(triggerMapping, v);
                      }}
                      disabled={loadingDropdowns[q.id]}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        {loadingDropdowns[q.id] ? (
                          <span className="flex items-center gap-2 text-gray-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> Loading spreadsheet options...
                          </span>
                        ) : (
                          <SelectValue placeholder="Choose an option..." />
                        )}
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {((lookupDropdownOptions[q.id] && lookupDropdownOptions[q.id].length > 0)
                          ? lookupDropdownOptions[q.id]
                          : (q.options || []).map((opt: any) => ({ label: opt.label, value: opt.label }))
                        ).map((opt: any) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {lookupStatus[q.id]?.isLookingUp && (
                      <p className="text-[11px] text-blue-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading record details...
                      </p>
                    )}
                    {lookupStatus[q.id]?.matched && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <Check className="h-3 w-3" /> Record matched. Dependent fields autofilled.
                      </p>
                    )}
                    {lookupStatus[q.id]?.error && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium">
                        <AlertCircle className="h-3 w-3" /> {lookupStatus[q.id]?.error}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="max-w-md">
                    <Select value={val || ''} onValueChange={(v) => handleAnswerChange(q.id, v)}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {q.options?.map((opt: any) => (
                          <SelectItem key={opt.id || opt.label} value={opt.label}>
                            <div className="flex items-center gap-2">
                              {opt.imageUrl && (
                                <img
                                  src={opt.imageUrl}
                                  alt={opt.label}
                                  className="h-5 w-7 object-cover rounded shrink-0 border border-gray-200 dark:border-gray-700"
                                />
                              )}
                              <span>{opt.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              )}

              {/* Linear Scale */}
              {q.type === 'LINEAR_SCALE' && (
                <div className="py-2 space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                    <span>{q.config?.scaleMinLabel || ''}</span>
                    <span>{q.config?.scaleMaxLabel || ''}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                    {Array.from(
                      { length: (q.config?.scaleMax ?? 5) - (q.config?.scaleMin ?? 1) + 1 },
                      (_, i) => (q.config?.scaleMin ?? 1) + i
                    ).map((num) => {
                      const isSelected = val === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleAnswerChange(q.id, num)}
                          className={`flex-1 min-w-[36px] h-10 rounded-xl border flex flex-col items-center justify-center text-sm font-semibold transition-all ${
                            isSelected
                              ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rating */}
              {q.type === 'RATING' && (
                <div className="flex items-center gap-2 py-1">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isSelected = (val || 0) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleAnswerChange(q.id, star)}
                        className="p-1 text-gray-300 hover:text-amber-400 transition-colors"
                      >
                        <Star
                          className={`h-7 w-7 ${
                            isSelected ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                  {val && (
                    <span className="text-xs font-semibold text-purple-600 ml-2">
                      {val} of 5
                    </span>
                  )}
                </div>
              )}

              {/* Multiple Choice Grid */}
              {q.type === 'MULTIPLE_CHOICE_GRID' && (
                <div className="overflow-x-auto py-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left py-2 font-medium text-gray-400 w-1/3" />
                        {(q.config?.cols || ['Col 1', 'Col 2']).map((col: string) => (
                          <th key={col} className="text-center py-2 font-semibold text-gray-600">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {(q.config?.rows || ['Row 1']).map((row: string) => (
                        <tr key={row}>
                          <td className="py-3 font-medium text-gray-800 dark:text-gray-200">
                            {row}
                          </td>
                          {(q.config?.cols || ['Col 1', 'Col 2']).map((col: string) => {
                            const isChecked = val?.[row] === col;
                            return (
                              <td key={col} className="py-3 text-center">
                                <input
                                  type="radio"
                                  name={`grid-${q.id}-${row}`}
                                  checked={isChecked}
                                  onChange={() => handleGridChange(q.id, row, col)}
                                  className="h-4 w-4 text-purple-600 cursor-pointer"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Date */}
              {q.type === 'DATE' && (
                <div className="space-y-1.5 max-w-xs">
                  <div className="relative flex items-center">
                    <Calendar className="absolute left-3 h-4 w-4 text-purple-600 pointer-events-none select-none" />
                    <Input
                      type="date"
                      value={val || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className="pl-9 pr-3 h-10 text-sm border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Format: YYYY-MM-DD</span>
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        handleAnswerChange(q.id, today);
                      }}
                      className="text-purple-600 hover:text-purple-700 hover:underline font-semibold"
                    >
                      Set Today
                    </button>
                  </div>
                </div>
              )}

              {/* Time */}
              {q.type === 'TIME' && (
                <div className="space-y-1.5 max-w-xs">
                  <div className="relative flex items-center">
                    <Clock className="absolute left-3 h-4 w-4 text-purple-600 pointer-events-none select-none" />
                    <Input
                      type="time"
                      value={val || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className="pl-9 pr-3 h-10 text-sm border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                  <span className="text-[11px] text-gray-400">Format: HH:MM</span>
                </div>
              )}

              {/* File Upload with Live Image Preview */}
              {q.type === 'FILE_UPLOAD' && (
                <div className="space-y-3">
                  {val && val.publicUrl ? (
                    (() => {
                      const isImg =
                        val.mimeType?.startsWith('image/') ||
                        /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(val.fileName || '') ||
                        /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(val.publicUrl || '');

                      return (
                        <div className="border border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4 transition-all shadow-sm">
                          {isImg ? (
                            <div className="relative group shrink-0">
                              <img
                                src={val.publicUrl}
                                alt={val.fileName || 'Uploaded image'}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                                className="h-32 w-48 rounded-lg object-contain bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm"
                              />
                              <a
                                href={val.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-xs font-semibold transition-opacity gap-1"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Full view
                              </a>
                            </div>
                          ) : (
                            <div className="h-16 w-16 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center shrink-0">
                              <FileText className="h-8 w-8" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 text-center sm:text-left space-y-1">
                            <div className="flex items-center gap-2 justify-center sm:justify-start">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                {val.fileName}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500">
                              {val.fileSize ? `${(val.fileSize / 1024).toFixed(1)} KB` : 'File uploaded'}
                              {isImg ? ' • Image preview ready' : ' • Document ready'}
                            </p>
                            <div className="pt-2 flex items-center gap-3 justify-center sm:justify-start">
                              <label
                                htmlFor={`file-replace-${q.id}`}
                                className="relative inline-flex items-center cursor-pointer"
                              >
                                <input
                                  type="file"
                                  id={`file-replace-${q.id}`}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                  accept={getAcceptAttribute(q.config?.allowedFileTypes)}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    const target = e.target;
                                    if (file) handleFileUpload(q.id, file, target);
                                  }}
                                />
                                <span className="inline-flex items-center text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline">
                                  <Upload className="h-3.5 w-3.5 mr-1" /> Replace file
                                </span>
                              </label>
                              <span className="text-gray-300">•</span>
                              <button
                                type="button"
                                onClick={() => {
                                  handleAnswerChange(q.id, null);
                                  setFileErrors((prev) => ({ ...prev, [q.id]: null }));
                                }}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileUpload(q.id, file);
                      }}
                      className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-sky-500 dark:hover:border-sky-500 rounded-xl p-6 flex flex-col items-center justify-center transition-all bg-gray-50/50 dark:bg-gray-800/30 group overflow-hidden cursor-pointer block text-center"
                    >
                      <input
                        type="file"
                        id={`file-input-${q.id}`}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        style={{ minHeight: '130px' }}
                        accept={getAcceptAttribute(q.config?.allowedFileTypes)}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          const target = e.target;
                          if (file) handleFileUpload(q.id, file, target);
                        }}
                      />
                      {uploadingFiles[q.id] ? (
                        <div className="flex flex-col items-center gap-2 text-sky-600 py-3 pointer-events-none">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span className="text-xs font-bold">Uploading file, please wait...</span>
                          <span className="text-[11px] text-gray-500">Sending to server...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center pointer-events-none text-center">
                          <div className="h-12 w-12 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-600 group-hover:scale-110 flex items-center justify-center mb-2 transition-transform shadow-sm">
                            <Upload className="h-6 w-6" />
                          </div>
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                            Tap to choose file or photo
                          </span>
                          <span className="text-[11px] text-gray-500 mt-1">
                            Max size limit: {formatSizeMb(q.config?.maxFileSizeMb || 10)}
                          </span>
                          {q.config?.allowedFileTypes && q.config.allowedFileTypes.length > 0 ? (
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium mt-1">
                              Accepted: {q.config.allowedFileTypes.join(', ')}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 mt-1">
                              All file types accepted (Photos, Documents, PDF, etc.)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {fileErrors[q.id] && (
                    <div className="mt-2.5 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400 animate-in fade-in">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{fileErrors[q.id]}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        if (isCattleSurvey) {
          return (
            <div className="space-y-6">
              {/* 1. Society & Location Section Header & Fields */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-sky-950 dark:text-sky-100 flex items-center gap-2">
                      <Database className="h-4 w-4 text-sky-600" />
                      1. SOCIETY &amp; LOCATION DETAILS (૧. મંડળી અને ભૌગોલિક વિગતો)
                    </h2>
                    <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300 mt-0.5">
                      Enter Society Code once. Society Name, Taluka, and District will auto-fill automatically.
                    </p>
                  </div>
                </div>
                {societyQuestions.map((q: any) => renderQuestionCard(q))}
              </div>

              {/* 2. Surveyor Details Section Header & Fields */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-sky-950 dark:text-sky-100 flex items-center gap-2">
                      <Users className="h-4 w-4 text-sky-600" />
                      2. SURVEYOR DETAILS (૨. સર્વે કરનાર ની વિગતો)
                    </h2>
                    <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300 mt-0.5">
                      Enter your Surveyor details once per visit. These details apply to every cattle owner entered below.
                    </p>
                  </div>
                </div>
                {surveyorQuestions.map((q: any) => renderQuestionCard(q))}
              </div>

              {/* 3. Repeatable Cattle Owners Section */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-sky-950 dark:text-sky-100 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-sky-600" />
                      3. CATTLE OWNERS INFORMATION (૩. પશુપાલકોની વિગતો)
                    </h2>
                    <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300 mt-0.5">
                      Enter information for each cattle owner in this village. Click &ldquo;+ Add Another Cattle Owner&rdquo; to add more.
                    </p>
                  </div>
                  <span className="text-xs font-extrabold px-3 py-1 bg-sky-600 text-white rounded-full shadow-xs">
                    {cattleOwners.length} {cattleOwners.length === 1 ? 'Owner' : 'Owners'}
                  </span>
                </div>

                {cattleOwners.map((owner, idx) => {
                  const errors = cattleOwnerErrors[owner.id] || {};

                  return (
                    <div
                      key={owner.id}
                      className={`bg-white dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-5 transition-all ${
                        theme.borderRadius || 'rounded-xl'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2.5">
                          <span className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-black text-xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <h3 className="font-extrabold text-base text-gray-900 dark:text-gray-100">
                            Cattle Owner {idx + 1} (પશુ માલિક {idx + 1})
                          </h3>
                        </div>
                        {cattleOwners.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOwner(owner.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs h-8 px-2.5 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Remove (કાઢી નાખો)</span>
                          </Button>
                        )}
                      </div>

                      {/* Field 1: Cattle Owner Full Name */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Cattle Owner Full Name (પશુ માલિકનું પૂરું નામ) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <Input
                          type="text"
                          placeholder="Enter full name of cattle owner..."
                          value={owner.ownerName}
                          onChange={(e) => handleOwnerFieldChange(owner.id, 'ownerName', e.target.value)}
                          className={`max-w-md h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none px-1 focus:ring-0 ${
                            errors.ownerName ? 'border-red-500 focus:border-red-600' : 'border-gray-300 focus:border-purple-600'
                          }`}
                        />
                        {errors.ownerName && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.ownerName}
                          </p>
                        )}
                      </div>

                      {/* Field 2: Owner Mobile Number */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Owner Mobile No. (10 Digits) (માલિકનો મોબાઇલ નં.) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <div className="relative flex items-center max-w-md">
                          <Phone className="absolute left-3 h-4 w-4 text-purple-600 select-none pointer-events-none" />
                          <Input
                            type="tel"
                            inputMode="tel"
                            placeholder="10-digit mobile number"
                            value={owner.ownerMobile}
                            onKeyDown={(e) => {
                              if (
                                ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
                                (e.ctrlKey || e.metaKey)
                              ) return;
                              if (/^[0-9]$/.test(e.key)) return;
                              e.preventDefault();
                            }}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                              handleOwnerFieldChange(owner.id, 'ownerMobile', digits);
                            }}
                            className={`pl-9 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:ring-0 ${
                              errors.ownerMobile ? 'border-red-500 focus:border-red-600' : 'border-gray-300 focus:border-purple-600'
                            }`}
                          />
                        </div>
                        {owner.ownerMobile && owner.ownerMobile.length > 0 && owner.ownerMobile.length < 10 && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            {owner.ownerMobile.length}/10 digits entered — minimum 10 digits required
                          </p>
                        )}
                        {owner.ownerMobile && owner.ownerMobile.length === 10 && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Valid 10-digit mobile number
                          </p>
                        )}
                        {errors.ownerMobile && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.ownerMobile}
                          </p>
                        )}
                      </div>

                      {/* Field 3: Total Large Cattle Count */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Total Large Cattle Count (Over 1 Year Age) (હાજર મોટા પશુઓની કુલ સંખ્યા (૧ વર્ષથી વધુ)) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <div className="relative flex items-center max-w-md">
                          <span className="absolute left-3 text-sm font-bold text-purple-600 select-none">#</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g. 5"
                            value={owner.largeCattleCount}
                            onKeyDown={(e) => {
                              if (
                                ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
                                (e.ctrlKey || e.metaKey)
                              ) return;
                              if (/^[0-9]$/.test(e.key)) return;
                              e.preventDefault();
                            }}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '');
                              handleOwnerFieldChange(owner.id, 'largeCattleCount', clean);
                            }}
                            className={`pl-8 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:ring-0 ${
                              errors.largeCattleCount ? 'border-red-500 focus:border-red-600' : 'border-gray-300 focus:border-purple-600'
                            }`}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">Numbers only (0 or more)</p>
                        {errors.largeCattleCount && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.largeCattleCount}
                          </p>
                        )}
                      </div>

                      {/* Field 4: Total Small Cattle Count */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Total Small Cattle Count (હાજર નાના પશુઓની કુલ સંખ્યા) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <div className="relative flex items-center max-w-md">
                          <span className="absolute left-3 text-sm font-bold text-purple-600 select-none">#</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g. 2"
                            value={owner.smallCattleCount}
                            onKeyDown={(e) => {
                              if (
                                ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
                                (e.ctrlKey || e.metaKey)
                              ) return;
                              if (/^[0-9]$/.test(e.key)) return;
                              e.preventDefault();
                            }}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '');
                              handleOwnerFieldChange(owner.id, 'smallCattleCount', clean);
                            }}
                            className={`pl-8 h-10 text-sm border-b-2 border-t-0 border-x-0 rounded-none focus:ring-0 ${
                              errors.smallCattleCount ? 'border-red-500 focus:border-red-600' : 'border-gray-300 focus:border-purple-600'
                            }`}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">Numbers only (0 or more)</p>
                        {errors.smallCattleCount && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.smallCattleCount}
                          </p>
                        )}
                      </div>

                      {/* Field 5: Flooring Type (Concrete or Mud) */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Flooring Type (ભોંયતળિયું (પાકું/કાચું)) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-md">
                          {['Concrete (પાકું)', 'Mud (કાચું)'].map((opt) => {
                            const isSelected = owner.flooringType === opt;
                            return (
                              <div
                                key={opt}
                                onClick={() => handleOwnerFieldChange(owner.id, 'flooringType', opt)}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/30 font-bold text-sky-950 dark:text-sky-100 shadow-xs'
                                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                                }`}
                              >
                                <div
                                  className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    isSelected ? 'border-sky-600 bg-sky-600' : 'border-gray-400'
                                  }`}
                                >
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </div>
                                <span>{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                        {errors.flooringType && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.flooringType}
                          </p>
                        )}
                      </div>

                      {/* Field 6: Supply Dung? (Yes or No) */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                          <span>
                            Supply Dung? (છાણ આપવા સંમત?) <span className="text-red-500 font-bold">*</span>
                          </span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-md">
                          {['Yes (હા)', 'No (ના)'].map((opt) => {
                            const isSelected = owner.supplyDung === opt;
                            return (
                              <div
                                key={opt}
                                onClick={() => handleOwnerFieldChange(owner.id, 'supplyDung', opt)}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/30 font-bold text-sky-950 dark:text-sky-100 shadow-xs'
                                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                                }`}
                              >
                                <div
                                  className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    isSelected ? 'border-sky-600 bg-sky-600' : 'border-gray-400'
                                  }`}
                                >
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </div>
                                <span>{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                        {errors.supplyDung && (
                          <p className="text-xs text-red-500 font-medium flex items-center gap-1 pt-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errors.supplyDung}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Button: + Add Another Cattle Owner */}
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={handleAddOwner}
                    className="w-full h-13 rounded-2xl border-2 border-dashed border-sky-400 hover:border-sky-500 dark:border-sky-500/50 bg-sky-50/70 hover:bg-sky-100/90 dark:bg-sky-950/30 dark:hover:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
                  >
                    <Plus className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    <span>+ Add Another Cattle Owner (બીજા પશુ માલિક ઉમેરો)</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        }

        return questionsInCurrentSection.map((q: any) => renderQuestionCard(q));
      })()}

        {/* Navigation & Submit Bar */}
        <div className={`p-4 sm:p-5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xl transition-colors ${
          isDarkBg
            ? 'bg-white/10 dark:bg-gray-900/60 backdrop-blur-md border border-white/20 dark:border-white/10'
            : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
        }`}>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            {!isCattleSurvey && sectionHistory.length > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className={`text-xs sm:text-sm font-bold h-11 px-4 sm:px-5 rounded-xl transition-all hover:scale-[1.02] ${
                  isDarkBg
                    ? 'bg-white text-gray-800 hover:bg-sky-50 border border-white/40 shadow-md'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm'
                }`}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowClearConfirm(true)}
              className={`text-xs sm:text-sm font-semibold h-11 px-4 sm:px-5 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 group cursor-pointer ${
                isDarkBg
                  ? 'bg-white/10 hover:bg-rose-500/20 text-white/90 hover:text-white border border-white/25 hover:border-rose-400/50 shadow-sm backdrop-blur-md'
                  : 'bg-white hover:bg-rose-50 text-gray-700 hover:text-rose-600 border border-gray-300 hover:border-rose-300 shadow-sm'
              }`}
              title="Clear all answers and reset form"
            >
              <RotateCcw className={`h-3.5 w-3.5 group-hover:rotate-[-60deg] transition-all duration-200 ${
                isDarkBg ? 'text-sky-200 group-hover:text-rose-300' : 'text-gray-500 group-hover:text-rose-500'
              }`} />
              <span>Clear form</span>
            </Button>
          </div>

          <div>
            {isCattleSurvey || isLastSection ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="h-12 px-8 sm:px-10 text-sm sm:text-base font-extrabold text-white shadow-xl hover:shadow-2xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] rounded-xl border border-white/40 ring-2 ring-sky-300/40 flex items-center gap-2 cursor-pointer"
                style={{ backgroundColor: submitButtonBg }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> {formData?.title?.includes('Cattle') || formData?.title?.includes('સર્વે') ? 'Submit Survey (સર્વે સબમિટ કરો)' : 'Submit'}
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleNext}
                className="h-12 px-7 text-xs sm:text-sm font-extrabold text-white shadow-xl hover:shadow-2xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] rounded-xl border border-white/30 ring-2 ring-sky-300/40 flex items-center gap-2 cursor-pointer"
                style={{ backgroundColor: submitButtonBg }}
              >
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Clear Form Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-left">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400 shadow-sm">
                  <RotateCcw className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Clear form answers?
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                    This will remove all your entered answers, selections, and any uploaded files across this form. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowClearConfirm(false)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleClearForm}
                  className="h-10 px-5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Yes, clear form
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {settings?.showProgressBar !== false && !isCattleSurvey && sections.length > 1 && (
          <div className="pt-6 space-y-1">
            <div className={`h-2 w-full rounded-full overflow-hidden ${isDarkBg ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${progressPercentage}%`,
                  backgroundColor: submitButtonBg,
                }}
              />
            </div>
            <p className={`text-[11px] text-right font-medium ${isDarkBg ? 'text-sky-100' : 'text-gray-600 dark:text-gray-400'}`}>
              {progressPercentage}% completed
            </p>
          </div>
        )}

        {/* Public Form Footer */}
        <div className="pt-6 pb-2 flex items-center justify-center gap-2 opacity-95 hover:opacity-100 transition-opacity">
          <div className="bg-white rounded p-1 shadow-sm">
            <img
              src="/logo.png"
              alt="FormCraft Logo"
              className="h-4 w-auto object-contain"
            />
          </div>
          <span className={`text-xs font-semibold tracking-wide ${isDarkBg ? 'text-sky-100' : 'text-gray-600 dark:text-gray-400'}`}>
            FormCraft – Digital Form Builder &amp; Management Platform
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PublicFormPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: '#004B6E' }}
        >
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm font-medium text-sky-100">Loading form...</p>
          </div>
        </div>
      }
    >
      <PublicFormContent />
    </Suspense>
  );
}
