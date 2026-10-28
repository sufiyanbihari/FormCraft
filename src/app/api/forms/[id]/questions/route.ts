import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { createQuestionSchema } from '@/lib/validation/questionSchema';
import { logActivity } from '@/lib/audit/auditLogger';

export async function POST(
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

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const result = createQuestionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid question data', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      sectionId,
      title,
      description,
      type,
      isRequired,
      validation,
      config,
      quizPoints,
      quizAnswer,
      quizExplanation,
      timeLimitSeconds,
      options,
    } = result.data;

    const form = await prisma.form.findUnique({
      where: { id },
      include: { settings: true },
    });

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // Determine next orderIndex within the section
    const lastQ = await prisma.formQuestion.findFirst({
      where: { sectionId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const nextOrder = (lastQ?.orderIndex ?? -1) + 1;

    // Default points per question based on form.settings.quizDefaultPoints if quiz
    const isPresentationType = type === 'SECTION_HEADER' || type === 'TEXT_BLOCK' || type === 'IMAGE_BLOCK' || type === 'VIDEO_EMBED';
    const defaultPoints = (form.isQuiz && !isPresentationType) ? (form.settings?.quizDefaultPoints ?? 1) : 0;
    const finalQuizPoints = quizPoints !== undefined ? quizPoints : defaultPoints;

    const question = await prisma.$transaction(async (tx) => {
      const created = await tx.formQuestion.create({
        data: {
          formId: id,
          sectionId,
          title: title || 'Untitled Question',
          description: description || '',
          type,
          isRequired,
          orderIndex: nextOrder,
          validation: validation || {},
          config: config || {},
          quizPoints: finalQuizPoints,
          quizAnswer: quizAnswer || {},
          quizExplanation: quizExplanation || '',
          timeLimitSeconds: timeLimitSeconds || 0,
        },
      });

      // Default options for choice types if none provided
      let finalOptions = options;
      if (
        (!finalOptions || finalOptions.length === 0) &&
        (type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES' || type === 'DROPDOWN')
      ) {
        finalOptions = [{ label: 'Option 1', value: 'Option 1', orderIndex: 0, isOther: false }];
      }

      if (finalOptions && finalOptions.length > 0) {
        await tx.questionOption.createMany({
          data: finalOptions.map((opt, idx) => ({
            questionId: created.id,
            label: opt.label,
            value: opt.value || opt.label,
            orderIndex: opt.orderIndex ?? idx,
            isOther: Boolean(opt.isOther),
            goToSectionId: opt.goToSectionId || null,
            imageUrl: opt.imageUrl || null,
          })),
        });
      }

      return tx.formQuestion.findUnique({
        where: { id: created.id },
        include: {
          options: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });

    if (question) {
      await logActivity({
        action: 'QUESTION_CREATE',
        category: 'QUESTION',
        status: 'SUCCESS',
        formId: id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        req: request,
        details: {
          questionId: question.id,
          questionTitle: question.title,
          type: question.type,
          sectionId,
        },
      });
    }

    return NextResponse.json({ question });
  } catch (error) {
    console.error('Failed to create question:', error);
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 });
  }
}
