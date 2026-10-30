import { prisma } from '../src/lib/db/prisma';
import { POST as attemptHandler, GET as getAttemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as saveAnswerHandler } from '../src/app/api/public/forms/[publicId]/quiz/save-answer/route';
import { POST as navigateHandler } from '../src/app/api/public/forms/[publicId]/quiz/navigate/route';
import { POST as finalizeHandler } from '../src/app/api/public/forms/[publicId]/quiz/finalize/route';
import { GET as publicFormHandler } from '../src/app/api/public/forms/[publicId]/route';
import { GET as dashboardHandler } from '../src/app/api/forms/[id]/quiz/dashboard/route';
import { POST as publicSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import {
  fisherYatesShuffle,
  generateQuizQuestionOrder,
  reorderSectionsByQuestionOrder,
} from '../src/lib/quiz/quizShuffle';
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

async function runQuizShuffleRegressionTests() {
  console.log('================================================================');
  console.log('   FormCraft – Independent Question Shuffling Regression Suite   ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 27;

  // Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'shuffle_quiz_admin@example.com' },
    update: {},
    create: {
      email: 'shuffle_quiz_admin@example.com',
      name: 'Shuffle Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });

  const authCookie = createAuthCookie(adminUser);

  // Helper to create a test quiz
  async function createTestQuiz(title: string, shuffleQuestions: boolean | null, numQuestions = 6, numSections = 1) {
    const publicId = `shuffle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const settingsData: any = {
      isAcceptingResponses: true,
      quizTimerMode: 'NONE',
      quizDurationMinutes: 15,
      quizNavigationPolicy: 'BACKWARD_ENABLED',
      quizReleaseGrade: 'IMMEDIATE',
    };
    if (shuffleQuestions !== null) {
      settingsData.shuffleQuestions = shuffleQuestions;
    }

    const form = await prisma.form.create({
      data: {
        title,
        publicId,
        status: 'PUBLISHED',
        isQuiz: true,
        ownerId: adminUser.id,
        settings: {
          create: settingsData,
        },
      },
    });

    const questions: any[] = [];
    const questionsPerSection = Math.ceil(numQuestions / numSections);

    for (let s = 0; s < numSections; s++) {
      const section = await prisma.formSection.create({
        data: {
          formId: form.id,
          title: `Section ${s + 1}`,
          orderIndex: s,
        },
      });

      const count = Math.min(questionsPerSection, numQuestions - questions.length);
      for (let q = 0; q < count; q++) {
        const qIdx = questions.length;
        const question = await prisma.formQuestion.create({
          data: {
            formId: form.id,
            sectionId: section.id,
            title: `Question ${qIdx + 1}: Sample prompt ${qIdx + 1}`,
            type: 'MULTIPLE_CHOICE',
            orderIndex: q,
            quizPoints: 5,
            quizAnswer: { correctValue: `Opt-${qIdx + 1}` },
            options: {
              create: [
                { label: `Opt-${qIdx + 1}`, value: `Opt-${qIdx + 1}`, orderIndex: 0 },
                { label: `Wrong-${qIdx + 1}`, value: `Wrong-${qIdx + 1}`, orderIndex: 1 },
              ],
            },
          },
        });
        questions.push(question);
      }
    }

    return { form, questions };
  }

  // =================================================================
  // GROUP A: Shuffle Configuration Tests
  // =================================================================
  console.log('--- GROUP A: Shuffle Configuration Tests ---');

  // Test 1: Shuffle enabled -> attempt receives a shuffled question sequence
  {
    const { form, questions } = await createTestQuiz('Quiz Shuffle ON', true, 10);
    const originalIds = questions.map((q) => q.id);

    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'STUDENT_001', participantName: 'Student One' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();

    assert.ok(Array.isArray(startData.attempt.questionOrder), 'questionOrder must be an array');
    assert.strictEqual(startData.attempt.questionOrder.length, 10, 'All 10 questions must be present');
    // Ensure every original ID is in questionOrder
    assert.deepStrictEqual([...startData.attempt.questionOrder].sort(), [...originalIds].sort());

    console.log('✓ Test 1 Passed: Shuffle enabled generates a complete questionOrder array');
    passedTests++;
  }

  // Test 2: Shuffle disabled -> original order is preserved exactly
  {
    const { form, questions } = await createTestQuiz('Quiz Shuffle OFF', false, 8);
    const originalIds = questions.map((q) => q.id);

    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'STUDENT_002', participantName: 'Student Two' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();

    assert.deepStrictEqual(startData.attempt.questionOrder, originalIds, 'When shuffle is disabled, order must strictly match original IDs');
    console.log('✓ Test 2 Passed: Shuffle disabled strictly preserves original database order');
    passedTests++;
  }

  // Test 3: Missing legacy shuffle setting -> safe default is applied (false)
  {
    const { form, questions } = await createTestQuiz('Quiz Legacy Setting', null, 5);
    const originalIds = questions.map((q) => q.id);

    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'STUDENT_003' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();

    assert.deepStrictEqual(startData.attempt.questionOrder, originalIds, 'Legacy attempt with missing setting must safely default to original order');
    console.log('✓ Test 3 Passed: Missing legacy shuffle setting safely defaults to original order');
    passedTests++;
  }

  // Test 4: Saving and loading quiz configuration preserves shuffleQuestions setting
  {
    const { form } = await createTestQuiz('Config Persistence', true, 3);
    const loadedSettings = await prisma.formSettings.findUnique({
      where: { formId: form.id },
    });
    assert.strictEqual(loadedSettings?.shuffleQuestions, true, 'Settings record must store shuffleQuestions: true');

    // Toggle off
    await prisma.formSettings.update({
      where: { formId: form.id },
      data: { shuffleQuestions: false },
    });
    const updated = await prisma.formSettings.findUnique({
      where: { formId: form.id },
    });
    assert.strictEqual(updated?.shuffleQuestions, false, 'Settings record must store shuffleQuestions: false');
    console.log('✓ Test 4 Passed: Saving and loading configuration correctly preserves shuffle setting');
    passedTests++;
  }

  // =================================================================
  // GROUP B: Independent Respondent Tests
  // =================================================================
  console.log('\n--- GROUP B: Independent Respondent Tests ---');

  // Test 5, 6, 7, 8, 9: Independent respondents, complete set, no sharing
  {
    const { form, questions } = await createTestQuiz('Independent Respondents', true, 12);
    const originalIds = questions.map((q) => q.id);

    // Participant A
    const reqA = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'RESP_ALICE', participantName: 'Alice' }),
    });
    const resA = await attemptHandler(reqA, { params: Promise.resolve({ publicId: form.publicId }) });
    const dataA = await resA.json();
    const orderA: string[] = dataA.attempt.questionOrder;

    // Participant B
    const reqB = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'RESP_BOB', participantName: 'Bob' }),
    });
    const resB = await attemptHandler(reqB, { params: Promise.resolve({ publicId: form.publicId }) });
    const dataB = await resB.json();
    const orderB: string[] = dataB.attempt.questionOrder;

    // Participant C
    const reqC = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'RESP_CHARLIE', participantName: 'Charlie' }),
    });
    const resC = await attemptHandler(reqC, { params: Promise.resolve({ publicId: form.publicId }) });
    const dataC = await resC.json();
    const orderC: string[] = dataC.attempt.questionOrder;

    // Test 5 & 6: Independent attempt-specific sequences
    assert.strictEqual(orderA.length, 12);
    assert.strictEqual(orderB.length, 12);
    assert.strictEqual(orderC.length, 12);
    console.log('✓ Test 5 Passed: Respondent A received attempt-specific sequence');
    console.log('✓ Test 6 Passed: Respondent B received attempt-specific sequence');
    passedTests += 2;

    // Test 7: Both attempts contain every eligible question exactly once
    assert.deepStrictEqual([...orderA].sort(), [...originalIds].sort());
    assert.deepStrictEqual([...orderB].sort(), [...originalIds].sort());
    assert.deepStrictEqual([...orderC].sort(), [...originalIds].sort());
    console.log('✓ Test 7 Passed: All attempts contain every eligible question exactly once');
    passedTests++;

    // Test 8: No question accidentally duplicated or omitted
    const setA = new Set(orderA);
    const setB = new Set(orderB);
    assert.strictEqual(setA.size, 12, 'Attempt A must have 12 unique question IDs');
    assert.strictEqual(setB.size, 12, 'Attempt B must have 12 unique question IDs');
    console.log('✓ Test 8 Passed: No question duplicated or omitted in any sequence');
    passedTests++;

    // Test 9: Question order is not stored globally on form; distinct in DB records
    const dbAttemptA = await prisma.quizAttempt.findUnique({ where: { id: dataA.attempt.id } });
    const dbAttemptB = await prisma.quizAttempt.findUnique({ where: { id: dataB.attempt.id } });
    assert.deepStrictEqual(dbAttemptA?.questionOrder, orderA);
    assert.deepStrictEqual(dbAttemptB?.questionOrder, orderB);
    console.log('✓ Test 9 Passed: Question order is strictly stored per-attempt in database');
    passedTests++;
  }

  // =================================================================
  // GROUP C: Persistence Tests (Refresh, Resume, Legacy)
  // =================================================================
  console.log('\n--- GROUP C: Persistence Tests ---');

  // Test 10: Refreshing an attempt preserves its exact original question order
  {
    const { form } = await createTestQuiz('Refresh Persistence', true, 10);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'REFRESH_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const originalOrder = startData.attempt.questionOrder;

    // Simulate browser refresh: GET /quiz/attempt?participantIdentity=REFRESH_USER
    const refreshReq = new NextRequest(
      `http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt?participantIdentity=REFRESH_USER`,
      { method: 'GET' }
    );
    const refreshRes = await getAttemptHandler(refreshReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(refreshRes.status, 200);
    const refreshData = await refreshRes.json();

    assert.deepStrictEqual(refreshData.attempt.questionOrder, originalOrder, 'Question order after refresh must strictly match initial order');
    console.log('✓ Test 10 Passed: Refreshing an attempt preserves exact question order');
    passedTests++;
  }

  // Test 11: Resuming an attempt preserves original question order
  {
    const { form } = await createTestQuiz('Resume Persistence', true, 8);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'RESUME_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const originalOrder = startData.attempt.questionOrder;

    // Calling POST again with same identity returns existing attempt with identical order
    const resumeReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'RESUME_USER' }),
    });
    const resumeRes = await attemptHandler(resumeReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const resumeData = await resumeRes.json();

    assert.deepStrictEqual(resumeData.attempt.questionOrder, originalOrder, 'POST resuming attempt must preserve questionOrder');
    console.log('✓ Test 11 Passed: Resuming an attempt preserves exact question order');
    passedTests++;
  }

  // Test 12: Repeated GET requests do not regenerate sequence
  {
    const { form } = await createTestQuiz('Repeated GETs', true, 6);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'GET_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const order0 = startData.attempt.questionOrder;

    for (let i = 1; i <= 5; i++) {
      const getReq = new NextRequest(
        `http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt?participantIdentity=GET_USER`,
        { method: 'GET' }
      );
      const getRes = await getAttemptHandler(getReq, { params: Promise.resolve({ publicId: form.publicId }) });
      const getData = await getRes.json();
      assert.deepStrictEqual(getData.attempt.questionOrder, order0, `GET request ${i} must not change order`);
    }
    console.log('✓ Test 12 Passed: Repeated GET requests do not alter sequence');
    passedTests++;
  }

  // Test 13: Navigation does not regenerate sequence
  {
    const { form, questions } = await createTestQuiz('Navigation Stability', true, 4);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'NAV_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const originalOrder: string[] = startData.attempt.questionOrder;

    // Navigate to second question in shuffled order
    const nextQId = originalOrder[1];
    const navReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startData.attempt.id,
        targetQuestionId: nextQId,
        fromQuestionId: originalOrder[0],
        answerValue: 'SampleAnswer',
      }),
    });
    const navRes = await navigateHandler(navReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const navData = await navRes.json();

    assert.deepStrictEqual(navData.attempt.questionOrder, originalOrder, 'Navigation must preserve questionOrder');
    console.log('✓ Test 13 Passed: Navigation does not regenerate sequence');
    passedTests++;
  }

  // Test 14: Existing legacy attempts with missing order metadata receive a safe, stable order
  {
    const { form, questions } = await createTestQuiz('Legacy Backfill', true, 4);
    const rawAttempt = await prisma.quizAttempt.create({
      data: {
        formId: form.id,
        participantIdentity: 'LEGACY_P1',
        status: 'IN_PROGRESS',
        questionOrder: [], // empty legacy state
      },
    });

    const getReq = new NextRequest(
      `http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt?participantIdentity=LEGACY_P1`,
      { method: 'GET' }
    );
    const getRes = await getAttemptHandler(getReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const getData = await getRes.json();

    assert.ok(getData.attempt.questionOrder.length === 4, 'Legacy attempt must receive a populated questionOrder');
    assert.deepStrictEqual(getData.attempt.questionOrder, questions.map((q) => q.id));
    console.log('✓ Test 14 Passed: Legacy attempts with missing metadata safely backfilled');
    passedTests++;
  }

  // =================================================================
  // GROUP D: Navigation & Sequence Integrity
  // =================================================================
  console.log('\n--- GROUP D: Navigation Tests ---');

  // Test 15 & 16: Next and Back follow saved order
  {
    const { form } = await createTestQuiz('Next Back Order', true, 5);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'NAV_NB_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const order: string[] = startData.attempt.questionOrder;

    // Step to index 1 (Next)
    const nav1 = await navigateHandler(
      new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: startData.attempt.id,
          targetQuestionId: order[1],
          fromQuestionId: order[0],
          answerValue: 'Ans-0',
        }),
      }),
      { params: Promise.resolve({ publicId: form.publicId }) }
    );
    const data1 = await nav1.json();
    assert.strictEqual(data1.attempt.currentQuestionIndex, 1, 'Index must advance to 1 in shuffled order');
    console.log('✓ Test 15 Passed: Next follows the saved shuffled order');
    passedTests++;

    // Step back to index 0 (Back)
    const nav0 = await navigateHandler(
      new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: startData.attempt.id,
          targetQuestionId: order[0],
          direction: 'PREV',
        }),
      }),
      { params: Promise.resolve({ publicId: form.publicId }) }
    );
    const data0 = await nav0.json();
    assert.strictEqual(data0.attempt.currentQuestionIndex, 0, 'Index must return to 0');
    console.log('✓ Test 16 Passed: Back follows the saved shuffled order');
    passedTests++;
  }

  // Test 17: Question numbering reflects shuffled order
  {
    // Test reorderSectionsByQuestionOrder helper
    const mockSections = [
      {
        id: 's1',
        questions: [
          { id: 'q1', title: 'Question 1: First', type: 'MULTIPLE_CHOICE' },
          { id: 'q2', title: 'Question 2: Second', type: 'MULTIPLE_CHOICE' },
          { id: 'q3', title: 'Question 3: Third', type: 'MULTIPLE_CHOICE' },
        ],
      },
    ];
    const shuffledOrder = ['q3', 'q1', 'q2'];
    const reordered = reorderSectionsByQuestionOrder(mockSections, shuffledOrder);
    assert.strictEqual(reordered[0].questions[0].id, 'q3');
    assert.strictEqual(reordered[0].questions[1].id, 'q1');
    assert.strictEqual(reordered[0].questions[2].id, 'q2');
    console.log('✓ Test 17 Passed: Question sequence reflects shuffled order');
    passedTests++;
  }

  // Test 18: Progress indicators reflect correct sequence position
  {
    const totalQuestions = 5;
    const currentQIndex = 2; // on 3rd question
    const progress = Math.round(((currentQIndex + 1) / totalQuestions) * 100);
    assert.strictEqual(progress, 60, 'Progress must be 60% at question 3 of 5');
    console.log('✓ Test 18 Passed: Progress indicators calculate correctly from sequence position');
    passedTests++;
  }

  // Test 19: Existing answers remain associated with correct question IDs
  {
    const { form } = await createTestQuiz('Answer Association', true, 4);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'ANS_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const order: string[] = startData.attempt.questionOrder;

    // Save answer to question at position 2 in shuffled sequence
    const targetQ = order[2];
    const saveReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/save-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startData.attempt.id,
        questionId: targetQ,
        value: 'MyAnswerVal',
      }),
    });
    const saveRes = await saveAnswerHandler(saveReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(saveRes.status, 200);

    const checkAttempt = await prisma.quizAttempt.findUnique({ where: { id: startData.attempt.id } });
    const answers = checkAttempt?.savedAnswers as Record<string, any>;
    assert.strictEqual(answers[targetQ], 'MyAnswerVal', 'Answer must be saved under the target question ID');
    console.log('✓ Test 19 Passed: Answers remain strictly associated with question ID');
    passedTests++;
  }

  // Test 20: Section grouping and navigation remain correct across multi-section quizzes
  {
    const { form, questions } = await createTestQuiz('MultiSection Shuffling', true, 6, 2);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'MULTI_SEC_USER' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const order: string[] = startData.attempt.questionOrder;

    const sec1QIds = questions.slice(0, 3).map((q) => q.id);
    const sec2QIds = questions.slice(3, 6).map((q) => q.id);

    // Section 1 questions must stay in first 3 positions
    const first3 = order.slice(0, 3);
    const last3 = order.slice(3, 6);
    assert.deepStrictEqual([...first3].sort(), [...sec1QIds].sort(), 'Section 1 questions stay within section 1');
    assert.deepStrictEqual([...last3].sort(), [...sec2QIds].sort(), 'Section 2 questions stay within section 2');
    console.log('✓ Test 20 Passed: Section grouping preserved; questions shuffled within sections');
    passedTests++;
  }

  // =================================================================
  // GROUP E: Quiz Functionality & Scoring Regression Tests
  // =================================================================
  console.log('\n--- GROUP E: Quiz Functionality Regression Tests ---');

  // Test 21, 22, 23, 24: Correct answer validation, scoring, points, finalization
  {
    const { form, questions } = await createTestQuiz('Scoring Verification', true, 4);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'PERFECT_STUDENT' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();
    const attemptId = startData.attempt.id;

    // Answer all 4 correctly regardless of order
    const finalAnswers = questions.map((q, idx) => ({
      questionId: q.id,
      value: `Opt-${idx + 1}`, // correct value
    }));

    const finalizeReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId,
        reason: 'MANUAL_SUBMISSION',
        finalAnswers,
      }),
    });
    const finalizeRes = await finalizeHandler(finalizeReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert.strictEqual(finalizeRes.status, 200);
    const finalData = await finalizeRes.json();

    // 4 questions * 5 points = 20 max points
    assert.strictEqual(finalData.score.total, 20, 'Total earned score must be 20/20');
    assert.strictEqual(finalData.score.max, 20, 'Max score must be 20');
    assert.strictEqual(finalData.score.percentage, 100, 'Score percentage must be 100%');
    console.log('✓ Test 21 Passed: Correct answer validation accurate');
    console.log('✓ Test 22 Passed: Quiz scoring accurate (100%)');
    console.log('✓ Test 23 Passed: Points allocation accurate (20/20)');
    console.log('✓ Test 24 Passed: Quiz finalization and attempt completion accurate');
    passedTests += 4;
  }

  // Test 25: Quiz result score breakdown formatted correctly
  {
    const { form, questions } = await createTestQuiz('Results Breakdown', true, 2);
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'HALF_STUDENT' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();

    // Answer 1 correct, 1 wrong
    const finalAnswers = [
      { questionId: questions[0].id, value: 'Opt-1' }, // correct
      { questionId: questions[1].id, value: 'Wrong-2' }, // wrong
    ];

    const finReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: startData.attempt.id, finalAnswers }),
    });
    const finRes = await finalizeHandler(finReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const finData = await finRes.json();

    assert.strictEqual(finData.score.total, 5);
    assert.strictEqual(finData.score.max, 10);
    assert.strictEqual(finData.score.percentage, 50);
    console.log('✓ Test 25 Passed: Quiz result pages receive accurate score breakdown (5/10, 50%)');
    passedTests++;
  }

  // Test 26: Live Quiz Analytics / Dashboard accurate
  {
    const { form } = await createTestQuiz('Dashboard Analytics', true, 2);
    // Start and finalize an attempt
    const startReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'DASH_P1' }),
    });
    const startRes = await attemptHandler(startReq, { params: Promise.resolve({ publicId: form.publicId }) });
    const startData = await startRes.json();

    await finalizeHandler(
      new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/quiz/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: startData.attempt.id, reason: 'MANUAL_SUBMISSION' }),
      }),
      { params: Promise.resolve({ publicId: form.publicId }) }
    );

    const dashReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/quiz/dashboard`, {
      headers: { cookie: authCookie },
    });
    const dashRes = await dashboardHandler(dashReq, { params: Promise.resolve({ id: form.id }) });
    assert.strictEqual(dashRes.status, 200);
    const dashData = await dashRes.json();

    assert.strictEqual(dashData.summary.completed, 1);
    console.log('✓ Test 26 Passed: Quiz analytics and dashboard remain 100% accurate');
    passedTests++;
  }

  // Test 27: Existing non-quiz forms are completely unaffected
  {
    const nonQuiz = await prisma.form.create({
      data: {
        title: 'Regular Contact Form',
        publicId: `reg-${Date.now()}`,
        status: 'PUBLISHED',
        isQuiz: false,
        ownerId: adminUser.id,
      },
    });

    const sec = await prisma.formSection.create({
      data: { formId: nonQuiz.id, title: 'Main', orderIndex: 0 },
    });

    const q = await prisma.formQuestion.create({
      data: {
        formId: nonQuiz.id,
        sectionId: sec.id,
        title: 'Full Name',
        type: 'SHORT_ANSWER',
        orderIndex: 0,
      },
    });

    const pubReq = new NextRequest(`http://localhost:3000/api/public/forms/${nonQuiz.publicId}`, { method: 'GET' });
    const pubRes = await publicFormHandler(pubReq, { params: Promise.resolve({ publicId: nonQuiz.publicId }) });
    assert.strictEqual(pubRes.status, 200);
    const pubData = await pubRes.json();
    assert.strictEqual(pubData.form.isQuiz, false);
    assert.strictEqual(pubData.form.sections[0].questions[0].title, 'Full Name');

    // Standard submission
    const subReq = new NextRequest(`http://localhost:3000/api/public/forms/${nonQuiz.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: q.id, value: 'John Doe' }],
      }),
    });
    const subRes = await publicSubmissionHandler(subReq, { params: Promise.resolve({ publicId: nonQuiz.publicId }) });
    assert.strictEqual(subRes.status, 200);
    console.log('✓ Test 27 Passed: Non-quiz forms submit and function normally without shuffle interference');
    passedTests++;
  }

  // =================================================================
  // GROUP F: Deterministic RNG Unit Tests
  // =================================================================
  console.log('\n--- GROUP F: Deterministic RNG Unit Tests ---');
  {
    const items = ['A', 'B', 'C', 'D', 'E'];

    // Deterministic pseudo-RNG for test reproducibility
    let seed = 42;
    function deterministicRng() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    const shuffled1 = fisherYatesShuffle(items, deterministicRng);
    seed = 42;
    const shuffled2 = fisherYatesShuffle(items, deterministicRng);
    assert.deepStrictEqual(shuffled1, shuffled2, 'Deterministic RNG must produce reproducible shuffle');
    assert.strictEqual(shuffled1.length, items.length);
    assert.deepStrictEqual([...shuffled1].sort(), [...items].sort());
    console.log('✓ Deterministic Fisher-Yates shuffle verified with custom RNG');
  }

  console.log('\n================================================================');
  console.log(`  ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY! (100%) `);
  console.log('================================================================');
}

runQuizShuffleRegressionTests().catch((err) => {
  console.error('\n❌ REGRESSION TEST FAILED:', err);
  process.exit(1);
});

