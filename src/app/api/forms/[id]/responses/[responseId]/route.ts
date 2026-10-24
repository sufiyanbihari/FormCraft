import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canViewResponses, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, responseId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canViewResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id: responseId },
      include: {
        respondent: {
          select: { id: true, name: true, email: true },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!submission || submission.formId !== id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error('Failed to get submission:', error);
    return NextResponse.json({ error: 'Failed to retrieve submission' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, responseId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      select: { id: true, title: true, publicId: true },
    });

    const submission = await prisma.formSubmission.findUnique({
      where: { id: responseId },
      select: { respondentEmail: true },
    });

    await prisma.formSubmission.delete({
      where: { id: responseId },
    });

    await logActivity({
      action: 'SUBMISSION_DELETE',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: id,
      formTitle: form?.title,
      publicId: form?.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        submissionId: responseId,
        respondentEmail: submission?.respondentEmail || 'Anonymous',
        description: `Deleted response #${responseId.slice(-6)} from form "${form?.title || 'Untitled Form'}"`,
      },
    });

    return NextResponse.json({ message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Failed to delete submission:', error);
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 });
  }
}
