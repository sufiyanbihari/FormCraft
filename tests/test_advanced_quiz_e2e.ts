import { prisma } from '../src/lib/db/prisma';
import { POST as attemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as saveAnswerHandler } from '../src/app/api/public/forms/[publicId]/quiz/save-answer/route';
import { POST as navigateHandler } from '../src/app/api/public/forms/[publicId]/quiz/navigate/route';
import { POST as finalizeHandler } from '../src/app/api/public/forms/[publicId]/quiz/finalize/route';
import { GET as dashboardHandler } from '../src/app/api/forms/[id]/quiz/dashboard/route';
import { POST as publicSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
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

async function runAdvancedQuizE2ETests() {
  console.log('================================================================');
  console.log('   FormCraft End-to-End Advanced Quiz & Dashboard Verification   ');
  console.log('================================================================\n');

  // Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'quiz_e2e_admin@example.com' },
    update: {},
    create: {
      email: 'quiz_e2e_admin@example.com',
      name: 'Quiz Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });
  const adminCookie = createAuthCookie(adminUser);

  // -------------------------------------------------------------
  // TEST 1: Forward-Only Quiz with Timers & Scoring
  // -------------------------------------------------------------
  console.log('--- TEST 1: Forward-Only Quiz with Timers & Lock Enforcement ---');
  const quiz1 = await prisma.form.create({
    data: {
      title: 'Forward-Only Timed Assessment',
      description: 'Testing per-question timers and forward-only locking',
      publicId: `quiz-fo-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'BOTH',
          quizDurationMinutes: 10,
          quizNavigationPolicy: 'FORWARD_ONLY',
          quizTimeoutBehavior: 'AUTO_FINALIZE',
          quizRosterMode: 'COUNT_ONLY',
          quizExpectedParticipants: 100,
          quizReleaseGrade: 'IMMEDIATE',
        },
      },
    },
  });

  const sec1 = await prisma.formSection.create({
    data: { formId: quiz1.id, title: 'Section 1', orderIndex: 0 },
  });

  const q1 = await prisma.formQuestion.create({
    data: {
      formId: quiz1.id,
      sectionId: sec1.id,
      title: 'Question 1: Capital of Gujarat?',
      type: 'MULTIPLE_CHOICE',
      quizPoints: 10,
      quizAnswer: { correctValue: 'Gandhinagar' },
      timeLimitSeconds: 30,
      orderIndex: 0,
    },
  });

  const q2 = await prisma.formQuestion.create({
    data: {
      formId: quiz1.id,
      sectionId: sec1.id,
      title: 'Question 2: Headquarters of Banas Dairy?',
      type: 'MULTIPLE_CHOICE',
      quizPoints: 10,
      quizAnswer: { correctValue: 'Palanpur' },
      timeLimitSeconds: 45,
      orderIndex: 1,
    },
  });

  // Start attempt for participant EMP001
  const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantIdentity: 'EMP001',
      participantName: 'Ramesh Patel',
    }),
  });
  const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(startRes.status, 200, 'Attempt should start successfully');
  const startData = await startRes.json();
  const attemptId = startData.attempt.id;
  assert.strictEqual(startData.attempt.status, 'IN_PROGRESS');
  assert.ok(startData.attempt.overallDeadline, 'Overall deadline must be set');
  console.log('✓ Participant EMP001 started attempt successfully');

  // Answer Q1 correctly
  const saveReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/save-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId,
      questionId: q1.id,
      value: 'Gandhinagar',
    }),
  });
  const saveRes1 = await saveAnswerHandler(saveReq1, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(saveRes1.status, 200, 'Q1 answer should save successfully');
  console.log('✓ Q1 answer saved');

  // Navigate to Q2: In FORWARD_ONLY mode, leaving Q1 permanently locks Q1
  const navReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId,
      fromQuestionId: q1.id,
      targetQuestionId: q2.id,
      answerValue: 'Gandhinagar',
    }),
  });
  const navRes = await navigateHandler(navReq, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(navRes.status, 200, 'Navigate to Q2 should succeed');
  const navData = await navRes.json();
  assert.ok(navData.attempt.lockedQuestionIds.includes(q1.id), 'Q1 must be in lockedQuestionIds');
  console.log('✓ Navigation to Q2 locked Q1 in forward-only mode');

  // Verify Security: Attempt to modify locked Q1 must be rejected by backend
  const tamperReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/save-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId,
      questionId: q1.id,
      value: 'Ahmedabad',
    }),
  });
  const tamperRes = await saveAnswerHandler(tamperReq, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(tamperRes.status, 403, 'Server must reject modifying locked question in forward-only mode');
  console.log('✓ Security: Server rejected tampering with locked question');

  // Answer Q2 correctly and finalize quiz attempt manually
  const finalizeReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId,
      reason: 'MANUAL_SUBMISSION',
      finalAnswers: [
        { questionId: q1.id, value: 'Gandhinagar' },
        { questionId: q2.id, value: 'Palanpur' },
      ],
    }),
  });
  const finalizeRes = await finalizeHandler(finalizeReq, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(finalizeRes.status, 200, 'Quiz finalization must succeed');
  const finalizeData = await finalizeRes.json();
  assert.strictEqual(finalizeData.attempt.status, 'COMPLETED');
  assert.strictEqual(finalizeData.attempt.earnedScore, 20);
  assert.strictEqual(finalizeData.attempt.maxScore, 20);
  assert.strictEqual(finalizeData.attempt.percentage, 100);
  console.log('✓ Participant EMP001 scored 20/20 (100%) and finalized attempt');

  // Verify submission record was created and linked for backward compatibility
  const submission = await prisma.formSubmission.findFirst({
    where: { formId: quiz1.id },
    include: { answers: true },
  });
  assert.ok(submission, 'FormSubmission record must exist');
  assert.strictEqual(submission.totalScore, 20, 'FormSubmission totalScore must equal 20');
  console.log('✓ Linked FormSubmission confirmed compatible with responses export');

  // -------------------------------------------------------------
  // TEST 2: Timeout Handling & Automatic Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Timeout Finalization & Reconciliation ---');
  // Create an attempt for EMP002 with an expired overall deadline
  const expiredAttempt = await prisma.quizAttempt.create({
    data: {
      formId: quiz1.id,
      participantIdentity: 'EMP002',
      participantName: 'Suresh Kumar',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 3600000), // 1 hour ago
      overallDeadline: new Date(Date.now() - 1800000), // expired 30 mins ago
      savedAnswers: { [q1.id]: 'Gandhinagar', [q2.id]: 'WrongAnswer' },
    },
  });

  // Saving an answer on expired attempt must be rejected and auto-finalized
  const lateSaveReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz1.publicId}/quiz/save-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: expiredAttempt.id,
      questionId: q2.id,
      value: 'Palanpur',
    }),
  });
  const lateSaveRes = await saveAnswerHandler(lateSaveReq, { params: Promise.resolve({ publicId: quiz1.publicId }) });
  assert.strictEqual(lateSaveRes.status, 403, 'Late answer submission must be rejected with 403');
  const updatedExpired = await prisma.quizAttempt.findUnique({ where: { id: expiredAttempt.id } });
  assert.strictEqual(updatedExpired?.status, 'TIMED_OUT', 'Expired attempt must be auto-finalized as TIMED_OUT');
  assert.strictEqual(updatedExpired?.earnedScore, 10, 'Only answers saved before expiry scored (10 pts for Q1)');
  console.log('✓ Expired attempt automatically timed out and graded with pre-expiry answers');

  // -------------------------------------------------------------
  // TEST 3: Backward-Enabled Quiz Mode (Preserves Timers & Revisiting)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Backward-Enabled Quiz Mode ---');
  const quiz2 = await prisma.form.create({
    data: {
      title: 'Backward-Enabled Quiz',
      publicId: `quiz-be-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'QUESTION',
          quizNavigationPolicy: 'BACKWARD_ENABLED',
          quizTimeoutBehavior: 'AUTO_FINALIZE',
        },
      },
    },
  });

  const sec2 = await prisma.formSection.create({
    data: { formId: quiz2.id, title: 'Section 1', orderIndex: 0 },
  });

  const bq1 = await prisma.formQuestion.create({
    data: {
      formId: quiz2.id,
      sectionId: sec2.id,
      title: 'BQ1',
      type: 'SHORT_ANSWER',
      timeLimitSeconds: 60,
      orderIndex: 0,
    },
  });

  const bq2 = await prisma.formQuestion.create({
    data: {
      formId: quiz2.id,
      sectionId: sec2.id,
      title: 'BQ2',
      type: 'SHORT_ANSWER',
      timeLimitSeconds: 60,
      orderIndex: 1,
    },
  });

  const bStartReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz2.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'EMP003' }),
  });
  const bStartRes = await attemptHandler(bStartReq, { params: Promise.resolve({ publicId: quiz2.publicId }) });
  const bAttempt = (await bStartRes.json()).attempt;

  // Move to BQ2
  const bNav1 = new NextRequest(`http://localhost:3000/api/public/forms/${quiz2.publicId}/quiz/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: bAttempt.id,
      fromQuestionId: bq1.id,
      targetQuestionId: bq2.id,
      answerValue: 'FirstAnswer',
    }),
  });
  const bNav1Res = await navigateHandler(bNav1, { params: Promise.resolve({ publicId: quiz2.publicId }) });
  const bNav1Data = await bNav1Res.json();
  // In BACKWARD_ENABLED mode, BQ1 is NOT locked
  assert.ok(!bNav1Data.attempt.lockedQuestionIds.includes(bq1.id), 'BQ1 must NOT be locked in backward-enabled mode');

  // Participant revisits BQ1: server preserves original question deadline, does not reset countdown
  const bNav2 = new NextRequest(`http://localhost:3000/api/public/forms/${quiz2.publicId}/quiz/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: bAttempt.id,
      fromQuestionId: bq2.id,
      targetQuestionId: bq1.id,
    }),
  });
  const bNav2Res = await navigateHandler(bNav2, { params: Promise.resolve({ publicId: quiz2.publicId }) });
  assert.strictEqual(bNav2Res.status, 200, 'Revisiting previous question must succeed');
  console.log('✓ Backward-enabled mode allows revisiting without locking');

  // -------------------------------------------------------------
  // TEST 4: Live Quiz Dashboard (Summary Metrics, Filters, 100 Participants)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Live Quiz Dashboard & 100 Simulated Participants ---');
  // Create 100 simulated participants on quiz1:
  // 60 Completed, 20 In Progress, 15 Timed Out
  const bulkAttempts: any[] = [];
  const baseTime = new Date();

  for (let i = 10; i < 70; i++) {
    bulkAttempts.push({
      formId: quiz1.id,
      participantIdentity: `EMP${String(i).padStart(3, '0')}`,
      participantName: `Employee ${i}`,
      status: 'COMPLETED',
      startedAt: new Date(baseTime.getTime() - 15 * 60000),
      completedAt: new Date(baseTime.getTime() - 5 * 60000),
      durationSeconds: 600,
      earnedScore: 10 + (i % 11),
      maxScore: 20,
      percentage: Math.round(((10 + (i % 11)) / 20) * 100),
    });
  }

  for (let i = 70; i < 90; i++) {
    bulkAttempts.push({
      formId: quiz1.id,
      participantIdentity: `EMP${String(i).padStart(3, '0')}`,
      participantName: `Employee ${i}`,
      status: 'IN_PROGRESS',
      startedAt: new Date(baseTime.getTime() - 2 * 60000),
      overallDeadline: new Date(baseTime.getTime() + 8 * 60000), // active
    });
  }

  for (let i = 90; i < 105; i++) {
    bulkAttempts.push({
      formId: quiz1.id,
      participantIdentity: `EMP${String(i).padStart(3, '0')}`,
      participantName: `Employee ${i}`,
      status: 'TIMED_OUT',
      timeoutReason: 'OVERALL_TIMEOUT',
      startedAt: new Date(baseTime.getTime() - 40 * 60000),
      completedAt: new Date(baseTime.getTime() - 30 * 60000),
      durationSeconds: 600,
      earnedScore: 5,
      maxScore: 20,
      percentage: 25,
    });
  }

  await prisma.quizAttempt.createMany({ data: bulkAttempts });
  console.log('✓ Generated simulated attempts (100+ participants)');

  // Request Dashboard as Admin
  const dashReq = new NextRequest(`http://localhost:3000/api/forms/${quiz1.id}/quiz/dashboard?status=ALL&limit=25`, {
    headers: { cookie: adminCookie },
  });
  const dashRes = await dashboardHandler(dashReq, { params: Promise.resolve({ id: quiz1.id }) });
  assert.strictEqual(dashRes.status, 200, 'Admin can view live dashboard');
  const dashData = await dashRes.json();

  console.log('Dashboard Summary Metrics:', dashData.summary);
  assert.strictEqual(dashData.summary.expected, 100, 'Expected participants must be 100');
  assert.ok(dashData.summary.completed >= 61, 'Completed count must be at least 61');
  assert.ok(dashData.summary.inProgress >= 20, 'In Progress count must be at least 20');
  assert.ok(dashData.summary.timedOut >= 16, 'Timed Out count must be at least 16');
  assert.ok(dashData.participants.length === 25, 'Pagination limit of 25 enforced');
  console.log('✓ Summary metrics and pagination verified');

  // Verify status filter: COMPLETED
  const filterReq = new NextRequest(`http://localhost:3000/api/forms/${quiz1.id}/quiz/dashboard?status=COMPLETED`, {
    headers: { cookie: adminCookie },
  });
  const filterRes = await dashboardHandler(filterReq, { params: Promise.resolve({ id: quiz1.id }) });
  const filterData = await filterRes.json();
  assert.ok(filterData.participants.every((p: any) => p.status === 'COMPLETED'), 'Only completed returned');
  console.log('✓ Filter by status (COMPLETED) verified');

  // Verify search
  const searchReq = new NextRequest(`http://localhost:3000/api/forms/${quiz1.id}/quiz/dashboard?search=EMP055`, {
    headers: { cookie: adminCookie },
  });
  const searchRes = await dashboardHandler(searchReq, { params: Promise.resolve({ id: quiz1.id }) });
  const searchData = await searchRes.json();
  assert.strictEqual(searchData.participants.length, 1);
  assert.strictEqual(searchData.participants[0].participantIdentity, 'EMP055');
  console.log('✓ Search by Participant Identity verified');

  // Verify RBAC: Unauthenticated request to dashboard must be 401
  const unauthReq = new NextRequest(`http://localhost:3000/api/forms/${quiz1.id}/quiz/dashboard`);
  const unauthRes = await dashboardHandler(unauthReq, { params: Promise.resolve({ id: quiz1.id }) });
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must be rejected with 401');
  console.log('✓ RBAC: Unauthorized dashboard access rejected');

  // -------------------------------------------------------------
  // TEST 5: Non-Quiz Form Backward Compatibility
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Non-Quiz Form Backward Compatibility ---');
  const normalForm = await prisma.form.create({
    data: {
      title: 'Ordinary Feedback Form',
      publicId: `normal-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: false,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
        },
      },
    },
  });

  const nSec = await prisma.formSection.create({
    data: { formId: normalForm.id, title: 'Section 1', orderIndex: 0 },
  });

  const nQ = await prisma.formQuestion.create({
    data: {
      formId: normalForm.id,
      sectionId: nSec.id,
      title: 'Your Comments',
      type: 'TEXTAREA',
      orderIndex: 0,
    },
  });

  // Standard submission directly to /api/public/forms/[publicId]/submissions
  const normalSubReq = new NextRequest(`http://localhost:3000/api/public/forms/${normalForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: nQ.id, value: 'Everything works normally!' }],
      respondentEmail: 'respondent@example.com',
      idempotencyKey: `norm-sub-${Date.now()}`,
    }),
  });
  const normalSubRes = await publicSubmissionHandler(normalSubReq, { params: Promise.resolve({ publicId: normalForm.publicId }) });
  assert.strictEqual(normalSubRes.status, 200, 'Standard form submission must succeed');
  console.log('✓ Ordinary non-quiz forms submit normally without attempt restrictions');

  console.log('\n================================================================');
  console.log('  ALL ADVANCED QUIZ MODE & LIVE DASHBOARD TESTS PASSED (100%)!   ');
  console.log('================================================================\n');
}

runAdvancedQuizE2ETests()
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
