import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { parseSpreadsheet, normalizeLookupKey, LookupParserError } from './lookupParser';
import { LookupDatasetSummary, FieldMapping } from './lookupTypes';

const BATCH_INSERT_SIZE = 500;

export class LookupServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupServiceError';
  }
}

/**
 * Creates a new dataset and inserts its records in batches within a transaction
 */
export async function createDataset(
  formId: string,
  buffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<{ dataset: LookupDatasetSummary; sampleRows: Record<string, any>[] }> {
  const parsed = parseSpreadsheet(buffer, fileName, fileSize);
  const primaryKeyCol = parsed.columns[0];

  return await prisma.$transaction(async (tx) => {
    // 1. Create dataset metadata
    const dataset = await tx.formLookupDataset.create({
      data: {
        formId,
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        rowCount: parsed.rowCount,
        columns: parsed.columns,
        version: 1,
        isActive: true,
      },
    });

    // 2. Batch insert records
    const allRecords = parsed.rows.map((row, idx) => ({
      datasetId: dataset.id,
      key: normalizeLookupKey(row[primaryKeyCol] ?? ''),
      displayKey: String(row[primaryKeyCol] ?? ''),
      data: row as Prisma.InputJsonValue,
      rowIndex: idx,
    }));

    for (let i = 0; i < allRecords.length; i += BATCH_INSERT_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_INSERT_SIZE);
      await tx.formLookupRecord.createMany({
        data: batch,
      });
    }

    return {
      dataset: {
        id: dataset.id,
        formId: dataset.formId,
        fileName: dataset.fileName,
        fileSize: dataset.fileSize,
        rowCount: dataset.rowCount,
        columns: dataset.columns,
        version: dataset.version,
        isActive: dataset.isActive,
        createdAt: dataset.createdAt,
        updatedAt: dataset.updatedAt,
      },
      sampleRows: parsed.sampleRows,
    };
  }, {
    timeout: 30000, // 30s timeout for large uploads
  });
}

/**
 * Replaces an existing dataset's contents atomically.
 * If new parsing or ingestion fails, the previous version remains untouched.
 */
