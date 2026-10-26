import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;
    const user = await getAuthUserFromRequest(request);

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        theme: true,
        settings: true,
        lookupMappings: {
          select: {
            id: true,
            triggerQuestionId: true,
            lookupType: true,
            keyColumn: true,
            noMatchMessage: true,
            mappings: true,
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
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This form is not found or has not been published.' },
        { status: 404 }
      );
    }

    // Check settings for accepting responses
    const now = new Date();
    const settings = form.settings;
    let isClosed = false;
    let closedReason = '';

    if (settings) {
      if (!settings.isAcceptingResponses) {
        isClosed = true;
        closedReason = settings.closedMessage || 'This form is no longer accepting responses.';
      } else if (settings.startDate && new Date(settings.startDate) > now) {
        isClosed = true;
        closedReason = `This form will start accepting responses on ${new Date(settings.startDate).toLocaleString()}.`;
      } else if (settings.endDate && new Date(settings.endDate) < now) {
        isClosed = true;
        closedReason = settings.closedMessage || 'The deadline to submit responses has passed.';
      } else if (settings.maxResponses && form._count.submissions >= settings.maxResponses) {
        isClosed = true;
        closedReason = 'This form has reached the maximum number of responses.';
      }
    }

    // Security: sanitize quiz answers so respondents cannot inspect client network payload for cheat sheets!
    const sanitizedSections = form.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        title: q.title,
        description: q.description,
        type: q.type,
        isRequired: q.isRequired,
        orderIndex: q.orderIndex,
        validation: q.validation,
        config: q.config,
        quizPoints: form.isQuiz ? q.quizPoints : 0,
        options: q.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          value: opt.value,
          orderIndex: opt.orderIndex,
          isOther: opt.isOther,
          goToSectionId: opt.goToSectionId,
          imageUrl: opt.imageUrl,
        })),
      })),
    }));

    return NextResponse.json(
      {
        form: {
          id: form.id,
          publicId: form.publicId,
          title: form.title,
          description: form.description,
          isQuiz: form.isQuiz,
          theme: form.theme,
          settings: form.settings,
          sections: sanitizedSections,
          lookupMappings: form.lookupMappings || [],
        },
        isClosed,
        closedReason,
        isAuthenticated: !!user,
        currentUserEmail: user?.email || null,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Failed to get public form:', error);
    return NextResponse.json({ error: 'Failed to retrieve form' }, { status: 500 });
  }
}
