import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canPublishForm } from '@/lib/auth/rbac';
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

    if (!canPublishForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
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

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    if (form.sections.length === 0 || form.sections.every((s) => s.questions.length === 0)) {
      return NextResponse.json(
        { error: 'Cannot publish a form with no questions. Please add at least one question.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // Determine next version number
    const latestVersion = await prisma.formVersion.findFirst({
      where: { formId: id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // Create immutable version snapshot and update form transactionally
    const result = await prisma.$transaction(async (tx) => {
      // 1. If questions payload is provided, sync questions and options first
      if (body?.questions && Array.isArray(body.questions)) {
        for (const q of body.questions) {
          if (!q.id) continue;
          await tx.formQuestion.updateMany({
            where: { id: q.id, formId: id },
            data: {
              title: q.title || 'Untitled Question',
              description: q.description || '',
              type: q.type,
              isRequired: Boolean(q.isRequired),
              orderIndex: q.orderIndex ?? 0,
              validation: q.validation || {},
              config: q.config || {},
              quizPoints: q.quizPoints || 0,
              quizAnswer: q.quizAnswer || {},
              quizExplanation: q.quizExplanation || '',
              timeLimitSeconds: q.timeLimitSeconds ?? 0,
            },
          });

          if (q.options && Array.isArray(q.options)) {
            await tx.questionOption.deleteMany({
              where: { questionId: q.id },
            });

            if (q.options.length > 0) {
              await tx.questionOption.createMany({
                data: q.options.map((opt: any, idx: number) => {
                  const label = (opt.label || '').trim() || `Option ${idx + 1}`;
                  return {
                    questionId: q.id,
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
        }
      }

      // 2. Fetch the fully updated form with all relations
      const freshForm = await tx.form.findUnique({
        where: { id },
        include: {
          theme: true,
          settings: true,
          lookupMappings: {
            include: {
              dataset: {
                select: {
                  id: true,
                  fileName: true,
                  version: true,
                  columns: true,
                  rowCount: true,
                  isActive: true,
                },
              },
            },
          },
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

      if (!freshForm) {
        throw new Error('Form not found during publish');
      }

      if (
        freshForm.sections.length === 0 ||
        freshForm.sections.every((s) => s.questions.length === 0)
      ) {
        throw new Error('Cannot publish a form with no questions. Please add at least one question.');
      }

      const version = await tx.formVersion.create({
        data: {
          formId: id,
          versionNumber: nextVersionNumber,
          snapshotJson: freshForm as any,
          publishedByUserId: user.id,
        },
      });

      const updatedForm = await tx.form.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedVersionId: version.id,
        },
      });

      return { form: updatedForm, version };
    });

    await logActivity({
      action: 'FORM_PUBLISH',
      category: 'FORM',
      status: 'SUCCESS',
      formId: id,
      formTitle: result.form.title,
      publicId: result.form.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        versionNumber: result.version.versionNumber,
        versionId: result.version.id,
        publicUrl: `/f/${result.form.publicId}`,
        summary: `Published version #${result.version.versionNumber} of "${result.form.title}"`,
      },
    });

    const isRepublish = nextVersionNumber > 1 || form.status === 'PUBLISHED';
    const message = isRepublish ? 'Form republished successfully' : 'Form published successfully';

    return NextResponse.json({
      success: true,
      message,
      form: result.form,
      version: result.version,
      publicUrl: `/f/${result.form.publicId}`,
      publishedUrl: `/f/${result.form.publicId}`,
      publishedVersion: result.version.versionNumber,
      isRepublish,
    });
  } catch (error) {
    console.error('Failed to publish form:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to publish form';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
