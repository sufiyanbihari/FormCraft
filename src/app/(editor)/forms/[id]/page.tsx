'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import BuilderHeader from '@/components/form-builder/BuilderHeader';
import QuestionCard, { QuestionData } from '@/components/form-builder/QuestionCard';
import SectionCard, { SectionData } from '@/components/form-builder/SectionCard';
import FloatingToolbar from '@/components/form-builder/FloatingToolbar';
import ThemeDrawer, { ThemeConfig } from '@/components/form-builder/ThemeDrawer';
import CollaboratorsModal from '@/components/form-builder/CollaboratorsModal';
import LookupConfigModal from '@/components/form-builder/LookupConfigModal';
import ImportQuestionsModal from '@/components/form-builder/ImportQuestionsModal';
import ResponsesTab from '@/components/form-builder/ResponsesTab';
import SettingsTab from '@/components/form-builder/SettingsTab';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Loader2, Sparkles, Check, Send } from 'lucide-react';
import { isLikelyImageSource } from '@/lib/utils';

function FormBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const formId = params.id as string;

  const [form, setForm] = useState<any>(null);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [theme, setTheme] = useState<ThemeConfig>({
    primaryColor: '#004B6E',
    backgroundColor: '#004B6E',
    cardColor: '#ffffff',
    fontFamily: 'Inter',
    borderRadius: 'rounded-xl',
    headerImageUrl: '/default-banner.jpg',
  });
  const [settings, setSettings] = useState<any>({});
  const [isQuiz, setIsQuiz] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'questions' | 'responses' | 'settings'>('questions');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lookupMappings, setLookupMappings] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [brokenBanner, setBrokenBanner] = useState(false);

  // Undo / Redo Command History
  const historyRef = useRef<any[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isUndoRedoAction = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const updateHistory = (snapshot: any) => {
    if (isUndoRedoAction.current) return;
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(JSON.parse(JSON.stringify(snapshot)));
    if (history.length > 30) history.shift();
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      isUndoRedoAction.current = true;
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      setTitle(prev.title);
      setDescription(prev.description);
      setSections(prev.sections);
      setQuestions(prev.questions);
      setTheme(prev.theme);
      setSettings(prev.settings);
      setIsQuiz(prev.isQuiz);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
      setTimeout(() => {
        isUndoRedoAction.current = false;
      }, 50);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isUndoRedoAction.current = true;
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      setTitle(next.title);
      setDescription(next.description);
      setSections(next.sections);
      setQuestions(next.questions);
      setTheme(next.theme);
      setSettings(next.settings);
      setIsQuiz(next.isQuiz);
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      setTimeout(() => {
        isUndoRedoAction.current = false;
      }, 50);
    }
  };

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch form data
  const fetchForm = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/forms/${formId}`);
      if (!res.ok) {
        router.push('/');
        return;
      }
      const data = await res.json();
      const f = data.form;
      setForm(f);
      setTitle(f.title);
      setDescription(f.description || '');
      setIsQuiz(f.isQuiz);
      if (f.theme) setTheme(f.theme);
      if (f.settings) setSettings(f.settings);
      if (f.lookupMappings) setLookupMappings(f.lookupMappings);

      // Extract sections and questions
      const secs: SectionData[] = (f.sections || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        orderIndex: s.orderIndex,
        nextSectionId: s.nextSectionId,
      }));

      const qs: QuestionData[] = (f.sections || []).flatMap((s: any) =>
        (s.questions || []).map((q: any) => ({
          id: q.id,
          sectionId: s.id,
          title: q.title,
          description: q.description,
          type: q.type,
          isRequired: q.isRequired,
          orderIndex: q.orderIndex,
          validation: q.validation || {},
          config: q.config || {},
          quizPoints: q.quizPoints || 0,
          quizAnswer: q.quizAnswer || {},
          quizExplanation: q.quizExplanation || '',
          options: (q.options || []).map((o: any) => ({
            id: o.id,
            label: o.label,
            value: o.value,
            orderIndex: o.orderIndex,
            isOther: o.isOther,
            goToSectionId: o.goToSectionId,
          })),
        }))
      );

      setSections(secs);
      setQuestions(qs);
      if (qs.length > 0) setActiveQuestionId(qs[0].id);

      // Initial history snapshot
      updateHistory({
        title: f.title,
        description: f.description || '',
        sections: secs,
        questions: qs,
        theme: f.theme,
        settings: f.settings,
        isQuiz: f.isQuiz,
      });
    } catch (err) {
      console.error('Error fetching form:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/forms/${formId}`);
    } else if (user) {
      fetchForm();
    }
  }, [authLoading, user, formId]);

  // Debounced Auto-save
  const isInitialLoadDone = useRef(false);
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Per-question debounced autosave state & queue
  const pendingQuestionDeltasRef = useRef<Record<string, Partial<QuestionData>>>({});
  const questionSaveTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activeQuestionSavesCountRef = useRef<number>(0);
  const latestDefaultPointsReqIdRef = useRef<number>(0);
  const defaultPointsSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const saveQuestionDeltaToServer = useCallback(
    async (qId: string, delta: Partial<QuestionData>) => {
      try {
        activeQuestionSavesCountRef.current += 1;
        setSaveStatus('saving');
        const res = await fetch(`/api/forms/${formId}/questions/${qId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(delta),
        });
        if (!res.ok) {
          console.error(`Failed to save question ${qId}:`, await res.text());
        }
      } catch (err) {
        console.error('Question update error:', err);
      } finally {
        activeQuestionSavesCountRef.current = Math.max(0, activeQuestionSavesCountRef.current - 1);
        if (
          activeQuestionSavesCountRef.current === 0 &&
          Object.keys(pendingQuestionDeltasRef.current).length === 0
        ) {
          setSaveStatus('saved');
        }
      }
    },
    [formId]
  );

  const flushAllPendingQuestionSaves = useCallback(async () => {
    const promises: Promise<void>[] = [];
    const pending = { ...pendingQuestionDeltasRef.current };
    pendingQuestionDeltasRef.current = {};

    // Clear all pending question timers
    for (const qId of Object.keys(questionSaveTimersRef.current)) {
      clearTimeout(questionSaveTimersRef.current[qId]);
      delete questionSaveTimersRef.current[qId];
    }

    for (const [qId, delta] of Object.entries(pending)) {
      promises.push(saveQuestionDeltaToServer(qId, delta));
    }

    await Promise.all(promises);
  }, [saveQuestionDeltaToServer]);

  // Clean up question timers on unmount
  useEffect(() => {
    return () => {
      for (const qId of Object.keys(questionSaveTimersRef.current)) {
        clearTimeout(questionSaveTimersRef.current[qId]);
      }
      if (defaultPointsSaveTimerRef.current) {
        clearTimeout(defaultPointsSaveTimerRef.current);
      }
    };
  }, []);

  const saveFormToServer = useCallback(async () => {
    if (!formId || isLoading || !form) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: (title || '').trim() || 'Untitled form',
          description,
          isQuiz,
          theme,
          settings,
        }),
      });

      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [formId, title, description, isQuiz, theme, settings, isLoading, form]);

  useEffect(() => {
    // Only auto-save if initial data load has finished and form exists
    if (!isInitialLoadDone.current) {
      if (!isLoading && form) {
        isInitialLoadDone.current = true;
      }
      return;
    }

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaveStatus('saving');

    saveTimeout.current = setTimeout(() => {
      saveFormToServer();
    }, 1000);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [title, description, isQuiz, theme, settings, isLoading, form, saveFormToServer]);

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = questions.findIndex((q) => q.id === active.id);
      const newIndex = questions.findIndex((q) => q.id === over.id);
      const reordered = arrayMove(questions, oldIndex, newIndex).map((q, idx) => ({
        ...q,
        orderIndex: idx,
      }));

      setQuestions(reordered);
      updateHistory({
        title,
        description,
        sections,
        questions: reordered,
        theme,
        settings,
        isQuiz,
      });

      // Persist reorder to server
      await fetch(`/api/forms/${formId}/questions/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reordered.map((q) => ({
            id: q.id,
            sectionId: q.sectionId,
            orderIndex: q.orderIndex,
          })),
        }),
      });
    }
  };

  // Add Question
  const handleAddQuestion = async (type = 'MULTIPLE_CHOICE') => {
    // Resolve target section:
    // 1. If an active question is selected, add to that question's section
    // 2. Else if activeSectionId is set, add to that section
    // 3. Otherwise fallback to the last section (most recently added) or first section
    let targetSection = null;
    if (activeQuestionId) {
      const activeQ = questions.find((q) => q.id === activeQuestionId);
      if (activeQ) {
        targetSection = sections.find((s) => s.id === activeQ.sectionId);
      }
    }
    if (!targetSection && activeSectionId) {
      targetSection = sections.find((s) => s.id === activeSectionId);
    }
    if (!targetSection) {
      targetSection = sections[sections.length - 1] || sections[0];
    }
    if (!targetSection) return;

    const sectionQuestions = questions.filter((q) => q.sectionId === targetSection.id);
    const orderIndex = sectionQuestions.length;

    const isPresentationType = type === 'SECTION_HEADER' || type === 'TEXT_BLOCK' || type === 'IMAGE_BLOCK' || type === 'VIDEO_EMBED';
    const defaultPoints = (isQuiz && !isPresentationType) ? (settings?.quizDefaultPoints ?? 1) : 0;

    try {
      const res = await fetch(`/api/forms/${formId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: targetSection.id,
          title: 'Untitled Question',
          type,
          orderIndex,
          quizPoints: defaultPoints,
          options:
            type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES' || type === 'DROPDOWN'
              ? [{ label: 'Option 1', value: 'Option 1', orderIndex: 0, isOther: false }]
              : [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newQ = data.question;
        const updated = [...questions, newQ];
        setQuestions(updated);
        setActiveQuestionId(newQ.id);
        setActiveSectionId(targetSection.id);
        updateHistory({
          title,
          description,
          sections,
          questions: updated,
          theme,
          settings,
          isQuiz,
        });
        showToast('Question added');
      }
    } catch {
      showToast('Failed to add question');
    }
  };

  // Add Section
  const handleAddSection = async () => {
    try {
      const res = await fetch(`/api/forms/${formId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Section ${sections.length + 1}`,
          description: '',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updatedSections = [...sections, data.section];
        setSections(updatedSections);
        setActiveSectionId(data.section.id);
        setActiveQuestionId(null);
        updateHistory({
          title,
          description,
          sections: updatedSections,
          questions,
          theme,
          settings,
          isQuiz,
        });
        showToast('New section added');
      }
    } catch {
      showToast('Failed to add section');
    }
  };

  // Update Question (with snappy local state update and 400ms debounce to server)
  const handleUpdateQuestion = (qId: string, delta: Partial<QuestionData>) => {
    const updated = questions.map((q) => (q.id === qId ? { ...q, ...delta } : q));
    setQuestions(updated);
    updateHistory({
      title,
      description,
      sections,
      questions: updated,
      theme,
      settings,
      isQuiz,
    });

    setSaveStatus('saving');

    // Merge delta into pending queue
    pendingQuestionDeltasRef.current[qId] = {
      ...(pendingQuestionDeltasRef.current[qId] || {}),
      ...delta,
    };

    // Reset debounce timer for this question
    if (questionSaveTimersRef.current[qId]) {
      clearTimeout(questionSaveTimersRef.current[qId]);
    }

    questionSaveTimersRef.current[qId] = setTimeout(async () => {
      const qDelta = pendingQuestionDeltasRef.current[qId];
      if (qDelta) {
        delete pendingQuestionDeltasRef.current[qId];
        delete questionSaveTimersRef.current[qId];
        await saveQuestionDeltaToServer(qId, qDelta);
      }
    }, 400);
  };

  // Duplicate Question
  const handleDuplicateQuestion = async (qId: string) => {
    const orig = questions.find((q) => q.id === qId);
    if (!orig) return;

    const isPresentation =
      orig.type === 'SECTION_HEADER' ||
      orig.type === 'TEXT_BLOCK' ||
      orig.type === 'IMAGE_BLOCK' ||
      orig.type === 'VIDEO_EMBED';
    const fallbackPoints = (isQuiz && !isPresentation) ? (settings?.quizDefaultPoints ?? 1) : 0;
    const duplicatedPoints = orig.quizPoints !== undefined ? orig.quizPoints : fallbackPoints;

    try {
      const res = await fetch(`/api/forms/${formId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: orig.sectionId,
          title: `Copy of ${orig.title}`,
          description: orig.description,
          type: orig.type,
          isRequired: orig.isRequired,
          validation: orig.validation,
          config: orig.config,
          quizPoints: duplicatedPoints,
          quizAnswer: orig.quizAnswer,
          quizExplanation: orig.quizExplanation,
          options: orig.options.map((o) => ({
            label: o.label,
            value: o.value,
            orderIndex: o.orderIndex,
            isOther: o.isOther,
            goToSectionId: o.goToSectionId,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = [...questions, data.question];
        setQuestions(updated);
        setActiveQuestionId(data.question.id);
        updateHistory({
          title,
          description,
          sections,
          questions: updated,
          theme,
          settings,
          isQuiz,
        });
        showToast('Question duplicated');
      }
    } catch {
      showToast('Failed to duplicate question');
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (qId: string) => {
    try {
      const res = await fetch(`/api/forms/${formId}/questions/${qId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const updated = questions.filter((q) => q.id !== qId);
        setQuestions(updated);
        updateHistory({
          title,
          description,
          sections,
          questions: updated,
          theme,
          settings,
          isQuiz,
        });
        showToast('Question deleted');
      }
    } catch {
      showToast('Failed to delete question');
    }
  };

  // Toggle Quiz Mode with immediate state & server sync and question points initialization
  const handleToggleQuiz = async (checked: boolean) => {
    setIsQuiz(checked);
    const configuredDefault = settings?.quizDefaultPoints ?? 1;

    let updatedQuestions = questions;
    if (checked) {
      let hasChanges = false;
      updatedQuestions = questions.map((q) => {
        const isPresentation =
          q.type === 'SECTION_HEADER' ||
          q.type === 'TEXT_BLOCK' ||
          q.type === 'IMAGE_BLOCK' ||
          q.type === 'VIDEO_EMBED';
        if (!isPresentation && (q.quizPoints === 0 || q.quizPoints === undefined || q.quizPoints === null)) {
          hasChanges = true;
          return { ...q, quizPoints: configuredDefault };
        }
        return q;
      });

      if (hasChanges) {
        setQuestions(updatedQuestions);
      }
    }

    updateHistory({
      title,
      description,
      sections,
      questions: updatedQuestions,
      theme,
      settings,
      isQuiz: checked,
    });

    try {
      await fetch(`/api/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isQuiz: checked,
          settings: {
            ...settings,
            quizDefaultPoints: configuredDefault,
          },
        }),
      });
    } catch (err) {
      console.error('Failed to update quiz toggle:', err);
    }
  };

  // Synchronized Settings Change Handler for Quiz Default Points & Form Settings
  const handleSettingsChange = useCallback(
    (delta: any) => {
      const newSettings = { ...settings, ...delta };
      setSettings(newSettings);

      const hasDefaultPointsChange =
        delta.quizDefaultPoints !== undefined &&
        delta.quizDefaultPoints !== null &&
        Number(delta.quizDefaultPoints) !== Number(settings?.quizDefaultPoints);

      if (hasDefaultPointsChange) {
        const newDefault = Math.max(0, parseInt(delta.quizDefaultPoints, 10) || 0);

        // 1. Purge any pending individual question saves for quizPoints
        for (const qId of Object.keys(pendingQuestionDeltasRef.current)) {
          if (pendingQuestionDeltasRef.current[qId]?.quizPoints !== undefined) {
            delete pendingQuestionDeltasRef.current[qId].quizPoints;
            if (Object.keys(pendingQuestionDeltasRef.current[qId]).length === 0) {
              if (questionSaveTimersRef.current[qId]) {
                clearTimeout(questionSaveTimersRef.current[qId]);
                delete questionSaveTimersRef.current[qId];
              }
              delete pendingQuestionDeltasRef.current[qId];
            }
          }
        }

        // 2. Synchronize all gradable questions in React state immediately
        const updatedQuestions = questions.map((q) => {
          const isPresentation =
            q.type === 'SECTION_HEADER' ||
            q.type === 'TEXT_BLOCK' ||
            q.type === 'IMAGE_BLOCK' ||
            q.type === 'VIDEO_EMBED';
          if (!isPresentation) {
            return { ...q, quizPoints: newDefault };
          }
          return q;
        });

        setQuestions(updatedQuestions);

        // 3. Update history
        updateHistory({
          title,
          description,
          sections,
          questions: updatedQuestions,
          theme,
          settings: newSettings,
          isQuiz,
        });

        // 4. Save to server with request ID sequencing
        const reqId = ++latestDefaultPointsReqIdRef.current;
        setSaveStatus('saving');

        if (defaultPointsSaveTimerRef.current) {
          clearTimeout(defaultPointsSaveTimerRef.current);
        }

        defaultPointsSaveTimerRef.current = setTimeout(async () => {
          try {
            const res = await fetch(`/api/forms/${formId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                settings: newSettings,
              }),
            });

            if (reqId === latestDefaultPointsReqIdRef.current) {
              if (res.ok) {
                setSaveStatus('saved');
              } else {
                setSaveStatus('error');
              }
            }
          } catch {
            if (reqId === latestDefaultPointsReqIdRef.current) {
              setSaveStatus('error');
            }
          }
        }, 250);
      }
    },
    [settings, questions, title, description, sections, theme, isQuiz, formId, updateHistory]
  );

  // Import Questions Success Handler
  const handleImportSuccess = (
    importedQuestions: QuestionData[],
    newSectionOrSections?: SectionData | SectionData[]
  ) => {
    let nextSections = sections;
    if (newSectionOrSections) {
      const added = Array.isArray(newSectionOrSections)
        ? newSectionOrSections
        : [newSectionOrSections];
      const existingIds = new Set(sections.map((s) => s.id));
      const fresh = added.filter((s) => !existingIds.has(s.id));
      if (fresh.length > 0) {
        nextSections = [...sections, ...fresh];
        setSections(nextSections);
      }
    }

    setQuestions((prev) => {
      const updated = [...prev, ...importedQuestions];
      updateHistory({
        title,
        description,
        sections: nextSections,
        questions: updated,
        theme,
        settings,
        isQuiz,
      });
      return updated;
    });

    if (importedQuestions.length > 0) {
      setActiveQuestionId(importedQuestions[0].id);
      if (importedQuestions[0].sectionId) {
        setActiveSectionId(importedQuestions[0].sectionId);
      }
    }
    showToast(
      `Successfully imported ${importedQuestions.length} ${
        importedQuestions.length === 1 ? 'question' : 'questions'
      }!`
    );
  };

  // Update Section
  const handleUpdateSection = async (sId: string, delta: Partial<SectionData>) => {
    const updated = sections.map((s) => (s.id === sId ? { ...s, ...delta } : s));
    setSections(updated);
    try {
      await fetch(`/api/forms/${formId}/sections/${sId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta),
      });
    } catch (err) {
      console.error('Section update error:', err);
    }
  };

  // Delete Section
  const handleDeleteSection = async (sId: string) => {
    if (sections.length <= 1) {
      showToast('A form must have at least one section');
      return;
    }
    try {
      const res = await fetch(`/api/forms/${formId}/sections/${sId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const updatedSecs = sections.filter((s) => s.id !== sId);
        const updatedQs = questions.filter((q) => q.sectionId !== sId);
        setSections(updatedSecs);
        setQuestions(updatedQs);
        showToast('Section deleted');
      }
    } catch {
      showToast('Failed to delete section');
    }
  };

  // Publish Form: Flush pending saves, sync questions atomically, and publish
  const handlePublish = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      if (defaultPointsSaveTimerRef.current) {
        clearTimeout(defaultPointsSaveTimerRef.current);
        defaultPointsSaveTimerRef.current = null;
      }
      setSaveStatus('saving');

      // 1. Flush any pending question saves
      await flushAllPendingQuestionSaves();

      // 2. Save form metadata
      await saveFormToServer();

      // 3. Atomically sync all current questions/options and publish
      const res = await fetch(`/api/forms/${formId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map((q) => ({
            id: q.id,
            sectionId: q.sectionId,
            title: q.title,
            description: q.description,
            type: q.type,
            isRequired: q.isRequired,
            orderIndex: q.orderIndex,
            validation: q.validation,
            config: q.config,
            quizPoints: q.quizPoints,
            quizAnswer: q.quizAnswer,
            quizExplanation: q.quizExplanation,
            options: q.options,
          })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setForm((prev: any) => ({ ...prev, status: 'PUBLISHED' }));
        setSaveStatus('saved');
        showToast('🎉 Form published! Anyone with the link can respond.');
      } else {
        setSaveStatus('error');
        showToast(data.error || 'Failed to publish form');
      }
    } catch {
      setSaveStatus('error');
      showToast('Error publishing form');
    }
  };

  if (isLoading || !form) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 transition-colors"
        style={{ backgroundColor: '#004B6E' }}
      >
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm font-medium text-sky-100">Opening FormCraft editor...</p>
        </div>
      </div>
    );
  }

  const effectiveBg =
    !theme.backgroundColor ||
    theme.backgroundColor.trim() === '' ||
    theme.backgroundColor.toLowerCase() === '#f0ebf8'
      ? '#004B6E'
      : theme.backgroundColor;

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-300"
      style={{
        backgroundColor: effectiveBg,
        fontFamily: theme.fontFamily || 'Inter',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm animate-in fade-in slide-in-from-bottom-4">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Editor Header */}
      <BuilderHeader
        title={title}
        onTitleChange={setTitle}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (activeTab === 'questions' && tab !== 'questions') {
            flushAllPendingQuestionSaves();
          }
          setActiveTab(tab);
        }}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenTheme={() => setIsThemeOpen(true)}
        onOpenLookup={() => setIsLookupOpen(true)}
        lookupCount={lookupMappings.length}
        onOpenShare={() => setIsShareOpen(true)}
        onPublish={handlePublish}
        isPublished={form.status === 'PUBLISHED'}
        publicId={form.publicId}
        responseCount={form._count?.submissions || 0}
        primaryColor={theme.primaryColor}
      />

      {/* Main Tab Views */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        {/* TAB 1: QUESTIONS CANVAS */}
        {activeTab === 'questions' && (
          <div className="flex gap-4">
            <div className="flex-1 space-y-4">
              {/* Form Title & Description Card */}
              <div
                className={`bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm ${
                  theme.borderRadius || 'rounded-xl'
                }`}
              >
                {/* Banner Image (only show if set, otherwise show sleek accent bar) */}
                {Boolean(theme.headerImageUrl && isLikelyImageSource(theme.headerImageUrl)) && !brokenBanner ? (
                  <div className="w-full overflow-hidden relative bg-white border-b border-gray-100 dark:border-gray-800">
                    <img
                      src={theme.headerImageUrl!}
                      alt="Header Banner"
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

                <div className="p-6 space-y-3">
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled form"
                    className="text-3xl font-extrabold border-none px-1 h-12 focus:ring-0 bg-transparent text-gray-900 dark:text-gray-100"
                  />
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Form description (e.g. Instructions for respondents)"
                    className="text-sm text-gray-600 dark:text-gray-400 border-none px-1 min-h-[60px] focus:ring-0 bg-transparent resize-none"
                  />
                </div>
              </div>

              {/* Sections & Sortable Questions Context */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {sections.map((sec, secIdx) => {
                  const sectionQuestions = questions.filter((q) => q.sectionId === sec.id);

                  return (
                    <div
                      key={sec.id}
                      className="space-y-4"
                      onClick={() => setActiveSectionId(sec.id)}
                    >
                      {/* Section Card (only show if multiple sections or non-default) */}
                      {sections.length > 1 && (
                        <SectionCard
                          section={sec}
                          sectionIndex={secIdx}
                          totalSections={sections.length}
                          onChange={(delta) => handleUpdateSection(sec.id, delta)}
                          onDelete={() => handleDeleteSection(sec.id)}
                          allSections={sections}
                          borderRadius={theme.borderRadius}
                        />
                      )}

                      {/* Question Cards Sortable Context */}
                      <SortableContext
                        items={sectionQuestions.map((q) => q.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {sectionQuestions.map((q) => (
                          <QuestionCard
                            key={q.id}
                            question={q}
                            isActive={activeQuestionId === q.id}
                            onSelect={() => {
                              setActiveQuestionId(q.id);
                              setActiveSectionId(sec.id);
                            }}
                            onChange={(delta) => handleUpdateQuestion(q.id, delta)}
                            onDuplicate={() => handleDuplicateQuestion(q.id)}
                            onDelete={() => handleDeleteQuestion(q.id)}
                            sections={sections}
                            isQuiz={isQuiz}
                            primaryColor={theme.primaryColor}
                            borderRadius={theme.borderRadius}
                            lookupMappings={lookupMappings}
                            onOpenLookup={() => setIsLookupOpen(true)}
                            quizDefaultPoints={settings?.quizDefaultPoints ?? 1}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  );
                })}
              </DndContext>
            </div>

            {/* Right-side Floating Action Toolbar */}
            <FloatingToolbar
              onAddQuestion={handleAddQuestion}
              onImportQuestions={() => setIsImportModalOpen(true)}
              onAddSection={handleAddSection}
            />
          </div>
        )}

        {/* TAB 2: RESPONSES */}
        {activeTab === 'responses' && (
          <ResponsesTab
            formId={form.id}
            isQuiz={isQuiz}
            isAcceptingResponses={settings?.isAcceptingResponses ?? true}
            onToggleAccepting={(accepting) => {
              setSettings((prev: any) => ({ ...prev, isAcceptingResponses: accepting }));
            }}
            primaryColor={theme.primaryColor}
          />
        )}

        {/* TAB 3: SETTINGS */}
        {activeTab === 'settings' && (
          <SettingsTab
            isQuiz={isQuiz}
            onToggleQuiz={handleToggleQuiz}
            settings={settings}
            onChangeSettings={handleSettingsChange}
            primaryColor={theme.primaryColor}
            questions={questions}
            formId={form.id}
            onOpenLiveDashboard={() => setActiveTab('responses')}
          />
        )}
      </main>

      {/* Theme Drawer Modal */}
      <ThemeDrawer
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        theme={theme}
        onChange={(delta) => setTheme((prev) => ({ ...prev, ...delta }))}
      />

      {/* Collaborators Modal */}
      <CollaboratorsModal
        formId={form.id}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {/* Lookup Configuration Modal */}
      <LookupConfigModal
        formId={form.id}
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        questions={questions}
        onMappingsChange={(updated) => setLookupMappings(updated)}
      />

      {/* Import Questions Modal */}
      <ImportQuestionsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentFormId={form.id}
        sections={sections}
        activeSectionId={
          questions.find((q) => q.id === activeQuestionId)?.sectionId || sections[0]?.id
        }
        onImportSuccess={handleImportSuccess}
        primaryColor={theme.primaryColor}
        isQuiz={isQuiz}
        onEnableQuiz={() => {
          setIsQuiz(true);
          showToast('Quiz mode enabled!');
        }}
      />
    </div>
  );
}

export default function FormBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="flex flex-col items-center gap-3 text-purple-600">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-medium text-gray-500">Opening FormCraft editor...</p>
          </div>
        </div>
      }
    >
      <FormBuilderContent />
    </Suspense>
  );
}
