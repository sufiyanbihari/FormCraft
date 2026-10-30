import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureQuizSchema();

    const { id } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const original = await prisma.form.findUnique({
      where: { id },
      include: {
        theme: true,
        settings: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                options: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!original) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const duplicated = await prisma.$transaction(async (tx) => {
      const newForm = await tx.form.create({
        data: {
          title: `Copy of ${original.title}`,
          description: original.description,
          status: 'DRAFT',
          isQuiz: original.isQuiz,
          ownerId: user.id,
          theme: original.theme
            ? {
                create: {
                  primaryColor: original.theme.primaryColor,
                  backgroundColor: original.theme.backgroundColor,
                  cardColor: original.theme.cardColor,
                  fontFamily: original.theme.fontFamily,
                  borderRadius: original.theme.borderRadius,
                  headerImageUrl: original.theme.headerImageUrl,
                  logoUrl: original.theme.logoUrl,
                },
              }
            : undefined,
          settings: original.settings
            ? {
                create: {
                  isAcceptingResponses: original.settings.isAcceptingResponses,
                  closedMessage: original.settings.closedMessage,
                  showProgressBar: original.settings.showProgressBar,
                  shuffleQuestions: original.settings.shuffleQuestions,
                  confirmationMessage: original.settings.confirmationMessage,
                  allowMultipleSubmissions: original.settings.allowMultipleSubmissions,
                  requireAuth: false,
                  collectEmail: original.settings.collectEmail,
                  restrictOneResponse: original.settings.restrictOneResponse,
                  allowResponseEditing: original.settings.allowResponseEditing,
                  showSummaryToRespondents: original.settings.showSummaryToRespondents,
                  accessMode: original.settings.accessMode,
                  quizReleaseGrade: original.settings.quizReleaseGrade,
                  quizShowCorrectAnswers: original.settings.quizShowCorrectAnswers,
                  quizShowPointsEarned: original.settings.quizShowPointsEarned,
                  quizShowFeedback: original.settings.quizShowFeedback,
                  quizPassPercentage: original.settings.quizPassPercentage,
                  quizPassMessage: original.settings.quizPassMessage,
                  quizFailMessage: original.settings.quizFailMessage,
                  quizDefaultPoints: original.settings.quizDefaultPoints,
                  editingAuthMethod: original.settings.editingAuthMethod,
                  editingWindowMode: original.settings.editingWindowMode,
                  editingWindowMinutes: original.settings.editingWindowMinutes,
                  editingTimeDuration: original.settings.editingTimeDuration,
                  editingTimeUnit: original.settings.editingTimeUnit,
                  maxEditCount: original.settings.maxEditCount,
                },
              }
            : undefined,
        },
      });

      for (const s of original.sections) {
        const newSection = await tx.formSection.create({
          data: {
            formId: newForm.id,
            title: s.title,
            description: s.description,
            orderIndex: s.orderIndex,
            nextSectionId: s.nextSectionId,
          },
        });

        for (const q of s.questions) {
          const newQ = await tx.formQuestion.create({
            data: {
              formId: newForm.id,
              sectionId: newSection.id,
              title: q.title,
              description: q.description,
              type: q.type,
              isRequired: q.isRequired,
              orderIndex: q.orderIndex,
              validation: q.validation || {},
              config: q.config || {},
              quizPoints: q.quizPoints,
              quizAnswer: q.quizAnswer || {},
              quizExplanation: q.quizExplanation,
            },
          });

          if (q.options.length > 0) {
            await tx.questionOption.createMany({
              data: q.options.map((opt) => ({
                questionId: newQ.id,
                label: opt.label,
                value: opt.value,
                orderIndex: opt.orderIndex,
                isOther: opt.isOther,
                goToSectionId: opt.goToSectionId,
                imageUrl: opt.imageUrl,
              })),
            });
          }
        }
      }

      return newForm;
    });

    await logActivity({
      action: 'FORM_DUPLICATE',
      category: 'FORM',
      status: 'SUCCESS',
      formId: duplicated.id,
      formTitle: duplicated.title,
      publicId: duplicated.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        sourceFormId: id,
        sourceTitle: original.title,
        newFormId: duplicated.id,
        newTitle: duplicated.title,
        summary: `Duplicated form "${original.title}" into "${duplicated.title}"`,
      },
    });

    return NextResponse.json({ form: duplicated });
  } catch (error) {
    console.error('Failed to duplicate form:', error);
    return NextResponse.json({ error: 'Failed to duplicate form' }, { status: 500 });
  }
}
