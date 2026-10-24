import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { z } from 'zod';

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sectionId: z.string(),
      orderIndex: z.number().int(),
    })
  ),
});

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
    const result = reorderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid reorder payload', details: result.error.flatten() },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      result.data.items.map((item) =>
        prisma.formQuestion.update({
          where: { id: item.id },
          data: {
            sectionId: item.sectionId,
            orderIndex: item.orderIndex,
          },
        })
      )
    );

    return NextResponse.json({ message: 'Questions reordered successfully' });
  } catch (error) {
    console.error('Failed to reorder questions:', error);
    return NextResponse.json({ error: 'Failed to reorder questions' }, { status: 500 });
  }
}
