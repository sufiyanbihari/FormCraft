import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole } from '@/lib/auth/rbac';
import { verifyEditEligibility } from '@/lib/submission/responseEditingService';
import { submitFormSchema } from '@/lib/validation/submissionSchema';
import { calculateEditingWindowMinutes } from '@/lib/validation/formSchema';
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
        { error: 'This form is not found or is currently closed.', code: 'FORM_NOT_FOUND', canEdit: false },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const { searchParams } = new URL(request.url);
    const editToken = searchParams.get('editToken')?.trim() || null;
    const authenticatedUser = await getAuthUserFromRequest(request);
    const userRole = authenticatedUser ? await getUserFormRole(form.id, authenticatedUser.id) : null;
    const isAdmin = userRole === 'OWNER' || userRole === 'EDITOR' || authenticatedUser?.role === 'ADMIN';

    if (!editToken && !isAdmin) {
      return NextResponse.json(
        {
          error: 'Invalid or unavailable edit link. You do not have permission to edit this response.',
          code: 'INVALID_TOKEN',
          canEdit: false,
        },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

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
    } else if (isAdmin && authenticatedUser?.id) {
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
      if (editToken) {
        const tokenExistsElsewhere = await prisma.formSubmission.findFirst({
          where: { editToken },
          select: { id: true, formId: true },
        });
        if (tokenExistsElsewhere) {
          return NextResponse.json(
            {
              error: 'This edit link does not belong to this form.',
              code: 'INVALID_TOKEN',
              canEdit: false,
            },
            { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
          );
        }
      }
      return NextResponse.json(
        {
          error: 'Submission unavailable. Please verify your edit link.',
          code: 'SUBMISSION_NOT_FOUND',
          canEdit: false,
        },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
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
        {
          error: eligibility.reason || 'You do not have permission to edit this response.',
          code: eligibility.code || 'EDIT_FORBIDDEN',
          canEdit: false,
          maxEditCount: eligibility.maxEditCount,
          currentEditCount: eligibility.currentEditCount,
          formTitle: form.title,
        },
        {
          status: eligibility.statusCode || 403,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
          },
        }
      );
    }

    // Format saved answers for the frontend form state
    const formattedAnswers: Record<string, any> = {};
    for (const ans of submission.answers) {
      formattedAnswers[ans.questionId] = ans.value;
    }

    const maxEdits = Number(form.settings?.maxEditCount) || 1;
    return NextResponse.json(
      {
        submission: {
          id: submission.id,
          editToken: submission.editToken,
          submittedAt: submission.submittedAt,
          editCount: submission.editCount,
          maxEditCount: maxEdits,
          canEdit: true,
          lastEditedAt: submission.lastEditedAt,
          respondentEmail: submission.respondentEmail,
          answers: formattedAnswers,
          cattleOwners: submission.cattleOwners,
        },
        form,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
        },
      }
    );
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
    const isAdmin = userRole === 'OWNER' || userRole === 'EDITOR' || authenticatedUser?.role === 'ADMIN';

    if (!editToken && !isAdmin) {
      return NextResponse.json(
        {
          error: 'Invalid or unavailable edit link. You do not have permission to edit this response.',
          code: 'INVALID_TOKEN',
          canEdit: false,
        },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    let submission: any = null;
    if (editToken) {
      submission = await prisma.formSubmission.findFirst({
        where: {
          formId: form.id,
          editToken,
        },
        include: { answers: true },
      });
    } else if (isAdmin && authenticatedUser?.id) {
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
      if (editToken) {
        const tokenExistsElsewhere = await prisma.formSubmission.findFirst({
          where: { editToken },
          select: { id: true, formId: true },
        });
        if (tokenExistsElsewhere) {
          return NextResponse.json(
            {
              error: 'This edit link does not belong to this form.',
              code: 'INVALID_TOKEN',
              canEdit: false,
            },
            { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
          );
        }
      }
      return NextResponse.json(
        {
          error: 'Submission unavailable. Please verify your edit link.',
          code: 'SUBMISSION_NOT_FOUND',
          canEdit: false,
        },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
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
        {
          error: eligibility.reason || 'You do not have permission to edit this response.',
          code: eligibility.code || 'EDIT_FORBIDDEN',
          canEdit: false,
          maxEditCount: eligibility.maxEditCount,
          currentEditCount: eligibility.currentEditCount,
        },
        { status: eligibility.statusCode || 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
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
    const maxEdits = Number(form.settings?.maxEditCount) || 1;

    // Execute atomic update transaction on original response
    let updatedSubmission: any;
    try {
      updatedSubmission = await prisma.$transaction(async (tx) => {
        // 1. Transaction advisory lock for atomic concurrency protection per submission
        try {
          await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1))`,
            `submission_edit_${submission.id}`
          );
        } catch {
          // Continue if locking isn't supported on mock/test db
        }

        // 2. Fetch fresh submission record under the lock to verify limits atomically
        const freshSub = await tx.formSubmission.findUnique({
          where: { id: submission.id },
          select: { id: true, editCount: true, submittedAt: true },
        });

        if (!freshSub) {
          throw new Error('SUBMISSION_NOT_FOUND');
        }

        // 3. Atomically enforce maximum edit limit
        if (!isAdmin && freshSub.editCount >= maxEdits) {
          const err = new Error('MAX_EDITS_EXCEEDED');
          (err as any).statusCode = 403;
          (err as any).editCount = freshSub.editCount;
          throw err;
        }

        // 4. Atomically enforce window expiration from original submission timestamp
        let windowMinutes = form.settings?.editingWindowMinutes;
        if (!windowMinutes && form.settings?.editingTimeDuration) {
          windowMinutes = calculateEditingWindowMinutes(form.settings.editingTimeDuration, form.settings.editingTimeUnit);
        }
        if (!windowMinutes || windowMinutes <= 0) {
          windowMinutes = 1440;
        }
        const submissionTime = new Date(freshSub.submittedAt).getTime();
        const expiryTime = submissionTime + windowMinutes * 60 * 1000;
        if (!isAdmin && now.getTime() > expiryTime) {
          const err = new Error('EDIT_WINDOW_EXPIRED');
          (err as any).statusCode = 403;
          throw err;
        }

        // 5. Delete previous answers for this submission
        await tx.submissionAnswer.deleteMany({
          where: { submissionId: submission.id },
        });

        // 6. Insert updated answers
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

        // 7. Update cattle owners if provided
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

        // 8. Update FormSubmission record in-place (submittedAt explicitly preserved!)
        return await tx.formSubmission.update({
          where: {
            id: submission.id,
            editCount: freshSub.editCount, // Optimistic concurrency check
          },
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
    } catch (txErr: any) {
      if (txErr?.message === 'MAX_EDITS_EXCEEDED') {
        return NextResponse.json(
          {
            error: `This response has already reached the maximum allowed limit of ${maxEdits} edit${maxEdits === 1 ? '' : 's'}. You have used all permitted editing attempts, so further changes are no longer available.`,
            code: 'MAX_EDITS_EXCEEDED',
            canEdit: false,
            maxEditCount: maxEdits,
            currentEditCount: txErr.editCount,
          },
          { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
      }
      if (txErr?.message === 'EDIT_WINDOW_EXPIRED') {
        return NextResponse.json(
          {
            error: 'Editing period has expired. Edits are no longer accepted.',
            code: 'EDIT_WINDOW_EXPIRED',
            canEdit: false,
          },
          { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
      }
      if (txErr?.code === 'P2025') {
        return NextResponse.json(
          { error: 'Concurrent edit conflict detected. Please refresh and try again.', code: 'CONCURRENT_CONFLICT' },
          { status: 409, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
      }
      throw txErr;
    }

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

    const allowEditing = Boolean(form.settings?.allowResponseEditing);
    let windowMinutes = form.settings?.editingWindowMinutes;
    if (!windowMinutes && form.settings?.editingTimeDuration) {
      windowMinutes = calculateEditingWindowMinutes(form.settings.editingTimeDuration, form.settings.editingTimeUnit);
    }
    if (!windowMinutes || windowMinutes <= 0) {
      windowMinutes = 1440;
    }
    const submissionTime = new Date(updatedSubmission.submittedAt).getTime();
    const expiryTime = submissionTime + windowMinutes * 60 * 1000;
    const isWithinWindow = Date.now() <= expiryTime;
    const canEdit = allowEditing && isWithinWindow && updatedSubmission.editCount < maxEdits;

    return NextResponse.json(
      {
        message: 'Your response has been successfully updated.',
        submissionId: updatedSubmission.id,
        submittedAt: updatedSubmission.submittedAt,
        editToken: canEdit ? updatedSubmission.editToken : undefined,
        editCount: updatedSubmission.editCount,
        maxEditCount: maxEdits,
        canEdit,
        allowResponseEditing: allowEditing,
        lastEditedAt: updatedSubmission.lastEditedAt,
        score: quizResult,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to update submission:', error);
    return NextResponse.json(
      { error: 'Failed to save updated response.' },
      { status: 500 }
    );
  }
}
