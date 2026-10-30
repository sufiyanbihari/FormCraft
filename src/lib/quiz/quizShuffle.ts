/**
 * Quiz Question Shuffling Service & Utilities
 * Provides statistically sound, unbiased Fisher-Yates randomization
 * with deterministic RNG injection for automated testing.
 */

export const NON_INTERACTIVE_QUESTION_TYPES = [
  'SECTION_HEADER',
  'TEXT_BLOCK',
  'IMAGE_BLOCK',
  'VIDEO_EMBED',
] as const;

export interface FormQuestionLike {
  id: string;
  type: string;
  sectionId?: string;
  orderIndex?: number;
  [key: string]: any;
}

export interface FormSectionLike {
  id: string;
  title?: string;
  description?: string | null;
  orderIndex?: number;
  questions?: FormQuestionLike[];
  [key: string]: any;
}

export interface QuizFormLike {
  id?: string;
  settings?: {
    shuffleQuestions?: boolean | null;
    shuffleQuestionOrder?: boolean | null;
    [key: string]: any;
  } | null;
  sections?: FormSectionLike[];
  [key: string]: any;
}

/**
 * Checks whether shuffle is enabled for the form.
 * Accepts both shuffleQuestions and shuffleQuestionOrder property variants.
 */
export function isShuffleEnabled(form: QuizFormLike): boolean {
  const settings = form?.settings;
  if (!settings) return false;
  return Boolean(
    settings.shuffleQuestions ||
    (settings as any).shuffleQuestionOrder ||
    (form as any).shuffleQuestionOrder
  );
}

/**
 * Performs an unbiased Fisher-Yates (Knuth) shuffle on an array.
 * Accepts an optional custom random number generator (defaulting to Math.random)
 * for deterministic unit and regression testing.
 */
export function fisherYatesShuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Helper to extract interactive questions from a section.
 */
export function getInteractiveQuestions(section: FormSectionLike): FormQuestionLike[] {
  return (section.questions || []).filter(
    (q) => !NON_INTERACTIVE_QUESTION_TYPES.includes(q.type as any)
  );
}

/**
 * Generates the authoritative ordered list of question IDs for a quiz attempt.
 *
 * Handles all quiz structural scenarios:
 * - Scenario A (One question per section, e.g. 30 sections with 1 question each):
 *   Moves the entire section-question pairs as complete units so that the sequence of questions
 *   is properly randomized and section titles/descriptions stay attached to their questions.
 * - Scenario B (Single section with multiple questions):
 *   Shuffles questions within the section using Fisher-Yates.
 * - Scenario C (Multiple sections, each with multiple questions):
 *   Preserves section boundaries while independently shuffling questions within each section.
 * - Scenario D (Mixed section structure):
 *   Preserves section boundaries and shuffles eligible questions within sections.
 */
export function generateQuizQuestionOrder(
  form: QuizFormLike,
  rng: () => number = Math.random
): string[] {
  const sections = form.sections || [];
  if (!isShuffleEnabled(form)) {
    // Preserve original database order
    return sections.flatMap((sec) => (sec.questions || []).map((q) => q.id));
  }

  // Count interactive questions in each section
  const sectionInteractiveCounts = sections.map((sec) => getInteractiveQuestions(sec).length);
  const maxInteractiveCount = Math.max(0, ...sectionInteractiveCounts);
  const sectionsWithQuestions = sections.filter((sec) => getInteractiveQuestions(sec).length > 0);

  // Scenario A: One question per section (e.g. 30 sections, 1 question each)
  // When there are multiple sections with questions, and NO section has more than 1 interactive question.
  if (sectionsWithQuestions.length > 1 && maxInteractiveCount <= 1) {
    // Separate leading intro sections (sections with 0 interactive questions) from question sections
    const introSections: FormSectionLike[] = [];
    let idx = 0;
    while (idx < sections.length && getInteractiveQuestions(sections[idx]).length === 0) {
      introSections.push(sections[idx]);
      idx++;
    }

    const questionSections = sections.slice(idx);
    const shuffledQuestionSections = fisherYatesShuffle(questionSections, rng);
    const finalSections = [...introSections, ...shuffledQuestionSections];

    const orderedIds: string[] = [];
    for (const sec of finalSections) {
      for (const q of sec.questions || []) {
        orderedIds.push(q.id);
      }
    }
    return orderedIds;
  }

  // Scenario B, C, D: Single section or multi-question sections (preserve section boundaries)
  const orderedIds: string[] = [];

  for (const sec of sections) {
    const questions = sec.questions || [];
    const nonInteractive: FormQuestionLike[] = [];
    const interactive: FormQuestionLike[] = [];

    for (const q of questions) {
      if (NON_INTERACTIVE_QUESTION_TYPES.includes(q.type as any)) {
        nonInteractive.push(q);
      } else {
        interactive.push(q);
      }
    }

    const shuffledInteractive = fisherYatesShuffle(interactive, rng);
    const sectionOrdered = [...nonInteractive, ...shuffledInteractive];

    for (const q of sectionOrdered) {
      orderedIds.push(q.id);
    }
  }

  return orderedIds;
}

/**
 * Reconstructs the questions within each section AND the section order itself
 * according to an attempt's persisted questionOrder.
 *
 * For Scenario A (one question per section), reorders the section-question units
 * so that section 1 of N corresponds to the first item of questionOrder, keeping
 * section titles and question content together.
 * For Scenario B/C/D, preserves section order while ordering questions inside.
 */
export function reorderSectionsByQuestionOrder<T extends FormSectionLike>(
  sections: T[],
  questionOrder?: string[] | null
): T[] {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return [];
  if (!questionOrder || questionOrder.length === 0) return sections;

  const orderMap = new Map<string, number>();
  questionOrder.forEach((id, idx) => orderMap.set(id, idx));

  // 1. Reorder questions within each section
  const updatedSections = sections.map((sec) => {
    const questions = [...(sec.questions || [])];
    const hasOrdered = questions.some((q) => orderMap.has(q.id));
    if (!hasOrdered) return sec;

    questions.sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      return idxA - idxB;
    });

    return {
      ...sec,
      questions,
    };
  });

  // 2. Reorder sections array itself based on the earliest question appearance in questionOrder
  return [...updatedSections].sort((secA, secB) => {
    const getMinIndex = (sec: T, origIndex: number): number => {
      let min = Infinity;
      for (const q of sec.questions || []) {
        if (orderMap.has(q.id)) {
          min = Math.min(min, orderMap.get(q.id)!);
        }
      }
      if (min === Infinity) {
        return origIndex * 0.0001 - 1;
      }
      return min;
    };

    const origIdxA = sections.indexOf(secA);
    const origIdxB = sections.indexOf(secB);
    const minA = getMinIndex(secA, origIdxA);
    const minB = getMinIndex(secB, origIdxB);

    return minA - minB;
  });
}
