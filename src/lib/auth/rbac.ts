import { prisma } from '@/lib/db/prisma';
import { CollaboratorRole } from '@prisma/client';

export type UserFormRole = 'OWNER' | 'EDITOR' | 'VIEWER' | 'ANALYST' | 'NONE';

export async function getUserFormRole(formId: string, userId: string): Promise<UserFormRole> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { ownerId: true },
  });

  if (!form) return 'NONE';
  if (form.ownerId === userId) return 'OWNER';

  const collaborator = await prisma.formCollaborator.findUnique({
    where: {
      formId_userId: { formId, userId },
    },
    select: { role: true },
  });

  if (collaborator) return collaborator.role as UserFormRole;

  return 'NONE';
}

export function canEditForm(role: UserFormRole): boolean {
  return role === 'OWNER' || role === 'EDITOR';
}

export function canPublishForm(role: UserFormRole): boolean {
  return role === 'OWNER' || role === 'EDITOR';
}

export function canViewResponses(role: UserFormRole): boolean {
  return role === 'OWNER' || role === 'EDITOR' || role === 'ANALYST';
}

export function canExportResponses(role: UserFormRole): boolean {
  return role === 'OWNER' || role === 'EDITOR' || role === 'ANALYST';
}

export function canManageCollaborators(role: UserFormRole): boolean {
  return role === 'OWNER';
}

export function canDeleteForm(role: UserFormRole): boolean {
  return role === 'OWNER';
}
