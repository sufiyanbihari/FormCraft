import { prisma } from '../src/lib/db/prisma';
import { POST as importQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/route';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import assert from 'assert';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createAuthCookie(user: { id: string; email: string; role: string }): string {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `formcraft_session=${token}`;
}

async function runImportTests() {
  console.log('====================================================');
  console.log('   FormCraft Import Questions Verification Tests    ');
  console.log('====================================================\n');

  // 1. Setup test users
  const ownerUser = await prisma.user.upsert({
    where: { email: 'test_import_owner@example.com' },
    update: {},
    create: {
      email: 'test_import_owner@example.com',
      name: 'Import Test Owner',
      passwordHash: 'dummyhash',
      role: 'USER',
    },
  });

  const unauthorizedUser = await prisma.user.upsert({
    where: { email: 'test_import_unauth@example.com' },
    update: {},
    create: {
      email: 'test_import_unauth@example.com',
      name: 'Import Test Unauthorized',
      passwordHash: 'dummyhash',
      role: 'USER',
    },
  });

  const ownerCookie = createAuthCookie(ownerUser);
  const unauthCookie = createAuthCookie(unauthorizedUser);

  // 2. Setup Source Form with Sections and diverse Questions
  console.log('Setting up Source Form with questions (Choices, Quiz, Images)...');
  const sourceForm = await prisma.form.create({
    data: {
      title: 'Source Form for Import Tests',
      description: 'Source questions repo',
      ownerId: ownerUser.id,
      isQuiz: true,
    },
  });

  const sourceSection = await prisma.formSection.create({
    data: {
      formId: sourceForm.id,
      title: 'Source Section 1',
      orderIndex: 0,
    },
  });

  const sourceQ1 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: sourceSection.id,
      title: 'What is the capital of France?',
      description: 'Select the primary capital city',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 0,
      isRequired: true,
      quizPoints: 5,
      quizAnswer: { correctValue: 'Paris' },
      quizExplanation: 'Paris has been the capital since the 12th century.',
      config: { imageAlignment: 'center' },
      options: {
        create: [
          { label: 'London', value: 'opt_1', orderIndex: 0 },
          { label: 'Berlin', value: 'opt_2', orderIndex: 1 },
          { label: 'Paris', value: 'opt_3', orderIndex: 2, imageUrl: '/uploads/paris.jpg' },
          { label: 'Madrid', value: 'opt_4', orderIndex: 3 },
        ],
      },
    },
    include: { options: true },
  });

  const sourceQ2 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: sourceSection.id,
      title: 'Select all dairy products:',
      description: 'Choose all that apply',
      type: 'CHECKBOXES',
      orderIndex: 1,
      isRequired: false,
      quizPoints: 10,
      quizAnswer: { correctValues: ['Milk', 'Cheese', 'Butter'] },
      quizExplanation: 'Almond milk is plant-based.',
      options: {
        create: [
          { label: 'Milk', value: 'opt_1', orderIndex: 0 },
          { label: 'Cheese', value: 'opt_2', orderIndex: 1 },
          { label: 'Butter', value: 'opt_3', orderIndex: 2 },
          { label: 'Bread', value: 'opt_4', orderIndex: 3 },
        ],
      },
    },
    include: { options: true },
  });

  const sourceQ3 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: sourceSection.id,
      title: 'Provide your feedback',
      description: 'Long form response',
      type: 'PARAGRAPH',
      orderIndex: 2,
      isRequired: false,
      quizPoints: 0,
    },
  });

  // 3. Setup Target Form
  const targetForm = await prisma.form.create({
    data: {
      title: 'Target Form to Receive Questions',
      ownerId: ownerUser.id,
    },
  });

  const targetSection1 = await prisma.formSection.create({
    data: {
      formId: targetForm.id,
      title: 'Target Section 1',
      orderIndex: 0,
    },
  });
  console.log('✓ Source and Target forms initialized\n');

  try {
    // TEST 1: Unauthenticated request should return 401
    console.log('Test 1: Unauthenticated request rejection');
    const req1 = new NextRequest(`http://localhost:3000/api/forms/${targetForm.id}/import-questions`, {
      method: 'POST',
      body: JSON.stringify({
        sourceFormId: sourceForm.id,
        questionIds: [sourceQ1.id],
        targetSectionId: targetSection1.id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res1 = await importQuestionsHandler(req1, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(res1.status, 401, 'Should reject unauthenticated requests with 401');
    console.log('  ✓ Unauthenticated call returned HTTP 401\n');

    // TEST 2: Unauthorized user cannot import into someone else\'s form
    console.log('Test 2: Access denied for unauthorized user');
    const req2 = new NextRequest(`http://localhost:3000/api/forms/${targetForm.id}/import-questions`, {
      method: 'POST',
      body: JSON.stringify({
        sourceFormId: sourceForm.id,
        questionIds: [sourceQ1.id],
        targetSectionId: targetSection1.id,
      }),
      headers: {
        'Content-Type': 'application/json',
        cookie: unauthCookie,
      },
    });
    const res2 = await importQuestionsHandler(req2, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(res2.status, 403, 'Should reject unauthorized user with 403');
    console.log('  ✓ Unauthorized call returned HTTP 403\n');

    // TEST 3: Import single question into existing section
    console.log('Test 3: Import single question into existing section');
    const req3 = new NextRequest(`http://localhost:3000/api/forms/${targetForm.id}/import-questions`, {
      method: 'POST',
      body: JSON.stringify({
        sourceFormId: sourceForm.id,
        questionIds: [sourceQ1.id],
        targetSectionId: targetSection1.id,
      }),
      headers: {
        'Content-Type': 'application/json',
        cookie: ownerCookie,
      },
    });
    const res3 = await importQuestionsHandler(req3, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(res3.status, 200, 'Import single question should succeed');
    const data3 = await res3.json();
    assert.strictEqual(data3.success, true);
    assert.strictEqual(data3.count, 1);
    const importedQ1 = data3.questions[0];

    // Assert independence and property preservation
    assert.notStrictEqual(importedQ1.id, sourceQ1.id, 'Imported question must have a new unique ID');
    assert.strictEqual(importedQ1.formId, targetForm.id);
    assert.strictEqual(importedQ1.sectionId, targetSection1.id);
    assert.strictEqual(importedQ1.title, sourceQ1.title);
    assert.strictEqual(importedQ1.quizPoints, 5);
    assert.strictEqual((importedQ1.quizAnswer as any).correctValue, 'Paris');
    assert.strictEqual(importedQ1.options.length, 4);
    assert.strictEqual(importedQ1.options[2].imageUrl, '/uploads/paris.jpg', 'Must preserve option image');
    console.log('  ✓ Single question imported with new ID, options, and quiz settings preserved\n');

    // TEST 4: Import multiple questions into a NEW section
    console.log('Test 4: Import multiple questions and create new section');
    const req4 = new NextRequest(`http://localhost:3000/api/forms/${targetForm.id}/import-questions`, {
      method: 'POST',
      body: JSON.stringify({
        sourceFormId: sourceForm.id,
        questionIds: [sourceQ2.id, sourceQ3.id],
        createNewSection: true,
        newSectionTitle: 'Bonus Questions Section',
      }),
      headers: {
        'Content-Type': 'application/json',
        cookie: ownerCookie,
      },
    });
    const res4 = await importQuestionsHandler(req4, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(res4.status, 200, 'Import into new section should succeed');
    const data4 = await res4.json();
    assert.strictEqual(data4.count, 2);
    assert(data4.newSections && data4.newSections.length === 2, 'Should create 2 new sections for 2 imported questions');
    assert.strictEqual(data4.newSections[0].title, 'Bonus Questions Section 1');
    assert.strictEqual(data4.newSections[1].title, 'Bonus Questions Section 2');

    const importedQ2 = data4.questions[0];
    const importedQ3 = data4.questions[1];
    assert.strictEqual(importedQ2.sectionId, data4.newSections[0].id);
    assert.strictEqual(importedQ3.sectionId, data4.newSections[1].id);
    assert.strictEqual(importedQ2.orderIndex, 0);
    assert.strictEqual(importedQ3.orderIndex, 0);
    assert.strictEqual(importedQ2.type, 'CHECKBOXES');
    assert.deepStrictEqual((importedQ2.quizAnswer as any).correctValues, ['Milk', 'Cheese', 'Butter']);
    console.log('  ✓ Multiple questions imported into dynamically created new sections (one section per question)\n');

    // TEST 5: Verify original source questions remain completely untouched
    console.log('Test 5: Verify original questions independence');
    const verifySourceQ1 = await prisma.formQuestion.findUnique({
      where: { id: sourceQ1.id },
      include: { options: true },
    });
    assert(verifySourceQ1, 'Original question must still exist');
    assert.strictEqual(verifySourceQ1.formId, sourceForm.id);
    assert.strictEqual(verifySourceQ1.options.length, 4);

    // Modify imported question to prove independence
    await prisma.formQuestion.update({
      where: { id: importedQ1.id },
      data: { title: 'MODIFIED TITLE IN TARGET FORM' },
    });

    const verifySourceAfterEdit = await prisma.formQuestion.findUnique({
      where: { id: sourceQ1.id },
    });
    assert.strictEqual(
      verifySourceAfterEdit?.title,
      'What is the capital of France?',
      'Original question title must not be affected by edits to imported question'
    );
    console.log('  ✓ Original source questions remain pristine and completely independent\n');

    console.log('🎉 ALL PHASE 1 IMPORT QUESTIONS TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Clean up test forms and users
    await prisma.form.deleteMany({
      where: { id: { in: [sourceForm.id, targetForm.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUser.id, unauthorizedUser.id] } },
    });
  }
}

runImportTests()
  .catch((err) => {
    console.error('❌ Import tests failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
