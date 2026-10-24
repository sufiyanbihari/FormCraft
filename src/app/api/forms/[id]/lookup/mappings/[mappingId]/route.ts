import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mappingId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, mappingId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const mapping = await prisma.formLookupMapping.findFirst({
      where: { id: mappingId, formId: id },
    });

    if (!mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    await prisma.formLookupMapping.delete({
      where: { id: mappingId },
    });

    await logActivity({
      action: 'LOOKUP_MAPPING_DELETED',
      category: 'FORM',
      userId: user.id,
      userEmail: user.email,
      formId: id,
      details: {
        mappingId,
        triggerQuestionId: mapping.triggerQuestionId,
        keyColumn: mapping.keyColumn,
      },
      req: request,
    });

    return NextResponse.json({ success: true, message: 'Mapping deleted successfully' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete lookup mapping' },
      { status: 500 }
    );
  }
}
