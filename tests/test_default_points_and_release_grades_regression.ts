import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { POST as createFormHandler } from '../src/app/api/forms/route';
import { POST as createQuestionHandler } from '../src/app/api/forms/[id]/questions/route';
import { PATCH as updateFormHandler } from '../src/app/api/forms/[id]/route';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { signToken } from '../src/lib/auth/jwt';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/session';

async function runRegressionSuite() {
  console.log('=== Starting Regression Suite: Default Points & Release Grades Removal ===\n');

  // Setup test user
  const user = await prisma.user.upsert({
    where: { email: 'regression_engineer@example.com' },
    update: {},
    create: {
      email: 'regression_engineer@example.com',
      name: 'Regression Engineer',
      passwordHash: 'dummy-hashed-pwd',
      role: 'ADMIN',
    },
  });

  const authToken = signToken({ userId: user.id, email: user.email, role: 'ADMIN' });

  // --------------------------------------------------------------------------
  // TEST 1: Blank Quiz Form creation initializes Question 1 with Default Points (1)
  // Non-quiz form initializes Question 1 with 0 points
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Blank Quiz Form creation initializes Question 1 with default points (1) vs non-quiz (0) ---');

  // 1A. Non-quiz form
  const nonQuizReq = new NextRequest('http://localhost:3000/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Standard Non-Quiz Form',
      isQuiz: false,
    }),
  });
  nonQuizReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const nonQuizRes = await createFormHandler(nonQuizReq);
  assert.strictEqual(nonQuizRes.status, 200, 'Non-quiz form creation should succeed');
  const nonQuizData = await nonQuizRes.json();
  const nonQuizId = nonQuizData.form.id;

  const nonQuizQuestions = await prisma.formQuestion.findMany({ where: { formId: nonQuizId } });
  assert.strictEqual(nonQuizQuestions.length, 1, 'Should have 1 default question');
  assert.strictEqual(nonQuizQuestions[0].quizPoints, 0, 'Non-quiz default question must have quizPoints = 0');
  console.log('✓ Non-quiz form Question 1 correctly has quizPoints = 0.');

  // 1B. Quiz form (default settings)
  const quizReq = new NextRequest('http://localhost:3000/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Default Quiz Form',
      isQuiz: true,
    }),
  });
  quizReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const quizRes = await createFormHandler(quizReq);
  assert.strictEqual(quizRes.status, 200, 'Quiz form creation should succeed');
  const quizData = await quizRes.json();
  const quizId = quizData.form.id;

  const quizSettings = await prisma.formSettings.findUnique({ where: { formId: quizId } });
  assert.strictEqual(quizSettings?.quizDefaultPoints, 1, 'Form settings quizDefaultPoints must be 1');

  const quizQuestions = await prisma.formQuestion.findMany({ where: { formId: quizId } });
  assert.strictEqual(quizQuestions.length, 1, 'Should have 1 default question');
  assert.strictEqual(quizQuestions[0].quizPoints, 1, 'Newly created question in quiz mode must have quizPoints = 1 (not 0)');
  console.log('✓ Quiz form Question 1 correctly initialized with quizPoints = 1.');

  // --------------------------------------------------------------------------
  // TEST 2: Creating a form with custom default points (e.g. 5)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Creating a form with custom default points = 5 ---');
  const customQuizReq = new NextRequest('http://localhost:3000/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Custom 5pt Quiz Form',
      isQuiz: true,
      settings: {
        quizDefaultPoints: 5,
      },
    }),
  });
  customQuizReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const customQuizRes = await createFormHandler(customQuizReq);
  assert.strictEqual(customQuizRes.status, 200);
  const customQuizData = await customQuizRes.json();
  const customQuizId = customQuizData.form.id;

  const customSettings = await prisma.formSettings.findUnique({ where: { formId: customQuizId } });
  assert.strictEqual(customSettings?.quizDefaultPoints, 5, 'Form settings quizDefaultPoints must be 5');

  const customQuizQuestions = await prisma.formQuestion.findMany({ where: { formId: customQuizId } });
  assert.strictEqual(customQuizQuestions[0].quizPoints, 5, 'Question 1 must be initialized to 5 points');
  console.log('✓ Question 1 in 5-pt quiz correctly initialized with quizPoints = 5.');

  // --------------------------------------------------------------------------
  // TEST 3: Adding questions in quiz mode uses default points (1 and 5)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Adding new questions dynamically with default points 1 and 5 ---');
  const form1Sections = await prisma.formSection.findMany({ where: { formId: quizId } });
  const form1SecId = form1Sections[0].id;

  // Add question to quizId (which has default = 1) without specifying quizPoints
  const addQ1Req = new NextRequest(`http://localhost:3000/api/forms/${quizId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: form1SecId,
      title: 'Question with Default Points',
      type: 'MULTIPLE_CHOICE',
    }),
  });
  addQ1Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const addQ1Res = await createQuestionHandler(addQ1Req, { params: Promise.resolve({ id: quizId }) });
  assert.strictEqual(addQ1Res.status, 200);
  const addQ1Data = await addQ1Res.json();
  assert.strictEqual(addQ1Data.question.quizPoints, 1, 'Dynamically added question must receive default points = 1');
  console.log('✓ Newly added question in quiz mode received default points = 1.');

  // Update default points to 5 in quizId
  const updateSettingsReq = new NextRequest(`http://localhost:3000/api/forms/${quizId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 5 },
    }),
  });
  updateSettingsReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  const updateSettingsRes = await updateFormHandler(updateSettingsReq, { params: Promise.resolve({ id: quizId }) });
  assert.strictEqual(updateSettingsRes.status, 200);

  // Add question after default was changed to 5
  const addQ2Req = new NextRequest(`http://localhost:3000/api/forms/${quizId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: form1SecId,
      title: 'Question Created After Default Changed to 5',
      type: 'MULTIPLE_CHOICE',
    }),
  });
  addQ2Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  const addQ2Res = await createQuestionHandler(addQ2Req, { params: Promise.resolve({ id: quizId }) });
  const addQ2Data = await addQ2Res.json();
  assert.strictEqual(addQ2Data.question.quizPoints, 5, 'New question after changing default to 5 must have quizPoints = 5');
  console.log('✓ Subsequently created question after default change received 5 points.');

  // --------------------------------------------------------------------------
  // TEST 4: Changing default updates existing questions to the new default
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Changing default updates existing questions to the new default ---');
  // In Test 3, changing default to 5 updated existing questions to 5
  const q1After5 = await prisma.formQuestion.findUnique({ where: { id: quizQuestions[0].id } });
  assert.strictEqual(q1After5?.quizPoints, 5, 'Question 1 must be updated to 5 when default changed to 5');

  // Change default to 8 via updateFormHandler
  const changeTo8Req = new NextRequest(`http://localhost:3000/api/forms/${quizId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { quizDefaultPoints: 8 },
    }),
  });
  changeTo8Req.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateFormHandler(changeTo8Req, { params: Promise.resolve({ id: quizId }) });

  // Verify all questions are updated to 8
  const q1After8 = await prisma.formQuestion.findUnique({ where: { id: quizQuestions[0].id } });
  const addQ1After8 = await prisma.formQuestion.findUnique({ where: { id: addQ1Data.question.id } });
  const addQ2After8 = await prisma.formQuestion.findUnique({ where: { id: addQ2Data.question.id } });

  assert.strictEqual(q1After8?.quizPoints, 8, 'Question 1 must be updated to 8');
  assert.strictEqual(addQ1After8?.quizPoints, 8, 'addQ1 must be updated to 8');
  assert.strictEqual(addQ2After8?.quizPoints, 8, 'addQ2 must be updated to 8');

  // Manually customize addQ1 to 10 points
  await prisma.formQuestion.update({
    where: { id: addQ1Data.question.id },
    data: { quizPoints: 10 },
  });

  // Subsequent form update with same default (8) preserves customization
  const sameDefaultReq = new NextRequest(`http://localhost:3000/api/forms/${quizId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Updated Title',
      settings: { quizDefaultPoints: 8 },
    }),
  });
  sameDefaultReq.cookies.set(SESSION_COOKIE_NAME, authToken);
  await updateFormHandler(sameDefaultReq, { params: Promise.resolve({ id: quizId }) });

  const addQ1Preserved = await prisma.formQuestion.findUnique({ where: { id: addQ1Data.question.id } });
  assert.strictEqual(addQ1Preserved?.quizPoints, 10, 'Individual customization (10) must be preserved when default does not change');
  console.log('✓ Changing default updated all existing questions, and individual customizations are preserved until default changes.');

  // --------------------------------------------------------------------------
  // TEST 5: Verify Release Grades section is completely absent from SettingsTab.tsx
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Verify Release Grades UI is completely absent from SettingsTab.tsx ---');
  const settingsTabPath = path.resolve(process.cwd(), 'src/components/form-builder/SettingsTab.tsx');
  const settingsTabContent = fs.readFileSync(settingsTabPath, 'utf-8');

  // Verify absence of "Release Grades" section header and options
  assert.strictEqual(
    settingsTabContent.includes('Release Grades'),
    false,
    'SettingsTab.tsx must NOT contain "Release Grades" heading'
  );
  assert.strictEqual(
    settingsTabContent.includes('Immediately after each submission'),
    false,
    'SettingsTab.tsx must NOT contain "Immediately after each submission"'
  );
  assert.strictEqual(
    settingsTabContent.includes('Later, after manual review'),
    false,
    'SettingsTab.tsx must NOT contain "Later, after manual review"'
  );
  assert.strictEqual(
    settingsTabContent.includes('quizReleaseGrade'),
    false,
    'SettingsTab.tsx must NOT contain quizReleaseGrade controls or event handlers'
  );
  console.log('✓ Release Grades heading, cards, descriptions, and controls are completely absent from SettingsTab.tsx.');

  // Verify remaining quiz settings are preserved
  assert.ok(settingsTabContent.includes('Show points earned'), 'Show points earned setting must be preserved');
  assert.ok(settingsTabContent.includes('quizShowPointsEarned'), 'quizShowPointsEarned must be preserved');
  assert.ok(settingsTabContent.includes('Default Points per Question'), 'Default Points per Question must be preserved');
  assert.ok(settingsTabContent.includes('quizDefaultPoints'), 'quizDefaultPoints must be preserved');
  assert.ok(settingsTabContent.includes('Passing Score Threshold'), 'Passing Score Threshold must be preserved');
  console.log('✓ Remaining quiz settings ("Show points earned", "Default Points", "Passing Score") are intact.');

  // --------------------------------------------------------------------------
  // TEST 6: Quiz submissions, answer validation, scoring, and response storage work correctly
  // Grades are released immediately
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Quiz submissions release immediately and score accurately ---');
  // Configure quizId questions with answer keys
  await prisma.formQuestion.update({
    where: { id: quizQuestions[0].id },
    data: {
      quizPoints: 5,
      quizAnswer: { correctValue: 'Option 1' },
    },
  });
  await prisma.formQuestion.update({
    where: { id: addQ1Data.question.id },
    data: {
      quizPoints: 10,
      quizAnswer: { correctValue: 'Option 1' },
    },
  });
  await prisma.formQuestion.update({
    where: { id: addQ2Data.question.id },
    data: {
      quizPoints: 5,
    },
  });
  await prisma.form.update({
    where: { id: quizId },
    data: { status: 'PUBLISHED' },
  });

  const fullForm = await prisma.form.findUnique({
    where: { id: quizId },
    include: { settings: true },
  });

  const subReq = new NextRequest(`http://localhost:3000/api/public/forms/${fullForm!.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondentEmail: 'test_student@example.com',
      answers: [
        { questionId: quizQuestions[0].id, value: 'Option 1' }, // Correct: 5 pts
        { questionId: addQ1Data.question.id, value: 'Option 2' }, // Wrong: 0 pts
      ],
    }),
  });

  const subRes = await submitHandler(subReq, { params: Promise.resolve({ publicId: fullForm!.publicId }) });
  assert.strictEqual(subRes.status, 200, 'Quiz submission should succeed');
  const subData = await subRes.json();

  assert.strictEqual(subData.isGradeReleased, true, 'isGradeReleased must be true');
  assert.strictEqual(subData.score.total, 5, 'Earned points (total) should be 5');
  assert.strictEqual(subData.score.max, 20, 'Max points should be sum of all quiz questions (5 + 10 + 5)');
  assert.ok(subData.score.breakdown.length >= 2, 'Breakdown should be returned immediately');
  console.log(`✓ Submission correctly released grade immediately with earned score: ${subData.score.total}/${subData.score.max}.`);

  // Verify database record
  const dbSub = await prisma.formSubmission.findUnique({
    where: { id: subData.submissionId },
  });
  assert.strictEqual(dbSub?.isGradeReleased, true, 'Database record must have isGradeReleased = true');
  assert.strictEqual(dbSub?.totalScore, 5, 'Database record must store correct totalScore = 5');
  console.log('✓ Database submission record confirmed with isGradeReleased = true and totalScore = 5.');

  // Clean up test forms
  await prisma.form.deleteMany({
    where: {
      id: { in: [nonQuizId, quizId, customQuizId] },
    },
  });

  console.log('\n=== ALL REGRESSION TESTS PASSED SUCCESSFULLY! ===');
}

runRegressionSuite().catch((err) => {
  console.error('\n❌ Regression test failed:', err);
  process.exit(1);
});
