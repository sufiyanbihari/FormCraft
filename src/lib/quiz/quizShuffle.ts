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
  orderIndex?: number;
  questions?: FormQuestionLike[];
  [key: string]: any;
}

export interface QuizFormLike {
  id?: string;
  settings?: {
    shuffleQuestions?: boolean | null;
    [key: string]: any;
  } | null;
  sections?: FormSectionLike[];
  [key: string]: any;
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
 * Generates the ordered list of question IDs for a quiz attempt.
 * If shuffleQuestions is enabled, shuffles interactive questions independently
 * inside each section, preserving non-interactive elements (headers, text blocks)
 * and section structure.
 * If shuffleQuestions is disabled or missing, returns question IDs in original database order.
 */
export function generateQuizQuestionOrder(
  form: QuizFormLike,
  rng: () => number = Math.random
): string[] {
  const sections = form.sections || [];
  const shouldShuffle = Boolean(form.settings?.shuffleQuestions);

  if (!shouldShuffle) {
    // Preserve original database order
    return sections.flatMap((sec) => (sec.questions || []).map((q) => q.id));
  }

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
 * Reconstructs the questions within each section according to an attempt's persisted questionOrder.
 * If questionOrder is empty or missing, returns sections unchanged.
 */
export function reorderSectionsByQuestionOrder<T extends FormSectionLike>(
  sections: T[],
  questionOrder?: string[] | null
): T[] {
  if (!sections || !Array.isArray(sections)) return [];
  if (!questionOrder || questionOrder.length === 0) return sections;

  const orderMap = new Map<string, number>();
  questionOrder.forEach((id, idx) => orderMap.set(id, idx));

  return sections.map((sec) => {
    const questions = [...(sec.questions || [])];
    const hasOrderedQuestions = questions.some((q) => orderMap.has(q.id));
    if (!hasOrderedQuestions) return sec;

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
}

