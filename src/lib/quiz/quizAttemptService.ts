import { prisma } from '@/lib/db/prisma';
import crypto from 'crypto';

export interface GradedAnswerResult {
  questionId: string;
  value: any;
  score: number;
  isCorrect: boolean;
}

/**
 * Authoritative grading calculation reusing existing FormCraft grading rules.
 */
export function calculateQuizScores(
  allQuestions: any[],
  answersMap: Map<string, any>
): {
  totalScore: number;
  maxScore: number;
  percentage: number;
  gradedAnswers: GradedAnswerResult[];
} {
  let totalScore = 0;
  let maxScore = 0;
  const gradedAnswers: GradedAnswerResult[] = [];

  for (const q of allQuestions) {
    const qPoints = q.quizPoints || 0;
    maxScore += qPoints;
    const submittedVal = answersMap.get(q.id);
    const qAnswerConfig: any = q.quizAnswer || {};

    let isCorrect = false;
    let pointsEarned = 0;

    if (qPoints > 0 && submittedVal !== undefined && submittedVal !== null && submittedVal !== '') {
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'DROPDOWN') {
        const correctVal = qAnswerConfig.correctValue;
        if (correctVal && String(submittedVal).trim().toLowerCase() === String(correctVal).trim().toLowerCase()) {
          isCorrect = true;
          pointsEarned = qPoints;
        }
      } else if (q.type === 'CHECKBOXES') {
        const correctVals: string[] = qAnswerConfig.correctValues || [];
        if (Array.isArray(submittedVal)) {
          const sSorted = [...submittedVal].map((v) => String(v).trim().toLowerCase()).sort();
          const cSorted = [...correctVals].map((v) => String(v).trim().toLowerCase()).sort();
          if (
            sSorted.length === cSorted.length &&
            sSorted.every((v, i) => v === cSorted[i])
          ) {
            isCorrect = true;
            pointsEarned = qPoints;
          }
        }
      } else if (q.type === 'SHORT_ANSWER') {
        const accepted: string[] =
          Array.isArray(qAnswerConfig.acceptedAnswers) && qAnswerConfig.acceptedAnswers.length > 0
            ? qAnswerConfig.acceptedAnswers
            : qAnswerConfig.correctValue
              ? [qAnswerConfig.correctValue]
              : [];
        const caseSensitive = Boolean(qAnswerConfig.caseSensitive);
        const subStr = String(submittedVal).trim();
        if (
          accepted.some((ans: string) => {
            const a = String(ans).trim();
            return caseSensitive ? subStr === a : subStr.toLowerCase() === a.toLowerCase();
          })
        ) {
          isCorrect = true;
          pointsEarned = qPoints;
        }
      } else if (q.type === 'NUMBER') {
        const numVal = Number(submittedVal);
        if (!isNaN(numVal)) {
          const mode = qAnswerConfig.numberMode || 'exact';
          if (mode === 'exact') {
            const target = Number(qAnswerConfig.exactValue ?? qAnswerConfig.correctValue);
            if (!isNaN(target) && numVal === target) {
              isCorrect = true;
              pointsEarned = qPoints;
            }
          } else if (mode === 'tolerance') {
            const target = Number(qAnswerConfig.exactValue);
            const tol = Math.abs(Number(qAnswerConfig.tolerance || 0));
            if (!isNaN(target) && Math.abs(numVal - target) <= tol) {
              isCorrect = true;
              pointsEarned = qPoints;
            }
          } else if (mode === 'range') {
            const min = Number(qAnswerConfig.minVal);
            const max = Number(qAnswerConfig.maxVal);
            if (!isNaN(min) && !isNaN(max) && numVal >= min && numVal <= max) {
              isCorrect = true;
              pointsEarned = qPoints;
            }
          }
        }
      }
    }

    totalScore += pointsEarned;
    gradedAnswers.push({
      questionId: q.id,
      value: submittedVal,
      score: pointsEarned,
      isCorrect,
    });
  }

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  return { totalScore, maxScore, percentage, gradedAnswers };
}

/**
 * Idempotently finalizes a quiz attempt within a Prisma transaction.
 * Creates or links the corresponding FormSubmission and SubmissionAnswers.
 */
