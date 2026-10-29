import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { GET as getEditHandler, PUT as putEditHandler } from '../src/app/api/public/forms/[publicId]/submissions/edit/route';
import { POST as quizAttemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as quizFinalizeHandler } from '../src/app/api/public/forms/[publicId]/quiz/finalize/route';

async function runRegressionTests() {
  console.log('========================================================================');
  console.log('  Testing "Submit another response" visibility & response editing rules ');
  console.log('========================================================================\n');

  // Setup test user
  const testUser = await prisma.user.upsert({
    where: { email: 'another_response_tester@example.com' },
    update: {},
    create: {
      email: 'another_response_tester@example.com',
      name: 'Another Response Tester',
      passwordHash: 'dummy',
      role: 'ADMIN',
    },
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Regular Form with allowResponseEditing = OFF
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Regular Form - allowResponseEditing = OFF ---');
  const form1 = await prisma.form.create({
    data: {
      title: 'Regular Form Editing OFF',
      ownerId: testUser.id,
      isQuiz: false,
      status: 'PUBLISHED',
      settings: {
        create: {
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

  const q1 = await prisma.formQuestion.create({
    data: {
      formId: form1.id,
      sectionId: form1.sections[0].id,
      title: 'What is your feedback?',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
    },
  });

  const subReq1 = new NextRequest(`http://localhost/api/public/forms/${form1.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: q1.id, value: 'Great platform' }],
    }),
  });
  const subRes1 = await submitHandler(subReq1, { params: Promise.resolve({ publicId: form1.publicId }) });
  assert.strictEqual(subRes1.status, 200);
  const subData1 = await subRes1.json();

  // 1. Verify backend returns allowResponseEditing = false and no editToken
  assert.strictEqual(subData1.allowResponseEditing, false, 'allowResponseEditing must be false in response');
  assert.strictEqual(subData1.editToken, undefined, 'editToken must be undefined');

  // 2. Evaluate confirmation page button visibility logic
  const isEditingAllowed1 = Boolean(
    subData1.allowResponseEditing !== undefined ? subData1.allowResponseEditing : form1.settings?.allowResponseEditing
  );
  const isRestricted1 = Boolean(
    subData1.restrictOneResponse !== undefined ? subData1.restrictOneResponse : form1.settings?.restrictOneResponse
  );
  const showSubmitAnother1 = isEditingAllowed1 && !isRestricted1;
  assert.strictEqual(showSubmitAnother1, false, 'Submit another response button must be HIDDEN when allowResponseEditing is OFF');

  // 3. Verify backend enforcement of editing route
  const subDb1 = await prisma.formSubmission.findUnique({ where: { id: subData1.submissionId } });
  const editAttemptReq = new NextRequest(
    `http://localhost/api/public/forms/${form1.publicId}/submissions/edit?editToken=${subDb1!.editToken}`,
    { method: 'GET' }
  );
  const editAttemptRes = await getEditHandler(editAttemptReq, { params: Promise.resolve({ publicId: form1.publicId }) });
  assert.strictEqual(editAttemptRes.status, 403, 'Backend must reject editing with 403');
  console.log('✓ TEST 1 PASSED: "Submit another response" button is HIDDEN when editing is OFF for regular forms\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Regular Form with allowResponseEditing = ON and restrictOneResponse = OFF
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Regular Form - allowResponseEditing = ON, restrictOneResponse = OFF ---');
  const form2 = await prisma.form.create({
    data: {
      title: 'Regular Form Editing ON Multi-Response',
      ownerId: testUser.id,
      isQuiz: false,
      status: 'PUBLISHED',
      settings: {
        create: {
          allowResponseEditing: true,
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

  const q2 = await prisma.formQuestion.create({
    data: {
      formId: form2.id,
      sectionId: form2.sections[0].id,
      title: 'Department',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
    },
  });

  const subReq2 = new NextRequest(`http://localhost/api/public/forms/${form2.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: q2.id, value: 'Engineering' }],
    }),
  });
  const subRes2 = await submitHandler(subReq2, { params: Promise.resolve({ publicId: form2.publicId }) });
  assert.strictEqual(subRes2.status, 200);
  const subData2 = await subRes2.json();

  assert.strictEqual(subData2.allowResponseEditing, true);
  assert.ok(subData2.editToken, 'editToken must be returned when editing is ON');

  const isEditingAllowed2 = Boolean(
    subData2.allowResponseEditing !== undefined ? subData2.allowResponseEditing : form2.settings?.allowResponseEditing
  );
  const isRestricted2 = Boolean(
    subData2.restrictOneResponse !== undefined ? subData2.restrictOneResponse : form2.settings?.restrictOneResponse
  );
  const showSubmitAnother2 = isEditingAllowed2 && !isRestricted2;
  assert.strictEqual(showSubmitAnother2, true, 'Submit another response button must be VISIBLE when editing is ON and duplicate prevention is OFF');
  console.log('✓ TEST 2 PASSED: "Submit another response" button is VISIBLE when editing is ON & restrictOneResponse is OFF\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Regular Form with allowResponseEditing = ON and restrictOneResponse = ON
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Regular Form - allowResponseEditing = ON, restrictOneResponse = ON ---');
  const form3 = await prisma.form.create({
    data: {
      title: 'Regular Form Editing ON Restricted',
      ownerId: testUser.id,
      isQuiz: false,
      status: 'PUBLISHED',
      settings: {
        create: {
          allowResponseEditing: true,
          restrictOneResponse: true,
          duplicateIdentifierMethod: 'IP_ADDRESS',
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

  const q3 = await prisma.formQuestion.create({
    data: {
      formId: form3.id,
      sectionId: form3.sections[0].id,
      title: 'User ID',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
    },
  });

  const subReq3 = new NextRequest(`http://localhost/api/public/forms/${form3.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.99' },
    body: JSON.stringify({
      answers: [{ questionId: q3.id, value: 'UID123' }],
    }),
  });
  const subRes3 = await submitHandler(subReq3, { params: Promise.resolve({ publicId: form3.publicId }) });
  assert.strictEqual(subRes3.status, 200);
  const subData3 = await subRes3.json();

  assert.strictEqual(subData3.allowResponseEditing, true);
  assert.strictEqual(subData3.restrictOneResponse, true);

  const isEditingAllowed3 = Boolean(
    subData3.allowResponseEditing !== undefined ? subData3.allowResponseEditing : form3.settings?.allowResponseEditing
  );
  const isRestricted3 = Boolean(
    subData3.restrictOneResponse !== undefined ? subData3.restrictOneResponse : form3.settings?.restrictOneResponse
  );
  const showSubmitAnother3 = isEditingAllowed3 && !isRestricted3;
  assert.strictEqual(showSubmitAnother3, false, 'Submit another response button must be HIDDEN when duplicate prevention is ON');
  console.log('✓ TEST 3 PASSED: "Submit another response" button is HIDDEN when restrictOneResponse is ON\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Quiz with allowResponseEditing = OFF
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Quiz - allowResponseEditing = OFF ---');
  const quiz4 = await prisma.form.create({
    data: {
      title: 'Quiz Editing OFF',
      ownerId: testUser.id,
      isQuiz: true,
      status: 'PUBLISHED',
      settings: {
        create: {
          allowResponseEditing: false,
          restrictOneResponse: false,
          quizTimerMode: 'NONE',
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
    include: { sections: true, settings: true },
  });

  const quizQ4 = await prisma.formQuestion.create({
    data: {
      formId: quiz4.id,
      sectionId: quiz4.sections[0].id,
      title: 'What is 5 + 5?',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 0,
      quizPoints: 10,
      quizAnswer: { correctValue: '10' },
      options: {
        create: [
          { label: '10', value: '10', orderIndex: 0 },
          { label: '20', value: '20', orderIndex: 1 },
        ],
      },
    },
  });

  // Start quiz attempt
  const startReq4 = new NextRequest(`http://localhost/api/public/forms/${quiz4.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantIdentity: 'student_quiz_off@example.com',
    }),
  });
  const startRes4 = await quizAttemptHandler(startReq4, { params: Promise.resolve({ publicId: quiz4.publicId }) });
  assert.strictEqual(startRes4.status, 200);
  const startData4 = await startRes4.json();
  assert.strictEqual(startData4.allowResponseEditing, false, 'attempt start must return allowResponseEditing = false');

  // Finalize quiz attempt
  const finReq4 = new NextRequest(`http://localhost/api/public/forms/${quiz4.publicId}/quiz/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: startData4.attempt.id,
      reason: 'MANUAL_SUBMISSION',
      finalAnswers: [{ questionId: quizQ4.id, value: '10' }],
    }),
  });
  const finRes4 = await quizFinalizeHandler(finReq4, { params: Promise.resolve({ publicId: quiz4.publicId }) });
  assert.strictEqual(finRes4.status, 200);
  const finData4 = await finRes4.json();

  assert.strictEqual(finData4.allowResponseEditing, false, 'Finalize response must return allowResponseEditing = false');
  assert.strictEqual(finData4.score.total, 10, 'Quiz scoring must remain accurate');

  const isEditingAllowed4 = Boolean(
    finData4.allowResponseEditing !== undefined ? finData4.allowResponseEditing : quiz4.settings?.allowResponseEditing
  );
  const isRestricted4 = Boolean(
    finData4.restrictOneResponse !== undefined ? finData4.restrictOneResponse : quiz4.settings?.restrictOneResponse
  );
  const showSubmitAnother4 = isEditingAllowed4 && !isRestricted4;
  assert.strictEqual(showSubmitAnother4, false, 'Submit another response button must be HIDDEN on Quiz confirmation when editing is OFF');
  console.log('✓ TEST 4 PASSED: "Submit another response" button is HIDDEN on Quiz confirmation when editing is OFF\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Quiz with allowResponseEditing = ON and restrictOneResponse = OFF
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Quiz - allowResponseEditing = ON, restrictOneResponse = OFF ---');
  const quiz5 = await prisma.form.create({
    data: {
      title: 'Quiz Editing ON',
      ownerId: testUser.id,
      isQuiz: true,
      status: 'PUBLISHED',
      settings: {
        create: {
          allowResponseEditing: true,
          restrictOneResponse: false,
          quizTimerMode: 'NONE',
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
    include: { sections: true, settings: true },
  });

  const quizQ5 = await prisma.formQuestion.create({
    data: {
      formId: quiz5.id,
      sectionId: quiz5.sections[0].id,
      title: 'What is 3 * 3?',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 0,
      quizPoints: 5,
      quizAnswer: { correctValue: '9' },
      options: {
        create: [
          { label: '9', value: '9', orderIndex: 0 },
          { label: '6', value: '6', orderIndex: 1 },
        ],
      },
    },
  });

  const startReq5 = new NextRequest(`http://localhost/api/public/forms/${quiz5.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantIdentity: 'student_quiz_on@example.com',
    }),
  });
  const startRes5 = await quizAttemptHandler(startReq5, { params: Promise.resolve({ publicId: quiz5.publicId }) });
  assert.strictEqual(startRes5.status, 200);
  const startData5 = await startRes5.json();
  assert.strictEqual(startData5.allowResponseEditing, true);

  const finReq5 = new NextRequest(`http://localhost/api/public/forms/${quiz5.publicId}/quiz/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: startData5.attempt.id,
      reason: 'MANUAL_SUBMISSION',
      finalAnswers: [{ questionId: quizQ5.id, value: '9' }],
    }),
  });
  const finRes5 = await quizFinalizeHandler(finReq5, { params: Promise.resolve({ publicId: quiz5.publicId }) });
  assert.strictEqual(finRes5.status, 200);
  const finData5 = await finRes5.json();

  assert.strictEqual(finData5.allowResponseEditing, true);
  assert.strictEqual(finData5.score.total, 5);

  const isEditingAllowed5 = Boolean(
    finData5.allowResponseEditing !== undefined ? finData5.allowResponseEditing : quiz5.settings?.allowResponseEditing
  );
  const isRestricted5 = Boolean(
    finData5.restrictOneResponse !== undefined ? finData5.restrictOneResponse : quiz5.settings?.restrictOneResponse
  );
  const showSubmitAnother5 = isEditingAllowed5 && !isRestricted5;
  assert.strictEqual(showSubmitAnother5, true, 'Submit another response button must be VISIBLE on Quiz confirmation when editing is ON and duplicate prevention is OFF');
  console.log('✓ TEST 5 PASSED: "Submit another response" button is VISIBLE on Quiz confirmation when editing is ON\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Static Code Verification of Confirmation Screen
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Static Code Verification of Confirmation Screen ---');
  const pagePath = path.join(__dirname, '../src/app/f/[publicId]/page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf-8');

  // Verify dynamic check of allowResponseEditing and restrictOneResponse
  assert(
    pageContent.includes('isResponseEditingAllowed && !isOneResponseRestricted'),
    'page.tsx must guard "Submit another response" with isResponseEditingAllowed && !isOneResponseRestricted'
  );
  assert(
    pageContent.includes('submissionResult?.allowResponseEditing !== undefined'),
    'page.tsx must check submissionResult?.allowResponseEditing dynamically'
  );
  assert(
    pageContent.includes('formData?.settings?.allowResponseEditing'),
    'page.tsx must fallback to formData?.settings?.allowResponseEditing'
  );
  console.log('✓ TEST 6 PASSED: Verified static AST/code patterns in public form page\n');

  console.log('========================================================================');
  console.log(' ALL REGRESSION TESTS PASSED (6/6)!                                     ');
  console.log('========================================================================');
}

runRegressionTests()
  .catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
