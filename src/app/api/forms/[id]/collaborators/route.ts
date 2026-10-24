import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canManageCollaborators } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';
import { z } from 'zod';

const addCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER', 'ANALYST']).default('EDITOR'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userRole = await getUserFormRole(id, user.id);

    if (userRole === 'NONE' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        collaborators: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json({
      owner: form.owner,
      collaborators: form.collaborators,
    });
  } catch (error) {
    console.error('Failed to get collaborators:', error);
    return NextResponse.json({ error: 'Failed to retrieve collaborators' }, { status: 500 });
  }
}

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
    const userRole = await getUserFormRole(id, user.id);

    if (!canManageCollaborators(userRole) && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only form owners can manage collaborators' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = addCollaboratorSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid invitation payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = result.data;
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: `No user found with email ${email}. They must create an account first.` },
        { status: 404 }
      );
    }

    if (targetUser.id === user.id) {
      return NextResponse.json(
        { error: 'You are already the owner of this form' },
        { status: 400 }
      );
    }

    const collaborator = await prisma.formCollaborator.upsert({
      where: {
        formId_userId: {
          formId: id,
          userId: targetUser.id,
        },
      },
      update: { role },
      create: {
        formId: id,
        userId: targetUser.id,
        role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    await logActivity({
      action: 'COLLABORATOR_ADD',
      category: 'COLLABORATOR',
      status: 'SUCCESS',
      formId: id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        collaboratorEmail: targetUser.email,
        collaboratorName: targetUser.name,
        role,
      },
    });

    return NextResponse.json({ collaborator });
  } catch (error) {
    console.error('Failed to add collaborator:', error);
    return NextResponse.json({ error: 'Failed to add collaborator' }, { status: 500 });
  }
}
