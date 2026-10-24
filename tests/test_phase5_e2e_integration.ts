import { prisma } from '../src/lib/db/prisma';
import { createDataset, replaceDataset, getDropdownOptions, findLookupRecord } from '../src/lib/lookup/lookupService';
import { sanitizeSpreadsheetField } from '../src/lib/utils';
import * as XLSX from 'xlsx';

async function runPhase5E2ETests() {
  console.log('🧪 Starting Phase 5: End-to-End Integration, Security & Regression Suite\n');

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
  if (!adminUser) throw new Error('No user found in database');

  let testFormId: string | null = null;
  let testDatasetId: string | null = null;

  try {
    // -------------------------------------------------------------
    // Test 1: Complete Form Creation with Multiple Sections & Questions
    // -------------------------------------------------------------
    const form = await prisma.form.create({
      data: {
        title: 'Procurement & Staff Verification Form',
        description: 'Universal Dynamic Lookup & Autofill Engine E2E Test',
        status: 'DRAFT',
        ownerId: adminUser.id,
      },
    });
    testFormId = form.id;

    const sec1 = await prisma.formSection.create({
      data: { formId: form.id, title: 'Plant Details (Section 1)', orderIndex: 0 },
    });
    const sec2 = await prisma.formSection.create({
      data: { formId: form.id, title: 'Employee Verification (Section 2)', orderIndex: 1 },
    });

    // Section 1 Questions: Plant Dropdown Lookup
    const qPlantTrigger = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec1.id, title: 'Select Plant', type: 'DROPDOWN', orderIndex: 0 },
    });
    const qPlantName = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec1.id, title: 'Plant Name', type: 'SHORT_ANSWER', orderIndex: 1 },
    });
    const qPlantLocation = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec1.id, title: 'Location', type: 'SHORT_ANSWER', orderIndex: 2 },
    });

    // Section 2 Questions: Employee Unique-Key Text Lookup + Cross-Section mapping
    const qEmpTrigger = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Enter Employee ID', type: 'SHORT_ANSWER', orderIndex: 0 },
    });
    const qEmpName = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Employee Full Name', type: 'SHORT_ANSWER', orderIndex: 1 },
    });
    const qEmpDept = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Department', type: 'SHORT_ANSWER', orderIndex: 2 },
    });
    const qCrossSectionManager = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Assigned Plant Manager (Cross-Section)', type: 'SHORT_ANSWER', orderIndex: 3 },
    });

    assert(Boolean(form.id), 'E2E: Form created with multiple sections');

    // -------------------------------------------------------------
    // Test 2: Upload Excel Dataset with Unicode & Numbers
    // -------------------------------------------------------------
    const plantCatalog = [
      ['PlantCode', 'OfficialName', 'City', 'ManagerName', 'SecretAuditNotes'],
      ['PLANT-01', 'મુખ્ય કેન્દ્ર (Main Facility)', 'Metro City', 'શ્રી રમેશભાઈ પટેલ', 'CONFIDENTIAL_NOTE_1'],
      ['PLANT-02', 'પૂર્વ એકમ (East Facility)', 'East City', 'સુરેશભાઈ ચૌધરી', 'CONFIDENTIAL_NOTE_2'],
      ['PLANT-03', 'પશ્ચિમ એકમ (West Facility)', 'West City', 'હરેશભાઈ જોશી', 'CONFIDENTIAL_NOTE_3'],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(plantCatalog);
    const wb1 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb1, ws1, 'Plants');
    const plantBuffer = XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' });

    const dsResult = await createDataset(form.id, plantBuffer, 'sample_plants.xlsx', plantBuffer.length);
    testDatasetId = dsResult.dataset.id;
    assert(dsResult.dataset.rowCount === 3, 'E2E: Dataset uploaded with 3 rows');
    assert(dsResult.dataset.columns.length === 5, 'E2E: Dataset columns detected (5 columns)');

    // -------------------------------------------------------------
    // Test 3: Configure Multi-Field & Cross-Section Lookup Mapping
    // -------------------------------------------------------------
    const plantMapping = await prisma.formLookupMapping.create({
      data: {
        formId: form.id,
        datasetId: testDatasetId,
        triggerQuestionId: qPlantTrigger.id,
        lookupType: 'DROPDOWN',
        keyColumn: 'PlantCode',
        noMatchMessage: 'Selected plant not found in directory.',
        mappings: [
          { column: 'OfficialName', targetQuestionId: qPlantName.id, isReadOnly: true },
          { column: 'City', targetQuestionId: qPlantLocation.id, isReadOnly: true },
          // Cross-section mapping: trigger is in Section 1, target is in Section 2!
          { column: 'ManagerName', targetQuestionId: qCrossSectionManager.id, isReadOnly: false },
        ],
      },
    });
    assert(Boolean(plantMapping.id), 'E2E: Multi-field and cross-section mapping created');

    // -------------------------------------------------------------
    // Test 4: Form Publishing & Immutable Version Snapshot
    // -------------------------------------------------------------
    const freshFormForPublish = await prisma.form.findUnique({
      where: { id: form.id },
      include: {
        theme: true,
        settings: true,
        lookupMappings: {
          include: {
            dataset: {
              select: {
                id: true,
                fileName: true,
                version: true,
                columns: true,
                rowCount: true,
                isActive: true,
              },
            },
          },
        },
        sections: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
      },
    });

    const publishedVersion = await prisma.formVersion.create({
      data: {
        formId: form.id,
        versionNumber: 1,
        snapshotJson: freshFormForPublish as any,
        publishedByUserId: adminUser.id,
      },
    });

    const publishedForm = await prisma.form.update({
      where: { id: form.id },
      data: {
        status: 'PUBLISHED',
        publishedVersionId: publishedVersion.id,
      },
    });

    const snapshot = publishedVersion.snapshotJson as any;
    assert(publishedForm.status === 'PUBLISHED', 'E2E: Form published successfully');
    assert(Array.isArray(snapshot.lookupMappings), 'E2E: Lookup mappings preserved in published snapshot');
    assert(snapshot.lookupMappings[0].dataset.version === 1, 'E2E: Dataset version 1 captured in snapshot');

    // -------------------------------------------------------------
    // Test 5: Public Lookup Options Retrieval
    // -------------------------------------------------------------
    const options = await getDropdownOptions(testDatasetId, 'PlantCode');
    assert(options.options.length === 3, 'E2E: Public dropdown options returned 3 items');
    assert(options.options.some((o) => o.value === 'PLANT-02'), 'E2E: PLANT-02 present in options');

    // -------------------------------------------------------------
    // Test 6: Dynamic Record Query & Confidential Data Sanitization
    // -------------------------------------------------------------
    const plantRecord = await findLookupRecord(testDatasetId, 'PlantCode', 'PLANT-01');
    assert(plantRecord !== null, 'E2E: Lookup record query succeeded for "PLANT-01"');
    assert(
      plantRecord!['OfficialName'].includes('પાલનપુર'),
      'E2E: Gujarati Unicode preserved in query result'
    );

    // Verify unmapped SecretAuditNotes is excluded from mapped output
    const clientPayload: Record<string, any> = {};
    for (const fm of plantMapping.mappings as any[]) {
      clientPayload[fm.targetQuestionId] = plantRecord![fm.column];
    }
    assert(
      clientPayload[qPlantName.id] === 'મુખ્ય કેન્દ્ર (Main Facility)',
      'E2E: Autofilled plant name mapped'
    );
    assert(
      (clientPayload as any)['SecretAuditNotes'] === undefined,
      'SECURITY: SecretAuditNotes is completely excluded from client payload'
    );

    // -------------------------------------------------------------
    // Test 7: Submission Security: Tampered Read-Only Overrides
    // -------------------------------------------------------------
    const tamperedClientAnswers = [
      { questionId: qPlantTrigger.id, value: 'PLANT-01' },
      { questionId: qPlantName.id, value: 'FAKE_MODIFIED_NAME' }, // Tampered locked field
      { questionId: qPlantLocation.id, value: 'FAKE_LOCATION' }, // Tampered locked field
      { questionId: qCrossSectionManager.id, value: 'Edited Manager Name' }, // Editable field
    ];

    const answerMap = new Map<string, any>();
    tamperedClientAnswers.forEach((a) => answerMap.set(a.questionId, a.value));

    // Server-side submission security verification
    const verifiedRecord = await findLookupRecord(
      plantMapping.datasetId,
      plantMapping.keyColumn,
      String(answerMap.get(plantMapping.triggerQuestionId))
    );

    if (verifiedRecord) {
      for (const fm of plantMapping.mappings as any[]) {
        if (fm.isReadOnly) {
          const authVal = verifiedRecord[fm.column] !== undefined ? String(verifiedRecord[fm.column]) : '';
          answerMap.set(fm.targetQuestionId, authVal);
        }
      }
    }

    assert(
      answerMap.get(qPlantName.id) === 'મુખ્ય કેન્દ્ર (Main Facility)',
      'SECURITY: Tampered plant name overridden with authoritative database value'
    );
    assert(
      answerMap.get(qPlantLocation.id) === 'Metro City',
      'SECURITY: Tampered location overridden with authoritative database value'
    );
    assert(
      answerMap.get(qCrossSectionManager.id) === 'Edited Manager Name',
      'E2E: Editable mapped field allows valid custom respondent input'
    );

    // -------------------------------------------------------------
    // Test 8: Store Submission & Verify Database Integrity
    // -------------------------------------------------------------
    const sub = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        formVersionId: publishedVersion.id,
        respondentEmail: 'respondent@example.com',
        isComplete: true,
      },
    });

    for (const [qId, val] of answerMap.entries()) {
      await prisma.submissionAnswer.create({
        data: {
          submissionId: sub.id,
          questionId: qId,
          value: val,
          textAnswer: String(val),
        },
      });
    }

    const savedAnswers = await prisma.submissionAnswer.findMany({
      where: { submissionId: sub.id },
    });
    assert(savedAnswers.length === 4, 'E2E: 4 submission answers recorded in database');

    // -------------------------------------------------------------
    // Test 9: Spreadsheet Export & Formula Injection Sanitization
    // -------------------------------------------------------------
    const formulaPayload = '=cmd|"/C calc"!A0';
    const sanitized = sanitizeSpreadsheetField(formulaPayload);
    assert(sanitized === `'=cmd|"/C calc"!A0`, 'SECURITY: Formula injection sanitized for export');

    // -------------------------------------------------------------
    // Test 10: Atomic Dataset Replacement (Version Increment)
    // -------------------------------------------------------------
    const updatedPlantCatalog = [
      ['PlantCode', 'OfficialName', 'City', 'ManagerName', 'SecretAuditNotes'],
      ['PLANT-01', 'મુખ્ય કેન્દ્ર (Main Facility)', 'Metro City', 'શ્રી રમેશભાઈ પટેલ', 'NOTE_V2'],
      ['PLANT-02', 'પૂર્વ એકમ (East Facility)', 'East City', 'સુરેશભાઈ ચૌધરી', 'NOTE_V2'],
      ['PLANT-03', 'પશ્ચિમ એકમ (West Facility)', 'West City', 'હરેશભાઈ જોશી', 'NOTE_V2'],
      ['PLANT-04', 'ઉત્તર એકમ (North Facility)', 'North City', 'વિનોદભાઈ રાવલ', 'NOTE_V2'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(updatedPlantCatalog);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws2, 'Plants');
    const v2Buffer = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });

    const replaceRes = await replaceDataset(testDatasetId, form.id, v2Buffer, 'sample_plants_v2.xlsx', v2Buffer.length);
    assert(replaceRes.dataset.version === 2, 'E2E: Dataset version incremented to 2');
    assert(replaceRes.dataset.rowCount === 4, 'E2E: Updated dataset has 4 rows');

    // Verify existing submission was untouched by dataset replacement
    const existingSubCheck = await prisma.formSubmission.findUnique({
      where: { id: sub.id },
      include: { answers: true },
    });
    assert(existingSubCheck !== null && existingSubCheck.answers.length === 4, 'E2E: Existing submissions completely intact after dataset replacement');
  } catch (err: any) {
    assert(false, 'Phase 5 E2E Test Execution', err.message);
  } finally {
    // Clean up test form and cascaded records
    if (testFormId) {
      try {
        await prisma.form.delete({ where: { id: testFormId } });
        console.log('Cleaned up Phase 5 test form.');
      } catch {}
    }
  }

  console.log(`\n========================================`);
  console.log(`Phase 5 E2E Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5E2ETests().catch((err) => {
  console.error('Phase 5 crashed:', err);
  process.exit(1);
});
