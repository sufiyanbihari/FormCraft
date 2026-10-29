import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm, canDeleteForm } from '@/lib/auth/rbac';
import { updateFormSchema } from '@/lib/validation/formSchema';
import { logActivity } from '@/lib/audit/auditLogger';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';

export async function GET(
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

    if (role === 'NONE' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
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
        lookupDatasets: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            rowCount: true,
            columns: true,
            version: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
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
        collaborators: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json({ form, userRole: role });
  } catch (error) {
    console.error('Failed to get form:', error);
    return NextResponse.json({ error: 'Failed to retrieve form' }, { status: 500 });
  }
}

export async function PATCH(
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

    const body = await request.json();
    const result = updateFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, status, isQuiz, theme, settings } = result.data;

    const updatedForm = await prisma.$transaction(async (tx) => {
      const formUpdateData: any = {};
      if (title !== undefined) formUpdateData.title = title;
      if (description !== undefined) formUpdateData.description = description;
      if (status !== undefined) formUpdateData.status = status;
      if (isQuiz !== undefined) formUpdateData.isQuiz = isQuiz;

      const form = await tx.form.update({
        where: { id },
        data: formUpdateData,
      });

      if (theme) {
        await tx.formTheme.upsert({
          where: { formId: id },
          update: theme,
          create: {
            formId: id,
            primaryColor: theme.primaryColor || '#004B6E',
            backgroundColor: theme.backgroundColor || '#004B6E',
            cardColor: theme.cardColor || '#ffffff',
            fontFamily: theme.fontFamily || 'Inter',
            borderRadius: theme.borderRadius || 'rounded-xl',
            headerImageUrl: theme.headerImageUrl,
            logoUrl: theme.logoUrl,
          },
        });
      }

      let defaultPointsChanged = false;
      let newDefaultPointsValue = 1;

      if (settings) {
        const previousSettings = await tx.formSettings.findUnique({
          where: { formId: id },
        });

        // Cross-field validation for Both Timers mode
        const effectiveTimerMode = settings.quizTimerMode !== undefined ? settings.quizTimerMode : previousSettings?.quizTimerMode;
        if (effectiveTimerMode === 'BOTH') {
          const effectiveDurationMin = settings.quizDurationMinutes !== undefined ? settings.quizDurationMinutes : previousSettings?.quizDurationMinutes;
          const effectiveQuestionSec = settings.quizQuestionTimeLimitSeconds !== undefined ? settings.quizQuestionTimeLimitSeconds : previousSettings?.quizQuestionTimeLimitSeconds;

          if (effectiveQuestionSec !== null && effectiveQuestionSec !== undefined) {
            if (effectiveQuestionSec <= 0) {
              throw new Error('VALIDATION_ERROR: Per-question time limit must be greater than zero.');
            }
            if (effectiveDurationMin !== null && effectiveDurationMin !== undefined && effectiveDurationMin > 0) {
              const maxAllowedSec = effectiveDurationMin * 60;
              if (effectiveQuestionSec > maxAllowedSec) {
                throw new Error(
                  `VALIDATION_ERROR: Per-question time limit (${effectiveQuestionSec}s) cannot exceed overall quiz duration (${maxAllowedSec}s).`
                );
              }
            }
          }
        }

        if (
          settings.quizDefaultPoints !== undefined &&
          settings.quizDefaultPoints !== null &&
          settings.quizDefaultPoints !== previousSettings?.quizDefaultPoints
        ) {
          defaultPointsChanged = true;
          newDefaultPointsValue = settings.quizDefaultPoints;
        }

        await tx.formSettings.upsert({
          where: { formId: id },
          update: settings,
          create: {
            formId: id,
            ...settings,
          },
        });
      }

      const effectiveIsQuiz = isQuiz !== undefined ? isQuiz : form.isQuiz;
      const turningQuizOn = !form.isQuiz && effectiveIsQuiz;

      // When the Default Points per Question setting changes, update all existing questions to the new default
      if (effectiveIsQuiz && defaultPointsChanged) {
        await tx.formQuestion.updateMany({
          where: {
            formId: id,
            type: {
              notIn: ['SECTION_HEADER', 'TEXT_BLOCK', 'IMAGE_BLOCK', 'VIDEO_EMBED'],
            },
          },
          data: {
            quizPoints: newDefaultPointsValue,
          },
        });
      } else if (effectiveIsQuiz && turningQuizOn) {
        // When converting to quiz without explicitly changing default points, initialize 0-pt questions
        const currentDef =
          (await tx.formSettings.findUnique({ where: { formId: id }, select: { quizDefaultPoints: true } }))
            ?.quizDefaultPoints ?? 1;
        await tx.formQuestion.updateMany({
          where: {
            formId: id,
            type: {
              notIn: ['SECTION_HEADER', 'TEXT_BLOCK', 'IMAGE_BLOCK', 'VIDEO_EMBED'],
            },
            quizPoints: 0,
          },
          data: {
            quizPoints: currentDef,
          },
        });
      }

      // Record audit log
      await tx.formAuditLog.create({
        data: {
          formId: id,
          userId: user.id,
          action: 'UPDATE_FORM',
          details: { updatedFields: Object.keys(body) },
        },
      });

      const reloadedForm = await tx.form.findUnique({
        where: { id },
        include: { settings: true, theme: true },
      });

      return reloadedForm || form;
    });

    const isClosed = settings && settings.isAcceptingResponses === false;
    const isReopened = settings && settings.isAcceptingResponses === true;
    const actionName = isClosed ? 'FORM_CLOSED' : 'FORM_UPDATE';

    await logActivity({
      action: actionName,
      category: 'FORM',
      status: 'SUCCESS',
      formId: id,
      formTitle: updatedForm.title,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        updatedFields: Object.keys(body),
        title: updatedForm.title,
        status: updatedForm.status,
        isAcceptingResponses: settings?.isAcceptingResponses,
        summary: isClosed
          ? `Closed form "${updatedForm.title}" from accepting responses`
          : isReopened
          ? `Reopened form "${updatedForm.title}" for responses`
          : `Made changes in form "${updatedForm.title}" (${Object.keys(body).join(', ')})`,
      },
    });

    return NextResponse.json({ form: updatedForm });
  } catch (error: any) {
    if (error?.message?.startsWith('VALIDATION_ERROR: ')) {
      return NextResponse.json(
        { error: error.message.replace('VALIDATION_ERROR: ', '') },
        { status: 400 }
      );
    }
    console.error('Failed to update form:', error);
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}

export async function DELETE(
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

    if (!canDeleteForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners can delete forms' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      select: { id: true, title: true, publicId: true },
    });

    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      await prisma.form.delete({
        where: { id },
      });

      // Record deletion with formId null so it persists permanently even after form cascade delete
      await logActivity({
        action: 'FORM_DELETE',
        category: 'FORM',
        status: 'SUCCESS',
        formId: null,
        formTitle: form?.title || 'Untitled Form',
        publicId: form?.publicId || null,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        req: request,
        details: {
          deletedFormId: id,
          formTitle: form?.title,
          permanent: true,
        },
      });

      return NextResponse.json({ message: 'Form permanently deleted' });
    } else {
      // Move to trash
      await prisma.form.update({
        where: { id },
        data: { status: 'TRASHED' },
      });

      await logActivity({
        action: 'FORM_DELETE',
        category: 'FORM',
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
          formTitle: form?.title,
          permanent: false,
          actionType: 'MOVED_TO_TRASH',
        },
      });

      return NextResponse.json({ message: 'Form moved to trash' });
    }
  } catch (error) {
    console.error('Failed to delete form:', error);
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
  }
}
