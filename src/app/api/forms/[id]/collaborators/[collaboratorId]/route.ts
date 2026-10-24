import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canManageCollaborators } from '@/lib/auth/rbac';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, collaboratorId } = await params;
    const userRole = await getUserFormRole(id, user.id);

    if (!canManageCollaborators(userRole) && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only form owners can remove collaborators' },
        { status: 403 }
      );
    }

    await prisma.formCollaborator.delete({
      where: { id: collaboratorId },
    });

    return NextResponse.json({ message: 'Collaborator removed successfully' });
  } catch (error) {
    console.error('Failed to remove collaborator:', error);
    return NextResponse.json({ error: 'Failed to remove collaborator' }, { status: 500 });
  }
}
