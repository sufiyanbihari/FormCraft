import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canEditForm } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit/auditLogger';
import { LookupMappingSchema } from '@/lib/lookup/lookupTypes';

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

    const mappings = await prisma.formLookupMapping.findMany({
      where: { formId: id },
      include: {
        dataset: {
          select: {
            id: true,
            fileName: true,
            rowCount: true,
            columns: true,
            version: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ mappings });
  } catch (error: any) {
    console.error('Error fetching lookup mappings:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch lookup mappings' },
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

    const body = await request.json();
    const validated = LookupMappingSchema.parse(body);

    // 1. Verify dataset belongs to form and has keyColumn
    const dataset = await prisma.formLookupDataset.findFirst({
      where: { id: validated.datasetId, formId: id },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found or does not belong to this form' }, { status: 400 });
    }

    if (!dataset.columns.includes(validated.keyColumn)) {
      return NextResponse.json(
        { error: `Key column "${validated.keyColumn}" does not exist in dataset columns.` },
        { status: 400 }
      );
    }

    // 2. Verify triggerQuestion exists in form
    const triggerQuestion = await prisma.formQuestion.findFirst({
      where: { id: validated.triggerQuestionId, formId: id },
    });

    if (!triggerQuestion) {
      return NextResponse.json({ error: 'Trigger question not found in this form' }, { status: 400 });
    }

    // 3. Verify target questions exist and are not the trigger question itself
    const formQuestions = await prisma.formQuestion.findMany({
      where: { formId: id },
      select: { id: true, title: true },
    });
    const questionIdSet = new Set(formQuestions.map((q) => q.id));

    const seenTargets = new Set<string>();
    for (const m of validated.mappings) {
      if (!dataset.columns.includes(m.column)) {
        return NextResponse.json(
          { error: `Mapped column "${m.column}" does not exist in dataset.` },
          { status: 400 }
        );
      }

      if (!questionIdSet.has(m.targetQuestionId)) {
        return NextResponse.json(
          { error: `Target question (ID: ${m.targetQuestionId}) not found in form.` },
          { status: 400 }
        );
      }

      if (m.targetQuestionId === validated.triggerQuestionId) {
        return NextResponse.json(
          { error: 'A question cannot be mapped to autofill itself. Please select a different target question.' },
          { status: 400 }
        );
      }

      if (seenTargets.has(m.targetQuestionId)) {
        return NextResponse.json(
          { error: 'Multiple columns cannot be mapped to the same target question.' },
          { status: 400 }
        );
      }
      seenTargets.add(m.targetQuestionId);
    }

    let mapping;
    if (validated.id) {
      // Update existing mapping
      mapping = await prisma.formLookupMapping.update({
        where: { id: validated.id },
        data: {
          datasetId: validated.datasetId,
          triggerQuestionId: validated.triggerQuestionId,
          lookupType: validated.lookupType,
          keyColumn: validated.keyColumn,
          noMatchMessage: validated.noMatchMessage || 'No matching record found.',
          mappings: validated.mappings,
        },
        include: {
          dataset: {
            select: {
              id: true,
              fileName: true,
              rowCount: true,
              columns: true,
              version: true,
              isActive: true,
            },
          },
        },
      });
    } else {
      // Create new mapping
      mapping = await prisma.formLookupMapping.create({
        data: {
          formId: id,
          datasetId: validated.datasetId,
          triggerQuestionId: validated.triggerQuestionId,
          lookupType: validated.lookupType,
          keyColumn: validated.keyColumn,
          noMatchMessage: validated.noMatchMessage || 'No matching record found.',
          mappings: validated.mappings,
        },
        include: {
          dataset: {
            select: {
              id: true,
              fileName: true,
              rowCount: true,
              columns: true,
              version: true,
              isActive: true,
            },
          },
        },
      });
    }

    await logActivity({
      action: validated.id ? 'LOOKUP_MAPPING_UPDATED' : 'LOOKUP_MAPPING_CREATED',
      category: 'FORM',
      userId: user.id,
      userEmail: user.email,
      formId: id,
      details: {
        mappingId: mapping.id,
        triggerQuestionId: mapping.triggerQuestionId,
        keyColumn: mapping.keyColumn,
        lookupType: mapping.lookupType,
        mappedFieldsCount: validated.mappings.length,
      },
      req: request,
    });

    return NextResponse.json({ success: true, mapping });
  } catch (error: any) {
    console.error('Error saving lookup mapping:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save lookup mapping' },
      { status: 400 }
    );
  }
}
