import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canViewResponses, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, responseId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canViewResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id: responseId },
      include: {
        respondent: {
          select: { id: true, name: true, email: true },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!submission || submission.formId !== id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error('Failed to get submission:', error);
    return NextResponse.json({ error: 'Failed to retrieve submission' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, responseId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      select: { id: true, title: true, publicId: true },
    });

    const submission = await prisma.formSubmission.findUnique({
      where: { id: responseId },
      select: { respondentEmail: true },
    });

    await prisma.formSubmission.delete({
      where: { id: responseId },
    });

    await logActivity({
      action: 'SUBMISSION_DELETE',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: id,
      formTitle: form?.title,
      publicId: form?.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        submissionId: responseId,
        respondentEmail: submission?.respondentEmail || 'Anonymous',
        description: `Deleted response #${responseId.slice(-6)} from form "${form?.title || 'Untitled Form'}"`,
      },
    });

    return NextResponse.json({ message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Failed to delete submission:', error);
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, responseId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id: responseId },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!submission || submission.formId !== id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { answerUpdates, isGradeReleased } = body;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Apply answer grade/feedback updates if provided
      if (Array.isArray(answerUpdates) && answerUpdates.length > 0) {
        for (const update of answerUpdates) {
          if (!update.answerId) continue;
          const currentAns = submission.answers.find((a) => a.id === update.answerId);
          if (!currentAns) continue;

          const newScore = update.score !== undefined ? Number(update.score) : currentAns.score;
          const qMaxPoints = currentAns.question?.quizPoints || 0;
          const isCorrect =
            newScore !== null && newScore !== undefined
              ? (newScore > 0 ? (qMaxPoints > 0 ? newScore >= qMaxPoints : true) : false)
              : currentAns.isCorrect;

          await tx.submissionAnswer.update({
            where: { id: update.answerId },
            data: {
              score: newScore,
              isCorrect,
              reviewerFeedback:
                update.reviewerFeedback !== undefined
                  ? update.reviewerFeedback
                  : currentAns.reviewerFeedback,
            },
          });
        }
      }

      // 2. Fetch fresh answers to recalculate submission totalScore
      const freshAnswers = await tx.submissionAnswer.findMany({
        where: { submissionId: responseId },
      });

      const totalScore = freshAnswers.reduce((sum, a) => sum + (a.score || 0), 0);

      const subData: {
        totalScore: number;
        isGradeReleased?: boolean;
        gradeReleasedAt?: Date | null;
      } = { totalScore };
      if (isGradeReleased !== undefined) {
        subData.isGradeReleased = Boolean(isGradeReleased);
        subData.gradeReleasedAt = isGradeReleased ? new Date() : null;
      }

      return tx.formSubmission.update({
        where: { id: responseId },
        data: subData,
        include: {
          respondent: {
            select: { id: true, name: true, email: true },
          },
          cattleOwners: {
            orderBy: { orderIndex: 'asc' },
          },
          answers: {
            include: {
              question: {
                select: { id: true, title: true, type: true, quizPoints: true },
              },
            },
          },
        },
      });
    });

    await logActivity({
      action: 'QUIZ_MANUAL_GRADE',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        submissionId: responseId,
        newTotalScore: updated.totalScore,
        isGradeReleased: updated.isGradeReleased,
        summary: `Updated grading for submission #${responseId.slice(-6)}: ${updated.totalScore} pts (released: ${updated.isGradeReleased})`,
      },
    });

    return NextResponse.json({ submission: updated });
  } catch (error) {
    console.error('Failed to grade submission:', error);
    return NextResponse.json({ error: 'Failed to update submission grade' }, { status: 500 });
  }
}
