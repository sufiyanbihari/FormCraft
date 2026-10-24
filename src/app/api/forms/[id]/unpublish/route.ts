import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canPublishForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';

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

    if (!canPublishForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.update({
      where: { id },
      data: { status: 'DRAFT' },
    });

    await logActivity({
      action: 'FORM_CLOSED',
      category: 'FORM',
      status: 'SUCCESS',
      formId: id,
      formTitle: form.title,
      publicId: form.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        status: 'DRAFT',
        actionType: 'UNPUBLISH',
        summary: `Unpublished and closed form "${form.title}"`,
      },
    });

    return NextResponse.json({ message: 'Form unpublished', form });
  } catch (error) {
    console.error('Failed to unpublish form:', error);
    return NextResponse.json({ error: 'Failed to unpublish form' }, { status: 500 });
  }
}
