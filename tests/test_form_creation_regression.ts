import { prisma } from '../src/lib/db/prisma';
import { FORM_TEMPLATES } from '../src/lib/templates/seedTemplates';
import { logActivity } from '../src/lib/audit/auditLogger';

async function runRegressionSuite() {
  console.log('====================================================');
  console.log(' FormCraft Form Creation Regression Test Suite      ');
  console.log('====================================================\n');

  const testUser = await prisma.user.findFirst();
  if (!testUser) {
    throw new Error('Test requires at least one user in the database.');
  }
  console.log(`Using Test User: ${testUser.email} (${testUser.id})\n`);

  const createdFormIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Blank Form Creation & FormSettings Defaults
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Blank Form Creation ---');
    const blankForm = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          title: 'Regression Test - Blank Form',
          description: 'Testing form settings and initial records',
          isQuiz: false,
          status: 'DRAFT',
          ownerId: testUser.id,
          theme: {
            create: {
              primaryColor: '#004B6E',
              backgroundColor: '#004B6E',
              cardColor: '#ffffff',
              fontFamily: 'Inter',
              borderRadius: 'rounded-xl',
              headerImageUrl: '/default-banner.jpg',
            },
          },
          settings: {
            create: {
              isAcceptingResponses: true,
              confirmationMessage: 'Your response has been recorded.',
              showProgressBar: true,
              allowMultipleSubmissions: true,
            },
          },
        },
        include: {
          settings: true,
          theme: true,
        },
      });

      const section = await tx.formSection.create({
        data: {
          formId: created.id,
          title: 'Section 1',
          description: '',
          orderIndex: 0,
        },
      });

      const question = await tx.formQuestion.create({
        data: {
          formId: created.id,
          sectionId: section.id,
          title: 'Sample Question',
          type: 'MULTIPLE_CHOICE',
          orderIndex: 0,
          isRequired: false,
        },
      });

      await tx.questionOption.create({
        data: {
          questionId: question.id,
          label: 'Option 1',
          value: 'Option 1',
          orderIndex: 0,
          imageUrl: null,
        },
      });

      return created;
    });

    createdFormIds.push(blankForm.id);
    console.log(`[PASS] Blank form created successfully (ID: ${blankForm.id})`);
    console.log('Verifying FormSettings defaults:');
    console.log('  - quizReleaseGrade:', blankForm.settings?.quizReleaseGrade);
    console.log('  - quizShowCorrectAnswers:', blankForm.settings?.quizShowCorrectAnswers);
    console.log('  - quizShowPointsEarned:', blankForm.settings?.quizShowPointsEarned);
    console.log('  - quizShowFeedback:', blankForm.settings?.quizShowFeedback);
    console.log('  - quizDefaultPoints:', blankForm.settings?.quizDefaultPoints);

    if (
      blankForm.settings?.quizReleaseGrade !== 'IMMEDIATE' ||
      blankForm.settings?.quizShowCorrectAnswers !== true ||
      blankForm.settings?.quizShowPointsEarned !== true ||
      blankForm.settings?.quizDefaultPoints !== 1
    ) {
      throw new Error('FormSettings quiz defaults do not match expected schema defaults.');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Template-Based Form Creation (Testing all templates)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Template-Based Form Creation ---');
    console.log(`Found ${FORM_TEMPLATES.length} templates to test.`);

    for (const template of FORM_TEMPLATES) {
      const templateForm = await prisma.$transaction(async (tx) => {
        const form = await tx.form.create({
          data: {
            title: template.title,
            description: template.description,
            isQuiz: Boolean(template.isQuiz),
            status: 'DRAFT',
            ownerId: testUser.id,
            theme: {
              create: {
                primaryColor: template.theme.primaryColor,
                backgroundColor: '#004B6E',
                cardColor: template.theme.cardColor,
                fontFamily: template.theme.fontFamily,
                borderRadius: template.theme.borderRadius,
                headerImageUrl: '/default-banner.jpg',
              },
            },
            settings: {
              create: {
                isAcceptingResponses: true,
                confirmationMessage: template.isQuiz
                  ? 'Quiz submitted! Review your score.'
                  : 'Your response has been recorded.',
                showProgressBar: true,
                allowMultipleSubmissions: true,
              },
            },
          },
        });

        for (const s of template.sections) {
          const section = await tx.formSection.create({
            data: {
              formId: form.id,
              title: s.title,
              description: s.description,
              orderIndex: s.orderIndex,
            },
          });

          for (const q of s.questions) {
            const question = await tx.formQuestion.create({
              data: {
                formId: form.id,
                sectionId: section.id,
                title: q.title,
                description: q.description || '',
                type: q.type,
                isRequired: q.isRequired,
                orderIndex: q.orderIndex,
                validation: q.validation || {},
                config: q.config || {},
                quizPoints: q.quizPoints || 0,
                quizAnswer: q.quizAnswer || {},
                quizExplanation: q.quizExplanation || '',
              },
            });

            if (q.options && q.options.length > 0) {
              await tx.questionOption.createMany({
                data: q.options.map((opt) => ({
                  questionId: question.id,
                  label: opt.label,
                  value: opt.value,
                  orderIndex: opt.orderIndex,
                  isOther: Boolean(opt.isOther),
                  goToSectionId: opt.goToSectionId || null,
                })),
              });
            }
          }
        }

        return form;
      });

      createdFormIds.push(templateForm.id);
      console.log(`[PASS] Template "${template.id}" ("${template.title}") created successfully.`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Audit Logging Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Audit Logging ---');
    const logResult = await logActivity({
      action: 'FORM_CREATE',
      category: 'FORM',
      status: 'SUCCESS',
      userId: testUser.id,
      userEmail: testUser.email,
      userName: testUser.name,
      userRole: testUser.role,
      formId: blankForm.id,
      formTitle: blankForm.title,
      publicId: blankForm.publicId,
      details: {
        isFromTemplate: false,
        summary: `Regression test audit log for "${blankForm.title}"`,
      },
    });

    if (!logResult || !logResult.id) {
      throw new Error('Audit logger failed to write FORM_CREATE log record.');
    }
    console.log(`[PASS] Audit log created successfully (ID: ${logResult.id})`);

    // Clean up audit log entry
    await prisma.formAuditLog.delete({ where: { id: logResult.id } });

    // -------------------------------------------------------------------------
    // TEST 4: Transaction Rollback on Failure
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Transaction Rollback Behavior ---');
    let rollbackSuccess = false;
    let attemptedFormId: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const dummy = await tx.form.create({
          data: {
            title: 'Rollback Test Form',
            description: '',
            ownerId: testUser.id,
          },
        });
        attemptedFormId = dummy.id;
        // Intentionally throw inside transaction
        throw new Error('Simulated transaction failure');
      });
    } catch {
      rollbackSuccess = true;
    }

    if (attemptedFormId) {
      const persisted = await prisma.form.findUnique({ where: { id: attemptedFormId } });
      if (persisted) {
        throw new Error('Transaction rollback failed: record was persisted despite error!');
      }
    }
    if (!rollbackSuccess) {
      throw new Error('Transaction did not catch simulated failure.');
    }
    console.log('[PASS] Transaction rollback works as expected; aborted transactions leave no orphan records.');

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Delete all created test forms
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    for (const formId of createdFormIds) {
      await prisma.form.delete({ where: { id: formId } }).catch(() => {});
    }
    console.log(`Cleaned up ${createdFormIds.length} test forms.`);
  }

  console.log('\n====================================================');
  console.log(' ALL REGRESSION TESTS PASSED!                        ');
  console.log('====================================================\n');
}

runRegressionSuite()
  .catch((err) => {
    console.error('\n[FAIL] Regression test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
