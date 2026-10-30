import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { quizNavigateSchema } from '@/lib/validation/quizAttemptSchema';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';
import { finalizeAttemptInTx } from '@/lib/quiz/quizAttemptService';
import { getAuthUserFromRequest } from '@/lib/auth/session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureQuizSchema();
    const { publicId } = await params;

    const body = await request.json();
    const effectiveBody = {
      ...body,
      currentAnswer:
        body.currentAnswer ||
        (body.fromQuestionId
          ? { questionId: body.fromQuestionId, value: body.answerValue }
          : undefined),
    };
    const parseResult = quizNavigateSchema.safeParse(effectiveBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid navigation data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { attemptId, targetQuestionId, currentAnswer, direction } = parseResult.data;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
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

    // 1. Check overall deadline
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

    const allQuestions = form.sections.flatMap((s) => s.questions);
    const targetQ = allQuestions.find((q) => q.id === targetQuestionId);

    if (!targetQ) {
      return NextResponse.json({ error: 'Target question not found' }, { status: 404 });
    }

    const questionOrder =
      attempt.questionOrder && attempt.questionOrder.length > 0
        ? attempt.questionOrder
        : allQuestions.map((q) => q.id);

    const targetQIndex =
      questionOrder.indexOf(targetQuestionId) !== -1
        ? questionOrder.indexOf(targetQuestionId)
        : allQuestions.findIndex((q) => q.id === targetQuestionId);

    const navigationPolicy = form.settings?.quizNavigationPolicy || 'BACKWARD_ENABLED';
    const lockedIds = [...attempt.lockedQuestionIds];
    const savedAnswers = { ...(attempt.savedAnswers as Record<string, any>) };
    const timingMap = { ...(attempt.questionTiming as Record<string, any>) };

    // 2. Save current answer if valid and not expired
    const currentQId = attempt.currentQuestionId;
    if (currentQId && currentAnswer && currentAnswer.questionId === currentQId) {
      const curTiming = timingMap[currentQId];
      const isCurExpired = curTiming?.deadline && new Date(curTiming.deadline) < now;
      if (!isCurExpired && !lockedIds.includes(currentQId)) {
        savedAnswers[currentQId] = currentAnswer.value;
        if (curTiming) {
          curTiming.answerSavedAt = now.toISOString();
        }
      }
    }

    // 3. Navigation Policy & Locking
    if (navigationPolicy === 'FORWARD_ONLY') {
      // If moving away from current question, lock it permanently
      if (currentQId && !lockedIds.includes(currentQId)) {
        lockedIds.push(currentQId);
      }
      // Cannot navigate to any locked question
      if (lockedIds.includes(targetQuestionId)) {
        return NextResponse.json(
          { error: 'Forward-only mode: earlier questions are locked and cannot be revisited.' },
          { status: 403 }
        );
      }
    } else {
      // BACKWARD_ENABLED:
      // Cannot revisit a question if its individual timer has expired
      const targetTiming = timingMap[targetQuestionId];
      if (targetTiming?.deadline && new Date(targetTiming.deadline) < now) {
        return NextResponse.json(
          { error: 'The time limit for that question has already expired.' },
          { status: 403 }
        );
      }
    }

    // 4. Per-Question Deadline initialization
    let targetQuestionDeadline: Date | null = null;
    let targetQuestionStartedAt: Date = now;

    if (timingMap[targetQuestionId]) {
      // Target question was visited previously: preserve its original deadline!
      const existingTiming = timingMap[targetQuestionId];
      targetQuestionStartedAt = new Date(existingTiming.startedAt);
      targetQuestionDeadline = existingTiming.deadline ? new Date(existingTiming.deadline) : null;
    } else {
      // First visit to target question
      const defaultQTimer =
        (form.settings?.quizTimerMode === 'QUESTION' || form.settings?.quizTimerMode === 'BOTH') &&
        form.settings?.quizQuestionTimeLimitSeconds
          ? form.settings.quizQuestionTimeLimitSeconds
          : 0;
      const effectiveTargetQTimer =
        targetQ.timeLimitSeconds && targetQ.timeLimitSeconds > 0
          ? targetQ.timeLimitSeconds
          : defaultQTimer;

      if (effectiveTargetQTimer > 0) {
        targetQuestionDeadline = new Date(now.getTime() + effectiveTargetQTimer * 1000);
      }
      timingMap[targetQuestionId] = {
        startedAt: now.toISOString(),
        deadline: targetQuestionDeadline?.toISOString() || null,
        timeLimitSeconds: effectiveTargetQTimer,
      };
    }

    // 5. Update attempt state atomically
    const updated = await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        currentQuestionId: targetQuestionId,
        currentQuestionIndex: targetQIndex,
        currentQuestionStartedAt: targetQuestionStartedAt,
        currentQuestionDeadline: targetQuestionDeadline,
        savedAnswers,
        questionTiming: timingMap,
        lockedQuestionIds: lockedIds,
      },
    });

    return NextResponse.json({
      attempt: {
        id: updated.id,
        currentQuestionId: updated.currentQuestionId,
        currentQuestionIndex: updated.currentQuestionIndex,
        currentQuestionStartedAt: updated.currentQuestionStartedAt,
        currentQuestionDeadline: updated.currentQuestionDeadline,
        lockedQuestionIds: updated.lockedQuestionIds,
        savedAnswers: updated.savedAnswers,
        questionOrder,
        status: updated.status,
      },
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error('Failed to navigate quiz question:', error);
    return NextResponse.json({ error: 'Failed to process navigation' }, { status: 500 });
  }
}
