import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { POST as createFormHandler } from '../src/app/api/forms/route';
import { GET as getFormHandler, PATCH as updateFormHandler } from '../src/app/api/forms/[id]/route';
import { POST as createQuestionHandler } from '../src/app/api/forms/[id]/questions/route';
import { PATCH as updateQuestionHandler } from '../src/app/api/forms/[id]/questions/[questionId]/route';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { signToken } from '../src/lib/auth/jwt';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/session';

async function runTest() {
  console.log('=== Running Regression Test: Default Points per Question Global Update & Customization ===\n');

  // Setup test user
  const user = await prisma.user.upsert({
    where: { email: 'quiz_points_engineer@example.com' },
    update: {},
    create: {
      email: 'quiz_points_engineer@example.com',
      name: 'Quiz Points Engineer',
      passwordHash: 'hashed-pwd',
      role: 'ADMIN',
    },
  });

  const authToken = signToken({ userId: user.id, email: user.email, role: 'ADMIN' });

  // -------------------------------------------------------------------------
  // 1. Initial Default (default = 1)
  // -------------------------------------------------------------------------
  console.log('--- Requirement 1: Initial Default (1 pt) ---');
  const createReq = new NextRequest('http://localhost:3000/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Global Points Test Quiz',
      isQuiz: true,
      settings: {
        quizDefaultPoints: 1,
      },
    }),
  });
  createReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const createRes = await createFormHandler(createReq);
  assert.strictEqual(createRes.status, 200, 'Form creation should succeed');
  const createData = await createRes.json();
  const formId = createData.form.id;

  // Verify Question 1 has 1 point initially
  const questions1 = await prisma.formQuestion.findMany({
    where: { formId },
    orderBy: { orderIndex: 'asc' },
  });
  assert.strictEqual(questions1.length, 1);
  const q1Id = questions1[0].id;
  assert.strictEqual(questions1[0].quizPoints, 1, 'Question 1 must have 1 point');

  // Add Question 2 - should inherit current default (1)
  const sec = await prisma.formSection.findFirst({ where: { formId } });
  const addQ2Req = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: sec!.id,
      title: 'Question 2',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 1,
      quizAnswer: { correctValue: 'Option 1' },
      options: [{ label: 'Option 1', value: 'Option 1', orderIndex: 0 }],
    }),
  });
  addQ2Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const addQ2Res = await createQuestionHandler(addQ2Req, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(addQ2Res.status, 200);
  const addQ2Data = await addQ2Res.json();
  const q2Id = addQ2Data.question.id;
  assert.strictEqual(addQ2Data.question.quizPoints, 1, 'Newly created Question 2 must start at 1 point');
  console.log('✓ Initial default points (1) applied to Question 1 and newly created Question 2.');

  // Configure Question 1 answer key
  const updateQ1KeyReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions/${q1Id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quizAnswer: { correctValue: 'Option 1' },
      options: [{ label: 'Option 1', value: 'Option 1', orderIndex: 0 }],
    }),
  });
  updateQ1KeyReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateQuestionHandler(updateQ1KeyReq, { params: Promise.resolve({ id: formId, questionId: q1Id }) });

  // -------------------------------------------------------------------------
  // 2. Change Default Globally to 5
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 2: Change Default Globally from 1 to 5 ---');
  const changeTo5Req = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 5 },
    }),
  });
  changeTo5Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const changeTo5Res = await updateFormHandler(changeTo5Req, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(changeTo5Res.status, 200);

  // Verify all existing questions updated to 5
  const freshQ1_after5 = await prisma.formQuestion.findUnique({ where: { id: q1Id } });
  const freshQ2_after5 = await prisma.formQuestion.findUnique({ where: { id: q2Id } });
  assert.strictEqual(freshQ1_after5?.quizPoints, 5, 'Question 1 must be updated to 5');
  assert.strictEqual(freshQ2_after5?.quizPoints, 5, 'Question 2 must be updated to 5');

  // Verify newly created questions start at 5
  const addQ3Req = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: sec!.id,
      title: 'Question 3',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 2,
    }),
  });
  addQ3Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const addQ3Res = await createQuestionHandler(addQ3Req, { params: Promise.resolve({ id: formId }) });
  const addQ3Data = await addQ3Res.json();
  const q3Id = addQ3Data.question.id;
  assert.strictEqual(addQ3Data.question.quizPoints, 5, 'Question 3 created when default is 5 must have 5 points');
  console.log('✓ All existing questions updated to 5 and new Question 3 started at 5.');

  // -------------------------------------------------------------------------
  // 3. Individual Customization (Question 1 changed to 2 while Question 2 remains 5)
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 3: Individual Customization (Question 1 -> 2, Question 2 -> 5) ---');
  const customQ1Req = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions/${q1Id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quizPoints: 2,
    }),
  });
  customQ1Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const customQ1Res = await updateQuestionHandler(customQ1Req, { params: Promise.resolve({ id: formId, questionId: q1Id }) });
  assert.strictEqual(customQ1Res.status, 200);

  // Trigger form auto-save with SAME default points (5) to verify individual points are NOT overwritten
  const autoSaveReq = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Global Points Test Quiz (Auto-Saved)',
      settings: { quizDefaultPoints: 5 },
    }),
  });
  autoSaveReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateFormHandler(autoSaveReq, { params: Promise.resolve({ id: formId }) });

  const freshQ1_afterCustom = await prisma.formQuestion.findUnique({ where: { id: q1Id } });
  const freshQ2_afterCustom = await prisma.formQuestion.findUnique({ where: { id: q2Id } });
  assert.strictEqual(freshQ1_afterCustom?.quizPoints, 2, 'Question 1 must remain at 2');
  assert.strictEqual(freshQ2_afterCustom?.quizPoints, 5, 'Question 2 must remain at 5');
  console.log('✓ Question 1 customized to 2 points while Question 2 remains at 5 points (auto-save preserved it).');

  // -------------------------------------------------------------------------
  // 4. Change Default Again Globally from 5 to 4
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 4: Change Default Again Globally to 4 (Overrides Customizations) ---');
  const changeTo4Req = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 4 },
    }),
  });
  changeTo4Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const changeTo4Res = await updateFormHandler(changeTo4Req, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(changeTo4Res.status, 200);

  // Verify EVERY question (including Question 1 previously customized to 2) is now 4
  const freshQ1_after4 = await prisma.formQuestion.findUnique({ where: { id: q1Id } });
  const freshQ2_after4 = await prisma.formQuestion.findUnique({ where: { id: q2Id } });
  const freshQ3_after4 = await prisma.formQuestion.findUnique({ where: { id: q3Id } });
  assert.strictEqual(freshQ1_after4?.quizPoints, 4, 'Question 1 must now be 4');
  assert.strictEqual(freshQ2_after4?.quizPoints, 4, 'Question 2 must now be 4');
  assert.strictEqual(freshQ3_after4?.quizPoints, 4, 'Question 3 must now be 4');

  // Verify new question starts at 4
  const addQ4Req = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: sec!.id,
      title: 'Question 4',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 3,
    }),
  });
  addQ4Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const addQ4Res = await createQuestionHandler(addQ4Req, { params: Promise.resolve({ id: formId }) });
  const addQ4Data = await addQ4Res.json();
  assert.strictEqual(addQ4Data.question.quizPoints, 4, 'Question 4 created when default is 4 must have 4 points');
  console.log('✓ Changing default to 4 updated all questions (including customized Q1) to 4, and new Q4 started at 4.');

  // -------------------------------------------------------------------------
  // 5. Support Any Valid Configured Value (e.g. 0 points, 3 points, etc.)
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 5: Support Any Valid Value (e.g. 0 and 3) ---');
  const changeTo0Req = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 0 },
    }),
  });
  changeTo0Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateFormHandler(changeTo0Req, { params: Promise.resolve({ id: formId }) });

  const freshQ1_after0 = await prisma.formQuestion.findUnique({ where: { id: q1Id } });
  assert.strictEqual(freshQ1_after0?.quizPoints, 0, 'Question 1 must be 0 points when default is 0');

  // Change to 3
  const changeTo3Req = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 3 },
    }),
  });
  changeTo3Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateFormHandler(changeTo3Req, { params: Promise.resolve({ id: formId }) });

  const freshQ1_after3 = await prisma.formQuestion.findUnique({ where: { id: q1Id } });
  const freshQ2_after3 = await prisma.formQuestion.findUnique({ where: { id: q2Id } });
  assert.strictEqual(freshQ1_after3?.quizPoints, 3, 'Question 1 must be 3 points');
  assert.strictEqual(freshQ2_after3?.quizPoints, 3, 'Question 2 must be 3 points');
  console.log('✓ Valid values 0 and 3 correctly updated questions globally.');

  // -------------------------------------------------------------------------
  // 6. Persistence across Reopen / GET /api/forms/[id]
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 6: Persistence across Form Reopen / Refresh ---');
  const getReq = new NextRequest(`http://localhost:3000/api/forms/${formId}`);
  getReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const getRes = await getFormHandler(getReq, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.form.settings.quizDefaultPoints, 3, 'GET form must return quizDefaultPoints = 3');

  const loadedQuestions = getData.form.sections.flatMap(
    (s: { questions: { id: string; title: string; quizPoints: number }[] }) => s.questions
  );
  for (const q of loadedQuestions) {
    assert.strictEqual(q.quizPoints, 3, `Loaded question ${q.title} must have quizPoints = 3`);
  }
  console.log('✓ Reopening form via GET /api/forms/[id] returns persisted 3 points for all questions.');

  // -------------------------------------------------------------------------
  // 7. Accurate Quiz Scoring & Calculations
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 7: Accurate Quiz Scoring & Calculations ---');
  // Form has 4 questions: Q1 (3 pts), Q2 (3 pts), Q3 (3 pts), Q4 (3 pts) => Total possible = 12 pts
  // Customize Q1 to 6 pts and Q2 to 4 pts (Q3 is 3, Q4 is 3) => Total possible = 6 + 4 + 3 + 3 = 16 pts
  const setQ1CustomReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions/${q1Id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quizPoints: 6 }),
  });
  setQ1CustomReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateQuestionHandler(setQ1CustomReq, { params: Promise.resolve({ id: formId, questionId: q1Id }) });

  const setQ2CustomReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions/${q2Id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quizPoints: 4 }),
  });
  setQ2CustomReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateQuestionHandler(setQ2CustomReq, { params: Promise.resolve({ id: formId, questionId: q2Id }) });

  // Publish form so it can be submitted
  const publishForm = await prisma.form.update({
    where: { id: formId },
    data: { status: 'PUBLISHED' },
    select: { publicId: true },
  });

  // Submit response: Answer Q1 correctly (earns 6 pts) and Q2 incorrectly (earns 0 pts)
  const submitReq = new NextRequest(`http://localhost:3000/api/public/forms/${publishForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: q1Id, value: 'Option 1' }, // Correct => 6 points
        { questionId: q2Id, value: 'Wrong Answer' }, // Wrong => 0 points
      ],
    }),
  });
  const submitRes = await submitHandler(submitReq, { params: Promise.resolve({ publicId: publishForm.publicId }) });
  assert.strictEqual(submitRes.status, 200);
  const submitData = await submitRes.json();

  assert(submitData.score, 'Submission must return score data');
  assert.strictEqual(submitData.score.total, 6, 'Earned points must be 6 (from Q1)');
  assert.strictEqual(submitData.score.max, 16, 'Total max score must be 16 (6 + 4 + 3 + 3)');
  const expectedPercentage = Math.round((6 / 16) * 100); // 38%
  assert.strictEqual(submitData.score.percentage, expectedPercentage, `Percentage must be ${expectedPercentage}%`);
  console.log(`✓ Accurate quiz scoring verified: Earned ${submitData.score.total}/${submitData.score.max} (${submitData.score.percentage}%).`);

  // -------------------------------------------------------------------------
  // 8. Rapid Default Changes (Concurrency & Race Condition Safety)
  // -------------------------------------------------------------------------
  console.log('\n--- Requirement 8: Rapid Default Changes Handling ---');
  // Fire rapid consecutive default changes: 2 -> 7 -> 9
  const promises = [2, 7, 9].map((val) => {
    const req = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: { quizDefaultPoints: val },
      }),
    });
    req.cookies.set(SESSION_COOKIE_NAME, authToken);
    return updateFormHandler(req, { params: Promise.resolve({ id: formId }) });
  });

  await Promise.all(promises);

  // Check the final state matches the final saved settings
  const finalSettings = await prisma.formSettings.findUnique({ where: { formId } });
  const finalQuestions = await prisma.formQuestion.findMany({ where: { formId } });
  for (const q of finalQuestions) {
    assert.strictEqual(
      q.quizPoints,
      finalSettings!.quizDefaultPoints,
      `All questions must be consistent with final settings default (${finalSettings!.quizDefaultPoints})`
    );
  }
  console.log(`✓ Rapid changes resolved cleanly. All questions consistent with final default points: ${finalSettings!.quizDefaultPoints}.`);

  console.log('\n=== ALL REGRESSION TESTS PASSED SUCCESSFULLY! ===');
}

runTest()
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
