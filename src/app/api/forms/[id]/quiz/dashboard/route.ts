import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canViewResponses } from '@/lib/auth/rbac';
import { reconcileAttemptTimeout } from '@/lib/quiz/quizAttemptService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canViewResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        settings: true,
        sections: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // 1. Automatic reconciliation of timed-out in-progress attempts
    const now = new Date();
    const expiredInProgressAttempts = await prisma.quizAttempt.findMany({
      where: {
        formId: id,
        status: 'IN_PROGRESS',
        overallDeadline: {
          lt: now,
        },
      },
    });

    for (const expired of expiredInProgressAttempts) {
      try {
        await reconcileAttemptTimeout(expired, form);
      } catch (err) {
        console.warn('Failed to reconcile expired attempt:', expired.id, err);
      }
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status') || 'ALL'; // ALL | COMPLETED | IN_PROGRESS | TIMED_OUT | NOT_STARTED
    const sortBy = searchParams.get('sortBy') || 'startTime'; // startTime | endTime | score | duration
    const sortOrder = (searchParams.get('sortOrder') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    // 3. Compute Summary Metrics
    const isRosterMode = Boolean(form.settings?.quizRosterMode);
    let expectedCount = form.settings?.quizExpectedParticipants ?? 0;

    let rosterTotal = 0;
    let rosterNotStarted = 0;
    if (isRosterMode) {
      rosterTotal = await prisma.quizParticipantRoster.count({ where: { formId: id } });
      rosterNotStarted = await prisma.quizParticipantRoster.count({
        where: {
          formId: id,
          attempts: { none: {} },
        },
      });
      if (rosterTotal > 0) {
        expectedCount = rosterTotal;
      }
    }

    const [completedCount, inProgressCount, timedOutCount] = await Promise.all([
      prisma.quizAttempt.count({ where: { formId: id, status: 'COMPLETED' } }),
      prisma.quizAttempt.count({ where: { formId: id, status: 'IN_PROGRESS' } }),
      prisma.quizAttempt.count({ where: { formId: id, status: 'TIMED_OUT' } }),
    ]);

    const notStartedCount = isRosterMode
      ? rosterNotStarted
      : Math.max(0, expectedCount - (completedCount + inProgressCount + timedOutCount));

    // 4. Fetch Participant Rows
    let participants: any[] = [];
    let totalRows = 0;

    if (statusFilter === 'NOT_STARTED') {
      if (isRosterMode) {
        const rosterWhere: any = {
          formId: id,
          attempts: { none: {} },
        };
        if (search) {
          rosterWhere.OR = [
            { participantId: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ];
        }

        totalRows = await prisma.quizParticipantRoster.count({ where: rosterWhere });
        const rosterItems = await prisma.quizParticipantRoster.findMany({
          where: rosterWhere,
          orderBy: { createdAt: sortOrder },
          skip,
          take: limit,
        });

        participants = rosterItems.map((r) => ({
          id: r.id,
          participantIdentity: r.participantId,
          participantName: r.name,
          status: 'NOT_STARTED',
          timeoutReason: null,
          earnedScore: null,
          maxScore: null,
          percentage: null,
          startTime: null,
          endTime: null,
          durationSeconds: null,
        }));
      } else {
        totalRows = 0;
        participants = [];
      }
    } else {
      // Query attempts
      const attemptWhere: any = {
        formId: id,
      };

      if (statusFilter !== 'ALL') {
        attemptWhere.status = statusFilter;
      }

      if (search) {
        attemptWhere.OR = [
          { participantIdentity: { contains: search, mode: 'insensitive' } },
          { participantName: { contains: search, mode: 'insensitive' } },
        ];
      }

      let orderByClause: any = { startedAt: sortOrder };
      if (sortBy === 'endTime') {
        orderByClause = { completedAt: sortOrder };
      } else if (sortBy === 'score') {
        orderByClause = { earnedScore: sortOrder };
      } else if (sortBy === 'duration') {
        orderByClause = { durationSeconds: sortOrder };
      }

      totalRows = await prisma.quizAttempt.count({ where: attemptWhere });
      const attempts = await prisma.quizAttempt.findMany({
        where: attemptWhere,
        orderBy: orderByClause,
        skip,
        take: limit,
      });

      participants = attempts.map((a) => ({
        id: a.id,
        participantIdentity: a.participantIdentity,
        participantName: a.participantName,
        status: a.status,
        timeoutReason: a.timeoutReason,
        earnedScore: a.earnedScore,
        maxScore: a.maxScore,
        percentage: a.percentage,
        startTime: a.startedAt?.toISOString() || null,
        endTime: a.completedAt?.toISOString() || null,
        durationSeconds: a.durationSeconds,
      }));
    }

    return NextResponse.json({
      summary: {
        expected: expectedCount,
        completed: completedCount,
        inProgress: inProgressCount,
        notStarted: notStartedCount,
        timedOut: timedOutCount,
        isRosterMode,
        notStartedIsEstimate: !isRosterMode,
      },
      participants,
      pagination: {
        page,
        limit,
        total: totalRows,
        totalPages: Math.ceil(totalRows / limit) || 1,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Quiz dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching quiz dashboard' },
      { status: 500 }
    );
  }
}