export async function replaceDataset(
  datasetId: string,
  formId: string,
  buffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<{ dataset: LookupDatasetSummary; sampleRows: Record<string, any>[] }> {
  // 1. Verify existing dataset
  const existing = await prisma.formLookupDataset.findFirst({
    where: { id: datasetId, formId },
    include: { mappings: true },
  });

  if (!existing) {
    throw new LookupServiceError('Dataset not found or does not belong to this form.');
  }

  // 2. Parse new spreadsheet
  const parsed = parseSpreadsheet(buffer, fileName, fileSize);

  // 3. Check if all existing mapping columns still exist in the new spreadsheet
  for (const mapping of existing.mappings) {
    if (!parsed.columns.includes(mapping.keyColumn)) {
      throw new LookupServiceError(
        `Cannot replace dataset: The key column "${mapping.keyColumn}" used in an active lookup mapping is missing from the new file.`
      );
    }

    const fieldMappings = (mapping.mappings as unknown as FieldMapping[]) || [];
    for (const fm of fieldMappings) {
      if (!parsed.columns.includes(fm.column)) {
        throw new LookupServiceError(
          `Cannot replace dataset: Mapped column "${fm.column}" is missing from the new file.`
        );
      }
    }
  }

  const primaryKeyCol = existing.mappings[0]?.keyColumn || parsed.columns[0];

  // 4. Atomic replacement in transaction
  return await prisma.$transaction(async (tx) => {
    // Delete existing records
    await tx.formLookupRecord.deleteMany({
      where: { datasetId },
    });

    // Update dataset record
    const updatedDataset = await tx.formLookupDataset.update({
      where: { id: datasetId },
      data: {
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        rowCount: parsed.rowCount,
        columns: parsed.columns,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // Insert new records in batches
    const allRecords = parsed.rows.map((row, idx) => ({
      datasetId,
      key: normalizeLookupKey(row[primaryKeyCol] ?? ''),
      displayKey: String(row[primaryKeyCol] ?? ''),
      data: row as Prisma.InputJsonValue,
      rowIndex: idx,
    }));

    for (let i = 0; i < allRecords.length; i += BATCH_INSERT_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_INSERT_SIZE);
      await tx.formLookupRecord.createMany({
        data: batch,
      });
    }

    return {
      dataset: {
        id: updatedDataset.id,
        formId: updatedDataset.formId,
        fileName: updatedDataset.fileName,
        fileSize: updatedDataset.fileSize,
        rowCount: updatedDataset.rowCount,
        columns: updatedDataset.columns,
        version: updatedDataset.version,
        isActive: updatedDataset.isActive,
        createdAt: updatedDataset.createdAt,
        updatedAt: updatedDataset.updatedAt,
      },
      sampleRows: parsed.sampleRows,
    };
  }, {
    timeout: 30000,
  });
}

/**
 * Lists all datasets associated with a form
 */
export async function getDatasets(formId: string): Promise<LookupDatasetSummary[]> {
  const datasets = await prisma.formLookupDataset.findMany({
    where: { formId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          mappings: true,
          records: true,
        },
      },
    },
  });

  return datasets.map((d) => ({
    id: d.id,
    formId: d.formId,
    fileName: d.fileName,
    fileSize: d.fileSize,
    rowCount: d.rowCount,
    columns: d.columns,
    version: d.version,
    isActive: d.isActive,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    mappingsCount: d._count.mappings,
  }));
}

/**
 * Gets a dataset and preview rows
 */
export async function getDatasetPreview(
  datasetId: string,
  formId: string,
  limit = 10
): Promise<{ dataset: LookupDatasetSummary; sampleRows: Record<string, any>[] }> {
  const dataset = await prisma.formLookupDataset.findFirst({
    where: { id: datasetId, formId },
    include: {
      records: {
        take: limit,
        orderBy: { rowIndex: 'asc' },
      },
    },
  });

  if (!dataset) {
    throw new LookupServiceError('Dataset not found.');
  }

  return {
    dataset: {
      id: dataset.id,
      formId: dataset.formId,
      fileName: dataset.fileName,
      fileSize: dataset.fileSize,
      rowCount: dataset.rowCount,
      columns: dataset.columns,
      version: dataset.version,
      isActive: dataset.isActive,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    },
    sampleRows: dataset.records.map((r) => r.data as Record<string, any>),
  };
}

/**
 * Deletes a dataset and all associated records and mappings
 */
export async function deleteDataset(datasetId: string, formId: string): Promise<void> {
  const dataset = await prisma.formLookupDataset.findFirst({
    where: { id: datasetId, formId },
  });

  if (!dataset) {
    throw new LookupServiceError('Dataset not found or does not belong to this form.');
  }

  await prisma.formLookupDataset.delete({
    where: { id: datasetId },
  });
}

/**
 * Retrieves distinct dropdown options for a keyColumn with optional search and pagination
 */
export async function getDropdownOptions(
  datasetId: string,
  keyColumn: string,
  search?: string,
  limit = 100,
  offset = 0
): Promise<{ options: { label: string; value: string }[]; total: number }> {
  const dataset = await prisma.formLookupDataset.findUnique({
    where: { id: datasetId },
    select: { columns: true },
  });

  if (!dataset) {
    throw new LookupServiceError('Dataset not found.');
  }

  if (!dataset.columns.includes(keyColumn)) {
    throw new LookupServiceError(`Column "${keyColumn}" not found in dataset.`);
  }

  // Sanitize keyColumn for JSON query path: keyColumn is verified to be in dataset.columns
  const normalizedSearch = search ? normalizeLookupKey(search) : '';

  // Execute raw query for fast distinct values
  let rows: Array<{ val: string }>;
  let countResult: Array<{ count: bigint | number }>;

  if (normalizedSearch) {
    rows = await prisma.$queryRaw<Array<{ val: string }>>`
      SELECT DISTINCT (data->>${keyColumn}) AS val
      FROM "form_lookup_records"
      WHERE "datasetId" = ${datasetId}
        AND (data->>${keyColumn}) IS NOT NULL
        AND TRIM(data->>${keyColumn}) != ''
        AND LOWER(data->>${keyColumn}) LIKE ${`%${normalizedSearch}%`}
      ORDER BY val ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    countResult = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT (data->>${keyColumn})) AS count
      FROM "form_lookup_records"
      WHERE "datasetId" = ${datasetId}
        AND (data->>${keyColumn}) IS NOT NULL
        AND TRIM(data->>${keyColumn}) != ''
        AND LOWER(data->>${keyColumn}) LIKE ${`%${normalizedSearch}%`}
    `;
  } else {
    rows = await prisma.$queryRaw<Array<{ val: string }>>`
      SELECT DISTINCT (data->>${keyColumn}) AS val
      FROM "form_lookup_records"
      WHERE "datasetId" = ${datasetId}
        AND (data->>${keyColumn}) IS NOT NULL
        AND TRIM(data->>${keyColumn}) != ''
      ORDER BY val ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    countResult = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT (data->>${keyColumn})) AS count
      FROM "form_lookup_records"
      WHERE "datasetId" = ${datasetId}
        AND (data->>${keyColumn}) IS NOT NULL
        AND TRIM(data->>${keyColumn}) != ''
    `;
  }

  const total = Number(countResult[0]?.count || 0);
  const options = rows
    .filter((r) => r.val !== null && r.val !== undefined && r.val.trim() !== '')
    .map((r) => ({
      label: r.val,
      value: r.val,
    }));

  return { options, total };
}

/**
 * Finds a single matching record by normalized key and keyColumn
 */
export async function findLookupRecord(
  datasetId: string,
  keyColumn: string,
  rawKey: string
): Promise<Record<string, any> | null> {
  const dataset = await prisma.formLookupDataset.findUnique({
    where: { id: datasetId },
    select: { columns: true },
  });

  if (!dataset || !dataset.columns.includes(keyColumn)) {
    return null;
  }

  const normalized = normalizeLookupKey(rawKey);
  if (!normalized) return null;

  // 1. Try fast indexed query first if key matches indexed column
  const indexedMatch = await prisma.formLookupRecord.findFirst({
    where: {
      datasetId,
      key: normalized,
    },
  });

  if (indexedMatch) {
    const data = indexedMatch.data as Record<string, any>;
    if (normalizeLookupKey(data[keyColumn]) === normalized) {
      return data;
    }
  }

  // 2. Query JSON data column with case-insensitive normalization
  const results = await prisma.$queryRaw<Array<{ data: any }>>`
    SELECT data FROM "form_lookup_records"
    WHERE "datasetId" = ${datasetId}
      AND LOWER(TRIM(data->>${keyColumn})) = ${normalized}
    LIMIT 1
  `;

  if (results && results.length > 0) {
    return results[0].data as Record<string, any>;
  }

  return null;
}
