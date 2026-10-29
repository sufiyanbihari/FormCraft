import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getDropdownOptions, findLookupRecord, LookupServiceError } from '@/lib/lookup/lookupService';
import { FieldMapping } from '@/lib/lookup/lookupTypes';
import { getAuthUserFromRequest } from '@/lib/auth/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'query';
    const mappingId = searchParams.get('mappingId');
    const triggerQuestionId = searchParams.get('triggerQuestionId');
    const search = searchParams.get('search') || '';
    const key = searchParams.get('key') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 250);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // 1. Verify form exists and is published
    const form = await prisma.form.findUnique({
      where: { publicId },
      select: {
        id: true,
        status: true,
        settings: {
          select: {
            requireAuth: true,
            isAcceptingResponses: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Form not found or not currently published' },
        { status: 404 }
      );
    }

    if (form.settings?.requireAuth) {
      const user = await getAuthUserFromRequest(request);
      if (!user) {
        return NextResponse.json({ error: 'Authentication required to query lookup data' }, { status: 401 });
      }
    }

    // 2. Check response acceptance window
    const now = new Date();
    if (form.settings) {
      if (!form.settings.isAcceptingResponses) {
        return NextResponse.json({ error: 'This form is no longer accepting responses.' }, { status: 403 });
      }
      if (form.settings.startDate && new Date(form.settings.startDate) > now) {
        return NextResponse.json({ error: 'This form is not yet accepting responses.' }, { status: 403 });
      }
      if (form.settings.endDate && new Date(form.settings.endDate) < now) {
        return NextResponse.json({ error: 'The deadline for this form has passed.' }, { status: 403 });
      }
    }

    // 3. Resolve lookup mapping rule
    const mapping = await prisma.formLookupMapping.findFirst({
      where: {
        formId: form.id,
        ...(mappingId
          ? { id: mappingId }
          : triggerQuestionId
            ? { triggerQuestionId }
            : {}),
      },
      include: {
        dataset: {
          select: {
            id: true,
            isActive: true,
            columns: true,
          },
        },
      },
    });

    if (!mapping) {
      return NextResponse.json(
        { error: 'Lookup mapping rule not found for this form question' },
        { status: 404 }
      );
    }

    if (!mapping.dataset || !mapping.dataset.isActive) {
      return NextResponse.json(
        { error: 'The linked dataset is currently inactive or unavailable' },
        { status: 400 }
      );
    }

    // 4. Handle 'options' action for Dropdown triggers
    if (action === 'options') {
      const optionsData = await getDropdownOptions(
        mapping.datasetId,
        mapping.keyColumn,
        search,
        limit,
        offset
      );

      return NextResponse.json({
        success: true,
        options: optionsData.options,
        total: optionsData.total,
      }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    // 5. Handle 'query' action for record retrieval and autofill
    if (action === 'query') {
      if (!key || key.trim() === '') {
        // Clearing or empty trigger: return empty autofill object
        const emptyData: Record<string, any> = {};
        const fieldMappings = (mapping.mappings as unknown as FieldMapping[]) || [];
        for (const fm of fieldMappings) {
          emptyData[fm.targetQuestionId] = '';
        }
        return NextResponse.json({
          success: true,
          found: false,
          data: emptyData,
          noMatchMessage: null,
        });
      }

      const record = await findLookupRecord(mapping.datasetId, mapping.keyColumn, key);

      const fieldMappings = (mapping.mappings as unknown as FieldMapping[]) || [];
      const autofillData: Record<string, any> = {};

      for (const fm of fieldMappings) {
        autofillData[fm.targetQuestionId] = record && record[fm.column] !== undefined
          ? record[fm.column]
          : '';
      }

      return NextResponse.json({
        success: true,
        found: !!record,
        data: autofillData,
        noMatchMessage: record ? null : (mapping.noMatchMessage || 'No matching record found.'),
      }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    console.error('Public lookup API error:', error);
    if (error instanceof LookupServiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to perform lookup' },
      { status: 500 }
    );
  }
}
