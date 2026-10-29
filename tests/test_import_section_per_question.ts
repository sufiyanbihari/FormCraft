import fs from 'fs';
import path from 'path';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { generateImportSectionTitle } from '../src/lib/utils';
import { POST as importFcQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/route';
import { POST as importExcelQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/from-excel/route';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createAuthCookie(user: { id: string; email: string; role: string }): string {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `formcraft_session=${token}`;
}

async function runTests() {
  console.log('================================================================');
  console.log(' Testing Section Creation Per Question & Quiz Settings Removal ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // PART 1: Title Generation Pattern Unit Tests
  // ---------------------------------------------------------------------------
  console.log('--- Part 1: Section Title Generation Pattern ---');
  assert.strictEqual(generateImportSectionTitle('Questions 1', 0), 'Questions 1');
  assert.strictEqual(generateImportSectionTitle('Questions 1', 1), 'question 2');
  assert.strictEqual(generateImportSectionTitle('Questions 1', 2), 'question 3');
  assert.strictEqual(generateImportSectionTitle('Questions 1', 3), 'question 4');

  assert.strictEqual(generateImportSectionTitle('Imported Questions', 0), 'Questions 1');
  assert.strictEqual(generateImportSectionTitle('Imported Questions', 1), 'question 2');
  assert.strictEqual(generateImportSectionTitle('Imported Questions', 2), 'question 3');

  assert.strictEqual(generateImportSectionTitle('', 0), 'Questions 1');
  assert.strictEqual(generateImportSectionTitle('', 1), 'question 2');

  assert.strictEqual(generateImportSectionTitle(undefined, 0), 'Questions 1');
  assert.strictEqual(generateImportSectionTitle(undefined, 1), 'question 2');

  // Custom user-provided base titles
  assert.strictEqual(generateImportSectionTitle('Physics', 0), 'Physics 1');
  assert.strictEqual(generateImportSectionTitle('Physics', 1), 'Physics 2');
  assert.strictEqual(generateImportSectionTitle('Chapter 1', 0), 'Chapter 1');
  assert.strictEqual(generateImportSectionTitle('Chapter 1', 1), 'Chapter 2');
  console.log('✓ Title generator matches pattern: "Questions 1", "question 2", "question 3", etc.\n');

  // ---------------------------------------------------------------------------
  // Setup Test User and Forms
  // ---------------------------------------------------------------------------
  const testUser = await prisma.user.upsert({
    where: { email: 'import_tester@example.com' },
    update: {},
    create: {
      email: 'import_tester@example.com',
      name: 'Import Tester',
      passwordHash: 'dummy',
      role: 'ADMIN',
    },
  });
  const cookie = createAuthCookie(testUser);

  // Create Source Form with 4 diverse questions
  const sourceForm = await prisma.form.create({
    data: {
      title: 'Source Question Bank',
      ownerId: testUser.id,
      isQuiz: true,
    },
  });
  const srcSection = await prisma.formSection.create({
    data: { formId: sourceForm.id, title: 'Bank Section', orderIndex: 0 },
  });

  const q1 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: srcSection.id,
      title: 'Question One: What is 2 + 2?',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 0,
      quizPoints: 2,
      quizAnswer: { correctValue: '4' },
      options: {
        create: [
          { label: '3', value: '3', orderIndex: 0 },
          { label: '4', value: '4', orderIndex: 1 },
        ],
      },
    },
  });

  const q2 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: srcSection.id,
      title: 'Question Two: Capital of Italy?',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 1,
      quizPoints: 5,
      quizAnswer: { correctValue: 'Rome' },
      options: {
        create: [
          { label: 'Rome', value: 'Rome', orderIndex: 0 },
          { label: 'Milan', value: 'Milan', orderIndex: 1 },
        ],
      },
    },
  });

  const q3 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: srcSection.id,
      title: 'Question Three: Describe photosynthesis',
      type: 'PARAGRAPH',
      orderIndex: 2,
      quizPoints: 10,
    },
  });

  const q4 = await prisma.formQuestion.create({
    data: {
      formId: sourceForm.id,
      sectionId: srcSection.id,
      title: 'Question Four: Select primary colors',
      type: 'CHECKBOXES',
      orderIndex: 3,
      quizPoints: 3,
      quizAnswer: { correctValues: ['Red', 'Blue', 'Yellow'] },
      options: {
        create: [
          { label: 'Red', value: 'Red', orderIndex: 0 },
          { label: 'Green', value: 'Green', orderIndex: 1 },
          { label: 'Blue', value: 'Blue', orderIndex: 2 },
          { label: 'Yellow', value: 'Yellow', orderIndex: 3 },
        ],
      },
    },
  });

  // ---------------------------------------------------------------------------
  // PART 2: FormCraft Import Scenarios
  // ---------------------------------------------------------------------------
  console.log('--- Part 2: FormCraft Import Scenarios ---');

  // Scenario 2A: Single question import into New Section
  console.log('Scenario 2A: 1 Question -> New Section');
  const targetFormA = await prisma.form.create({
    data: { title: 'Target Form A', ownerId: testUser.id },
  });
  const initSecA = await prisma.formSection.create({
    data: { formId: targetFormA.id, title: 'Introduction', orderIndex: 0 },
  });

  const req2A = new NextRequest(`http://localhost/api/forms/${targetFormA.id}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: sourceForm.id,
      questionIds: [q1.id],
      createNewSection: true,
    }),
  });
  const res2A = await importFcQuestionsHandler(req2A, { params: Promise.resolve({ id: targetFormA.id }) });
  assert.strictEqual(res2A.status, 200);
  const data2A = await res2A.json();
  assert.strictEqual(data2A.count, 1);
  assert.strictEqual(data2A.newSections.length, 1);
  assert.strictEqual(data2A.newSections[0].title, 'Questions 1');
  assert.strictEqual(data2A.questions[0].sectionId, data2A.newSections[0].id);
  assert.strictEqual(data2A.questions[0].orderIndex, 0);
  assert.strictEqual(data2A.questions[0].title, 'Question One: What is 2 + 2?');
  assert.strictEqual(data2A.questions[0].quizPoints, 2);
  console.log('✓ Scenario 2A PASSED: 1 question created exactly 1 section titled "Questions 1"');

  // Scenario 2B: Multiple (3) questions import into New Section
  console.log('Scenario 2B: 3 Questions -> New Section (Sequential Titles & Order)');
  const targetFormB = await prisma.form.create({
    data: { title: 'Target Form B', ownerId: testUser.id },
  });
  const initSecB = await prisma.formSection.create({
    data: { formId: targetFormB.id, title: 'Introduction', orderIndex: 0 },
  });

  const req2B = new NextRequest(`http://localhost/api/forms/${targetFormB.id}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: sourceForm.id,
      questionIds: [q1.id, q2.id, q4.id],
      createNewSection: true,
    }),
  });
  const res2B = await importFcQuestionsHandler(req2B, { params: Promise.resolve({ id: targetFormB.id }) });
  assert.strictEqual(res2B.status, 200);
  const data2B = await res2B.json();
  assert.strictEqual(data2B.count, 3);
  assert.strictEqual(data2B.newSections.length, 3);

  // Verify sequential titles
  assert.strictEqual(data2B.newSections[0].title, 'Questions 1');
  assert.strictEqual(data2B.newSections[1].title, 'question 2');
  assert.strictEqual(data2B.newSections[2].title, 'question 3');

  // Verify unique IDs and sequential orderIndex
  const secIds = new Set(data2B.newSections.map((s: any) => s.id));
  assert.strictEqual(secIds.size, 3, 'Each section must have a unique ID');
  assert.strictEqual(data2B.newSections[0].orderIndex, 1);
  assert.strictEqual(data2B.newSections[1].orderIndex, 2);
  assert.strictEqual(data2B.newSections[2].orderIndex, 3);

  // Verify 1:1 question-to-section mapping
  assert.strictEqual(data2B.questions[0].sectionId, data2B.newSections[0].id);
  assert.strictEqual(data2B.questions[1].sectionId, data2B.newSections[1].id);
  assert.strictEqual(data2B.questions[2].sectionId, data2B.newSections[2].id);

  assert.strictEqual(data2B.questions[0].orderIndex, 0);
  assert.strictEqual(data2B.questions[1].orderIndex, 0);
  assert.strictEqual(data2B.questions[2].orderIndex, 0);

  // Verify question data preserved
  assert.strictEqual(data2B.questions[0].title, q1.title);
  assert.strictEqual(data2B.questions[1].title, q2.title);
  assert.strictEqual(data2B.questions[2].title, q4.title);
  assert.strictEqual(data2B.questions[2].type, 'CHECKBOXES');
  assert.deepStrictEqual((data2B.questions[2].quizAnswer as any).correctValues, ['Red', 'Blue', 'Yellow']);
  console.log('✓ Scenario 2B PASSED: 3 questions created 3 sections ("Questions 1", "question 2", "question 3") with 1:1 mapping');

  // Scenario 2C: Select All (all 4 questions)
  console.log('Scenario 2C: Select All -> 4 Questions -> 4 New Sections');
  const targetFormC = await prisma.form.create({
    data: { title: 'Target Form C', ownerId: testUser.id },
  });
  const req2C = new NextRequest(`http://localhost/api/forms/${targetFormC.id}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: sourceForm.id,
      questionIds: [q1.id, q2.id, q3.id, q4.id],
      createNewSection: true,
    }),
  });
  const res2C = await importFcQuestionsHandler(req2C, { params: Promise.resolve({ id: targetFormC.id }) });
  const data2C = await res2C.json();
  assert.strictEqual(data2C.count, 4);
  assert.strictEqual(data2C.newSections.length, 4);
  assert.strictEqual(data2C.newSections[0].title, 'Questions 1');
  assert.strictEqual(data2C.newSections[1].title, 'question 2');
  assert.strictEqual(data2C.newSections[2].title, 'question 3');
  assert.strictEqual(data2C.newSections[3].title, 'question 4');
  console.log('✓ Scenario 2C PASSED: Select All created 4 sections sequentially');

  // Scenario 2D: Existing Section import (Must NOT create new sections)
  console.log('Scenario 2D: Existing Section Import (Preserve existing behavior)');
  const targetFormD = await prisma.form.create({
    data: { title: 'Target Form D', ownerId: testUser.id },
  });
  const existingSecD = await prisma.formSection.create({
    data: { formId: targetFormD.id, title: 'Main Section', orderIndex: 0 },
  });

  const req2D = new NextRequest(`http://localhost/api/forms/${targetFormD.id}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: sourceForm.id,
      questionIds: [q1.id, q2.id],
      createNewSection: false,
      targetSectionId: existingSecD.id,
    }),
  });
  const res2D = await importFcQuestionsHandler(req2D, { params: Promise.resolve({ id: targetFormD.id }) });
  const data2D = await res2D.json();
  assert.strictEqual(data2D.count, 2);
  assert.strictEqual(data2D.newSections.length, 0, 'Must NOT create new sections when importing to Existing Section');
  assert.strictEqual(data2D.questions[0].sectionId, existingSecD.id);
  assert.strictEqual(data2D.questions[1].sectionId, existingSecD.id);
  assert.strictEqual(data2D.questions[0].orderIndex, 0);
  assert.strictEqual(data2D.questions[1].orderIndex, 1);

  // Check form sections count in database
  const dSections = await prisma.formSection.findMany({ where: { formId: targetFormD.id } });
  assert.strictEqual(dSections.length, 1, 'Total sections in database should remain 1');
  console.log('✓ Scenario 2D PASSED: Existing Section import placed all questions into chosen section\n');

  // ---------------------------------------------------------------------------
  // PART 3: Excel Import Scenarios
  // ---------------------------------------------------------------------------
  console.log('--- Part 3: Excel Import Scenarios ---');

  const excelQuestions = [
    {
      title: 'Excel Q1: What is H2O?',
      options: [
        { label: 'Water', isCorrect: true },
        { label: 'Oxygen', isCorrect: false },
      ],
      marks: 1,
      correctAnswerText: 'Water',
    },
    {
      title: 'Excel Q2: Boiling point of water?',
      options: [
        { label: '100C', isCorrect: true },
        { label: '50C', isCorrect: false },
      ],
      marks: 2,
      correctAnswerText: '100C',
    },
    {
      title: 'Excel Q3: Speed of light is approximately?',
      options: [
        { label: '300,000 km/s', isCorrect: true },
        { label: '150,000 km/s', isCorrect: false },
      ],
      marks: 5,
      correctAnswerText: '300,000 km/s',
    },
  ];

  // Scenario 3A: 3 Excel questions -> New Section
  console.log('Scenario 3A: 3 Excel Questions -> New Section');
  const targetFormE = await prisma.form.create({
    data: { title: 'Target Form E (Excel)', ownerId: testUser.id },
  });
  const initSecE = await prisma.formSection.create({
    data: { formId: targetFormE.id, title: 'Welcome', orderIndex: 0 },
  });

  const req3A = new NextRequest(`http://localhost/api/forms/${targetFormE.id}/import-questions/from-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      createNewSection: true,
      questions: excelQuestions,
    }),
  });
  const res3A = await importExcelQuestionsHandler(req3A, { params: Promise.resolve({ id: targetFormE.id }) });
  assert.strictEqual(res3A.status, 200);
  const data3A = await res3A.json();
  assert.strictEqual(data3A.count, 3);
  assert.strictEqual(data3A.newSections.length, 3);
  assert.strictEqual(data3A.newSections[0].title, 'Questions 1');
  assert.strictEqual(data3A.newSections[1].title, 'question 2');
  assert.strictEqual(data3A.newSections[2].title, 'question 3');

  // Check 1:1 question:section mapping
  assert.strictEqual(data3A.questions[0].sectionId, data3A.newSections[0].id);
  assert.strictEqual(data3A.questions[1].sectionId, data3A.newSections[1].id);
  assert.strictEqual(data3A.questions[2].sectionId, data3A.newSections[2].id);
  assert.strictEqual(data3A.questions[0].orderIndex, 0);
  assert.strictEqual(data3A.questions[1].orderIndex, 0);
  assert.strictEqual(data3A.questions[2].orderIndex, 0);

  // Check data preservation
  assert.strictEqual(data3A.questions[0].title, 'Excel Q1: What is H2O?');
  assert.strictEqual(data3A.questions[0].quizPoints, 1);
  assert.strictEqual((data3A.questions[0].quizAnswer as any).correctValue, 'Water');
  assert.strictEqual(data3A.questions[2].quizPoints, 5);
  console.log('✓ Scenario 3A PASSED: Excel import created 3 sections with 1:1 questions');

  // Scenario 3B: Excel questions -> Existing Section
  console.log('Scenario 3B: Excel Questions -> Existing Section');
  const targetFormF = await prisma.form.create({
    data: { title: 'Target Form F (Excel Existing)', ownerId: testUser.id },
  });
  const existingSecF = await prisma.formSection.create({
    data: { formId: targetFormF.id, title: 'Single Section', orderIndex: 0 },
  });

  const req3B = new NextRequest(`http://localhost/api/forms/${targetFormF.id}/import-questions/from-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      createNewSection: false,
      targetSectionId: existingSecF.id,
      questions: excelQuestions,
    }),
  });
  const res3B = await importExcelQuestionsHandler(req3B, { params: Promise.resolve({ id: targetFormF.id }) });
  const data3B = await res3B.json();
  assert.strictEqual(data3B.count, 3);
  assert.strictEqual(data3B.newSections.length, 0);
  assert.strictEqual(data3B.questions[0].sectionId, existingSecF.id);
  assert.strictEqual(data3B.questions[1].sectionId, existingSecF.id);
  assert.strictEqual(data3B.questions[2].sectionId, existingSecF.id);
  console.log('✓ Scenario 3B PASSED: Excel import into Existing Section created 0 new sections\n');

  // ---------------------------------------------------------------------------
  // PART 4: Issue 2 Verification — Quiz Settings
  // ---------------------------------------------------------------------------
  console.log('--- Part 4: Quiz Settings "Show Correct Answers" Removal ---');
  const settingsTabPath = path.join(__dirname, '../src/components/form-builder/SettingsTab.tsx');
  const settingsTabContent = fs.readFileSync(settingsTabPath, 'utf-8');

  // Assert "Show correct answers" is completely absent from SettingsTab UI
  assert(
    !settingsTabContent.includes('Show correct answers'),
    'SettingsTab.tsx must NOT contain "Show correct answers"'
  );
  assert(
    !settingsTabContent.includes('Identify correct answers after grades are released'),
    'SettingsTab.tsx must NOT contain "Identify correct answers after grades are released"'
  );

  // Assert "Show points earned" is intact
  assert(
    settingsTabContent.includes('Show points earned'),
    'SettingsTab.tsx must retain "Show points earned"'
  );
  assert(
    settingsTabContent.includes('Display total points and points received for each question'),
    'SettingsTab.tsx must retain "Display total points and points received for each question"'
  );
  console.log('✓ "Show correct answers" is absent from SettingsTab.tsx while "Show points earned" remains functional\n');

  console.log('================================================================');
  console.log(' ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!                      ');
  console.log('================================================================');
}

runTests()
  .catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
