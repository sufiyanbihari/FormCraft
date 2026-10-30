import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { z } from 'zod';
import { logActivity } from '@/lib/audit/auditLogger';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';
import { generateImportSectionTitle, getUnwantedDefaultSection } from '@/lib/utils';

const excelImportPayloadSchema = z.object({
  targetSectionId: z.string().optional(),
  createNewSection: z.boolean().optional().default(false),
  newSectionTitle: z.string().optional().default('Questions 1'),
  questions: z
    .array(
      z.object({
        title: z.string().min(1, 'Question title is required'),
        type: z.literal('MULTIPLE_CHOICE').default('MULTIPLE_CHOICE'),
        options: z
          .array(
            z.object({
              label: z.string().min(1, 'Option text is required'),
              value: z.string().optional(),
              isCorrect: z.boolean().optional().default(false),
            })
          )
          .min(2, 'Multiple choice questions require at least 2 options'),
        marks: z.number().min(0).default(1),
        correctAnswerText: z.string().optional(),
      })
    )
    .min(1, 'At least one question must be selected for import'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: formId } = await params;

    // 1. Verify caller has EDIT permission on target form
    const role = await getUserFormRole(formId, user.id);
    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Permission denied: Cannot edit destination form' },
        { status: 403 }
      );
    }

    await ensureQuizSchema();

    const body = await request.json();
    const parseResult = excelImportPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid import parameters', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { targetSectionId, createNewSection, newSectionTitle, questions } = parseResult.data;

    // 2. Fetch target form and its sections with questions
    const targetForm = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            questions: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    if (!targetForm) {
      return NextResponse.json({ error: 'Destination form not found' }, { status: 404 });
    }

    // 3. Execute import in a database transaction
    const result = await prisma.$transaction(async (tx) => {
      const newlyCreatedSections: any[] = [];
      const createdQuestions: any[] = [];
      const deletedSectionIds: string[] = [];
      let totalImportedMarks = 0;

      if (createNewSection) {
        // Check if destination form has an unwanted temporary default section to clean up
        const unwantedDefault = getUnwantedDefaultSection(targetForm.sections);
        let nextSecOrder = 0;

        if (unwantedDefault) {
          // Clean up placeholder questions belonging to unwanted default section
          await tx.formQuestion.deleteMany({
            where: { sectionId: unwantedDefault.id },
          });
          // Remove unwanted default section
          await tx.formSection.delete({
            where: { id: unwantedDefault.id },
          });
          deletedSectionIds.push(unwantedDefault.id);
          nextSecOrder = 0;
        } else {
          nextSecOrder =
            targetForm.sections.length > 0
              ? Math.max(...targetForm.sections.map((s) => s.orderIndex)) + 1
              : 0;
        }

        // Requirement: Create exactly one new section for every selected question.
        // Sequential default titles: Questions 1, question 2, question 3, etc.
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const secTitle = generateImportSectionTitle(newSectionTitle, i);

          const newSec = await tx.formSection.create({
            data: {
              formId,
              title: secTitle,
              description: '',
              orderIndex: nextSecOrder + i,
              nextSectionId: 'NEXT',
            },
          });
          newlyCreatedSections.push(newSec);

          const correctOpt = q.options.find((o) => o.isCorrect);
          const correctValue = correctOpt ? correctOpt.label : q.correctAnswerText || '';
          const marks = Number(q.marks) || 0;
          totalImportedMarks += marks;

          const newQuestion = await tx.formQuestion.create({
            data: {
              formId,
              sectionId: newSec.id,
              title: q.title,
              description: '',
              type: 'MULTIPLE_CHOICE',
              orderIndex: 0,
              isRequired: false,
              validation: {},
              config: {},
              quizPoints: marks,
              quizAnswer: {
                correctValue,
              },
              quizExplanation: '',
            },
          });

          for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
            const opt = q.options[optIdx];
            await tx.questionOption.create({
              data: {
                questionId: newQuestion.id,
                label: opt.label,
                value: opt.value || opt.label,
                orderIndex: optIdx,
                isOther: false,
                goToSectionId: null,
              },
            });
          }

          const completeQuestion = await tx.formQuestion.findUnique({
            where: { id: newQuestion.id },
            include: {
              options: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          });

          if (completeQuestion) {
            createdQuestions.push(completeQuestion);
          }
        }
      } else {
        // Destination: Existing Section
        let finalSectionId = targetSectionId;
        const sectionExists = targetForm.sections.some((s) => s.id === finalSectionId);
        if (!sectionExists) {
          finalSectionId = targetForm.sections[0]?.id;
          if (!finalSectionId) {
            const fallbackSection = await tx.formSection.create({
              data: {
                formId,
                title: 'Section 1',
                orderIndex: 0,
              },
            });
            newlyCreatedSections.push(fallbackSection);
            finalSectionId = fallbackSection.id;
          }
        }

        const lastQuestionInSection = await tx.formQuestion.findFirst({
          where: { sectionId: finalSectionId },
          orderBy: { orderIndex: 'desc' },
          select: { orderIndex: true },
        });
        let currentOrder = (lastQuestionInSection?.orderIndex ?? -1) + 1;

        for (const q of questions) {
          const correctOpt = q.options.find((o) => o.isCorrect);
          const correctValue = correctOpt ? correctOpt.label : q.correctAnswerText || '';
          const marks = Number(q.marks) || 0;
          totalImportedMarks += marks;

          const newQuestion = await tx.formQuestion.create({
            data: {
              formId,
              sectionId: finalSectionId!,
              title: q.title,
              description: '',
              type: 'MULTIPLE_CHOICE',
              orderIndex: currentOrder++,
              isRequired: false,
              validation: {},
              config: {},
              quizPoints: marks,
              quizAnswer: {
                correctValue,
              },
              quizExplanation: '',
            },
          });

          for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
            const opt = q.options[optIdx];
            await tx.questionOption.create({
              data: {
                questionId: newQuestion.id,
                label: opt.label,
                value: opt.value || opt.label,
                orderIndex: optIdx,
                isOther: false,
                goToSectionId: null,
              },
            });
          }

          const completeQuestion = await tx.formQuestion.findUnique({
            where: { id: newQuestion.id },
            include: {
              options: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          });

          if (completeQuestion) {
            createdQuestions.push(completeQuestion);
          }
        }
      }

      // Audit log entry
      await logActivity({
        action: 'QUESTIONS_IMPORTED',
        category: 'FORM',
        status: 'SUCCESS',
        formId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        req: request,
        details: {
          source: 'EXCEL_UPLOAD',
          importedCount: createdQuestions.length,
          totalMarks: totalImportedMarks,
          targetSectionId: newlyCreatedSections[0]?.id || targetSectionId,
          createdNewSection: newlyCreatedSections.length > 0,
          createdSectionCount: newlyCreatedSections.length,
        },
      });

      return {
        importedQuestions: createdQuestions,
        newSections: newlyCreatedSections,
        newSection: newlyCreatedSections[0] || null,
        deletedSectionIds,
        targetSectionId: newlyCreatedSections[0]?.id || targetSectionId,
        totalMarks: totalImportedMarks,
      };
    });

    return NextResponse.json({
      success: true,
      count: result.importedQuestions.length,
      totalMarks: result.totalMarks,
      questions: result.importedQuestions,
      newSections: result.newSections,
      newSection: result.newSection,
      deletedSectionIds: result.deletedSectionIds,
      targetSectionId: result.targetSectionId,
    });
  } catch (error: any) {
    console.error('[Import Questions from Excel] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import Excel questions' },
      { status: 500 }
    );
  }
}
