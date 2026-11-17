import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { updateSectionSchema } from '@/lib/validation/formSchema';
import { logActivity } from '@/lib/audit/auditLogger';

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

    const existingSection = await prisma.formSection.findUnique({
      where: { id: sectionId },
    });

    if (!existingSection) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const changes: Array<{ field: string; label: string; before: any; after: any }> = [];
    if (result.data.title !== undefined && result.data.title !== existingSection.title) {
      changes.push({ field: 'title', label: 'Section Title', before: existingSection.title, after: result.data.title });
    }
    if (result.data.description !== undefined && result.data.description !== (existingSection.description || '')) {
      changes.push({ field: 'description', label: 'Description', before: existingSection.description || '', after: result.data.description });
    }
    if (result.data.nextSectionId !== undefined && result.data.nextSectionId !== existingSection.nextSectionId) {
      changes.push({ field: 'nextSectionId', label: 'Next Section Navigation', before: existingSection.nextSectionId, after: result.data.nextSectionId });
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

    if (changes.length > 0) {
      const beforeMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.before }), {});
      const afterMap = changes.reduce((acc, c) => ({ ...acc, [c.field]: c.after }), {});
      const summary = `Updated section "${section.title}" (${changes.map((c) => c.label).join(', ')})`;

      await logActivity({
        action: 'SECTION_UPDATE',
        category: 'QUESTION',
        status: 'SUCCESS',
        formId: id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || user.email,
        userRole: user.role,
        req: request,
        changes,
        before: beforeMap,
        after: afterMap,
        details: {
          sectionId,
          sectionTitle: section.title,
          updatedFields: changes.map((c) => c.field),
          summary,
          changes,
          before: beforeMap,
          after: afterMap,
        },
      });
    }

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

    const section = await prisma.formSection.findUnique({
      where: { id: sectionId },
      select: { title: true, orderIndex: true },
    });

    await prisma.formSection.delete({
      where: { id: sectionId },
    });

    await logActivity({
      action: 'SECTION_DELETE',
      category: 'QUESTION',
      status: 'SUCCESS',
      formId: id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
      userRole: user.role,
      req: request,
      changes: [
        { field: 'section', label: 'Section', before: section?.title || 'Section', after: '(Deleted)' },
      ],
      before: { title: section?.title, orderIndex: section?.orderIndex },
      after: null,
      details: {
        sectionId,
        sectionTitle: section?.title || 'Unknown',
        summary: `Deleted section "${section?.title || 'Section'}"`,
      },
    });

    return NextResponse.json({ message: 'Section deleted' });
  } catch (error) {
    console.error('Failed to delete section:', error);
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 });
  }
}
