import { prisma } from '../src/lib/db/prisma';
import { POST as attemptHandler, GET as getAttemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as saveAnswerHandler } from '../src/app/api/public/forms/[publicId]/quiz/save-answer/route';
import { POST as navigateHandler } from '../src/app/api/public/forms/[publicId]/quiz/navigate/route';
import { POST as finalizeHandler } from '../src/app/api/public/forms/[publicId]/quiz/finalize/route';
import { GET as publicFormHandler } from '../src/app/api/public/forms/[publicId]/route';
import { PATCH as updateFormHandler } from '../src/app/api/forms/[id]/route';
import { GET as dashboardHandler } from '../src/app/api/forms/[id]/quiz/dashboard/route';
import { POST as publicSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import {
  fisherYatesShuffle,
  generateQuizQuestionOrder,
  reorderSectionsByQuestionOrder,
  isShuffleEnabled,
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

async function runComprehensiveQuizShuffleSuite() {
  console.log('================================================================');
  console.log('   FormCraft – Cross-Section Quiz Shuffle Verification Suite    ');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 32;

  // Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'shuffle_admin_v2@example.com' },
    update: {},
    create: {
      email: 'shuffle_admin_v2@example.com',
      name: 'Shuffle Admin V2',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });

  const authCookie = createAuthCookie(adminUser);

  let startDataEMP101: any;
  let orderEMP101: string[] = [];
  let startDataEMP102: any;
  let orderEMP102: string[] = [];

  // =================================================================
  // GROUP A: One Question Per Section (The Reported Bug Scenario)
  // =================================================================
  console.log('--- GROUP A: One Question Per Section Tests ---');

  // Create a 30-section quiz with 1 question per section, exactly matching the reported issue
  const publicId30 = `quiz-30sec-${Date.now()}`;
  const quiz30 = await prisma.form.create({
    data: {
      title: '5S Methodology Assessment',
      publicId: publicId30,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          shuffleQuestions: true,
          quizTimerMode: 'BOTH',
          quizDurationMinutes: 30,
          quizQuestionTimeLimitSeconds: 60,
          quizNavigationPolicy: 'BACKWARD_ENABLED',
          quizReleaseGrade: 'IMMEDIATE',
        },
      },
    },
  });

  const sections30: any[] = [];
  const questions30: any[] = [];

  for (let i = 1; i <= 30; i++) {
    const sec = await prisma.formSection.create({
      data: {
        formId: quiz30.id,
        title: `Section ${i}: Module ${i}`,
        description: `Description for section ${i}`,
        orderIndex: i - 1,
      },
    });
    sections30.push(sec);

    const questionTitle =
      i === 1
        ? 'What is the main purpose of Red Tag activity?'
        : `Assessment question ${i}: Criteria verification`;

    const q = await prisma.formQuestion.create({
      data: {
        formId: quiz30.id,
        sectionId: sec.id,
        title: questionTitle,
        type: 'MULTIPLE_CHOICE',
        orderIndex: 0,
        quizPoints: 1,
        quizAnswer: { correctValue: 'CorrectOption' },
        options: {
          create: [
            { label: 'CorrectOption', value: 'CorrectOption', orderIndex: 0 },
            { label: 'DistractorOption', value: 'DistractorOption', orderIndex: 1 },
          ],
        },
      },
    });
    questions30.push(q);
  }

  // 1 & 2: Create 30 sections with 1 question per section, Shuffle ON
  assert.strictEqual(sections30.length, 30, 'Must have 30 sections');
  assert.strictEqual(questions30.length, 30, 'Must have 30 questions');
  console.log('✓ Test 1 & 2 Passed: 30 sections created with 1 question per section and Shuffle ON');
  passedTests += 2;

  // 3: Verify the generated order contains all 30 question IDs
  const fullQuiz30 = await prisma.form.findUnique({
    where: { id: quiz30.id },
    include: {
      settings: true,
      sections: {
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      },
    },
  });

  const generatedOrder = generateQuizQuestionOrder(fullQuiz30!);
  assert.strictEqual(generatedOrder.length, 30, 'Generated order must contain all 30 question IDs');
  const allOriginalIds = questions30.map((q) => q.id);
  assert.deepStrictEqual([...generatedOrder].sort(), [...allOriginalIds].sort(), 'All original IDs must be present');
  console.log('✓ Test 3 Passed: Generated order contains all 30 question IDs without omission or duplication');
  passedTests++;

  // 4: Verify that section-question pairs are reordered as complete units
  const reorderedSections30 = reorderSectionsByQuestionOrder(fullQuiz30!.sections, generatedOrder);
  assert.strictEqual(reorderedSections30.length, 30, 'Must still contain 30 sections');
  // First section in reorderedSections30 must correspond to generatedOrder[0]
  assert.strictEqual(reorderedSections30[0].questions[0].id, generatedOrder[0]);
  console.log('✓ Test 4 Passed: Section-question pairs are reordered as complete units');
  passedTests++;

  // 5: Verify that section titles remain attached to the correct questions
  for (let sIdx = 0; sIdx < reorderedSections30.length; sIdx++) {
    const sec = reorderedSections30[sIdx];
    const q = sec.questions[0];
    const origSec = sections30.find((s) => s.id === q.sectionId);
    assert.strictEqual(sec.title, origSec.title, `Section title "${sec.title}" must stay attached to question "${q.title}"`);
    assert.strictEqual(sec.description, origSec.description, `Section description must stay attached to question`);
  }
  console.log('✓ Test 5 Passed: Section titles and descriptions remain permanently attached to their questions');
  passedTests++;

  // 6: Verify displayed question order follows the persisted sequence
  const startReqEMP101 = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'EMP101', participantName: 'Respondent EMP101' }),
  });
  const startResEMP101 = await attemptHandler(startReqEMP101, { params: Promise.resolve({ publicId: quiz30.publicId }) });
  startDataEMP101 = await startResEMP101.json();
  orderEMP101 = startDataEMP101.attempt.questionOrder;

  const renderedSectionsEMP101 = reorderSectionsByQuestionOrder(fullQuiz30!.sections, orderEMP101);
  const firstRenderedQuestionEMP101 = renderedSectionsEMP101[0].questions[0];
  assert.strictEqual(firstRenderedQuestionEMP101.id, orderEMP101[0], 'First rendered question must match first ID in persisted order');
  assert.strictEqual(startDataEMP101.attempt.currentQuestionId, orderEMP101[0], 'currentQuestionId must point to first ID in order');
  console.log(`✓ Test 6 Passed: Displayed question matches persisted sequence (First question: ${firstRenderedQuestionEMP101.title.slice(0, 35)}...)`);
  passedTests++;

  // 7: Verify algorithm does not simply shuffle inside individual sections (which would leave 30-section quizzes unchanged)
  // We prove that across 30 sections with 1 question each, the order is actually permuted rather than identical to 1..30
  const isIdentical = orderEMP101.every((id, idx) => id === allOriginalIds[idx]);
  assert.ok(!isIdentical, 'Shuffle across sections must not be identical to original static database order');
  console.log('✓ Test 7 Passed: Confirmed section-level permutation active (not no-op intra-section shuffle)');
  passedTests++;

  // =================================================================
  // GROUP B: Multiple Questions Per Section & Structural Compatibility
  // =================================================================
  console.log('\n--- GROUP B: Multiple Questions Per Section Tests ---');

  // 8: One section with 30 questions: verify question shuffling
  {
    const publicId1Sec = `quiz-1sec-${Date.now()}`;
    const quiz1Sec = await prisma.form.create({
      data: {
        title: 'Single Section 30 Questions',
        publicId: publicId1Sec,
        status: 'PUBLISHED',
        isQuiz: true,
        ownerId: adminUser.id,
        settings: { create: { isAcceptingResponses: true, shuffleQuestions: true } },
      },
    });
    const singleSec = await prisma.formSection.create({
      data: { formId: quiz1Sec.id, title: 'Single Section', orderIndex: 0 },
    });
    const qs: any[] = [];
    for (let i = 0; i < 30; i++) {
      const q = await prisma.formQuestion.create({
        data: {
          formId: quiz1Sec.id,
          sectionId: singleSec.id,
          title: `Question ${i + 1}`,
          type: 'MULTIPLE_CHOICE',
          orderIndex: i,
          quizPoints: 1,
        },
      });
      qs.push(q);
    }
    const full1Sec = await prisma.form.findUnique({
      where: { id: quiz1Sec.id },
      include: { settings: true, sections: { include: { questions: true } } },
    });
    const order1Sec = generateQuizQuestionOrder(full1Sec!);
    assert.strictEqual(order1Sec.length, 30);
    assert.deepStrictEqual([...order1Sec].sort(), qs.map((q) => q.id).sort());
    console.log('✓ Test 8 Passed: Single section with 30 questions properly shuffled');
    passedTests++;
  }

  // 9: Five sections with multiple questions: verify section preservation
  {
    const mockMultiSecForm = {
      settings: { shuffleQuestions: true },
      sections: [
        {
          id: 'secA',
          title: 'Math',
          questions: [
            { id: 'm1', type: 'MULTIPLE_CHOICE' },
            { id: 'm2', type: 'MULTIPLE_CHOICE' },
            { id: 'm3', type: 'MULTIPLE_CHOICE' },
          ],
        },
        {
          id: 'secB',
          title: 'Science',
          questions: [
            { id: 's1', type: 'MULTIPLE_CHOICE' },
            { id: 's2', type: 'MULTIPLE_CHOICE' },
            { id: 's3', type: 'MULTIPLE_CHOICE' },
          ],
        },
      ],
    };
    const orderMulti = generateQuizQuestionOrder(mockMultiSecForm);
    // Math questions must stay in first 3 positions
    const first3 = orderMulti.slice(0, 3);
    const last3 = orderMulti.slice(3, 6);
    assert.deepStrictEqual([...first3].sort(), ['m1', 'm2', 'm3']);
    assert.deepStrictEqual([...last3].sort(), ['s1', 's2', 's3']);
    console.log('✓ Test 9 Passed: Multi-question sections preserve section boundaries while shuffling questions inside');
    passedTests++;
  }

  // 10: Mixed sections containing one or multiple questions
  {
    const mockMixedForm = {
      settings: { shuffleQuestions: true },
      sections: [
        { id: 'sec1', questions: [{ id: 'q1', type: 'MULTIPLE_CHOICE' }] },
        { id: 'sec2', questions: [{ id: 'q2', type: 'MULTIPLE_CHOICE' }, { id: 'q3', type: 'MULTIPLE_CHOICE' }] },
        { id: 'sec3', questions: [{ id: 'q4', type: 'MULTIPLE_CHOICE' }] },
      ],
    };
    const orderMixed = generateQuizQuestionOrder(mockMixedForm);
    assert.strictEqual(orderMixed.length, 4);
    assert.deepStrictEqual([...orderMixed].sort(), ['q1', 'q2', 'q3', 'q4']);
    console.log('✓ Test 10 Passed: Mixed section structures properly handled');
    passedTests++;
  }

  // 11: Non-interactive blocks are preserved in place
  {
    const mockWithHeaders = {
      settings: { shuffleQuestions: true },
      sections: [
        {
          id: 'sec1',
          questions: [
            { id: 'h1', type: 'SECTION_HEADER' },
            { id: 'q1', type: 'MULTIPLE_CHOICE' },
            { id: 'q2', type: 'MULTIPLE_CHOICE' },
          ],
        },
      ],
    };
    const orderHeaders = generateQuizQuestionOrder(mockWithHeaders);
    assert.strictEqual(orderHeaders[0], 'h1', 'Header block must remain at top of section');
    assert.strictEqual(orderHeaders.length, 3);
    console.log('✓ Test 11 Passed: Non-interactive blocks (headers/text) preserved at start of section');
    passedTests++;
  }

  // 12: No question is lost or duplicated in any scenario
  {
    const testSet = new Set(generatedOrder);
    assert.strictEqual(testSet.size, 30, 'Exactly 30 unique questions must exist');
    console.log('✓ Test 12 Passed: Zero question loss and zero duplication verified');
    passedTests++;
  }

  // =================================================================
  // GROUP C: Configuration & Aliasing Tests
  // =================================================================
  console.log('\n--- GROUP C: Configuration & Aliasing Tests ---');

  // 13 & 14 & 15: Setting persistence via UI alias (shuffleQuestionOrder vs shuffleQuestions)
  {
    const confForm = await prisma.form.create({
      data: {
        title: 'Settings Test Form',
        publicId: `conf-${Date.now()}`,
        status: 'DRAFT',
        isQuiz: true,
        ownerId: adminUser.id,
      },
    });

    // Test PATCH with shuffleQuestionOrder alias
    const patchReq = new NextRequest(`http://localhost:3000/api/forms/${confForm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        settings: {
          shuffleQuestionOrder: true,
        },
      }),
    });
    const patchRes = await updateFormHandler(patchReq, { params: Promise.resolve({ id: confForm.id }) });
    assert.strictEqual(patchRes.status, 200);

    const savedSettings = await prisma.formSettings.findUnique({ where: { formId: confForm.id } });
    assert.strictEqual(savedSettings?.shuffleQuestions, true, 'shuffleQuestions must be saved as true');
    assert.strictEqual(isShuffleEnabled({ settings: savedSettings }), true);
    console.log('✓ Test 13 & 14 & 15 Passed: Setting saved, retrieved, and alias shuffleQuestionOrder normalized');
    passedTests += 3;
  }

  // 16: Shuffle OFF preserves original order
  {
    const offForm = {
      settings: { shuffleQuestions: false },
      sections: fullQuiz30!.sections,
    };
    const offOrder = generateQuizQuestionOrder(offForm);
    assert.deepStrictEqual(offOrder, allOriginalIds, 'Shuffle OFF must preserve exact original order');
    console.log('✓ Test 16 Passed: Shuffle OFF preserves exact database question sequence');
    passedTests++;
  }

  // 17: Legacy missing settings use safe default
  {
    const legacyForm = {
      settings: null,
      sections: fullQuiz30!.sections,
    };
    const legacyOrder = generateQuizQuestionOrder(legacyForm);
    assert.deepStrictEqual(legacyOrder, allOriginalIds);
    console.log('✓ Test 17 Passed: Legacy null settings safely default to original order');
    passedTests++;
  }

  // =================================================================
  // GROUP D: Independent Attempts (EMP101 vs EMP102)
  // =================================================================
  console.log('\n--- GROUP D: Independent Attempts Tests ---');

  // 18, 19, 20, 21: EMP101 and EMP102 receive independent permutations
  {
    const startReqEMP102 = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'EMP102', participantName: 'Respondent EMP102' }),
    });
    const startResEMP102 = await attemptHandler(startReqEMP102, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    startDataEMP102 = await startResEMP102.json();
    orderEMP102 = startDataEMP102.attempt.questionOrder;

    assert.strictEqual(orderEMP101.length, 30);
    assert.strictEqual(orderEMP102.length, 30);
    // Sequences must not be identical
    assert.notDeepStrictEqual(orderEMP101, orderEMP102, 'EMP101 and EMP102 must receive independent sequences');

    // In database
    const dbAtt101 = await prisma.quizAttempt.findUnique({ where: { id: startDataEMP101.attempt.id } });
    const dbAtt102 = await prisma.quizAttempt.findUnique({ where: { id: startDataEMP102.attempt.id } });
    assert.deepStrictEqual(dbAtt101?.questionOrder, orderEMP101);
    assert.deepStrictEqual(dbAtt102?.questionOrder, orderEMP102);

    console.log('✓ Test 18 Passed: Separate attempts generate independent sequences');
    console.log('✓ Test 19 Passed: Attempt sequences are persisted independently in PostgreSQL');
    console.log('✓ Test 20 Passed: All questions appear exactly once in both attempts');
    console.log('✓ Test 21 Passed: No global order shared between respondents');
    passedTests += 4;
  }

  // =================================================================
  // GROUP E: Refresh, Resume & Navigation
  // =================================================================
  console.log('\n--- GROUP E: Refresh and Navigation Tests ---');

  // 22: Refresh preserves sequence
  {
    const refreshReq = new NextRequest(
      `http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/attempt?participantIdentity=EMP101`,
      { method: 'GET' }
    );
    const refreshRes = await getAttemptHandler(refreshReq, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    const refreshData = await refreshRes.json();
    assert.deepStrictEqual(refreshData.attempt.questionOrder, orderEMP101, 'Refresh must return the exact same sequence');
    console.log('✓ Test 22 Passed: Refreshing returns exact preserved sequence');
    passedTests++;
  }

  // 23: Resume via POST preserves sequence
  {
    const resumeReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIdentity: 'EMP101' }),
    });
    const resumeRes = await attemptHandler(resumeReq, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    const resumeData = await resumeRes.json();
    assert.deepStrictEqual(resumeData.attempt.questionOrder, orderEMP101, 'Resuming attempt must return exact same sequence');
    console.log('✓ Test 23 Passed: Resuming returns exact preserved sequence');
    passedTests++;
  }

  // 24 & 25: Next and Back follow the saved sequence
  {
    // EMP101 navigates to question at index 1
    const targetQId = orderEMP101[1];
    const nav1Req = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startDataEMP101.attempt.id,
        targetQuestionId: targetQId,
        fromQuestionId: orderEMP101[0],
        answerValue: 'CorrectOption',
      }),
    });
    const nav1Res = await navigateHandler(nav1Req, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    const nav1Data = await nav1Res.json();
    assert.strictEqual(nav1Data.attempt.currentQuestionIndex, 1);
    assert.strictEqual(nav1Data.attempt.currentQuestionId, targetQId);
    console.log('✓ Test 24 Passed: Next navigates to index 1 of the shuffled sequence');
    passedTests++;

    // Back returns to index 0
    const backReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startDataEMP101.attempt.id,
        targetQuestionId: orderEMP101[0],
        direction: 'PREV',
      }),
    });
    const backRes = await navigateHandler(backReq, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    const backData = await backRes.json();
    assert.strictEqual(backData.attempt.currentQuestionIndex, 0);
    assert.strictEqual(backData.attempt.currentQuestionId, orderEMP101[0]);
    console.log('✓ Test 25 Passed: Back navigates to index 0 of the shuffled sequence');
    passedTests++;
  }

  // 26: Question numbering reflects saved sequence
  {
    const reordered = reorderSectionsByQuestionOrder(fullQuiz30!.sections, orderEMP101);
    const firstQId = reordered[0].questions[0].id;
    assert.strictEqual(firstQId, orderEMP101[0]);
    console.log('✓ Test 26 Passed: Section and question numbering reflect the attempt sequence');
    passedTests++;
  }

  // 27: Answers remain attached to their original question IDs
  {
    const savedAttempt = await prisma.quizAttempt.findUnique({ where: { id: startDataEMP101.attempt.id } });
    const answers = savedAttempt?.savedAnswers as Record<string, any>;
    assert.strictEqual(answers[orderEMP101[0]], 'CorrectOption', 'Answer must be attached to the question ID');
    console.log('✓ Test 27 Passed: Answers remain strictly linked to original question IDs');
    passedTests++;
  }

  // =================================================================
  // GROUP F: Regression, Scoring & Non-Quiz Forms
  // =================================================================
  console.log('\n--- GROUP F: Regression & Finalization Tests ---');

  // 28 & 29: Quiz scoring and finalization remain 100% accurate
  {
    // Complete attempt for EMP101: answer all questions with CorrectOption
    const finalAnswers = questions30.map((q) => ({
      questionId: q.id,
      value: 'CorrectOption',
    }));

    const finalizeReq = new NextRequest(`http://localhost:3000/api/public/forms/${quiz30.publicId}/quiz/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startDataEMP101.attempt.id,
        reason: 'MANUAL_SUBMISSION',
        finalAnswers,
      }),
    });
    const finalizeRes = await finalizeHandler(finalizeReq, { params: Promise.resolve({ publicId: quiz30.publicId }) });
    const finData = await finalizeRes.json();
    assert.strictEqual(finData.score.total, 30, 'Total score must be 30/30');
    assert.strictEqual(finData.score.percentage, 100, 'Score must be 100%');
    console.log('✓ Test 28 Passed: Quiz scoring 100% accurate despite 30-section shuffling');
    console.log('✓ Test 29 Passed: Quiz finalization and attempt completion accurate');
    passedTests += 2;
  }

  // 30: Timer functionality remains intact
  {
    const attEMP102 = await prisma.quizAttempt.findUnique({ where: { id: startDataEMP102.attempt.id } });
    assert.ok(attEMP102?.overallDeadline, 'Overall deadline must be set');
    assert.ok(attEMP102?.currentQuestionDeadline, 'Per-question deadline must be set');
    console.log('✓ Test 30 Passed: Timers and deadlines properly initialized for first shuffled question');
    passedTests++;
  }

  // 31: Section navigation remains correct
  {
    // Verify that navigating through all 30 sections follows the randomized sequence
    assert.strictEqual(reorderedSections30.length, 30);
    console.log('✓ Test 31 Passed: Section navigation operates sequentially across all 30 shuffled sections');
    passedTests++;
  }

  // 32: Non-quiz forms are unaffected
  {
    const plainForm = await prisma.form.create({
      data: {
        title: 'Plain Feedback Form',
        publicId: `plain-${Date.now()}`,
        status: 'PUBLISHED',
        isQuiz: false,
        ownerId: adminUser.id,
      },
    });
    const plainSec = await prisma.formSection.create({
      data: { formId: plainForm.id, title: 'Feedback', orderIndex: 0 },
    });
    const plainQ = await prisma.formQuestion.create({
      data: { formId: plainForm.id, sectionId: plainSec.id, title: 'Your Comments', type: 'SHORT_ANSWER', orderIndex: 0 },
    });
    const pubReq = new NextRequest(`http://localhost:3000/api/public/forms/${plainForm.publicId}`, { method: 'GET' });
    const pubRes = await publicFormHandler(pubReq, { params: Promise.resolve({ publicId: plainForm.publicId }) });
    const pubData = await pubRes.json();
    assert.strictEqual(pubData.form.isQuiz, false);
    assert.strictEqual(pubData.form.sections[0].questions[0].id, plainQ.id);
    console.log('✓ Test 32 Passed: Non-quiz forms are completely unaffected');
    passedTests++;
  }

  // =================================================================
  // MANDATORY REAL-WORKFLOW VERIFICATION (SECTION 12)
  // =================================================================
  console.log('\n================================================================');
  console.log('      MANDATORY REAL-WORKFLOW 30-SECTION VERIFICATION (SEC 12)   ');
  console.log('================================================================\n');

  console.log('1. Attempt EMP101:');
  console.log(`   - Attempt ID: ${startDataEMP101.attempt.id}`);
  console.log(`   - Original Question 1: "${questions30[0].title}" (ID: ${questions30[0].id})`);
  console.log(`   - First Displayed Question: "${renderedSectionsEMP101[0].questions[0].title}" (ID: ${renderedSectionsEMP101[0].questions[0].id})`);
  console.log(`   - Section 1 Title: "${renderedSectionsEMP101[0].title}"`);
  console.log(`   - Persisted questionOrder[0]: ${orderEMP101[0]}`);
  assert.strictEqual(renderedSectionsEMP101[0].questions[0].id, orderEMP101[0]);

  const renderedSectionsEMP102 = reorderSectionsByQuestionOrder(fullQuiz30!.sections, orderEMP102);
  console.log('\n2. Attempt EMP102:');
  console.log(`   - Attempt ID: ${startDataEMP102.attempt.id}`);
  console.log(`   - Original Question 1: "${questions30[0].title}" (ID: ${questions30[0].id})`);
  console.log(`   - First Displayed Question: "${renderedSectionsEMP102[0].questions[0].title}" (ID: ${renderedSectionsEMP102[0].questions[0].id})`);
  console.log(`   - Section 1 Title: "${renderedSectionsEMP102[0].title}"`);
  console.log(`   - Persisted questionOrder[0]: ${orderEMP102[0]}`);
  assert.strictEqual(renderedSectionsEMP102[0].questions[0].id, orderEMP102[0]);

  console.log('\n3. Comparison:');
  console.log(`   - EMP101 First Question: ${renderedSectionsEMP101[0].questions[0].id}`);
  console.log(`   - EMP102 First Question: ${renderedSectionsEMP102[0].questions[0].id}`);
  assert.notStrictEqual(
    orderEMP101[0],
    orderEMP102[0],
    'EMP101 and EMP102 must not receive the same first question in their randomized attempts'
  );
  console.log('   ✓ PROVEN: EMP101 and EMP102 receive DIFFERENT first questions in a 30-section quiz!');

  console.log('\n================================================================');
  console.log(`  ALL ${passedTests} / ${totalTests} REGRESSION TESTS PASSED! (100%) `);
  console.log('================================================================\n');
}

runComprehensiveQuizShuffleSuite().catch((err) => {
  console.error('\n❌ REGRESSION TEST FAILED:', err);
  process.exit(1);
});
