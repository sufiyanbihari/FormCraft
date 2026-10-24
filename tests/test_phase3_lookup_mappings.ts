import { prisma } from '../src/lib/db/prisma';
import { LookupMappingSchema } from '../src/lib/lookup/lookupTypes';

async function runPhase3Tests() {
  console.log('🧪 Starting Phase 3: Admin Lookup Configuration & Mapping Tests\n');

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

  // Find or create test form, section, and questions
  let form = await prisma.form.findFirst({
    include: {
      sections: {
        include: { questions: true },
      },
      lookupDatasets: true,
    },
  });

  if (!form) {
    throw new Error('No form found to run Phase 3 tests');
  }

  // Ensure dataset exists for testing
  let dataset = form.lookupDatasets[0];
  if (!dataset) {
    dataset = await prisma.formLookupDataset.create({
      data: {
        formId: form.id,
        fileName: 'test_dataset.xlsx',
        fileSize: 1024,
        rowCount: 10,
        columns: ['PlantCode', 'PlantName', 'Manager', 'Location'],
        version: 1,
      },
    });
  }

  // Ensure questions exist
  let triggerQ = form.sections[0]?.questions[0];
  let targetQ1 = form.sections[0]?.questions[1];
  let targetQ2 = form.sections[0]?.questions[2];

  if (!triggerQ || !targetQ1) {
    const sec = form.sections[0] || (await prisma.formSection.create({ data: { formId: form.id, title: 'Sec 1' } }));
    triggerQ = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec.id, title: 'Plant Selector', type: 'DROPDOWN' },
    });
    targetQ1 = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec.id, title: 'Plant Name', type: 'SHORT_ANSWER' },
    });
    targetQ2 = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec.id, title: 'Plant Manager', type: 'SHORT_ANSWER' },
    });
  }

  // 1. Test Zod Validation: Valid payload
  const validPayload = {
    datasetId: dataset.id,
    triggerQuestionId: triggerQ.id,
    lookupType: 'DROPDOWN',
    keyColumn: 'PlantCode',
    noMatchMessage: 'Plant not found.',
    mappings: [
      { column: 'PlantName', targetQuestionId: targetQ1.id, isReadOnly: true },
      ...(targetQ2 ? [{ column: 'Manager', targetQuestionId: targetQ2.id, isReadOnly: false }] : []),
    ],
  };

  const parsedValid = LookupMappingSchema.safeParse(validPayload);
  assert(parsedValid.success, 'LookupMappingSchema validates correct configuration payload');

  // 2. Test Zod Validation: Empty mappings rejected
  const emptyMappingsPayload = { ...validPayload, mappings: [] };
  const parsedEmpty = LookupMappingSchema.safeParse(emptyMappingsPayload);
  assert(!parsedEmpty.success, 'LookupMappingSchema rejects empty mappings array');

  // 3. Test Database CRUD for FormLookupMapping
  let createdMappingId: string | null = null;
  try {
    const created = await prisma.formLookupMapping.create({
      data: {
        formId: form.id,
        datasetId: dataset.id,
        triggerQuestionId: triggerQ.id,
        lookupType: 'DROPDOWN',
        keyColumn: 'PlantCode',
        noMatchMessage: 'Plant not found.',
        mappings: validPayload.mappings,
      },
      include: { dataset: true },
    });
    createdMappingId = created.id;
    assert(created.id !== undefined, 'Lookup mapping created in database');
    assert(created.keyColumn === 'PlantCode', 'Key column saved correctly ("PlantCode")');
    assert(created.dataset.fileName === dataset.fileName, 'Dataset relation loaded properly');

    // Update mapping
    const updated = await prisma.formLookupMapping.update({
      where: { id: created.id },
      data: {
        lookupType: 'TEXT_KEY',
        noMatchMessage: 'Custom no match message',
      },
    });
    assert(updated.lookupType === 'TEXT_KEY', 'Lookup mapping updated to TEXT_KEY');
    assert(updated.noMatchMessage === 'Custom no match message', 'noMatchMessage updated');

    // Delete mapping
    await prisma.formLookupMapping.delete({
      where: { id: created.id },
    });
    const checkDeleted = await prisma.formLookupMapping.findUnique({
      where: { id: created.id },
    });
    assert(checkDeleted === null, 'Lookup mapping cleanly deleted from database');
    createdMappingId = null;
  } catch (err: any) {
    assert(false, 'Database mapping CRUD', err.message);
  } finally {
    if (createdMappingId) {
      try {
        await prisma.formLookupMapping.delete({ where: { id: createdMappingId } });
      } catch {}
    }
  }

  console.log(`\n========================================`);
  console.log(`Phase 3 Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
