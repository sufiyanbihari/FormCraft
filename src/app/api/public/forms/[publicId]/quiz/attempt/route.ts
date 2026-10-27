import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { startQuizAttemptSchema } from '@/lib/validation/quizAttemptSchema';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';
import { reconcileAttemptTimeout } from '@/lib/quiz/quizAttemptService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureQuizSchema();
    const { publicId } = await params;

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

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This quiz is not found or is currently closed.' },
        { status: 404 }
      );
    }

    if (!form.isQuiz) {
      return NextResponse.json(
        { error: 'This form is not configured as a quiz.' },
        { status: 400 }
      );
    }

    const settings = form.settings;
    const now = new Date();

    // Availability validation
    if (settings) {
      if (!settings.isAcceptingResponses) {
        return NextResponse.json(
          { error: settings.closedMessage || 'This quiz is no longer accepting responses.' },
          { status: 403 }
        );
      }
      if (settings.startDate && new Date(settings.startDate) > now) {
        return NextResponse.json(
          { error: 'This quiz has not opened yet.' },
          { status: 403 }
        );
      }
      if (settings.endDate && new Date(settings.endDate) < now) {
        return NextResponse.json(
          { error: settings.closedMessage || 'The deadline for this quiz has passed.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const parseResult = startQuizAttemptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid participant identity', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { participantIdentity, participantName } = parseResult.data;
    const cleanIdentity = participantIdentity.trim();

    // Roster validation if roster mode is enabled
    let rosterEntryId: string | null = null;
    let verifiedName: string | null = participantName || null;

    if (settings?.quizRosterMode === 'ROSTER') {
      const rosterEntry = await prisma.quizParticipantRoster.findFirst({
        where: {
          formId: form.id,
          participantId: {
            equals: cleanIdentity,
            mode: 'insensitive',
          },
        },
      });

      if (!rosterEntry) {
        return NextResponse.json(
          {
            error:
              'Your Participant ID was not found in the authorized roster for this quiz. Please contact your administrator.',
          },
          { status: 403 }
        );
      }

      rosterEntryId = rosterEntry.id;
      if (rosterEntry.name && !verifiedName) {
        verifiedName = rosterEntry.name;
      }
    }

    const allQuestions = form.sections.flatMap((s) => s.questions);
    const firstQuestion = allQuestions[0] || null;

    // Concurrency-safe attempt creation or resuming in transaction
    const attempt = await prisma.$transaction(async (tx) => {
      // Check existing attempt
      const existing = await tx.quizAttempt.findUnique({
        where: {
          formId_participantIdentity: {
            formId: form.id,
            participantIdentity: cleanIdentity,
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Calculate server deadlines
      const startedAt = now;
      let overallDeadline: Date | null = null;
      if (settings?.quizDurationMinutes && settings.quizDurationMinutes > 0) {
        overallDeadline = new Date(startedAt.getTime() + settings.quizDurationMinutes * 60 * 1000);
      }

      let currentQuestionDeadline: Date | null = null;
      if (firstQuestion && firstQuestion.timeLimitSeconds && firstQuestion.timeLimitSeconds > 0) {
        currentQuestionDeadline = new Date(startedAt.getTime() + firstQuestion.timeLimitSeconds * 1000);
      }

      const initialQuestionTiming: Record<string, any> = {};
      if (firstQuestion) {
        initialQuestionTiming[firstQuestion.id] = {
          startedAt: startedAt.toISOString(),
          deadline: currentQuestionDeadline?.toISOString() || null,
          timeLimitSeconds: firstQuestion.timeLimitSeconds || 0,
        };
      }

      return await tx.quizAttempt.create({
        data: {
          formId: form.id,
          formVersionId: form.publishedVersionId,
          participantIdentity: cleanIdentity,
          participantName: verifiedName,
          rosterEntryId,
          status: 'IN_PROGRESS',
          startedAt,
          overallDeadline,
          currentQuestionId: firstQuestion?.id || null,
          currentQuestionIndex: 0,
          currentQuestionStartedAt: startedAt,
          currentQuestionDeadline,
          savedAnswers: {},
          questionTiming: initialQuestionTiming,
          lockedQuestionIds: [],
        },
      });
    });

    // Reconcile timeout if attempt already existed
    const activeAttempt = await reconcileAttemptTimeout(attempt, form);

    return NextResponse.json({
      attempt: {
        id: activeAttempt.id,
        status: activeAttempt.status,
        participantIdentity: activeAttempt.participantIdentity,
        participantName: activeAttempt.participantName,
        startedAt: activeAttempt.startedAt,
        overallDeadline: activeAttempt.overallDeadline,
        currentQuestionId: activeAttempt.currentQuestionId,
        currentQuestionIndex: activeAttempt.currentQuestionIndex,
        currentQuestionStartedAt: activeAttempt.currentQuestionStartedAt,
        currentQuestionDeadline: activeAttempt.currentQuestionDeadline,
        savedAnswers: activeAttempt.savedAnswers,
        lockedQuestionIds: activeAttempt.lockedQuestionIds,
        completedAt: activeAttempt.completedAt,
        earnedScore: activeAttempt.earnedScore,
        maxScore: activeAttempt.maxScore,
        percentage: activeAttempt.percentage,
        durationSeconds: activeAttempt.durationSeconds,
        timeoutReason: activeAttempt.timeoutReason,
      },
      navigationPolicy: settings?.quizNavigationPolicy || 'BACKWARD_ENABLED',
      timerMode: settings?.quizTimerMode || 'NONE',
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to start or resume quiz attempt:', error);
    return NextResponse.json({ error: 'Failed to process quiz attempt' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureQuizSchema();
    const { publicId } = await params;
    const { searchParams } = new URL(request.url);
    const attemptId = searchParams.get('attemptId');
    const participantIdentity = searchParams.get('participantIdentity');

    if (!attemptId && !participantIdentity) {
      return NextResponse.json(
        { error: 'Missing attemptId or participantIdentity parameter' },
        { status: 400 }
      );
    }

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

    if (!form) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const attempt = attemptId
      ? await prisma.quizAttempt.findUnique({ where: { id: attemptId } })
      : await prisma.quizAttempt.findUnique({
          where: {
            formId_participantIdentity: {
              formId: form.id,
              participantIdentity: participantIdentity!.trim(),
            },
          },
        });

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    // Authoritative timeout reconciliation
    const reconciled = await reconcileAttemptTimeout(attempt, form);

    return NextResponse.json({
      attempt: {
        id: reconciled.id,
        status: reconciled.status,
        participantIdentity: reconciled.participantIdentity,
        participantName: reconciled.participantName,
        startedAt: reconciled.startedAt,
        overallDeadline: reconciled.overallDeadline,
        currentQuestionId: reconciled.currentQuestionId,
        currentQuestionIndex: reconciled.currentQuestionIndex,
        currentQuestionStartedAt: reconciled.currentQuestionStartedAt,
        currentQuestionDeadline: reconciled.currentQuestionDeadline,
        savedAnswers: reconciled.savedAnswers,
        lockedQuestionIds: reconciled.lockedQuestionIds,
        completedAt: reconciled.completedAt,
        earnedScore: reconciled.earnedScore,
        maxScore: reconciled.maxScore,
        percentage: reconciled.percentage,
        durationSeconds: reconciled.durationSeconds,
        timeoutReason: reconciled.timeoutReason,
      },
      navigationPolicy: form.settings?.quizNavigationPolicy || 'BACKWARD_ENABLED',
      timerMode: form.settings?.quizTimerMode || 'NONE',
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get quiz attempt:', error);
    return NextResponse.json({ error: 'Failed to retrieve quiz attempt' }, { status: 500 });
  }
}
