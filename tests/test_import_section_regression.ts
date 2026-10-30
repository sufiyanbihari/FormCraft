import assert from 'assert';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { getUnwantedDefaultSection } from '../src/lib/utils';
import { POST as createFormHandler } from '../src/app/api/forms/route';
import { POST as importExcelQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/from-excel/route';
import { POST as importFcQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/route';
import { POST as attemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { GET as getPublicFormHandler } from '../src/app/api/public/forms/[publicId]/route';

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
  console.log('========================================================================');
  console.log('  TEST SUITE: Question Import & Quiz Section Clean-up (No Extra Section) ');
  console.log('========================================================================\n');

  // 1. Setup User
  const testUser = await prisma.user.upsert({
    where: { email: 'section_tester@formcraft.test' },
    update: {},
    create: {
      email: 'section_tester@formcraft.test',
      name: 'Section Tester',
      passwordHash: 'dummy_hash',
      role: 'ADMIN',
    },
  });
  const cookie = createAuthCookie(testUser);

  // ---------------------------------------------------------------------------
  // GROUP A: Default Section Handling & Protection of Intentional Sections
  // ---------------------------------------------------------------------------
  console.log('--- GROUP A: Default Section Handling & Protection ---');

  // Test A1: Unit test getUnwantedDefaultSection helper
  console.log('Test A1: getUnwantedDefaultSection accurately identifies unwanted blank sections');
  const blankSection = {
    id: 'sec-1',
    title: 'Section 1',
    description: '',
    orderIndex: 0,
    questions: [
      {
        id: 'q-1',
        title: 'Untitled Question',
        quizPoints: 0,
        options: [{ id: 'opt-1', label: 'Option 1' }],
      },
    ],
  };
  assert.strictEqual(getUnwantedDefaultSection([blankSection])?.id, 'sec-1');

  // Empty section with 0 questions
  const emptySection = {
    id: 'sec-empty',
    title: 'Section 1',
    description: '',
    orderIndex: 0,
    questions: [],
  };
  assert.strictEqual(getUnwantedDefaultSection([emptySection])?.id, 'sec-empty');

  // Intentional section: custom title
  const customTitleSection = {
    id: 'sec-custom',
    title: 'Participant Information',
    description: '',
    orderIndex: 0,
    questions: [],
  };
  assert.strictEqual(getUnwantedDefaultSection([customTitleSection]), null, 'Must NOT delete section with custom title');

  // Intentional section: custom question
  const realQuestionSection = {
    id: 'sec-real-q',
    title: 'Section 1',
    description: '',
    orderIndex: 0,
    questions: [
      {
        id: 'q-real',
        title: 'Please enter your Employee ID',
        quizPoints: 0,
        options: [],
      },
    ],
  };
  assert.strictEqual(getUnwantedDefaultSection([realQuestionSection]), null, 'Must NOT delete section with real questions');

  // Multiple sections in form
  const multiSection = [
    { id: 'sec-m1', title: 'Section 1', description: '', orderIndex: 0, questions: [] },
    { id: 'sec-m2', title: 'Section 2', description: '', orderIndex: 1, questions: [] },
  ];
  assert.strictEqual(getUnwantedDefaultSection(multiSection), null, 'Must NOT delete section when multiple sections exist');
  console.log('✓ Test A1 Passed: Helper logic strictly protects intentional sections.\n');

  // Test A2: Excel import into a newly created blank form removes unwanted default section
  console.log('Test A2: Excel import into newly created blank form removes unwanted Section 1');
  const createFormReqA2 = new NextRequest('http://localhost/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Test Blank Form A2', isQuiz: true }),
  });
  const createFormResA2 = await createFormHandler(createFormReqA2);
  const formDataA2 = await createFormResA2.json();
  const formIdA2 = formDataA2.form.id;

  const excel5Questions = Array.from({ length: 5 }, (_, i) => ({
    title: `Question ${i + 1}: Sample Question?`,
    options: [
      { label: 'Option A', isCorrect: true },
      { label: 'Option B', isCorrect: false },
    ],
    marks: 1,
    correctAnswerText: 'Option A',
  }));

  const importReqA2 = new NextRequest(`http://localhost/api/forms/${formIdA2}/import-questions/from-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      createNewSection: true,
      questions: excel5Questions,
    }),
  });
  const importResA2 = await importExcelQuestionsHandler(importReqA2, { params: Promise.resolve({ id: formIdA2 }) });
  assert.strictEqual(importResA2.status, 200);
  const importDataA2 = await importResA2.json();

  assert.strictEqual(importDataA2.count, 5);
  assert.strictEqual(importDataA2.newSections.length, 5);
  assert(importDataA2.deletedSectionIds.length === 1, 'Should return the deleted default section ID');

  // Verify database has exactly 5 sections (not 6)
  const dbSectionsA2 = await prisma.formSection.findMany({
    where: { formId: formIdA2 },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(dbSectionsA2.length, 5, 'Must have exactly 5 sections in database (no extra section)');
  assert.strictEqual(dbSectionsA2[0].orderIndex, 0);
  assert.strictEqual(dbSectionsA2[0].title, 'Questions 1');
  assert.strictEqual(dbSectionsA2[1].orderIndex, 1);
  assert.strictEqual(dbSectionsA2[1].title, 'question 2');
  assert.strictEqual(dbSectionsA2[4].orderIndex, 4);
  assert.strictEqual(dbSectionsA2[4].title, 'question 5');

  // Verify the default placeholder question was cleaned up
  const dbQuestionsA2 = await prisma.formQuestion.findMany({
    where: { formId: formIdA2 },
  });
  assert.strictEqual(dbQuestionsA2.length, 5, 'Must have only the 5 imported questions (placeholder removed)');
  console.log('✓ Test A2 Passed: 5 questions imported into blank form -> exactly 5 sections, placeholder removed.\n');

  // Test A3: Excel import into a form with an intentional custom section preserves it
  console.log('Test A3: Excel import into a form with intentional custom section preserves it');
  const customFormA3 = await prisma.form.create({
    data: { title: 'Instructions Form', ownerId: testUser.id, isQuiz: true },
  });
  const customSecA3 = await prisma.formSection.create({
    data: { formId: customFormA3.id, title: 'Instructions & Guidelines', orderIndex: 0 },
  });

  const importReqA3 = new NextRequest(`http://localhost/api/forms/${customFormA3.id}/import-questions/from-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      createNewSection: true,
      questions: excel5Questions.slice(0, 2),
    }),
  });
  const importResA3 = await importExcelQuestionsHandler(importReqA3, { params: Promise.resolve({ id: customFormA3.id }) });
  const importDataA3 = await importResA3.json();

  assert.strictEqual(importDataA3.deletedSectionIds.length, 0, 'Must NOT delete intentional custom section');
  const dbSectionsA3 = await prisma.formSection.findMany({
    where: { formId: customFormA3.id },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(dbSectionsA3.length, 3, 'Must have 1 existing + 2 new = 3 sections');
  assert.strictEqual(dbSectionsA3[0].title, 'Instructions & Guidelines');
  assert.strictEqual(dbSectionsA3[1].title, 'Questions 1');
  assert.strictEqual(dbSectionsA3[2].title, 'question 2');
  console.log('✓ Test A3 Passed: Intentional section "Instructions & Guidelines" preserved.\n');

  // ---------------------------------------------------------------------------
  // GROUP B: 30 Questions Imported -> Exactly 30 Sections
  // ---------------------------------------------------------------------------
  console.log('--- GROUP B: 30 Questions Imported -> Exactly 30 Sections ---');

  // Test B1: Excel import of 30 questions into a fresh blank form
  console.log('Test B1: 30 Excel questions imported into fresh blank form');
  const createFormReqB1 = new NextRequest('http://localhost/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Safety Quiz 30 Questions', isQuiz: true }),
  });
  const createFormResB1 = await createFormHandler(createFormReqB1);
  const formIdB1 = (await createFormResB1.json()).form.id;

  const excel30Questions = Array.from({ length: 30 }, (_, i) => ({
    title: `Question ${i + 1}: What is standard procedure ${i + 1}?`,
    options: [
      { label: 'Follow SOP', isCorrect: true },
      { label: 'Ignore', isCorrect: false },
      { label: 'Escalate', isCorrect: false },
    ],
    marks: 2,
    correctAnswerText: 'Follow SOP',
  }));

  const importReqB1 = new NextRequest(`http://localhost/api/forms/${formIdB1}/import-questions/from-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      createNewSection: true,
      questions: excel30Questions,
    }),
  });
  const importResB1 = await importExcelQuestionsHandler(importReqB1, { params: Promise.resolve({ id: formIdB1 }) });
  const importDataB1 = await importResB1.json();

  assert.strictEqual(importDataB1.count, 30);
  assert.strictEqual(importDataB1.newSections.length, 30);
  assert.strictEqual(importDataB1.deletedSectionIds.length, 1);

  // Check section titles
  assert.strictEqual(importDataB1.newSections[0].title, 'Questions 1');
  assert.strictEqual(importDataB1.newSections[1].title, 'question 2');
  assert.strictEqual(importDataB1.newSections[29].title, 'question 30');

  // Verify in Database
  const dbSectionsB1 = await prisma.formSection.findMany({
    where: { formId: formIdB1 },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(dbSectionsB1.length, 30, 'Total sections in DB must be exactly 30, NOT 31!');
  assert.strictEqual(dbSectionsB1[0].title, 'Questions 1');
  assert.strictEqual(dbSectionsB1[0].orderIndex, 0);
  assert.strictEqual(dbSectionsB1[29].title, 'question 30');
  assert.strictEqual(dbSectionsB1[29].orderIndex, 29);

  // Check contiguity of orderIndex
  for (let i = 0; i < 30; i++) {
    assert.strictEqual(dbSectionsB1[i].orderIndex, i, `Section at index ${i} must have orderIndex ${i}`);
  }

  // Verify each question is mapped 1:1 to its section
  const dbQuestionsB1 = await prisma.formQuestion.findMany({
    where: { formId: formIdB1 },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(dbQuestionsB1.length, 30, 'Exactly 30 questions in DB');
  for (let i = 0; i < 30; i++) {
    assert.strictEqual(dbQuestionsB1[i].sectionId, dbSectionsB1[i].id, `Question ${i + 1} must belong to Section ${i + 1}`);
  }
  console.log('✓ Test B1 Passed: 30 Excel questions -> exactly 30 sections (no Section 31), 1:1 mapped.\n');

  // Test B2: FormCraft import of 30 questions into a fresh blank form
  console.log('Test B2: 30 FormCraft questions imported into fresh blank form');
  // Source form with 30 questions
  const srcFormB2 = await prisma.form.create({
    data: { title: 'Source Bank 30', ownerId: testUser.id, isQuiz: true },
  });
  const srcSecB2 = await prisma.formSection.create({
    data: { formId: srcFormB2.id, title: 'Bank Section', orderIndex: 0 },
  });
  const createdQuestionIds: string[] = [];
  for (let i = 0; i < 30; i++) {
    const q = await prisma.formQuestion.create({
      data: {
        formId: srcFormB2.id,
        sectionId: srcSecB2.id,
        title: `Bank Question ${i + 1}`,
        type: 'MULTIPLE_CHOICE',
        orderIndex: i,
        quizPoints: 1,
        options: {
          create: [{ label: 'Option 1', value: 'Option 1', orderIndex: 0 }],
        },
      },
    });
    createdQuestionIds.push(q.id);
  }

  // Create target blank form
  const createFormReqB2 = new NextRequest('http://localhost/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Target Bank Form B2', isQuiz: true }),
  });
  const formIdB2 = (await (await createFormHandler(createFormReqB2)).json()).form.id;

  const importReqB2 = new NextRequest(`http://localhost/api/forms/${formIdB2}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: srcFormB2.id,
      questionIds: createdQuestionIds,
      createNewSection: true,
    }),
  });
  const importResB2 = await importFcQuestionsHandler(importReqB2, { params: Promise.resolve({ id: formIdB2 }) });
  const importDataB2 = await importResB2.json();

  assert.strictEqual(importDataB2.count, 30);
  assert.strictEqual(importDataB2.newSections.length, 30);
  assert.strictEqual(importDataB2.deletedSectionIds.length, 1);

  const dbSectionsB2 = await prisma.formSection.findMany({
    where: { formId: formIdB2 },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(dbSectionsB2.length, 30, 'Total sections in DB must be exactly 30, NOT 31!');
  assert.strictEqual(dbSectionsB2[0].title, 'Questions 1');
  assert.strictEqual(dbSectionsB2[29].title, 'question 30');
  console.log('✓ Test B2 Passed: 30 FormCraft questions -> exactly 30 sections (no Section 31).\n');

  // ---------------------------------------------------------------------------
  // GROUP C: Persistence & Data Integrity
  // ---------------------------------------------------------------------------
  console.log('--- GROUP C: Persistence & Data Integrity ---');

  // Test C1: Verify form persistence by reloading full form with sections and questions
  console.log('Test C1: Full database reload of imported form');
  const reloadedForm = await prisma.form.findUnique({
    where: { id: formIdB1 },
    include: {
      sections: {
        include: { questions: { include: { options: true } } },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });
  assert(reloadedForm, 'Form must exist in database');
  assert.strictEqual(reloadedForm.sections.length, 30, 'Must persist exactly 30 sections');
  reloadedForm.sections.forEach((sec, idx) => {
    assert.strictEqual(sec.orderIndex, idx);
    assert.strictEqual(sec.questions.length, 1, `Section ${idx + 1} must contain exactly 1 question`);
    assert.strictEqual(sec.questions[0].options.length, 3);
  });
  console.log('✓ Test C1 Passed: Full reload verified contiguity and 1:1 mapping.\n');

  // ---------------------------------------------------------------------------
  // GROUP D: Quiz Mode, Public View, Navigation & Shuffling Compatibility
  // ---------------------------------------------------------------------------
  console.log('--- GROUP D: Quiz Mode, Public View & Shuffling Compatibility ---');

  // Test D1: Publish form and verify public form payload has 30 sections
  console.log('Test D1: Public form initialization returns 30 sections starting at Section 1');
  const pubFormB1 = await prisma.form.update({
    where: { id: formIdB1 },
    data: { status: 'PUBLISHED' },
  });

  const publicReq = new NextRequest(`http://localhost/api/public/forms/${pubFormB1.publicId}`);
  const publicRes = await getPublicFormHandler(publicReq, { params: Promise.resolve({ publicId: pubFormB1.publicId }) });
  assert.strictEqual(publicRes.status, 200);
  const publicData = await publicRes.json();

  assert.strictEqual(publicData.form.sections.length, 30, 'Public form must have 30 sections');
  const totalQuestions = publicData.form.sections.reduce((acc: number, s: any) => acc + s.questions.length, 0);
  assert.strictEqual(totalQuestions, 30, 'Public form must have 30 questions');
  assert.strictEqual(publicData.form.sections[0].title, 'Questions 1');
  assert.strictEqual(publicData.form.sections[29].title, 'question 30');
  console.log('✓ Test D1 Passed: Public form returns 30 sections starting with Section 1: "Questions 1".\n');

  // Test D2: Create quiz attempt with shuffle enabled
  console.log('Test D2: Quiz attempt creation with shuffle enabled across 30 sections');
  // Enable shuffle
  await prisma.formSettings.update({
    where: { formId: formIdB1 },
    data: { shuffleQuestions: true },
  });

  const attemptReq1 = new NextRequest(`http://localhost/api/public/forms/${pubFormB1.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'EMP_TEST_1' }),
  });
  const attemptRes1 = await attemptHandler(attemptReq1, { params: Promise.resolve({ publicId: pubFormB1.publicId }) });
  assert.strictEqual(attemptRes1.status, 200);
  const attemptData1 = await attemptRes1.json();
  assert(attemptData1.attempt.questionOrder, 'Attempt must have shuffled questionOrder');
  assert.strictEqual(attemptData1.attempt.questionOrder.length, 30);

  const attemptReq2 = new NextRequest(`http://localhost/api/public/forms/${pubFormB1.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'EMP_TEST_2' }),
  });
  const attemptRes2 = await attemptHandler(attemptReq2, { params: Promise.resolve({ publicId: pubFormB1.publicId }) });
  assert.strictEqual(attemptRes2.status, 200);
  const attemptData2 = await attemptRes2.json();
  assert.strictEqual(attemptData2.attempt.questionOrder.length, 30);

  console.log('✓ Test D2 Passed: Shuffled quiz attempts created cleanly across all 30 sections.\n');

  console.log('========================================================================');
  console.log(' ALL REGRESSION TESTS PASSED (Groups A, B, C, D)                        ');
  console.log('========================================================================\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
