import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { z } from 'zod';
import { logActivity } from '@/lib/audit/auditLogger';
import { generateImportSectionTitle } from '@/lib/utils';

const importQuestionsSchema = z.object({
  sourceFormId: z.string().min(1, 'Source form ID is required'),
  questionIds: z.array(z.string()).min(1, 'At least one question must be selected for import'),
  targetSectionId: z.string().optional(),
  createNewSection: z.boolean().optional().default(false),
  newSectionTitle: z.string().optional().default('Questions 1'),
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

    const { id: targetFormId } = await params;

    // 1. Verify caller has EDIT permission on target form
    const targetRole = await getUserFormRole(targetFormId, user.id);
    if (!canEditForm(targetRole) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Permission denied: Cannot edit destination form' }, { status: 403 });
    }

    const body = await request.json();
    const parseResult = importQuestionsSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid import parameters', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { sourceFormId, questionIds, targetSectionId, createNewSection, newSectionTitle } = parseResult.data;

    // 2. Verify caller has VIEW permission on source form
    const sourceRole = await getUserFormRole(sourceFormId, user.id);
    if (sourceRole === 'NONE' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Permission denied: Cannot access source form' },
        { status: 403 }
      );
    }

    // 3. Fetch target form and its sections
    const targetForm = await prisma.form.findUnique({
      where: { id: targetFormId },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!targetForm) {
      return NextResponse.json({ error: 'Destination form not found' }, { status: 404 });
    }

    // 4. Fetch source questions with options
    const sourceQuestions = await prisma.formQuestion.findMany({
      where: {
        formId: sourceFormId,
        id: { in: questionIds },
      },
      include: {
        options: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (sourceQuestions.length === 0) {
      return NextResponse.json({ error: 'No matching questions found in source form' }, { status: 400 });
    }

    // Preserve the selection order requested by the admin
    const questionMap = new Map(sourceQuestions.map((q) => [q.id, q]));
    const orderedSourceQuestions = questionIds
      .map((qId) => questionMap.get(qId))
      .filter((q): q is typeof sourceQuestions[0] => Boolean(q));

    // 5. Execute import transactionally
    const result = await prisma.$transaction(async (tx) => {
      const newlyCreatedSections: any[] = [];
      const createdQuestions: any[] = [];
      const warnings: string[] = [];

      // Collect target form section IDs for branching sanitization
      const targetSectionIdSet = new Set(targetForm.sections.map((s) => s.id));

      if (createNewSection) {
        // Requirement: Create exactly one new section for every selected question.
        // Sequential default titles: Questions 1, question 2, question 3, etc.
        const nextSecOrder =
          targetForm.sections.length > 0
            ? Math.max(...targetForm.sections.map((s) => s.orderIndex)) + 1
            : 0;

        for (let i = 0; i < orderedSourceQuestions.length; i++) {
          const srcQ = orderedSourceQuestions[i];
          const secTitle = generateImportSectionTitle(newSectionTitle, i);

          const newSec = await tx.formSection.create({
            data: {
              formId: targetFormId,
              title: secTitle,
              description: '',
              orderIndex: nextSecOrder + i,
              nextSectionId: 'NEXT',
            },
          });
          newlyCreatedSections.push(newSec);
          targetSectionIdSet.add(newSec.id);

          // Sanitize question configuration
          let cleanConfig: any = srcQ.config ? JSON.parse(JSON.stringify(srcQ.config)) : {};
          if (cleanConfig.lookupMappingId || cleanConfig.lookupDatasetId) {
            delete cleanConfig.lookupMappingId;
            delete cleanConfig.lookupDatasetId;
            warnings.push(
              `Lookup dataset mapping stripped from question "${srcQ.title}" as lookup datasets are not shared across forms.`
            );
          }

          const newQuestion = await tx.formQuestion.create({
            data: {
              formId: targetFormId,
              sectionId: newSec.id,
              title: srcQ.title,
              description: srcQ.description,
              type: srcQ.type,
              orderIndex: 0,
              isRequired: srcQ.isRequired,
              validation: srcQ.validation ? JSON.parse(JSON.stringify(srcQ.validation)) : {},
              config: cleanConfig,
              quizPoints: srcQ.quizPoints || 0,
              quizAnswer: srcQ.quizAnswer ? JSON.parse(JSON.stringify(srcQ.quizAnswer)) : {},
              quizExplanation: srcQ.quizExplanation || '',
            },
          });

          // Copy options
          if (srcQ.options && srcQ.options.length > 0) {
            for (let optIdx = 0; optIdx < srcQ.options.length; optIdx++) {
              const opt = srcQ.options[optIdx];

              let safeGoToSectionId = opt.goToSectionId;
              if (safeGoToSectionId && safeGoToSectionId !== 'SUBMIT' && safeGoToSectionId !== 'NEXT') {
                if (!targetSectionIdSet.has(safeGoToSectionId)) {
                  safeGoToSectionId = null;
                  warnings.push(
                    `Branching rule for option "${opt.label}" was cleared because the target section does not exist in this form.`
                  );
                }
              }

              await tx.questionOption.create({
                data: {
                  questionId: newQuestion.id,
                  label: opt.label,
                  value: opt.value || `option_${optIdx + 1}`,
                  orderIndex: opt.orderIndex,
                  isOther: opt.isOther,
                  goToSectionId: safeGoToSectionId,
                  imageUrl: opt.imageUrl || null,
                },
              });
            }
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
                formId: targetFormId,
                title: 'Section 1',
                orderIndex: 0,
              },
            });
            newlyCreatedSections.push(fallbackSection);
            finalSectionId = fallbackSection.id;
            targetSectionIdSet.add(fallbackSection.id);
          }
        }

        // Determine starting order index in the target section
        const lastQuestionInSection = await tx.formQuestion.findFirst({
          where: { sectionId: finalSectionId },
          orderBy: { orderIndex: 'desc' },
          select: { orderIndex: true },
        });
        let currentOrder = (lastQuestionInSection?.orderIndex ?? -1) + 1;

        for (const srcQ of orderedSourceQuestions) {
          let cleanConfig: any = srcQ.config ? JSON.parse(JSON.stringify(srcQ.config)) : {};
          if (cleanConfig.lookupMappingId || cleanConfig.lookupDatasetId) {
            delete cleanConfig.lookupMappingId;
            delete cleanConfig.lookupDatasetId;
            warnings.push(
              `Lookup dataset mapping stripped from question "${srcQ.title}" as lookup datasets are not shared across forms.`
            );
          }

          const newQuestion = await tx.formQuestion.create({
            data: {
              formId: targetFormId,
              sectionId: finalSectionId!,
              title: srcQ.title,
              description: srcQ.description,
              type: srcQ.type,
              orderIndex: currentOrder++,
              isRequired: srcQ.isRequired,
              validation: srcQ.validation ? JSON.parse(JSON.stringify(srcQ.validation)) : {},
              config: cleanConfig,
              quizPoints: srcQ.quizPoints || 0,
              quizAnswer: srcQ.quizAnswer ? JSON.parse(JSON.stringify(srcQ.quizAnswer)) : {},
              quizExplanation: srcQ.quizExplanation || '',
            },
          });

          if (srcQ.options && srcQ.options.length > 0) {
            for (let optIdx = 0; optIdx < srcQ.options.length; optIdx++) {
              const opt = srcQ.options[optIdx];

              let safeGoToSectionId = opt.goToSectionId;
              if (safeGoToSectionId && safeGoToSectionId !== 'SUBMIT' && safeGoToSectionId !== 'NEXT') {
                if (!targetSectionIdSet.has(safeGoToSectionId)) {
                  safeGoToSectionId = null;
                  warnings.push(
                    `Branching rule for option "${opt.label}" was cleared because the target section does not exist in this form.`
                  );
                }
              }

              await tx.questionOption.create({
                data: {
                  questionId: newQuestion.id,
                  label: opt.label,
                  value: opt.value || `option_${optIdx + 1}`,
                  orderIndex: opt.orderIndex,
                  isOther: opt.isOther,
                  goToSectionId: safeGoToSectionId,
                  imageUrl: opt.imageUrl || null,
                },
              });
            }
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

      // Record audit log
      await logActivity({
        action: 'QUESTIONS_IMPORTED',
        category: 'FORM',
        status: 'SUCCESS',
        formId: targetFormId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        req: request,
        details: {
          sourceFormId,
          importedCount: createdQuestions.length,
          targetSectionId: newlyCreatedSections[0]?.id || targetSectionId,
          createdNewSection: newlyCreatedSections.length > 0,
          createdSectionCount: newlyCreatedSections.length,
          warnings,
        },
      });

      return {
        importedQuestions: createdQuestions,
        newSections: newlyCreatedSections,
        newSection: newlyCreatedSections[0] || null,
        targetSectionId: newlyCreatedSections[0]?.id || targetSectionId,
        warnings,
      };
    });

    return NextResponse.json({
      success: true,
      count: result.importedQuestions.length,
      questions: result.importedQuestions,
      newSections: result.newSections,
      newSection: result.newSection,
      targetSectionId: result.targetSectionId,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error('[Import Questions] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import questions' },
      { status: 500 }
    );
  }
}
