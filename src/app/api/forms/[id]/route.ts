import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm, canDeleteForm } from '@/lib/auth/rbac';
import { updateFormSchema, calculateEditingWindowMinutes } from '@/lib/validation/formSchema';
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

    if (form.settings) {
      if (form.settings.duplicateIdentifierMethod !== 'IP_ADDRESS') {
        form.settings.duplicateIdentifierMethod = 'IP_ADDRESS';
      }
      if (form.settings.editingAuthMethod !== 'SECURE_EDIT_LINK') {
        form.settings.editingAuthMethod = 'SECURE_EDIT_LINK';
      }
      if (form.settings.editingWindowMode !== 'WITHIN_WINDOW') {
        form.settings.editingWindowMode = 'WITHIN_WINDOW';
      }
      const isDurationSynced =
        Boolean(form.settings.editingTimeDuration) &&
        Boolean(form.settings.editingWindowMinutes) &&
        calculateEditingWindowMinutes(form.settings.editingTimeDuration, form.settings.editingTimeUnit) === form.settings.editingWindowMinutes;

      if (!isDurationSynced) {
        if (form.settings.editingWindowMinutes) {
          const mins = form.settings.editingWindowMinutes;
          if (mins % 1440 === 0) {
            form.settings.editingTimeDuration = mins / 1440;
            form.settings.editingTimeUnit = 'Days';
          } else if (mins % 60 === 0) {
            form.settings.editingTimeDuration = mins / 60;
            form.settings.editingTimeUnit = 'Hours';
          } else {
            form.settings.editingTimeDuration = mins;
            form.settings.editingTimeUnit = 'Minutes';
          }
        } else {
          form.settings.editingTimeDuration = 24;
          form.settings.editingTimeUnit = 'Hours';
          form.settings.editingWindowMinutes = 1440;
        }
      }
      if (!form.settings.maxEditCount || form.settings.maxEditCount < 1) {
        form.settings.maxEditCount = 1;
      }
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

    // Handle legacy QUESTION_FIELD duplicateIdentifierMethod from existing forms safely
    if (body?.settings?.duplicateIdentifierMethod === 'QUESTION_FIELD') {
      body.settings.duplicateIdentifierMethod = 'IP_ADDRESS';
    }

    // Support aliases and calculate editingWindowMinutes
    if (body?.settings) {
      if (body.settings.shuffleQuestionOrder !== undefined) {
        if (body.settings.shuffleQuestions === undefined) {
          body.settings.shuffleQuestions = body.settings.shuffleQuestionOrder;
        }
        delete body.settings.shuffleQuestionOrder;
      }
      if (body.settings.maxEdits !== undefined && body.settings.maxEditCount === undefined) {
        body.settings.maxEditCount = body.settings.maxEdits;
      }
      if (body.settings.editingDuration !== undefined && body.settings.editingTimeDuration === undefined) {
        body.settings.editingTimeDuration = body.settings.editingDuration;
      }
      if (body.settings.editingUnit !== undefined && body.settings.editingTimeUnit === undefined) {
        body.settings.editingTimeUnit = body.settings.editingUnit;
      }
      if (body.settings.editingTimeDuration !== undefined || body.settings.editingTimeUnit !== undefined) {
        const dur = body.settings.editingTimeDuration !== undefined ? body.settings.editingTimeDuration : 24;
        const unit = body.settings.editingTimeUnit !== undefined ? body.settings.editingTimeUnit : 'Hours';
        if (Number(dur) > 0) {
          body.settings.editingWindowMinutes = calculateEditingWindowMinutes(dur, unit);
        }
      }
    }

    const result = updateFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, status, isQuiz, theme, settings } = result.data;

    const existingForm = await prisma.form.findUnique({
      where: { id },
      include: { settings: true, theme: true },
    });
    if (!existingForm) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // Compute before & after change tracking
    const changes: Array<{ field: string; label: string; before: any; after: any }> = [];
    if (title !== undefined && title !== existingForm.title) {
      changes.push({ field: 'title', label: 'Form Title', before: existingForm.title, after: title });
    }
    if (description !== undefined && description !== (existingForm.description || '')) {
      changes.push({ field: 'description', label: 'Form Description', before: existingForm.description || '', after: description });
    }
    if (status !== undefined && status !== existingForm.status) {
      changes.push({ field: 'status', label: 'Form Status', before: existingForm.status, after: status });
    }
    if (isQuiz !== undefined && isQuiz !== existingForm.isQuiz) {
      changes.push({ field: 'isQuiz', label: 'Quiz Mode', before: existingForm.isQuiz, after: isQuiz });
    }

    let isClosed = false;
    let isReopened = false;

    if (settings) {
      const prevSettings = existingForm.settings || ({} as any);
      if (settings.isAcceptingResponses !== undefined) {
        const prevAccepting = prevSettings.isAcceptingResponses ?? true;
        if (prevAccepting !== settings.isAcceptingResponses) {
          changes.push({
            field: 'isAcceptingResponses',
            label: 'Accepting Responses',
            before: prevAccepting,
            after: settings.isAcceptingResponses,
          });
          if (!settings.isAcceptingResponses && prevAccepting) {
            isClosed = true;
          } else if (settings.isAcceptingResponses && !prevAccepting) {
            isReopened = true;
          }
        }
      }

      const settingLabels: Record<string, string> = {
        confirmationMessage: 'Confirmation Message',
        showProgressBar: 'Progress Bar',
        allowMultipleSubmissions: 'Allow Multiple Submissions',
        quizTimerMode: 'Quiz Timer Mode',
        quizDurationMinutes: 'Quiz Duration',
        quizQuestionTimeLimitSeconds: 'Per-Question Time Limit',
        quizDefaultPoints: 'Default Points per Question',
      };

      for (const [key, label] of Object.entries(settingLabels)) {
        if ((settings as any)[key] !== undefined) {
          const prevVal = (prevSettings as any)[key];
          const newVal = (settings as any)[key];
          if (prevVal !== newVal) {
            changes.push({ field: key, label, before: prevVal ?? null, after: newVal });
          }
        }
      }
    }

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

      const effectiveIsQuiz = isQuiz !== undefined ? isQuiz : form.isQuiz;

      if (settings) {
        const previousSettings = await tx.formSettings.findUnique({
          where: { formId: id },
        });

        // Cross-field validation for Both Timers mode (only when quiz mode is enabled)
        const effectiveTimerMode = settings.quizTimerMode !== undefined ? settings.quizTimerMode : previousSettings?.quizTimerMode;
        if (effectiveIsQuiz && effectiveTimerMode === 'BOTH') {
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

        const prismaSettings = { ...settings };
        delete (prismaSettings as any).shuffleQuestionOrder;

        await tx.formSettings.upsert({
          where: { formId: id },
          update: prismaSettings,
          create: {
            formId: id,
            ...prismaSettings,
          },
        });
      }

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

      const reloadedForm = await tx.form.findUnique({
        where: { id },
        include: { settings: true, theme: true },
      });

      return reloadedForm || form;
    });

    if (changes.length > 0) {
      let actionName = 'FORM_UPDATE';
      let summary = `Made changes in form "${updatedForm.title}" (${changes.map((c) => c.label).join(', ')})`;

      if (isClosed) {
        actionName = 'FORM_CLOSED';
        summary = `Closed form "${updatedForm.title}" from accepting responses`;
      } else if (isReopened) {
        actionName = 'FORM_UPDATE';
        summary = `Reopened form "${updatedForm.title}" for responses`;
      }

      const beforeMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.before }), {});
      const afterMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.after }), {});

      await logActivity({
        action: actionName,
        category: 'FORM',
        status: 'SUCCESS',
        formId: id,
        formTitle: updatedForm.title,
        publicId: updatedForm.publicId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || user.email,
        userRole: user.role,
        req: request,
        changes,
        before: beforeMap,
        after: afterMap,
        details: {
          updatedFields: changes.map((c) => c.field),
          title: updatedForm.title,
          status: updatedForm.status,
          summary,
          changes,
          before: beforeMap,
          after: afterMap,
        },
      });
    }

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
