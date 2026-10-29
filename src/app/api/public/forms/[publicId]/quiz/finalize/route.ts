import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { finalizeQuizAttemptSchema } from '@/lib/validation/quizAttemptSchema';
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
    const parseResult = finalizeQuizAttemptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid finalization request', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { attemptId, reason, finalAnswers } = parseResult.data;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: { options: true },
            },
          },
        },
      },
    });

    if (!form || !form.isQuiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const user = await getAuthUserFromRequest(request);
    if (form.settings?.requireAuth && !user) {
      return NextResponse.json(
        {
          error: 'Authentication required: You must be signed in to submit this quiz.',
          requireAuth: true,
          redirectUrl: `/login?redirect=/f/${publicId}`,
        },
        { status: 401 }
      );
    }

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt || attempt.formId !== form.id) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    // Atomic idempotent finalization
    const finalized = await prisma.$transaction(async (tx) => {
      return await finalizeAttemptInTx(tx, attempt, form, reason, finalAnswers);
    });

    // Score breakdown formatting if release grade is IMMEDIATE
    const settings = form.settings;
    const isImmediate = (settings?.quizReleaseGrade ?? 'IMMEDIATE') === 'IMMEDIATE';
    let scoreResult: any = null;

    if (isImmediate) {
      const allQuestions = form.sections.flatMap((s) => s.questions);
      const showCorrect = Boolean(settings?.quizShowCorrectAnswers);
      const showFeedback = Boolean(settings?.quizShowFeedback);
      const showPoints = settings?.quizShowPointsEarned !== false;

      const passPercentage = settings?.quizPassPercentage;
      const hasPassRule = passPercentage !== null && passPercentage !== undefined;
      const isPassed = hasPassRule ? (finalized.percentage || 0) >= Number(passPercentage) : null;
      const customMessage =
        isPassed === true
          ? settings?.quizPassMessage
          : isPassed === false
            ? settings?.quizFailMessage
            : null;

      const breakdown = (finalized.gradedAnswers || []).map((g: any) => {
        const q = allQuestions.find((item) => item.id === g.questionId);
        const cfg = (q?.quizAnswer as any) || {};
        return {
          questionId: g.questionId,
          questionTitle: q?.title,
          score: showPoints ? g.score : undefined,
          maxPoints: showPoints ? (q?.quizPoints || 0) : undefined,
          isCorrect: g.isCorrect,
          submittedValue: g.value,
          correctAnswer: showCorrect
            ? cfg.correctValues || cfg.correctValue || cfg.acceptedAnswers || (cfg.numberMode ? cfg : null)
            : undefined,
          explanation: showFeedback ? q?.quizExplanation : undefined,
          feedback: showFeedback ? (g.isCorrect ? cfg.correctFeedback : cfg.incorrectFeedback) : undefined,
        };
      });

      scoreResult = {
        total: showPoints ? finalized.earnedScore : undefined,
        max: showPoints ? finalized.maxScore : undefined,
        percentage: showPoints ? finalized.percentage : undefined,
        durationSeconds: finalized.durationSeconds,
        isPassed,
        customMessage,
        showPoints,
        showCorrect,
        showFeedback,
        breakdown: showCorrect || showFeedback || showPoints ? breakdown : undefined,
      };
    }

    return NextResponse.json({
      message:
        reason === 'OVERALL_TIMEOUT'
          ? 'Time expired. Your quiz attempt was automatically submitted and scored.'
          : isImmediate
            ? settings?.confirmationMessage || 'Your response has been recorded.'
            : 'Your response has been recorded. Grades will be released after manual review.',
      attempt: {
        id: finalized.id,
        status: finalized.status,
        timeoutReason: finalized.timeoutReason,
        earnedScore: finalized.earnedScore,
        maxScore: finalized.maxScore,
        percentage: finalized.percentage,
        durationSeconds: finalized.durationSeconds,
        submissionId: finalized.submissionId,
      },
      allowResponseEditing: Boolean(settings?.allowResponseEditing),
      restrictOneResponse: Boolean(settings?.restrictOneResponse),
      isGradeReleased: isImmediate,
      score: scoreResult,
    });
  } catch (error) {
    console.error('Failed to finalize quiz attempt:', error);
    return NextResponse.json({ error: 'Failed to finalize quiz attempt' }, { status: 500 });
  }
}
