import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';
import {
  createDataset,
  replaceDataset,
  getDatasets,
  LookupServiceError,
} from '@/lib/lookup/lookupService';
import { LookupParserError } from '@/lib/lookup/lookupParser';

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

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const datasets = await getDatasets(id);
    return NextResponse.json({ datasets });
  } catch (error: any) {
    console.error('Error fetching datasets:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch datasets' },
      { status: 500 }
    );
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
    const role = await getUserFormRole(id, user.id);

    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const replaceDatasetId = formData.get('datasetId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No spreadsheet file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || 'dataset.xlsx';
    const fileSize = file.size;

    let result;
    if (replaceDatasetId) {
      result = await replaceDataset(replaceDatasetId, id, buffer, fileName, fileSize);
      await logActivity({
        action: 'DATASET_REPLACED',
        category: 'FORM',
        userId: user.id,
        userEmail: user.email,
        formId: id,
        details: {
          datasetId: replaceDatasetId,
          fileName,
          rowCount: result.dataset.rowCount,
          columns: result.dataset.columns,
          version: result.dataset.version,
        },
        req: request,
      });
    } else {
      result = await createDataset(id, buffer, fileName, fileSize);
      await logActivity({
        action: 'DATASET_UPLOADED',
        category: 'FORM',
        userId: user.id,
        userEmail: user.email,
        formId: id,
        details: {
          datasetId: result.dataset.id,
          fileName,
          rowCount: result.dataset.rowCount,
          columns: result.dataset.columns,
        },
        req: request,
      });
    }

    return NextResponse.json({
      success: true,
      dataset: result.dataset,
      sampleRows: result.sampleRows,
    });
  } catch (error: any) {
    console.error('Error uploading dataset:', error);

    if (error instanceof LookupParserError || error instanceof LookupServiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to process spreadsheet dataset' },
      { status: 500 }
    );
  }
}
