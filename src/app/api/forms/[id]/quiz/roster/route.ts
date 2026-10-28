import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { batchQuizRosterSchema } from '@/lib/validation/quizAttemptSchema';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureQuizSchema();
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: formId } = await params;
    const role = await getUserFormRole(formId, user.id);
    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const roster = await prisma.quizParticipantRoster.findMany({
      where: { formId },
      orderBy: { createdAt: 'asc' },
      include: {
        attempts: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            finalizedAt: true,
            earnedScore: true,
            maxScore: true,
            percentage: true,
            durationSeconds: true,
          },
        },
      },
    });

    const items = roster.map((r) => {
      const latestAttempt = r.attempts[0] || null;
      const status = latestAttempt ? latestAttempt.status : 'NOT_STARTED';
      return {
        id: r.id,
        participantId: r.participantId,
        name: r.name,
        email: r.email,
        status,
        attempt: latestAttempt,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({
      roster: items,
      totalCount: items.length,
    });
  } catch (error) {
    console.error('Failed to get quiz roster:', error);
    return NextResponse.json({ error: 'Failed to retrieve roster' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureQuizSchema();
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: formId } = await params;
    const role = await getUserFormRole(formId, user.id);
    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const parseResult = batchQuizRosterSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid roster data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { participants } = parseResult.data;

    // Deduplicate incoming participants by participantId
    const uniqueMap = new Map<string, { participantId: string; name?: string | null; email?: string | null }>();
    for (const p of participants) {
      const pid = p.participantId.trim();
      if (pid) {
        uniqueMap.set(pid.toLowerCase(), {
          participantId: pid,
          name: p.name?.trim() || null,
          email: p.email?.trim() || null,
        });
      }
    }

    const uniqueParticipants = Array.from(uniqueMap.values());

    // Batch upsert transactionally
    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const p of uniqueParticipants) {
        const item = await tx.quizParticipantRoster.upsert({
          where: {
            formId_participantId: {
              formId,
              participantId: p.participantId,
            },
          },
          update: {
            name: p.name,
            email: p.email,
          },
          create: {
            formId,
            participantId: p.participantId,
            name: p.name,
            email: p.email,
          },
        });
        results.push(item);
      }
      return results;
    });

    const totalCount = await prisma.quizParticipantRoster.count({
      where: { formId },
    });

    return NextResponse.json({
      message: `Successfully updated ${created.length} participant(s) in roster.`,
      count: created.length,
      totalCount,
      participants: created,
    });
  } catch (error) {
    console.error('Failed to import quiz roster:', error);
    return NextResponse.json({ error: 'Failed to update roster' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureQuizSchema();
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: formId } = await params;
    const role = await getUserFormRole(formId, user.id);
    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clearAll = searchParams.get('all') === 'true';
    const participantId = searchParams.get('participantId');

    if (clearAll) {
      await prisma.quizParticipantRoster.deleteMany({
        where: { formId },
      });
      return NextResponse.json({ message: 'Roster cleared successfully.' });
    }

    if (participantId) {
      await prisma.quizParticipantRoster.deleteMany({
        where: { formId, participantId },
      });
      return NextResponse.json({ message: `Participant ${participantId} removed from roster.` });
    }

    return NextResponse.json({ error: 'Missing participantId or all=true' }, { status: 400 });
  } catch (error) {
    console.error('Failed to delete roster entry:', error);
    return NextResponse.json({ error: 'Failed to delete from roster' }, { status: 500 });
  }
}
