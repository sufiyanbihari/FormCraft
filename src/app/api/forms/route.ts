import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { createFormSchema } from '@/lib/validation/formSchema';
import { FORM_TEMPLATES } from '@/lib/templates/seedTemplates';
import { logActivity } from '@/lib/audit/auditLogger';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // all, owned, shared, draft, published, archived, trash
    const search = searchParams.get('search')?.trim() || '';

    let whereClause: any = {};

    if (filter === 'trash') {
      whereClause.status = 'TRASHED';
      whereClause.ownerId = user.id;
    } else {
      // Exclude trashed by default unless specifically looking at trash
      whereClause.status = { not: 'TRASHED' };

      if (filter === 'draft') {
        whereClause.status = 'DRAFT';
        whereClause.ownerId = user.id;
      } else if (filter === 'published') {
        whereClause.status = 'PUBLISHED';
        whereClause.ownerId = user.id;
      } else if (filter === 'archived') {
        whereClause.status = 'ARCHIVED';
        whereClause.ownerId = user.id;
      } else if (filter === 'owned') {
        whereClause.ownerId = user.id;
      } else if (filter === 'shared') {
        whereClause.collaborators = {
          some: { userId: user.id },
        };
      } else {
        // 'all' or 'recent'
        whereClause.OR = [
          { ownerId: user.id },
          { collaborators: { some: { userId: user.id } } },
        ];
      }
    }

    if (search) {
      whereClause.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const forms = await prisma.form.findMany({
      where: whereClause,
      include: {
        theme: true,
        _count: {
          select: {
            submissions: true,
            questions: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ forms });
  } catch (error) {
    console.error('Failed to list forms:', error);
    return NextResponse.json({ error: 'Failed to retrieve forms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = createFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid form input', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, isQuiz, templateId } = result.data;

    // Check if creating from a template
    if (templateId) {
      const template = FORM_TEMPLATES.find((t) => t.id === templateId);
      if (template) {
        const newForm = await prisma.$transaction(async (tx) => {
          const form = await tx.form.create({
            data: {
              title: template.title,
              description: template.description,
              isQuiz: Boolean(template.isQuiz),
              status: 'DRAFT',
              ownerId: user.id,
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

        await logActivity({
          action: 'FORM_CREATE',
          category: 'FORM',
          status: 'SUCCESS',
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
          formId: newForm.id,
          formTitle: newForm.title,
          publicId: newForm.publicId,
          req: request,
          details: {
            isFromTemplate: true,
            templateId,
            summary: `Created form "${newForm.title}" from template`,
          },
        });

        return NextResponse.json({ form: newForm });
      }
    }

    // Otherwise create blank form
    const form = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          title: title || 'Untitled form',
          description: description || '',
          isQuiz: Boolean(isQuiz),
          status: 'DRAFT',
          ownerId: user.id,
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
      });

      // Create default Section 1
      const section = await tx.formSection.create({
        data: {
          formId: created.id,
          title: 'Section 1',
          description: '',
          orderIndex: 0,
        },
      });

      // Create default Question 1 (Multiple Choice)
      const question = await tx.formQuestion.create({
        data: {
          formId: created.id,
          sectionId: section.id,
          title: 'Untitled Question',
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
        },
      });

      return created;
    });

    await logActivity({
      action: 'FORM_CREATE',
      category: 'FORM',
      status: 'SUCCESS',
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      formId: form.id,
      formTitle: form.title,
      publicId: form.publicId,
      req: request,
      details: {
        isFromTemplate: false,
        summary: `Created new form "${form.title}"`,
      },
    });

    return NextResponse.json({ form });
  } catch (error) {
    console.error('Failed to create form:', error);
    return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
  }
}
