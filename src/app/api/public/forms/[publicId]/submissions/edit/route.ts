import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole } from '@/lib/auth/rbac';
import { verifyEditEligibility } from '@/lib/submission/responseEditingService';
import { submitFormSchema } from '@/lib/validation/submissionSchema';
import { logActivity } from '@/lib/audit/auditLogger';
import { ensureResponseControlSchema } from '@/lib/db/ensureResponseControlSchema';
import { calculateQuizScores } from '@/lib/quiz/quizAttemptService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureResponseControlSchema();
    const { publicId } = await params;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        theme: true,
        sections: {
          include: {
            questions: {
              include: { options: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This form is not found or is currently closed.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const editToken = searchParams.get('editToken')?.trim() || null;
    const authenticatedUser = await getAuthUserFromRequest(request);
    const userRole = authenticatedUser ? await getUserFormRole(form.id, authenticatedUser.id) : null;

    let submission: any = null;

    if (editToken) {
      submission = await prisma.formSubmission.findFirst({
        where: {
          formId: form.id,
          editToken,
        },
        include: {
          answers: true,
          cattleOwners: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    } else if (authenticatedUser?.id) {
      submission = await prisma.formSubmission.findFirst({
        where: {
          formId: form.id,
          respondentUserId: authenticatedUser.id,
        },
        orderBy: { submittedAt: 'desc' },
        include: {
          answers: true,
          cattleOwners: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    }

    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found. Please verify your edit link or log in with the correct account.' },
        { status: 404 }
      );
    }

    // Verify edit eligibility
    const eligibility = verifyEditEligibility({
      submission,
      form,
      editToken,
      authenticatedUser,
      userRole,
    });

    if (!eligibility.allowed) {
      return NextResponse.json(
        { error: eligibility.reason || 'You do not have permission to edit this response.' },
        { status: eligibility.statusCode || 403 }
      );
    }

    // Format saved answers for the frontend form state
    const formattedAnswers: Record<string, any> = {};
    for (const ans of submission.answers) {
      formattedAnswers[ans.questionId] = ans.value;
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        editToken: submission.editToken,
        submittedAt: submission.submittedAt,
        editCount: submission.editCount,
        lastEditedAt: submission.lastEditedAt,
        respondentEmail: submission.respondentEmail,
        answers: formattedAnswers,
        cattleOwners: submission.cattleOwners,
      },
      form,
    });
  } catch (error: any) {
    console.error('Failed to load submission for editing:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve submission for editing.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureResponseControlSchema();
    const { publicId } = await params;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        sections: {
          include: {
            questions: {
              include: { options: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This form is not found or is currently closed.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { editToken, answers, cattleOwners, respondentEmail } = body;

    const authenticatedUser = await getAuthUserFromRequest(request);
    const userRole = authenticatedUser ? await getUserFormRole(form.id, authenticatedUser.id) : null;

    let submission: any = null;
    if (editToken) {
      submission = await prisma.formSubmission.findFirst({
        where: {
          formId: form.id,
          editToken,
        },
        include: { answers: true },
      });
    } else if (authenticatedUser?.id) {
      submission = await prisma.formSubmission.findFirst({
        where: {
          formId: form.id,
          respondentUserId: authenticatedUser.id,
        },
        orderBy: { submittedAt: 'desc' },
        include: { answers: true },
      });
    }

    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found or unauthorized.' },
        { status: 404 }
      );
    }

    // Verify edit eligibility
    const eligibility = verifyEditEligibility({
      submission,
      form,
      editToken,
      authenticatedUser,
      userRole,
    });

    if (!eligibility.allowed) {
      return NextResponse.json(
        { error: eligibility.reason || 'You do not have permission to edit this response.' },
        { status: eligibility.statusCode || 403 }
      );
    }

    // Validate answers payload
    const parseResult = submitFormSchema.safeParse({
      answers,
      cattleOwners,
      respondentEmail,
      idempotencyKey: `edit-${submission.id}-${Date.now()}`,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid submission data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const validatedData = parseResult.data;
    const allQuestions = form.sections.flatMap((s) => s.questions || []);

    // Calculate Quiz Scores if quiz mode is active
    let quizResult: any = null;
    let totalScore: number | null = null;
    let maxScore: number | null = null;
    let gradedAnswers: any[] = [];

    if (form.isQuiz) {
      const answersMap = new Map<string, any>();
      for (const a of validatedData.answers) {
        answersMap.set(a.questionId, a.value);
      }
      const scoreCalculation = calculateQuizScores(allQuestions, answersMap);
      totalScore = scoreCalculation.totalScore;
      maxScore = scoreCalculation.maxScore;
      gradedAnswers = scoreCalculation.gradedAnswers;

      quizResult = {
        total: totalScore,
        max: maxScore,
        percentage: scoreCalculation.percentage,
      };
    }

    const now = new Date();

    // Execute atomic update transaction on original response
    const updatedSubmission = await prisma.$transaction(async (tx) => {
      // 1. Delete previous answers for this submission
      await tx.submissionAnswer.deleteMany({
        where: { submissionId: submission.id },
      });

      // 2. Insert updated answers
      for (const ans of validatedData.answers) {
        const graded = gradedAnswers.find((g) => g.questionId === ans.questionId);
        await tx.submissionAnswer.create({
          data: {
            submissionId: submission.id,
            questionId: ans.questionId,
            value: ans.value,
            textAnswer:
              typeof ans.value === 'string'
                ? ans.value
                : Array.isArray(ans.value)
                  ? ans.value.join(', ')
                  : JSON.stringify(ans.value),
            score: graded?.score ?? null,
            isCorrect: graded?.isCorrect ?? null,
          },
        });
      }

      // 3. Update cattle owners if provided
      if (validatedData.cattleOwners && validatedData.cattleOwners.length > 0) {
        await tx.cattleOwnerEntry.deleteMany({
          where: { submissionId: submission.id },
        });

        await tx.cattleOwnerEntry.createMany({
          data: validatedData.cattleOwners.map((owner, idx) => ({
            submissionId: submission.id,
            orderIndex: idx,
            ownerName: owner.ownerName.trim(),
            ownerMobile: owner.ownerMobile.trim(),
            largeCattleCount: Math.max(0, Math.floor(Number(owner.largeCattleCount) || 0)),
            smallCattleCount: Math.max(0, Math.floor(Number(owner.smallCattleCount) || 0)),
            flooringType: owner.flooringType.trim(),
            supplyDung: owner.supplyDung.trim(),
          })),
        });
      }

      // 4. Update FormSubmission record in-place
      return await tx.formSubmission.update({
        where: { id: submission.id },
        data: {
          respondentEmail: validatedData.respondentEmail || submission.respondentEmail,
          totalScore: totalScore !== null ? totalScore : submission.totalScore,
          maxScore: maxScore !== null ? maxScore : submission.maxScore,
          editCount: { increment: 1 },
          lastEditedAt: now,
          lastEditedBy: eligibility.actorType || 'RESPONDENT',
        },
      });
    });

    await logActivity({
      action: 'SUBMISSION_EDIT',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: form.id,
      formTitle: form.title,
      publicId: form.publicId,
      userId: authenticatedUser?.id,
      userEmail: authenticatedUser?.email || respondentEmail || submission.respondentEmail || 'Respondent',
      userName: authenticatedUser?.name,
      userRole: authenticatedUser?.role,
      req: request,
      details: {
        submissionId: submission.id,
        editCount: updatedSubmission.editCount,
        actorType: eligibility.actorType,
        answerCount: validatedData.answers.length,
      },
    });

    return NextResponse.json({
      message: 'Your response has been successfully updated.',
      submissionId: updatedSubmission.id,
      editToken: updatedSubmission.editToken,
      editCount: updatedSubmission.editCount,
      lastEditedAt: updatedSubmission.lastEditedAt,
      score: quizResult,
    });
  } catch (error: any) {
    console.error('Failed to update submission:', error);
    return NextResponse.json(
      { error: 'Failed to save updated response.' },
      { status: 500 }
    );
  }
}
