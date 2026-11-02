/**
 * Shared Quiz Timer Precedence & Resolution Utilities
 *
 * Provides single authoritative source of truth for:
 * - Inherited vs. custom per-question timers
 * - Quiz timer modes ('NONE' | 'QUESTION' | 'OVERALL' | 'BOTH')
 * - Question countdown calculation in editor and public quiz runtime
 */

export interface FormSettingsTimerConfig {
  quizTimerMode?: string | null;
  quizDurationMinutes?: number | null;
  quizQuestionTimeLimitSeconds?: number | null;
}

export interface QuestionTimerConfig {
  timeLimitSeconds?: number | null;
}

export interface EffectiveQuestionTimerResult {
  /**
   * The effective time limit in seconds for this question.
   * - If an individual override (> 0) is set, returns that override.
   * - Otherwise, if quizTimerMode is 'QUESTION' or 'BOTH', returns the quiz-level limit.
   * - Otherwise, returns 0 (no countdown).
   */
  effectiveSeconds: number;

  /**
   * True if the question is using the inherited quiz-level per-question timer.
   */
  isInherited: boolean;

  /**
   * True if the question has an explicit positive individual override (> 0).
   */
  hasOverride: boolean;

  /**
   * True if a per-question countdown is active for this question.
   */
  isTimerActive: boolean;
}

/**
 * Calculates the authoritative effective time limit in seconds for a question.
 *
 * Precedence Rules:
 * 1. If form is not in quiz mode (isQuiz === false), effective timer is 0.
 * 2. If question has an explicit individual override (timeLimitSeconds > 0):
 *    effective timer is question.timeLimitSeconds (hasOverride = true, isInherited = false).
 * 3. If quizTimerMode is 'QUESTION' or 'BOTH' and settings.quizQuestionTimeLimitSeconds > 0:
 *    effective timer defaults to settings.quizQuestionTimeLimitSeconds (hasOverride = false, isInherited = true).
 * 4. Otherwise (timer mode 'NONE' or 'OVERALL', or no timer configured):
 *    effective timer is 0 (hasOverride = false, isInherited = false).
 *
 * Note on Zero (0) semantics:
 * An individual timer value of 0 (or null/undefined) explicitly denotes "NO individual override"
 * and therefore inherits the configured quiz-level default.
 */
export function getEffectiveQuestionTimer(
  question?: QuestionTimerConfig | null,
  settings?: FormSettingsTimerConfig | null,
  isQuiz = true
): EffectiveQuestionTimerResult {
  if (!isQuiz) {
    return {
      effectiveSeconds: 0,
      isInherited: false,
      hasOverride: false,
      isTimerActive: false,
    };
  }

  const hasOverride = Boolean(
    question?.timeLimitSeconds !== undefined &&
    question?.timeLimitSeconds !== null &&
    Number(question.timeLimitSeconds) > 0
  );

  if (hasOverride) {
    const overrideSec = Math.max(0, Number(question!.timeLimitSeconds));
    return {
      effectiveSeconds: overrideSec,
      isInherited: false,
      hasOverride: true,
      isTimerActive: overrideSec > 0,
    };
  }

  const isTimerModeActive =
    settings?.quizTimerMode === 'QUESTION' || settings?.quizTimerMode === 'BOTH';

  const defaultLimit =
    isTimerModeActive &&
    settings?.quizQuestionTimeLimitSeconds != null &&
    Number(settings.quizQuestionTimeLimitSeconds) > 0
      ? Math.max(0, Number(settings.quizQuestionTimeLimitSeconds))
      : 0;

  return {
    effectiveSeconds: defaultLimit,
    isInherited: defaultLimit > 0,
    hasOverride: false,
    isTimerActive: defaultLimit > 0,
  };
}

