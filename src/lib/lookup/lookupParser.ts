import * as XLSX from 'xlsx';
import { ParsedSpreadsheet } from './lookupTypes';
import { sanitizeSpreadsheetField } from '@/lib/utils';

export const MAX_LOOKUP_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_LOOKUP_ROWS = 50000;
export const MAX_LOOKUP_COLUMNS = 100;

export class LookupParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupParserError';
  }
}

/**
 * Normalizes a key for fast, reliable, case-insensitive indexed lookups
 */
export function normalizeLookupKey(key: unknown): string {
  if (key === null || key === undefined) return '';
  return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV buffer into structured records
 */
export function parseSpreadsheet(
  buffer: Buffer,
  fileName: string,
  fileSize: number
): ParsedSpreadsheet {
  if (fileSize > MAX_LOOKUP_FILE_SIZE || buffer.length > MAX_LOOKUP_FILE_SIZE) {
    throw new LookupParserError(
      `File size exceeds maximum allowed limit of ${MAX_LOOKUP_FILE_SIZE / (1024 * 1024)}MB`
    );
  }

  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
    throw new LookupParserError('Unsupported file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.');
  }

  let workbook: XLSX.WorkBook;
  try {
    // raw: false ensures formatted text (e.g. leading zeroes like '00123') is preserved
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      raw: false,
      cellDates: true,
      codepage: 65001, // UTF-8
    });
  } catch (err: any) {
    throw new LookupParserError(`Failed to parse spreadsheet file: ${err?.message || 'Corrupted or unreadable format'}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new LookupParserError('The spreadsheet contains no readable sheets.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet || !worksheet['!ref']) {
    throw new LookupParserError('The first sheet is empty.');
  }

  // Parse raw matrix with header row
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new LookupParserError('Spreadsheet contains no data.');
  }

  // Detect and validate headers
  const rawHeaders = rawRows[0];
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) {
    throw new LookupParserError('No column headers detected in the first row.');
  }

  const columns: string[] = [];
  const seenColumns = new Set<string>();

  for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
    const rawCol = rawHeaders[colIdx];
    const colName = String(rawCol || '').trim();

    if (!colName) {
      // If trailing columns are empty, we stop if no data exists, or reject if mid-table
      const hasDataBelow = rawRows.slice(1).some((r) => r[colIdx] && String(r[colIdx]).trim() !== '');
      if (hasDataBelow) {
        throw new LookupParserError(`Column header at position ${colIdx + 1} is missing or empty.`);
      }
      continue;
    }

    const lowerCol = colName.toLowerCase();
    if (seenColumns.has(lowerCol)) {
      throw new LookupParserError(`Duplicate column header detected: "${colName}". All columns must have unique names.`);
    }

    seenColumns.add(lowerCol);
    columns.push(colName);
  }

  if (columns.length === 0) {
    throw new LookupParserError('No valid column headers found in spreadsheet.');
  }

  if (columns.length > MAX_LOOKUP_COLUMNS) {
    throw new LookupParserError(
      `Dataset exceeds maximum limit of ${MAX_LOOKUP_COLUMNS} columns (detected ${columns.length} columns).`
    );
  }

  const dataRows = rawRows.slice(1);
  if (dataRows.length === 0) {
    throw new LookupParserError('Spreadsheet contains column headers but no data rows.');
  }

  if (dataRows.length > MAX_LOOKUP_ROWS) {
    throw new LookupParserError(
      `Dataset exceeds maximum limit of ${MAX_LOOKUP_ROWS.toLocaleString()} rows (detected ${dataRows.length.toLocaleString()} rows).`
    );
  }

  const rows: Record<string, any>[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowArray = dataRows[i];
    // Check if entire row is empty
    const isRowEmpty = !rowArray || rowArray.every((cell) => cell === undefined || cell === null || String(cell).trim() === '');
    if (isRowEmpty) continue;

    const rowObj: Record<string, any> = {};
    for (let c = 0; c < columns.length; c++) {
      const colName = columns[c];
      const rawCell = rowArray[c];
      let val = rawCell === undefined || rawCell === null ? '' : String(rawCell).trim();
      // Sanitize formula injection if cell starts with dangerous prefix
      val = sanitizeSpreadsheetField(val);
      rowObj[colName] = val;
    }

    rows.push(rowObj);
  }

  if (rows.length === 0) {
    throw new LookupParserError('All rows in the spreadsheet are empty.');
  }

  const sampleRows = rows.slice(0, 10);

  return {
    fileName,
    fileSize,
    rowCount: rows.length,
    columns,
    rows,
    sampleRows,
  };
}
