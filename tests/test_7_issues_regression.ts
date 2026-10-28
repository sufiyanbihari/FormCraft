import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { GET as getEditHandler, PUT as putEditHandler } from '../src/app/api/public/forms/[publicId]/submissions/edit/route';
import { POST as createQuestionHandler } from '../src/app/api/forms/[id]/questions/route';
import { resolveParticipantIdentifier } from '../src/lib/submission/duplicatePreventionService';
import fs from 'node:fs';
import path from 'node:path';

async function runRegressionTests() {
  console.log('🚀 Starting regression tests for all 7 issues...\n');

  // Find or create test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: `test_user_${Date.now()}@formcraft.local`,
        name: 'Test Engineer',
        passwordHash: 'dummy_hash',
      },
    });
  }

  // =========================================================================
  // ISSUE 1: Response Editing & Duplicate Prevention Handling
  // =========================================================================
  console.log('--- Testing Issue 1: Response editing enforcement and Submit another response ---');

  // Form 1A: allowResponseEditing = false
  const form1A = await prisma.form.create({
    data: {
      title: 'Issue 1A: Editing Disabled',
      status: 'PUBLISHED',
      ownerId: user.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          allowResponseEditing: false,
          restrictOneResponse: false,
        },
      },
      sections: {
        create: {
          title: 'Section 1',
          orderIndex: 0,
        },
      },
    },
    include: { sections: true, settings: true },
  });

  const q1A = await prisma.formQuestion.create({
    data: {
      formId: form1A.id,
      sectionId: form1A.sections[0].id,
      title: 'Your Name',
      type: 'SHORT_ANSWER',
      isRequired: true,
      orderIndex: 0,
    },
  });

  // Submit response to form 1A
  const subReq1A = new NextRequest(`http://localhost:3000/api/public/forms/${form1A.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: q1A.id, value: 'Alice' }],
    }),
  });
  const subRes1A = await submitHandler(subReq1A, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(subRes1A.status, 200, 'Submission 1A should succeed');
  const subData1A = await subRes1A.json();

  // Assert editToken is hidden from client when allowResponseEditing is false
  assert.strictEqual(subData1A.editToken, undefined, 'editToken must NOT be returned when allowResponseEditing is OFF');

  // Try to directly access edit route with the internal DB token
  const dbSub1A = await prisma.formSubmission.findUnique({ where: { id: subData1A.submissionId } });
  assert.ok(dbSub1A?.editToken, 'DB has internal token');

  const editGetReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${form1A.publicId}/submissions/edit?editToken=${dbSub1A!.editToken}`,
    { method: 'GET' }
  );
  const editGetRes = await getEditHandler(editGetReq, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(editGetRes.status, 403, 'GET /submissions/edit must return 403 when allowResponseEditing is OFF');

  const editPutReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${form1A.publicId}/submissions/edit`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken: dbSub1A!.editToken,
        answers: [{ questionId: q1A.id, value: 'Alice Edited' }],
      }),
    }
  );
  const editPutRes = await putEditHandler(editPutReq, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(editPutRes.status, 403, 'PUT /submissions/edit must return 403 when allowResponseEditing is OFF');

  // Submit another response: since restrictOneResponse is false, another response is permitted
  const subReq1A_another = new NextRequest(`http://localhost:3000/api/public/forms/${form1A.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: q1A.id, value: 'Alice Second Response' }],
    }),
  });
  const subRes1A_another = await submitHandler(subReq1A_another, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(subRes1A_another.status, 200, 'Submitting another response must succeed when restrictOneResponse is OFF');

  // Now test with restrictOneResponse: true (duplicate prevention ON)
  await prisma.formSettings.update({
    where: { formId: form1A.id },
    data: { restrictOneResponse: true, duplicateIdentifierMethod: 'IP_ADDRESS' },
  });

  const subReq1A_dupe = new NextRequest(`http://localhost:3000/api/public/forms/${form1A.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
    body: JSON.stringify({
      answers: [{ questionId: q1A.id, value: 'Alice Duplicate 1' }],
    }),
  });
  const subRes1A_dupe1 = await submitHandler(subReq1A_dupe, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(subRes1A_dupe1.status, 200);

  const subReq1A_dupe2 = new NextRequest(`http://localhost:3000/api/public/forms/${form1A.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
    body: JSON.stringify({
      answers: [{ questionId: q1A.id, value: 'Alice Duplicate 2' }],
    }),
  });
  const subRes1A_dupe2 = await submitHandler(subReq1A_dupe2, { params: Promise.resolve({ publicId: form1A.publicId }) });
  assert.strictEqual(subRes1A_dupe2.status, 409, 'Duplicate submission must be rejected when restrictOneResponse is ON');
  const dupeData = await subRes1A_dupe2.json();
  assert.strictEqual(dupeData.canEdit, false, 'canEdit must be false when allowResponseEditing is OFF');
  assert.strictEqual(dupeData.editToken, undefined, 'editToken must be undefined when allowResponseEditing is OFF');
  console.log('✓ Issue 1 Passed: Response editing blocked on backend, editToken hidden, duplicate prevention enforced.\n');

  // =========================================================================
  // ISSUE 2: Quiz Back button styling
  // =========================================================================
  console.log('--- Testing Issue 2: Quiz Back button styling & accessibility ---');
  const pageFile = fs.readFileSync(path.join(process.cwd(), 'src/app/f/[publicId]/page.tsx'), 'utf-8');
  assert.ok(!pageFile.includes("isDarkBg\n                    ? 'bg-white text-gray-800"), 'Old low-contrast white bg on dark must be removed');
  assert.ok(pageFile.includes('disabled={isSubmitting || sectionHistory.length <= 1}'), 'Back button must have disabled condition');
  assert.ok(pageFile.includes('disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed'), 'Back button must have disabled styling');
  assert.ok(pageFile.includes('focus-visible:ring-2'), 'Back button must have keyboard focus state');
  console.log('✓ Issue 2 Passed: Back button styling is high-contrast, theme-consistent, and has proper hover/focus/disabled states.\n');

  // =========================================================================
  // ISSUE 3: Hide quiz points when "Show points earned" is OFF
  // =========================================================================
  console.log('--- Testing Issue 3: Hide quiz points when quizShowPointsEarned is OFF ---');
  const quizFormPointsHidden = await prisma.form.create({
    data: {
      title: 'Issue 3: Quiz Points Hidden',
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: user.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizShowPointsEarned: false, // OFF
          quizReleaseGrade: 'IMMEDIATE',
        },
      },
      sections: {
        create: {
          title: 'Quiz Section',
          orderIndex: 0,
        },
      },
    },
    include: { sections: true },
  });

  const quizQ = await prisma.formQuestion.create({
    data: {
      formId: quizFormPointsHidden.id,
      sectionId: quizFormPointsHidden.sections[0].id,
      title: 'What is 2 + 2?',
      type: 'MULTIPLE_CHOICE',
      quizPoints: 5,
      quizAnswer: { correctValue: '4' },
      orderIndex: 0,
    },
  });

  const quizSubReq = new NextRequest(`http://localhost:3000/api/public/forms/${quizFormPointsHidden.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: quizQ.id, value: '4' }],
    }),
  });
  const quizSubRes = await submitHandler(quizSubReq, { params: Promise.resolve({ publicId: quizFormPointsHidden.publicId }) });
  const quizSubData = await quizSubRes.json();

  assert.strictEqual(quizSubRes.status, 200);
  assert.ok(quizSubData.score, 'Quiz score object is present');
  assert.strictEqual(quizSubData.score.showPoints, false, 'showPoints must be false');
  assert.strictEqual(quizSubData.score.total, undefined, 'total points must be undefined/omitted');
  assert.strictEqual(quizSubData.score.max, undefined, 'max points must be undefined/omitted');
  assert.strictEqual(quizSubData.score.percentage, undefined, 'percentage must be undefined/omitted');

  // Also verify confirmation page JSX hides score summary when showPoints is false
  assert.ok(pageFile.includes('submissionResult.score.showPoints !== false && formData?.settings?.quizShowPointsEarned !== false'), 'Confirmation page must conditionally hide score summary when points are disabled');
  console.log('✓ Issue 3 Passed: Entire quiz points summary (earned, max, percentage) is hidden when showPoints is OFF.\n');

  // =========================================================================
  // ISSUE 4: Remove Question Review from respondent confirmation page
  // =========================================================================
  console.log('--- Testing Issue 4: Remove Question Review from confirmation page ---');
  assert.ok(!pageFile.includes('Question Review'), 'Question Review section must be removed from confirmation page');
  assert.ok(!pageFile.includes('submissionResult.score.breakdown.map'), 'Breakdown mapping must be removed from confirmation page');

  // Verify administrator response tab / route is preserved
  const responsesTabFile = fs.readFileSync(path.join(process.cwd(), 'src/components/form-builder/ResponsesTab.tsx'), 'utf-8');
  assert.ok(responsesTabFile.includes('ans.question?.title'), 'Admin ResponsesTab must still display questions');
  assert.ok(responsesTabFile.includes('ans.value'), 'Admin ResponsesTab must still display respondent answers');
  console.log('✓ Issue 4 Passed: Question Review is removed from respondent confirmation page and preserved in admin tools.\n');

  // =========================================================================
  // ISSUE 5: Remove Participant Identity Field dropdown & duplicate prevention dependency
  // =========================================================================
  console.log('--- Testing Issue 5: Remove Participant Identity Field & duplicate prevention dependency ---');
  const settingsTabFile = fs.readFileSync(path.join(process.cwd(), 'src/components/form-builder/SettingsTab.tsx'), 'utf-8');
  assert.ok(!settingsTabFile.includes('Participant Identity Field'), 'Participant Identity Field dropdown must be removed from SettingsTab');
  assert.ok(!settingsTabFile.includes('quizIdentityQuestionId: val === \'NONE\''), 'quizIdentityQuestionId selector must be removed from SettingsTab');

  // Test that resolveParticipantIdentifier does NOT throw 400 when method was QUESTION_FIELD but question is missing
  const legacyResolved = resolveParticipantIdentifier({
    settings: { duplicateIdentifierMethod: 'QUESTION_FIELD' },
    authenticatedUser: null,
    respondentEmail: 'respondent@example.com',
    answers: [],
    ipHash: 'ip12345',
  });
  assert.strictEqual(legacyResolved.success, true, 'Legacy QUESTION_FIELD must resolve successfully without error');
  assert.strictEqual(legacyResolved.identity.method, 'VERIFIED_EMAIL', 'Should fall back gracefully to email');

  const legacyResolvedIP = resolveParticipantIdentifier({
    settings: { duplicateIdentifierMethod: 'QUESTION_FIELD' },
    authenticatedUser: null,
    respondentEmail: null,
    answers: [],
    ipHash: 'ip_hash_device',
  });
  assert.strictEqual(legacyResolvedIP.success, true);
  assert.strictEqual(legacyResolvedIP.identity.method, 'IP_ADDRESS', 'Should fall back gracefully to IP address');
  console.log('✓ Issue 5 Passed: Participant Identity Field removed and duplicate prevention works smoothly without hard question dependency.\n');

  // =========================================================================
  // ISSUE 6: Section delete button visibility
  // =========================================================================
  console.log('--- Testing Issue 6: Section delete button visibility & states ---');
  const sectionCardFile = fs.readFileSync(path.join(process.cwd(), 'src/components/form-builder/SectionCard.tsx'), 'utf-8');
  assert.ok(!sectionCardFile.includes('text-gray-400 hover:text-red-500'), 'Low-contrast hover-only delete button must be removed');
  assert.ok(sectionCardFile.includes('text-red-700 dark:text-red-300'), 'Delete button must have high-contrast visible text');
  assert.ok(sectionCardFile.includes('Delete Section'), 'Delete button must have visible label');
  assert.ok(sectionCardFile.includes('focus-visible:ring-2 focus-visible:ring-red-500'), 'Delete button must have keyboard focus ring');
  console.log('✓ Issue 6 Passed: Section delete button is clearly visible, high contrast, and keyboard accessible.\n');

  // =========================================================================
  // ISSUE 7: Default quiz points consistency
  // =========================================================================
  console.log('--- Testing Issue 7: Default quiz points consistency ---');

  // Create Quiz Form with default quizDefaultPoints = 1
  const quizFormDefault1 = await prisma.form.create({
    data: {
      title: 'Issue 7: Quiz Points Default 1',
      status: 'DRAFT',
      isQuiz: true,
      ownerId: user.id,
      settings: {
        create: {
          quizDefaultPoints: 1,
        },
      },
      sections: {
        create: {
          title: 'Section 1',
          orderIndex: 0,
        },
      },
    },
    include: { sections: true, settings: true },
  });

  const sec1Id = quizFormDefault1.sections[0].id;

  // Add question without specifying quizPoints (simulate UI "Add Question")
  const addQReq1 = new NextRequest(`http://localhost:3000/api/forms/${quizFormDefault1.id}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: sec1Id,
      title: 'New Question With Default 1',
      type: 'MULTIPLE_CHOICE',
    }),
  });
  // Create auth cookie for form owner
  const { signToken } = await import('../src/lib/auth/jwt');
  const { SESSION_COOKIE_NAME } = await import('../src/lib/auth/session');
  const token = signToken({ userId: user.id, email: user.email, role: 'ADMIN' });
  addQReq1.cookies.set(SESSION_COOKIE_NAME, token);

  const addQRes1 = await createQuestionHandler(addQReq1, { params: Promise.resolve({ id: quizFormDefault1.id }) });
  assert.strictEqual(addQRes1.status, 200, 'Adding question should succeed');
  const addQData1 = await addQRes1.json();
  assert.strictEqual(addQData1.question.quizPoints, 1, 'Newly added question must have quizPoints = 1 (not 0)');

  // Change default to 5
  await prisma.formSettings.update({
    where: { formId: quizFormDefault1.id },
    data: { quizDefaultPoints: 5 },
  });

  // Verify existing question points was NOT overwritten
  const existingQ = await prisma.formQuestion.findUnique({ where: { id: addQData1.question.id } });
  assert.strictEqual(existingQ?.quizPoints, 1, 'Existing question must preserve its points (1) when default changes');

  // Add another question: must now receive 5
  const addQReq2 = new NextRequest(`http://localhost:3000/api/forms/${quizFormDefault1.id}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: sec1Id,
      title: 'New Question With Default 5',
      type: 'MULTIPLE_CHOICE',
    }),
  });
  addQReq2.cookies.set(SESSION_COOKIE_NAME, token);

  const addQRes2 = await createQuestionHandler(addQReq2, { params: Promise.resolve({ id: quizFormDefault1.id }) });
  const addQData2 = await addQRes2.json();
  assert.strictEqual(addQData2.question.quizPoints, 5, 'New question after changing default to 5 must have quizPoints = 5');

  // Manually configure points to 10
  await prisma.formQuestion.update({
    where: { id: addQData2.question.id },
    data: { quizPoints: 10, quizAnswer: { correctValue: 'Option 1' } },
  });
  await prisma.formQuestion.update({
    where: { id: addQData1.question.id },
    data: { quizAnswer: { correctValue: 'Option 1' } },
  });
  await prisma.form.update({
    where: { id: quizFormDefault1.id },
    data: { status: 'PUBLISHED' },
  });

  // Verify scoring calculation uses the exact stored points (1 + 10 = 11)
  const quizTestSubReq = new NextRequest(`http://localhost:3000/api/public/forms/${quizFormDefault1.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: addQData1.question.id, value: 'Option 1' }, // +1 pt
        { questionId: addQData2.question.id, value: 'Option 1' }, // +10 pts
      ],
    }),
  });
  const quizTestSubRes = await submitHandler(quizTestSubReq, { params: Promise.resolve({ publicId: quizFormDefault1.publicId }) });
  const quizTestSubData = await quizTestSubRes.json();
  assert.strictEqual(quizTestSubData.score.total, 11, 'Total earned score must accurately sum 1 + 10 = 11');
  assert.strictEqual(quizTestSubData.score.max, 11, 'Max score must accurately sum 1 + 10 = 11');
  console.log('✓ Issue 7 Passed: Default quiz points determines initial points (1 vs 5), does not overwrite existing, and scoring remains completely consistent.\n');

  // Cleanup test forms
  await prisma.form.deleteMany({
    where: {
      id: { in: [form1A.id, quizFormPointsHidden.id, quizFormDefault1.id] },
    },
  });

  console.log('====================================================');
  console.log('🎉 ALL 7 REGRESSION TEST SUITES PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runRegressionTests()
  .catch((err) => {
    console.error('❌ Regression tests failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
