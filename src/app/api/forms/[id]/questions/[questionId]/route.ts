import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { updateQuestionSchema, QuestionOptionInput } from '@/lib/validation/questionSchema';
import { logActivity } from '@/lib/audit/auditLogger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, questionId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const result = updateQuestionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid question update payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      type,
      isRequired,
      orderIndex,
      sectionId,
      validation,
      config,
      quizPoints,
      quizAnswer,
      quizExplanation,
      timeLimitSeconds,
      options,
    } = result.data;

    const existingQuestion = await prisma.formQuestion.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!existingQuestion) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Compute changes
    const changes: Array<{ field: string; label: string; before: any; after: any }> = [];
    if (title !== undefined && title !== existingQuestion.title) {
      changes.push({ field: 'title', label: 'Question Title', before: existingQuestion.title, after: title });
    }
    if (description !== undefined && description !== (existingQuestion.description || '')) {
      changes.push({ field: 'description', label: 'Description', before: existingQuestion.description || '', after: description });
    }
    if (type !== undefined && type !== existingQuestion.type) {
      changes.push({ field: 'type', label: 'Question Type', before: existingQuestion.type, after: type });
    }
    if (isRequired !== undefined && isRequired !== existingQuestion.isRequired) {
      changes.push({ field: 'isRequired', label: 'Required Field', before: existingQuestion.isRequired, after: isRequired });
    }
    if (quizPoints !== undefined && quizPoints !== existingQuestion.quizPoints) {
      changes.push({ field: 'quizPoints', label: 'Quiz Points', before: existingQuestion.quizPoints, after: quizPoints });
    }
    if (timeLimitSeconds !== undefined && timeLimitSeconds !== existingQuestion.timeLimitSeconds) {
      changes.push({ field: 'timeLimitSeconds', label: 'Time Limit (Seconds)', before: existingQuestion.timeLimitSeconds, after: timeLimitSeconds });
    }
    if (options !== undefined) {
      const prevOptionLabels = existingQuestion.options.map((o: { label?: string }) => o.label).join(', ');
      const newOptionLabels = options.map((o: QuestionOptionInput) => o.label).join(', ');
      if (prevOptionLabels !== newOptionLabels) {
        changes.push({ field: 'options', label: 'Question Options', before: prevOptionLabels || '(None)', after: newOptionLabels || '(None)' });
      }
    }

    const updatedQuestion = await prisma.$transaction(async (tx) => {
      const currentQ = await tx.formQuestion.findUnique({
        where: { id: questionId },
        select: { config: true, validation: true },
      });

      const qData: any = {};
      if (title !== undefined) qData.title = title;
      if (description !== undefined) qData.description = description;
      if (type !== undefined) qData.type = type;
      if (isRequired !== undefined) qData.isRequired = isRequired;
      if (orderIndex !== undefined) qData.orderIndex = orderIndex;
      if (sectionId !== undefined) qData.sectionId = sectionId;
      if (validation !== undefined) {
        qData.validation = {
          ...((currentQ?.validation as object) || {}),
          ...validation,
        };
      }
      if (config !== undefined) {
        qData.config = {
          ...((currentQ?.config as object) || {}),
          ...config,
        };
      }
      if (quizPoints !== undefined) qData.quizPoints = quizPoints;
      if (quizAnswer !== undefined) qData.quizAnswer = quizAnswer;
      if (quizExplanation !== undefined) qData.quizExplanation = quizExplanation;
      if (timeLimitSeconds !== undefined) qData.timeLimitSeconds = timeLimitSeconds;

      await tx.formQuestion.update({
        where: { id: questionId },
        data: qData,
      });

      // Update options if provided
      if (options !== undefined) {
        // Delete existing options
        await tx.questionOption.deleteMany({
          where: { questionId },
        });

        // Insert updated options
        if (options.length > 0) {
          await tx.questionOption.createMany({
            data: options.map((opt: QuestionOptionInput, idx: number) => {
              const label = (opt.label || '').trim() || `Option ${idx + 1}`;
              return {
                questionId,
                label,
                value: opt.value?.trim() || label,
                orderIndex: opt.orderIndex ?? idx,
                isOther: Boolean(opt.isOther),
                goToSectionId: opt.goToSectionId || null,
                imageUrl: opt.imageUrl || null,
              };
            }),
          });
        }
      }

      return tx.formQuestion.findUnique({
        where: { id: questionId },
        include: {
          options: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });

    if (updatedQuestion && changes.length > 0) {
      const beforeMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.before }), {});
      const afterMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.after }), {});
      const summary = `Updated question "${updatedQuestion.title}" (${changes.map((c) => c.label).join(', ')})`;

      await logActivity({
        action: 'QUESTION_UPDATE',
        category: 'QUESTION',
        status: 'SUCCESS',
        formId: id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || user.email,
        userRole: user.role,
        req: request,
        changes,
        before: beforeMap,
        after: afterMap,
        details: {
          questionId,
          questionTitle: updatedQuestion.title,
          updatedFields: changes.map((c) => c.field),
          summary,
          changes,
          before: beforeMap,
          after: afterMap,
        },
      });
    }

    return NextResponse.json({ question: updatedQuestion });
  } catch (error) {
    console.error('Failed to update question:', error);
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, questionId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const question = await prisma.formQuestion.findUnique({
      where: { id: questionId },
      select: { title: true, type: true, quizPoints: true },
    });

    await prisma.formQuestion.delete({
      where: { id: questionId },
    });

    await logActivity({
      action: 'QUESTION_DELETE',
      category: 'QUESTION',
      status: 'SUCCESS',
      formId: id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
      userRole: user.role,
      req: request,
      changes: [
        { field: 'question', label: 'Question', before: question?.title || 'Question', after: '(Deleted)' },
      ],
      before: { title: question?.title, type: question?.type, quizPoints: question?.quizPoints },
      after: null,
      details: {
        questionId,
        questionTitle: question?.title || 'Unknown',
        type: question?.type,
        summary: `Deleted question "${question?.title || 'Question'}"`,
      },
    });

    return NextResponse.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Failed to delete question:', error);
    return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 });
  }
}
