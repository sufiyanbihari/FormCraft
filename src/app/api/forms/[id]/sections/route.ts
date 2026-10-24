import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { createSectionSchema } from '@/lib/validation/formSchema';

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

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const result = createSectionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid section data', details: result.error.flatten() },
        { status: 400 }
      );
    }

    // Determine max orderIndex
    const lastSection = await prisma.formSection.findFirst({
      where: { formId: id },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const nextOrder = (lastSection?.orderIndex ?? -1) + 1;

    const section = await prisma.formSection.create({
      data: {
        formId: id,
        title: result.data.title || `Section ${nextOrder + 1}`,
        description: result.data.description || '',
        orderIndex: nextOrder,
        nextSectionId: result.data.nextSectionId || 'NEXT',
      },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    return NextResponse.json({ section });
  } catch (error) {
    console.error('Failed to create section:', error);
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 });
  }
}
