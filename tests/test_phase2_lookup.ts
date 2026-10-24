import * as XLSX from 'xlsx';
import { parseSpreadsheet, normalizeLookupKey, LookupParserError } from '../src/lib/lookup/lookupParser';
import {
  createDataset,
  replaceDataset,
  getDatasets,
  getDatasetPreview,
  getDropdownOptions,
  findLookupRecord,
  deleteDataset,
} from '../src/lib/lookup/lookupService';
import { prisma } from '../src/lib/db/prisma';

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2: Excel/CSV Upload, Parsing & Dataset Management Tests\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Test Excel (.xlsx) generation with leading zeroes, Unicode, formula injection
  const excelData = [
    ['EmpCode', 'EmpName', 'Department', 'Location', 'FormulaTest'],
    ['00101', 'रमेश पटेल (Ramesh Patel)', 'સંચાલન (Management)', 'North Region', '=SUM(A1:A10)'],
    ['00102', 'પ્રિયા શર્મા (Priya Sharma)', 'ગુણવત્તા નિયંત્રણ (QC)', 'East Region', '+12345'],
    ['00103', 'Vikram Chaudhary', 'કાર્યક્ષેત્ર (Operations)', 'West Region', 'NormalText'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Test Parser with valid Excel
  try {
    const parsedXlsx = parseSpreadsheet(xlsxBuffer, 'test_employees.xlsx', xlsxBuffer.length);
    assert(parsedXlsx.rowCount === 3, 'Excel row count parsed correctly (3 rows)');
    assert(parsedXlsx.columns.length === 5, 'Excel columns detected correctly (5 columns)');
    assert(parsedXlsx.rows[0]['EmpCode'] === '00101', 'Leading zero preserved in EmpCode ("00101")');
    assert(parsedXlsx.rows[0]['EmpName'].includes('रमेश'), 'Hindi Unicode preserved in EmpName');
    assert(parsedXlsx.rows[0]['Department'].includes('સંચાલન'), 'Gujarati Unicode preserved in Department');
    assert(parsedXlsx.rows[0]['FormulaTest'].startsWith("'="), 'Spreadsheet formula injection neutralized ("\'=") ');
  } catch (err: any) {
    assert(false, 'Valid Excel parsing', err.message);
  }

  // 2. Test CSV parsing
  const csvContent = `PlantCode,PlantName,Capacity,Region\n001,Main Processing Facility,500000,Northern Region\n002,Eastern Center,150000,Eastern Region\n003,Western Unit,250000,Western Region\n`;
  const csvBuffer = Buffer.from(csvContent, 'utf-8');

  try {
    const parsedCsv = parseSpreadsheet(csvBuffer, 'plants.csv', csvBuffer.length);
    assert(parsedCsv.rowCount === 3, 'CSV row count parsed correctly (3 rows)');
    assert(parsedCsv.columns.includes('PlantCode'), 'CSV column "PlantCode" found');
    assert(parsedCsv.rows[0]['PlantCode'] === '001', 'CSV leading zero preserved ("001")');
  } catch (err: any) {
    assert(false, 'Valid CSV parsing', err.message);
  }

  // 3. Test Empty Spreadsheet rejection
  try {
    const emptyWb = XLSX.utils.book_new();
    const emptyWs = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(emptyWb, emptyWs, 'Empty');
    const emptyBuffer = XLSX.write(emptyWb, { type: 'buffer', bookType: 'xlsx' });
    parseSpreadsheet(emptyBuffer, 'empty.xlsx', emptyBuffer.length);
    assert(false, 'Empty spreadsheet should throw error');
  } catch (err: any) {
    assert(err instanceof LookupParserError, 'Empty spreadsheet rejected with LookupParserError');
  }

  // 4. Test Duplicate Headers rejection
  try {
    const dupHeaders = [
      ['EmpCode', 'Name', 'Name'],
      ['001', 'Alice', 'Bob'],
    ];
    const dupWs = XLSX.utils.aoa_to_sheet(dupHeaders);
    const dupWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(dupWb, dupWs, 'Dup');
    const dupBuffer = XLSX.write(dupWb, { type: 'buffer', bookType: 'xlsx' });
    parseSpreadsheet(dupBuffer, 'duplicate.xlsx', dupBuffer.length);
    assert(false, 'Duplicate headers should throw error');
  } catch (err: any) {
    assert(err.message.includes('Duplicate column header detected'), 'Duplicate header caught correctly');
  }

  // 5. Test Key Normalization
  assert(normalizeLookupKey('  EMP-001  ') === 'emp-001', 'Key normalized (trimmed & lowercased)');
  assert(normalizeLookupKey('Gujarati  ટેસ્ટ ') === 'gujarati ટેસ્ટ', 'Unicode key normalized');

  // 6. Test Database Ingestion and Service Operations
  // Find or create a test form
  let form = await prisma.form.findFirst();
  if (!form) {
    const adminUser = await prisma.user.findFirst();
    if (!adminUser) {
      throw new Error('No user found to run database test');
    }
    form = await prisma.form.create({
      data: {
        title: 'Phase 2 Test Form',
        ownerId: adminUser.id,
      },
    });
  }

  let createdDatasetId: string | null = null;
  try {
    // Ingest dataset
    const createResult = await createDataset(form.id, xlsxBuffer, 'test_employees.xlsx', xlsxBuffer.length);
    createdDatasetId = createResult.dataset.id;

    assert(createResult.dataset.rowCount === 3, 'Database dataset created with 3 rows');
    assert(createResult.dataset.columns.length === 5, 'Dataset saved 5 columns');

    // Preview
    const preview = await getDatasetPreview(createdDatasetId, form.id, 5);
    assert(preview.sampleRows.length === 3, 'Preview returned 3 sample rows');
    assert(preview.sampleRows[0]['EmpCode'] === '00101', 'Preview has correct first row data');

    // Dropdown options
    const optionsResult = await getDropdownOptions(createdDatasetId, 'EmpName');
    assert(optionsResult.options.length === 3, 'Dropdown options returned 3 options');

    // Dropdown options with search
    const searchedOptions = await getDropdownOptions(createdDatasetId, 'EmpName', 'vikram');
    assert(searchedOptions.options.length === 1, 'Search dropdown options filtered correctly ("vikram" -> 1)');

    // Find record by key
    const foundRecord = await findLookupRecord(createdDatasetId, 'EmpCode', '00102');
    assert(foundRecord !== null && foundRecord['Department'].includes('ગુણવત્તા'), 'Find lookup record by key succeeded');

    // Atomic replacement
    const replacementData = [
      ['EmpCode', 'EmpName', 'Department', 'Location', 'FormulaTest'],
      ['00101', 'Ramesh Patel', 'Management', 'North Region', 'Val1'],
      ['00102', 'Priya Sharma', 'QC', 'East Region', 'Val2'],
      ['00103', 'Vikram Chaudhary', 'Operations', 'West Region', 'Val3'],
      ['00104', 'Anita Desai', 'Finance', 'South Region', 'Val4'],
    ];
    const repWs = XLSX.utils.aoa_to_sheet(replacementData);
    const repWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(repWb, repWs, 'Employees');
    const repBuffer = XLSX.write(repWb, { type: 'buffer', bookType: 'xlsx' });

    const replaceResult = await replaceDataset(createdDatasetId, form.id, repBuffer, 'test_employees_v2.xlsx', repBuffer.length);
    assert(replaceResult.dataset.version === 2, 'Dataset version incremented to 2');
    assert(replaceResult.dataset.rowCount === 4, 'Dataset replaced with 4 rows');

    // Cleanup
    await deleteDataset(createdDatasetId, form.id);
    const listAfterDelete = await getDatasets(form.id);
    assert(!listAfterDelete.some((d) => d.id === createdDatasetId), 'Dataset cleanly deleted');
    createdDatasetId = null;
  } catch (err: any) {
    assert(false, 'Database service test', err.message);
  } finally {
    if (createdDatasetId) {
      try {
        await prisma.formLookupDataset.delete({ where: { id: createdDatasetId } });
      } catch {}
    }
  }

  console.log(`\n========================================`);
  console.log(`Phase 2 Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
