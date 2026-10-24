import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { updateSectionSchema } from '@/lib/validation/formSchema';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, sectionId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const result = updateSectionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid section update payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const section = await prisma.formSection.update({
      where: { id: sectionId },
      data: result.data,
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    return NextResponse.json({ section });
  } catch (error) {
    console.error('Failed to update section:', error);
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, sectionId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if there is only 1 section left
    const count = await prisma.formSection.count({ where: { formId: id } });
    if (count <= 1) {
      return NextResponse.json(
        { error: 'A form must have at least one section.' },
        { status: 400 }
      );
    }

    await prisma.formSection.delete({
      where: { id: sectionId },
    });

    return NextResponse.json({ message: 'Section deleted' });
  } catch (error) {
    console.error('Failed to delete section:', error);
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 });
  }
}
