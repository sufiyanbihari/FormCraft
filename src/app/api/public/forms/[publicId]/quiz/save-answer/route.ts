import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { saveQuizAnswerSchema } from '@/lib/validation/quizAttemptSchema';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';
import { reconcileAttemptTimeout, finalizeAttemptInTx } from '@/lib/quiz/quizAttemptService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureQuizSchema();
    const { publicId } = await params;

    const body = await request.json();
    const parseResult = saveQuizAnswerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid answer data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { attemptId, questionId, value } = parseResult.data;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        sections: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!form || !form.isQuiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt || attempt.formId !== form.id) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    const now = new Date();

    // 1. Check overall deadline timeout
    if (attempt.overallDeadline && new Date(attempt.overallDeadline) < now) {
      const finalized = await prisma.$transaction(async (tx) => {
        return await finalizeAttemptInTx(tx, attempt, form, 'OVERALL_TIMEOUT');
      });
      return NextResponse.json(
        {
          error: 'The quiz deadline has expired. Your attempt has been automatically finalized.',
          attempt: finalized,
          timedOut: true,
        },
        { status: 403 }
      );
    }

    if (attempt.status !== 'IN_PROGRESS') {
      return NextResponse.json(
        { error: 'This quiz attempt is no longer active.' },
        { status: 400 }
      );
    }

    // 2. Check forward-only lock
    if (attempt.lockedQuestionIds.includes(questionId)) {
      return NextResponse.json(
        { error: 'This question has been locked and cannot be modified.' },
        { status: 403 }
      );
    }

    // 3. Check individual question deadline timeout
    const allQuestions = form.sections.flatMap((s) => s.questions);
    const question = allQuestions.find((q) => q.id === questionId);
    const timingMap = (attempt.questionTiming as Record<string, any>) || {};
    const qTiming = timingMap[questionId];

    if (qTiming?.deadline && new Date(qTiming.deadline) < now) {
      return NextResponse.json(
        { error: 'The time limit for this question has expired.' },
        { status: 403 }
      );
    }

    // 4. Save answer atomically
    const savedAnswers = (attempt.savedAnswers as Record<string, any>) || {};
    savedAnswers[questionId] = value;

    if (qTiming) {
      qTiming.answerSavedAt = now.toISOString();
      timingMap[questionId] = qTiming;
    }

    const updated = await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        savedAnswers,
        questionTiming: timingMap,
      },
    });

    return NextResponse.json({
      success: true,
      questionId,
      value,
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error('Failed to save quiz answer:', error);
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 });
  }
}