export async function finalizeAttemptInTx(
  tx: any,
  attempt: any,
  form: any,
  reason: 'MANUAL_SUBMISSION' | 'OVERALL_TIMEOUT' | 'QUESTION_TIMEOUT',
  finalAnswers?: { questionId: string; value: any }[]
): Promise<any> {
  // If already completed or timed out, return current state
  if (attempt.status === 'COMPLETED' || attempt.status === 'TIMED_OUT') {
    return attempt;
  }

  const now = new Date();
  const allQuestions = form.sections.flatMap((s: any) => s.questions || []);

  // Merge any latest answers
  const existingAnswers = (attempt.savedAnswers as Record<string, any>) || {};
  if (finalAnswers && Array.isArray(finalAnswers)) {
    for (const fa of finalAnswers) {
      if (fa.questionId) {
        existingAnswers[fa.questionId] = fa.value;
      }
    }
  }

  const answersMap = new Map<string, any>();
  for (const [k, v] of Object.entries(existingAnswers)) {
    answersMap.set(k, v);
  }

  const { totalScore, maxScore, percentage, gradedAnswers } = calculateQuizScores(
    allQuestions,
    answersMap
  );

  const durationSeconds = attempt.startedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000))
    : 0;

  const isImmediate = (form.settings?.quizReleaseGrade ?? 'IMMEDIATE') === 'IMMEDIATE';
  const isGradeReleased = isImmediate;
  const gradeReleasedAt = isGradeReleased ? now : null;

  // Generate editToken & idempotency key for persistent submission
  const editToken = crypto.randomBytes(32).toString('hex');
  const idempotencyKey = `attempt-sub-${attempt.id}`;

  // 1. Create or update FormSubmission record
  let submission = await tx.formSubmission.findUnique({
    where: { idempotencyKey },
  });

  if (!submission) {
    submission = await tx.formSubmission.create({
      data: {
        formId: form.id,
        formVersionId: form.publishedVersionId,
        respondentEmail: attempt.participantName
          ? `${attempt.participantIdentity} (${attempt.participantName})`
          : attempt.participantIdentity,
        editToken,
        idempotencyKey,
        isComplete: true,
        submittedAt: now,
        totalScore,
        maxScore,
        isGradeReleased,
        gradeReleasedAt,
      },
    });

    // Save individual answers
    for (const q of allQuestions) {
      const submittedVal = answersMap.get(q.id);
      if (submittedVal !== undefined && submittedVal !== null) {
        const graded = gradedAnswers.find((g) => g.questionId === q.id);
        await tx.submissionAnswer.create({
          data: {
            submissionId: submission.id,
            questionId: q.id,
            value: submittedVal,
            textAnswer:
              typeof submittedVal === 'string'
                ? submittedVal
                : Array.isArray(submittedVal)
                  ? submittedVal.join(', ')
                  : JSON.stringify(submittedVal),
            score: graded?.score ?? 0,
            isCorrect: graded?.isCorrect ?? false,
          },
        });
      }
    }
  }

  // 2. Update QuizAttempt
  const finalStatus = reason === 'MANUAL_SUBMISSION' ? 'COMPLETED' : 'TIMED_OUT';
  const updatedAttempt = await tx.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      status: finalStatus,
      completedAt: now,
      finalizedAt: now,
      timeoutReason: reason,
      earnedScore: totalScore,
      maxScore,
      percentage,
      durationSeconds,
      savedAnswers: existingAnswers,
      submissionId: submission.id,
    },
  });

  return {
    ...updatedAttempt,
    submission,
    gradedAnswers,
  };
}

/**
 * Checks whether an attempt has timed out (overall deadline passed)
 * and finalizes it automatically if needed.
 */
export async function reconcileAttemptTimeout(attempt: any, form: any): Promise<any> {
  if (attempt.status !== 'IN_PROGRESS') {
    return attempt;
  }

  const now = new Date();

  // 1. Check overall deadline
  if (attempt.overallDeadline && new Date(attempt.overallDeadline) < now) {
    return await prisma.$transaction(async (tx) => {
      const freshAttempt = await tx.quizAttempt.findUnique({ where: { id: attempt.id } });
      if (freshAttempt && freshAttempt.status === 'IN_PROGRESS') {
        return await finalizeAttemptInTx(tx, freshAttempt, form, 'OVERALL_TIMEOUT');
      }
      return freshAttempt;
    });
  }

  return attempt;
}
