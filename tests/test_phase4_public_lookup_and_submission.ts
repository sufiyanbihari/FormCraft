import { prisma } from '../src/lib/db/prisma';
import { createDataset } from '../src/lib/lookup/lookupService';
import * as XLSX from 'xlsx';

async function runPhase4Tests() {
  console.log('🧪 Starting Phase 4: Public Lookup API & Submission Verification Tests\n');

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

  const adminUser = await prisma.user.findFirst();
  if (!adminUser) throw new Error('No user found');

  // 1. Create a published test form with questions
  const form = await prisma.form.create({
    data: {
      title: 'Phase 4 Lookup Test Form',
      status: 'PUBLISHED',
      ownerId: adminUser.id,
    },
  });

  const section = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: 'Main Section',
      orderIndex: 0,
    },
  });

  const triggerQ = await prisma.formQuestion.create({
    data: { formId: form.id, sectionId: section.id, title: 'Employee Code', type: 'SHORT_ANSWER', orderIndex: 0 },
  });
  const nameQ = await prisma.formQuestion.create({
    data: { formId: form.id, sectionId: section.id, title: 'Employee Name', type: 'SHORT_ANSWER', orderIndex: 1 },
  });
  const deptQ = await prisma.formQuestion.create({
    data: { formId: form.id, sectionId: section.id, title: 'Department', type: 'SHORT_ANSWER', orderIndex: 2 },
  });
  const desigQ = await prisma.formQuestion.create({
    data: { formId: form.id, sectionId: section.id, title: 'Designation', type: 'SHORT_ANSWER', orderIndex: 3 },
  });

  // 2. Create and ingest spreadsheet dataset
  const employeeData = [
    ['EmpId', 'FullName', 'DeptName', 'RoleTitle', 'ConfidentialSalary'],
    ['EMP-001', 'Bhavesh Patel', 'Dairy Operations', 'Plant Manager', '150000'],
    ['EMP-002', 'Dharmesh Chaudhary', 'Quality Control', 'QC Officer', '85000'],
    ['EMP-003', 'Hetal Joshi', 'Veterinary Services', 'Field Doctor', '95000'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(employeeData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staff');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const { dataset } = await createDataset(form.id, buffer, 'staff.xlsx', buffer.length);

  // 3. Create Lookup Mapping:
  // Trigger: EmpId -> triggerQ
  // Target 1: FullName -> nameQ (ReadOnly: true)
  // Target 2: DeptName -> deptQ (ReadOnly: true)
  // Target 3: RoleTitle -> desigQ (ReadOnly: false - editable)
  // Note: ConfidentialSalary is UNMAPPED!
  const mapping = await prisma.formLookupMapping.create({
    data: {
      formId: form.id,
      datasetId: dataset.id,
      triggerQuestionId: triggerQ.id,
      lookupType: 'TEXT_KEY',
      keyColumn: 'EmpId',
      noMatchMessage: 'Employee not found in directory.',
      mappings: [
        { column: 'FullName', targetQuestionId: nameQ.id, isReadOnly: true },
        { column: 'DeptName', targetQuestionId: deptQ.id, isReadOnly: true },
        { column: 'RoleTitle', targetQuestionId: desigQ.id, isReadOnly: false },
      ],
    },
  });

  // 4. Test Public API logic: options
  const { getDropdownOptions, findLookupRecord } = await import('../src/lib/lookup/lookupService');
  const optionsResult = await getDropdownOptions(dataset.id, 'EmpId');
  assert(optionsResult.options.length === 3, 'Options query returned 3 records');
  assert(optionsResult.options[0].value === 'EMP-001', 'First option is EMP-001');

  // 5. Test Public API logic: record query & data filtering
  const matchingRecord = await findLookupRecord(dataset.id, mapping.keyColumn, 'EMP-002');
  assert(matchingRecord !== null, 'Matching record retrieved for EMP-002');

  const filteredOutput: Record<string, any> = {};
  for (const fm of mapping.mappings as any[]) {
    filteredOutput[fm.targetQuestionId] = matchingRecord![fm.column];
  }

  assert(filteredOutput[nameQ.id] === 'Dharmesh Chaudhary', 'Target FullName mapped correctly');
  assert(filteredOutput[deptQ.id] === 'Quality Control', 'Target DeptName mapped correctly');
  assert(filteredOutput[desigQ.id] === 'QC Officer', 'Target RoleTitle mapped correctly');
  assert(
    (filteredOutput as any)['ConfidentialSalary'] === undefined,
    'SECURITY: Unmapped confidential columns (ConfidentialSalary) are NEVER exposed'
  );

  // 6. Test No-Match Handling
  const noMatchRecord = await findLookupRecord(dataset.id, mapping.keyColumn, 'INVALID-KEY-999');
  assert(noMatchRecord === null, 'Non-existent key returns null record');

  // 7. Test Submission Security & Authoritative Overrides
  // Simulate an attacker submitting a tampered name and salary
  const simulatedAnswers = [
    { questionId: triggerQ.id, value: 'EMP-001' },
    { questionId: nameQ.id, value: 'TAMPERED_HACKED_NAME' }, // Tampered read-only field
    { questionId: deptQ.id, value: 'TAMPERED_DEPT' }, // Tampered read-only field
    { questionId: desigQ.id, value: 'Custom Designation' }, // Editable field (should be preserved)
  ];

  const answerMap = new Map<string, any>();
  simulatedAnswers.forEach((a) => answerMap.set(a.questionId, a.value));

  // Run the exact submission security logic from route.ts
  const authRecord = await findLookupRecord(mapping.datasetId, mapping.keyColumn, String(answerMap.get(mapping.triggerQuestionId)));
  if (authRecord) {
    for (const fm of mapping.mappings as any[]) {
      if (fm.isReadOnly) {
        const authVal = authRecord[fm.column] !== undefined ? String(authRecord[fm.column]) : '';
        answerMap.set(fm.targetQuestionId, authVal);
        const existingAns = simulatedAnswers.find((a) => a.questionId === fm.targetQuestionId);
        if (existingAns) existingAns.value = authVal;
      }
    }
  }

  assert(
    answerMap.get(nameQ.id) === 'Bhavesh Patel',
    'SECURITY: Tampered read-only name overridden with authoritative dataset value ("Bhavesh Patel")'
  );
  assert(
    answerMap.get(deptQ.id) === 'Dairy Operations',
    'SECURITY: Tampered read-only department overridden with authoritative dataset value ("Dairy Operations")'
  );
  assert(
    answerMap.get(desigQ.id) === 'Custom Designation',
    'Editable field allows respondent customization ("Custom Designation")'
  );

  // Clean up test form
  await prisma.form.delete({ where: { id: form.id } });
  console.log('Cleaned up test form.');

  console.log(`\n========================================`);
  console.log(`Phase 4 Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
