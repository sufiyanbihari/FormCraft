import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canViewResponses } from '@/lib/auth/rbac';

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
    const role = await getUserFormRole(id, user.id);

    if (!canViewResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const [submissions, totalCount] = await Promise.all([
      prisma.formSubmission.findMany({
        where: { formId: id },
        include: {
          respondent: {
            select: { id: true, name: true, email: true },
          },
          cattleOwners: {
            orderBy: { orderIndex: 'asc' },
          },
          answers: {
            include: {
              question: {
                select: { id: true, title: true, type: true },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.formSubmission.count({ where: { formId: id } }),
    ]);

    return NextResponse.json({
      submissions,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Failed to get responses:', error);
    return NextResponse.json({ error: 'Failed to retrieve responses' }, { status: 500 });
  }
}
