import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { FORM_TEMPLATES } from '../src/lib/templates/seedTemplates';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedAdminPassword || !seedAdminPassword.trim()) {
    console.error('❌ SEED_ADMIN_PASSWORD environment variable is missing or empty.');
    console.error('   Please define SEED_ADMIN_PASSWORD in your environment before running prisma db seed.');
    throw new Error('SEED_ADMIN_PASSWORD is required for seeding');
  }

  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@example.com';
  const seedAdminName = process.env.SEED_ADMIN_NAME?.trim() || 'FormCraft Admin';

  // Hash password for Administrator
  const passwordHash = await bcrypt.hash(seedAdminPassword.trim(), 12);

  // 1. Create or upsert single Administrator user
  const adminUser = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {
      passwordHash,
      role: 'ADMIN',
      name: seedAdminName,
    },
    create: {
      email: seedAdminEmail,
      name: seedAdminName,
      passwordHash,
      role: 'ADMIN',
      avatarUrl: '/logo.png',
    },
  });

  console.log('👤 Single Admin user seeded:', adminUser.email);

  // 3. Seed sample forms with questions, options, settings, and themes
  for (const template of FORM_TEMPLATES.slice(0, 4)) {
    const existing = await prisma.form.findFirst({
      where: {
        ownerId: adminUser.id,
        title: template.title,
      },
    });

    if (!existing) {
      const createdForm = await prisma.form.create({
        data: {
          title: template.title,
          description: template.description,
          status: 'PUBLISHED',
          isQuiz: Boolean(template.isQuiz),
          ownerId: adminUser.id,
          theme: {
            create: {
              primaryColor: template.theme.primaryColor,
              backgroundColor: template.theme.backgroundColor,
              cardColor: template.theme.cardColor,
              fontFamily: template.theme.fontFamily,
              borderRadius: template.theme.borderRadius,
            },
          },
          settings: {
            create: {
              isAcceptingResponses: true,
              confirmationMessage: template.isQuiz
                ? 'Your quiz has been submitted! Check your score below.'
                : 'Thank you! Your response has been recorded.',
              showProgressBar: true,
              allowMultipleSubmissions: true,
            },
          },
        },
      });

      // Create sections and questions
      for (const sectionData of template.sections) {
        const createdSection = await prisma.formSection.create({
          data: {
            formId: createdForm.id,
            title: sectionData.title,
            description: sectionData.description,
            orderIndex: sectionData.orderIndex,
          },
        });

        for (const q of sectionData.questions) {
          const createdQuestion = await prisma.formQuestion.create({
            data: {
              formId: createdForm.id,
              sectionId: createdSection.id,
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
            await prisma.questionOption.createMany({
              data: q.options.map((opt) => ({
                questionId: createdQuestion.id,
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

      // Create published version snapshot
      const fullForm = await prisma.form.findUnique({
        where: { id: createdForm.id },
        include: {
          theme: true,
          settings: true,
          sections: {
            include: {
              questions: {
                include: { options: true },
              },
            },
          },
        },
      });

      const publishedVersion = await prisma.formVersion.create({
        data: {
          formId: createdForm.id,
          versionNumber: 1,
          snapshotJson: fullForm as any,
          publishedByUserId: adminUser.id,
        },
      });

      await prisma.form.update({
        where: { id: createdForm.id },
        data: { publishedVersionId: publishedVersion.id },
      });

      // Add sample submissions for the first two forms
      if (template.id === 'customer-feedback' || template.id === 'contact-form') {
        const questions = fullForm?.sections.flatMap((s) => s.questions) || [];

        // Add 5 realistic sample submissions
        const sampleSubmissions = [
          { name: 'Sarah Miller', email: 'sarah@example.com', score: 10 },
          { name: 'David Chen', email: 'david@example.com', score: 10 },
          { name: 'Elena Rostova', email: 'elena@example.com', score: 8 },
          { name: 'Marcus Johnson', email: 'marcus@example.com', score: 9 },
          { name: 'Amina Al-Mansoor', email: 'amina@example.com', score: 10 },
        ];

        for (const sub of sampleSubmissions) {
          const submission = await prisma.formSubmission.create({
            data: {
              formId: createdForm.id,
              formVersionId: publishedVersion.id,
              respondentEmail: sub.email,
              totalScore: sub.score,
              maxScore: 10,
              submittedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 5)),
            },
          });

          for (const q of questions) {
            let answerValue: any = 'Great service!';
            if (q.type === 'SHORT_ANSWER') answerValue = sub.name;
            else if (q.type === 'EMAIL') answerValue = sub.email;
            else if (q.type === 'LINEAR_SCALE') answerValue = 5;
            else if (q.type === 'RATING') answerValue = 5;
            else if (q.type === 'MULTIPLE_CHOICE' && q.options.length > 0) {
              answerValue = q.options[0].label;
            } else if (q.type === 'CHECKBOXES' && q.options.length > 0) {
              answerValue = [q.options[0].label, q.options[1]?.label].filter(Boolean);
            } else if (q.type === 'MULTIPLE_CHOICE_GRID') {
              answerValue = { 'Ease of Use': 'Excellent', Reliability: 'Good' };
            }

            await prisma.submissionAnswer.create({
              data: {
                submissionId: submission.id,
                questionId: q.id,
                value: answerValue,
                textAnswer: typeof answerValue === 'string' ? answerValue : JSON.stringify(answerValue),
              },
            });
          }
        }
      }

      console.log(`✅ Seeded form: ${template.title}`);
    }
  }

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
