import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';
import { getDatasetPreview, deleteDataset, LookupServiceError } from '@/lib/lookup/lookupService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; datasetId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, datasetId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const preview = await getDatasetPreview(datasetId, id, 10);
    return NextResponse.json(preview);
  } catch (error: any) {
    if (error instanceof LookupServiceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch dataset preview' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; datasetId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, datasetId } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await deleteDataset(datasetId, id);

    await logActivity({
      action: 'DATASET_DELETED',
      category: 'FORM',
      userId: user.id,
      userEmail: user.email,
      formId: id,
      details: { datasetId },
      req: request,
    });

    return NextResponse.json({ success: true, message: 'Dataset deleted successfully' });
  } catch (error: any) {
    if (error instanceof LookupServiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to delete dataset' },
      { status: 500 }
    );
  }
}
