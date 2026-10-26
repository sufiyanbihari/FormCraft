import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { parseExcelQuestions } from '@/lib/excel/questionParser';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: formId } = await params;

    // Verify caller has EDIT permission on target form
    const role = await getUserFormRole(formId, user.id);
    if (!canEditForm(role) && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Permission denied: Cannot edit destination form' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedSheet = (formData.get('sheetName') as string | null) || undefined;

    if (!file) {
      return NextResponse.json({ error: 'No spreadsheet file uploaded' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseResult = parseExcelQuestions(buffer, { sheetName: requestedSheet });

    return NextResponse.json({
      success: true,
      fileName: file.name,
      sheetNames: parseResult.sheetNames,
      activeSheet: parseResult.activeSheet,
      totalQuestions: parseResult.totalQuestions,
      validQuestions: parseResult.validQuestions,
      invalidQuestions: parseResult.invalidQuestions,
      totalMarks: parseResult.totalMarks,
      questions: parseResult.questions,
      errors: parseResult.errors,
    });
  } catch (err: any) {
    console.error('[Parse Excel] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to parse Excel file' },
      { status: 500 }
    );
  }
}
