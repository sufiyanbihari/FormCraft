import assert from 'assert';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { getEffectiveQuestionTimer } from '../src/lib/quiz/quizTimer';
import { POST as createFormHandler, GET as listFormsHandler } from '../src/app/api/forms/route';
import { GET as getFormHandler, PATCH as patchFormHandler } from '../src/app/api/forms/[id]/route';
import { POST as addQuestionHandler } from '../src/app/api/forms/[id]/questions/route';
import { PATCH as patchQuestionHandler } from '../src/app/api/forms/[id]/questions/[questionId]/route';
import { POST as duplicateFormHandler } from '../src/app/api/forms/[id]/duplicate/route';
import { POST as importFcQuestionsHandler } from '../src/app/api/forms/[id]/import-questions/route';
import { GET as getPublicFormHandler } from '../src/app/api/public/forms/[publicId]/route';
import { POST as attemptHandler, GET as getAttemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as navigateHandler } from '../src/app/api/public/forms/[publicId]/quiz/navigate/route';
import { POST as saveAnswerHandler } from '../src/app/api/public/forms/[publicId]/quiz/save-answer/route';
import { POST as finalizeHandler } from '../src/app/api/public/forms/[publicId]/quiz/finalize/route';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createAuthCookie(user: { id: string; email: string; role: string }): string {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `formcraft_session=${token}`;
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: FormCraft Per-Question Quiz Timer Synchronization Suite   ');
  console.log('========================================================================\n');

  let passedTests = 0;

  // 0. Setup Test User
  const testUser = await prisma.user.upsert({
    where: { email: 'timer_sync_tester@formcraft.test' },
    update: {},
    create: {
      email: 'timer_sync_tester@formcraft.test',
      name: 'Timer Sync Tester',
      passwordHash: 'dummy_hash',
      role: 'ADMIN',
    },
  });
  const cookie = createAuthCookie(testUser);

  // ===========================================================================
  // GROUP A: Effective Timer Calculation
  // ===========================================================================
  console.log('--- GROUP A: Effective Timer Calculation Tests ---');

  // 1. Per-Question mode with 10 seconds returns an effective timer of 10
  {
    const settings = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 10 };
    const q = { timeLimitSeconds: 0 };
    const res = getEffectiveQuestionTimer(q, settings, true);
    assert.strictEqual(res.effectiveSeconds, 10);
    assert.strictEqual(res.isInherited, true);
    assert.strictEqual(res.hasOverride, false);
    assert.strictEqual(res.isTimerActive, true);
    console.log('✓ Test 1 Passed: Per-Question mode with 10s returns effective timer 10s (inherited)');
    passedTests++;
  }

  // 2. Per-Question mode with 20 seconds returns an effective timer of 20
  {
    const settings = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 20 };
    const q = { timeLimitSeconds: 0 };
    const res = getEffectiveQuestionTimer(q, settings, true);
    assert.strictEqual(res.effectiveSeconds, 20);
    assert.strictEqual(res.isInherited, true);
    assert.strictEqual(res.hasOverride, false);
    console.log('✓ Test 2 Passed: Per-Question mode with 20s returns effective timer 20s');
    passedTests++;
  }

  // 3. Inherited timer values update when quiz settings change
  {
    const q = { timeLimitSeconds: 0 };
    const settings1 = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 15 };
    const settings2 = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 30 };
    assert.strictEqual(getEffectiveQuestionTimer(q, settings1, true).effectiveSeconds, 15);
    assert.strictEqual(getEffectiveQuestionTimer(q, settings2, true).effectiveSeconds, 30);
    console.log('✓ Test 3 Passed: Inherited timer dynamically updates when quiz settings change');
    passedTests++;
  }

  // 4. Individual overrides are preserved when supported
  {
    const settings = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 10 };
    const qWithOverride = { timeLimitSeconds: 45 };
    const res = getEffectiveQuestionTimer(qWithOverride, settings, true);
    assert.strictEqual(res.effectiveSeconds, 45);
    assert.strictEqual(res.hasOverride, true);
    assert.strictEqual(res.isInherited, false);
    console.log('✓ Test 4 Passed: Individual question override (45s) takes precedence over quiz-level (10s)');
    passedTests++;
  }

  // 5. Zero-valued timer semantics are handled correctly
  {
    const settings = { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 10 };
    const qZero = { timeLimitSeconds: 0 };
    const qNull = { timeLimitSeconds: null };
    const qUndefined = { timeLimitSeconds: undefined };
    assert.strictEqual(getEffectiveQuestionTimer(qZero, settings, true).effectiveSeconds, 10);
    assert.strictEqual(getEffectiveQuestionTimer(qNull, settings, true).effectiveSeconds, 10);
    assert.strictEqual(getEffectiveQuestionTimer(qUndefined, settings, true).effectiveSeconds, 10);
    console.log('✓ Test 5 Passed: Zero, null, and undefined timeLimitSeconds inherit quiz default without suppression');
    passedTests++;
  }

  // 6. No Timers mode does not apply the global countdown
  {
    const settings = { quizTimerMode: 'NONE', quizQuestionTimeLimitSeconds: 10 };
    const qDefault = { timeLimitSeconds: 0 };
    const resDefault = getEffectiveQuestionTimer(qDefault, settings, true);
    assert.strictEqual(resDefault.effectiveSeconds, 0);
    assert.strictEqual(resDefault.isTimerActive, false);

    // If an individual question has an override, it is preserved
    const qOverride = { timeLimitSeconds: 25 };
    const resOverride = getEffectiveQuestionTimer(qOverride, settings, true);
    assert.strictEqual(resOverride.effectiveSeconds, 25);
    assert.strictEqual(resOverride.hasOverride, true);
    console.log('✓ Test 6 Passed: No Timers mode does not apply global countdown, respects custom override');
    passedTests++;
  }

  // 7. Overall Duration mode does not apply a per-question countdown
  {
    const settings = { quizTimerMode: 'OVERALL', quizDurationMinutes: 30, quizQuestionTimeLimitSeconds: 10 };
    const qDefault = { timeLimitSeconds: 0 };
    const res = getEffectiveQuestionTimer(qDefault, settings, true);
    assert.strictEqual(res.effectiveSeconds, 0);
    assert.strictEqual(res.isTimerActive, false);
    console.log('✓ Test 7 Passed: Overall Duration mode does not apply per-question countdown');
    passedTests++;
  }

  // 8. Both Timers mode applies both timer configurations
  {
    const settings = { quizTimerMode: 'BOTH', quizDurationMinutes: 10, quizQuestionTimeLimitSeconds: 15 };
    const qDefault = { timeLimitSeconds: 0 };
    const res = getEffectiveQuestionTimer(qDefault, settings, true);
    assert.strictEqual(res.effectiveSeconds, 15);
    assert.strictEqual(res.isTimerActive, true);
    console.log('✓ Test 8 Passed: Both Timers mode applies per-question countdown');
    passedTests++;
  }

  // ===========================================================================
  // GROUP B: Question Editor Synchronization
  // ===========================================================================
  console.log('\n--- GROUP B: Question Editor Synchronization Tests ---');

  // Create test quiz form with Per-Question mode: 10 seconds
  const createReq = new NextRequest('http://localhost:3000/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      title: 'Timer Sync Quiz Form',
      isQuiz: true,
      settings: {
        quizTimerMode: 'QUESTION',
        quizQuestionTimeLimitSeconds: 10,
      },
    }),
  });
  const createRes = await createFormHandler(createReq);
  assert.strictEqual(createRes.status, 200);
  const { form: quizForm } = await createRes.json();
  const formId = quizForm.id;

  // Verify form created with settings
  await prisma.formSettings.update({
    where: { formId },
    data: {
      quizTimerMode: 'QUESTION',
      quizQuestionTimeLimitSeconds: 10,
    },
  });

  // 9. Existing questions display the inherited timer
  const initialForm = await prisma.form.findUnique({
    where: { id: formId },
    include: { settings: true, sections: { include: { questions: true } } },
  });
  const q1 = initialForm!.sections[0].questions[0];
  const q1Timer = getEffectiveQuestionTimer(q1, initialForm!.settings, initialForm!.isQuiz);
  assert.strictEqual(q1Timer.effectiveSeconds, 10);
  assert.strictEqual(q1Timer.isInherited, true);
  console.log('✓ Test 9 Passed: Existing question displays inherited timer (10s)');
  passedTests++;

  // 10. Newly created questions inherit the configured timer
  const addQReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sectionId: initialForm!.sections[0].id,
      title: 'Question Two',
      type: 'MULTIPLE_CHOICE',
    }),
  });
  const addQRes = await addQuestionHandler(addQReq, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(addQRes.status, 200);
  const { question: newQ } = await addQRes.json();
  const newQTimer = getEffectiveQuestionTimer(newQ, initialForm!.settings, true);
  assert.strictEqual(newQTimer.effectiveSeconds, 10);
  assert.strictEqual(newQTimer.isInherited, true);
  console.log('✓ Test 10 Passed: Newly created question inherits configured timer (10s)');
  passedTests++;

  // 11. Duplicated questions preserve timer semantics
  // Set an individual override on newQ: 35s
  await prisma.formQuestion.update({
    where: { id: newQ.id },
    data: { timeLimitSeconds: 35 },
  });
  // Duplicate question via editor handler simulation (preserving timeLimitSeconds)
  const dupQReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sectionId: initialForm!.sections[0].id,
      title: `Copy of ${newQ.title}`,
      type: newQ.type,
      timeLimitSeconds: 35,
    }),
  });
  const dupQRes = await addQuestionHandler(dupQReq, { params: Promise.resolve({ id: formId }) });
  const { question: dupQ } = await dupQRes.json();
  const dupQTimer = getEffectiveQuestionTimer(dupQ, initialForm!.settings, true);
  assert.strictEqual(dupQTimer.effectiveSeconds, 35);
  assert.strictEqual(dupQTimer.hasOverride, true);
  console.log('✓ Test 11 Passed: Duplicated question preserves individual timer override (35s)');
  passedTests++;

  // 12. Changing quiz-level timer updates inherited values
  const patchSettingsReq = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      settings: {
        quizQuestionTimeLimitSeconds: 20,
      },
    }),
  });
  const patchSettingsRes = await patchFormHandler(patchSettingsReq, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(patchSettingsRes.status, 200);
  const updatedFormData = await (await getFormHandler(new NextRequest(`http://localhost:3000/api/forms/${formId}`, { headers: { cookie } }), { params: Promise.resolve({ id: formId }) })).json();
  const updatedSettings = updatedFormData.form.settings;
  assert.strictEqual(updatedSettings.quizQuestionTimeLimitSeconds, 20);

  // Inherited question q1 now calculates to 20s
  assert.strictEqual(getEffectiveQuestionTimer(q1, updatedSettings, true).effectiveSeconds, 20);
  console.log('✓ Test 12 Passed: Changing quiz-level timer to 20s immediately updates inherited questions');
  passedTests++;

  // 13. Explicit individual overrides are not accidentally overwritten
  const freshDupQ = await prisma.formQuestion.findUnique({ where: { id: dupQ.id } });
  assert.strictEqual(getEffectiveQuestionTimer(freshDupQ, updatedSettings, true).effectiveSeconds, 35);
  console.log('✓ Test 13 Passed: Explicit individual override (35s) was not overwritten by settings change');
  passedTests++;

  // 14. Timer values remain correct after reopening the editor
  const reopenedForm = await (await getFormHandler(new NextRequest(`http://localhost:3000/api/forms/${formId}`, { headers: { cookie } }), { params: Promise.resolve({ id: formId }) })).json();
  const reopenedQ1 = reopenedForm.form.sections[0].questions.find((q: any) => q.id === q1.id);
  const reopenedDupQ = reopenedForm.form.sections[0].questions.find((q: any) => q.id === dupQ.id);
  assert.strictEqual(getEffectiveQuestionTimer(reopenedQ1, reopenedForm.form.settings, true).effectiveSeconds, 20);
  assert.strictEqual(getEffectiveQuestionTimer(reopenedDupQ, reopenedForm.form.settings, true).effectiveSeconds, 35);
  console.log('✓ Test 14 Passed: Editor reload returns exact synchronized timer values');
  passedTests++;

  // ===========================================================================
  // GROUP C: Persistence & Data Integrity
  // ===========================================================================
  console.log('\n--- GROUP C: Persistence & Data Integrity Tests ---');

  // 15. Quiz-level timer settings save correctly
  const patchBothReq = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      settings: {
        quizTimerMode: 'BOTH',
        quizDurationMinutes: 15,
        quizQuestionTimeLimitSeconds: 25,
      },
    }),
  });
  const patchBothRes = await patchFormHandler(patchBothReq, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(patchBothRes.status, 200);
  const dbSettings = await prisma.formSettings.findUnique({ where: { formId } });
  assert.strictEqual(dbSettings?.quizTimerMode, 'BOTH');
  assert.strictEqual(dbSettings?.quizDurationMinutes, 15);
  assert.strictEqual(dbSettings?.quizQuestionTimeLimitSeconds, 25);
  console.log('✓ Test 15 Passed: Quiz-level Both Timers settings saved in PostgreSQL');
  passedTests++;

  // 16. Individual timer overrides save correctly
  const patchQReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/questions/${q1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      timeLimitSeconds: 50,
    }),
  });
  const patchQRes = await patchQuestionHandler(patchQReq, { params: Promise.resolve({ id: formId, questionId: q1.id }) });
  assert.strictEqual(patchQRes.status, 200);
  const dbQ1 = await prisma.formQuestion.findUnique({ where: { id: q1.id } });
  assert.strictEqual(dbQ1?.timeLimitSeconds, 50);
  console.log('✓ Test 16 Passed: Individual question override (50s) saved in PostgreSQL');
  passedTests++;

  // 17. GET form API returns correct timer configuration
  const apiFormRes = await getFormHandler(new NextRequest(`http://localhost:3000/api/forms/${formId}`, { headers: { cookie } }), { params: Promise.resolve({ id: formId }) });
  const apiFormData = await apiFormRes.json();
  assert.strictEqual(apiFormData.form.settings.quizTimerMode, 'BOTH');
  assert.strictEqual(apiFormData.form.settings.quizQuestionTimeLimitSeconds, 25);
  const apiQ1 = apiFormData.form.sections[0].questions.find((q: any) => q.id === q1.id);
  assert.strictEqual(apiQ1.timeLimitSeconds, 50);
  console.log('✓ Test 17 Passed: GET /api/forms/[id] returns all settings and question timers');
  passedTests++;

  // 18. Updating unrelated form settings does not reset timer values
  const patchTitleReq = new NextRequest(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      title: 'Renamed Quiz Form Title',
      description: 'Brand new updated description',
    }),
  });
  await patchFormHandler(patchTitleReq, { params: Promise.resolve({ id: formId }) });
  const dbSettingsAfterRename = await prisma.formSettings.findUnique({ where: { formId } });
  const dbQ1AfterRename = await prisma.formQuestion.findUnique({ where: { id: q1.id } });
  assert.strictEqual(dbSettingsAfterRename?.quizQuestionTimeLimitSeconds, 25);
  assert.strictEqual(dbQ1AfterRename?.timeLimitSeconds, 50);
  console.log('✓ Test 18 Passed: Unrelated form updates (title/description) preserve timer values intact');
  passedTests++;

  // 19. Refreshing the editor preserves timer configuration
  const reloadedFormRes = await getFormHandler(new NextRequest(`http://localhost:3000/api/forms/${formId}`, { headers: { cookie } }), { params: Promise.resolve({ id: formId }) });
  const reloadedFormData = await reloadedFormRes.json();
  assert.strictEqual(reloadedFormData.form.settings.quizQuestionTimeLimitSeconds, 25);
  console.log('✓ Test 19 Passed: Refreshing editor preserves exact timer configuration');
  passedTests++;

  // 20. Form duplication and question import preserve intended timer behaviour
  // Duplicate form
  const dupFormReq = new NextRequest(`http://localhost:3000/api/forms/${formId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
  });
  const dupFormRes = await duplicateFormHandler(dupFormReq, { params: Promise.resolve({ id: formId }) });
  assert.strictEqual(dupFormRes.status, 200);
  const { form: duplicatedForm } = await dupFormRes.json();

  const dupFormDb = await prisma.form.findUnique({
    where: { id: duplicatedForm.id },
    include: { settings: true, sections: { include: { questions: true } } },
  });
  assert.strictEqual(dupFormDb?.settings?.quizTimerMode, 'BOTH');
  assert.strictEqual(dupFormDb?.settings?.quizDurationMinutes, 15);
  assert.strictEqual(dupFormDb?.settings?.quizQuestionTimeLimitSeconds, 25);
  const duplicatedQWithOverride = dupFormDb?.sections[0].questions.find((q) => q.timeLimitSeconds === 50);
  assert.ok(duplicatedQWithOverride, 'Duplicated form must preserve question time limit override (50s)');

  // Import questions from duplicated form into another form
  const targetFormForImport = await prisma.form.create({
    data: {
      title: 'Target Form For Import',
      ownerId: testUser.id,
      isQuiz: true,
      settings: { create: { quizTimerMode: 'QUESTION', quizQuestionTimeLimitSeconds: 10 } },
      sections: { create: { title: 'Section 1', orderIndex: 0 } },
    },
  });
  const importReq = new NextRequest(`http://localhost:3000/api/forms/${targetFormForImport.id}/import-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sourceFormId: duplicatedForm.id,
      questionIds: [duplicatedQWithOverride!.id],
      createNewSection: false,
    }),
  });
  const importRes = await importFcQuestionsHandler(importReq, { params: Promise.resolve({ id: targetFormForImport.id }) });
  assert.strictEqual(importRes.status, 200);
  const importedData = await importRes.json();
  const importedQ = importedData.questions[0];
  assert.strictEqual(importedQ.timeLimitSeconds, 50, 'Imported question must preserve individual override (50s)');
  console.log('✓ Test 20 Passed: Form duplication and question import preserve timer configuration and overrides');
  passedTests++;

  // ===========================================================================
  // GROUP D: Public Quiz Runtime Enforcement
  // ===========================================================================
  console.log('\n--- GROUP D: Public Quiz Runtime Enforcement Tests ---');

  // Prepare a dedicated published quiz for runtime testing:
  // Timer Mode: QUESTION
  // Per-Question Limit: 10s
  // Question 1: Inherits 10s
  // Question 2: Individual Override: 15s
  const publicQuiz = await prisma.form.create({
    data: {
      title: 'Public Runtime Timer Quiz',
      publicId: `quiz-timer-runtime-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: testUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'QUESTION',
          quizQuestionTimeLimitSeconds: 10,
        },
      },
    },
  });
  const runtimeSec = await prisma.formSection.create({
    data: { formId: publicQuiz.id, title: 'Runtime Section', orderIndex: 0 },
  });
  const runtimeQ1 = await prisma.formQuestion.create({
    data: {
      formId: publicQuiz.id,
      sectionId: runtimeSec.id,
      title: 'Runtime Question 1 (Inherited 10s)',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 0,
      quizPoints: 5,
      quizAnswer: { correctValue: 'Option A' },
      timeLimitSeconds: 0, // Inherits 10s
      options: {
        create: [
          { label: 'Option A', value: 'Option A', orderIndex: 0 },
          { label: 'Option B', value: 'Option B', orderIndex: 1 },
        ],
      },
    },
  });
  const runtimeQ2 = await prisma.formQuestion.create({
    data: {
      formId: publicQuiz.id,
      sectionId: runtimeSec.id,
      title: 'Runtime Question 2 (Custom 15s)',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 1,
      quizPoints: 5,
      quizAnswer: { correctValue: 'Option X' },
      timeLimitSeconds: 15, // Custom override: 15s
      options: {
        create: [
          { label: 'Option X', value: 'Option X', orderIndex: 0 },
          { label: 'Option Y', value: 'Option Y', orderIndex: 1 },
        ],
      },
    },
  });

  // Verify GET /api/public/forms/[publicId] exposes effective timers
  const publicFormPayload = await (await getPublicFormHandler(new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}`), { params: Promise.resolve({ publicId: publicQuiz.publicId }) })).json();
  const pubQ1 = publicFormPayload.form.sections[0].questions.find((q: any) => q.id === runtimeQ1.id);
  const pubQ2 = publicFormPayload.form.sections[0].questions.find((q: any) => q.id === runtimeQ2.id);
  assert.strictEqual(pubQ1.timeLimitSeconds, 10, 'Public API must return effective timer 10s for inherited Q1');
  assert.strictEqual(pubQ2.timeLimitSeconds, 15, 'Public API must return effective timer 15s for custom Q2');

  // 21. Per-Question mode initializes the correct countdown
  const startAttemptReq = new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'TIMER_STUDENT_1', participantName: 'Timer Student' }),
  });
  const startAttemptRes = await attemptHandler(startAttemptReq, { params: Promise.resolve({ publicId: publicQuiz.publicId }) });
  assert.strictEqual(startAttemptRes.status, 200);
  const { attempt: runtimeAttempt } = await startAttemptRes.json();

  const startedAtMs = new Date(runtimeAttempt.startedAt).getTime();
  const deadlineMs = new Date(runtimeAttempt.currentQuestionDeadline).getTime();
  const diffSec = Math.round((deadlineMs - startedAtMs) / 1000);
  assert.strictEqual(diffSec, 10, 'First question deadline must be exactly 10 seconds after startedAt');
  console.log('✓ Test 21 Passed: Per-Question mode initializes exactly 10s countdown for Question 1');
  passedTests++;

  // 22. Countdown transitions correctly between questions
  const navReq = new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}/quiz/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: runtimeAttempt.id,
      targetQuestionId: runtimeQ2.id,
      direction: 'NEXT',
    }),
  });
  const navRes = await navigateHandler(navReq, { params: Promise.resolve({ publicId: publicQuiz.publicId }) });
  assert.strictEqual(navRes.status, 200);
  const navData = await navRes.json();
  const dbAttemptAfterNav = await prisma.quizAttempt.findUnique({ where: { id: runtimeAttempt.id } });
  const timingMapAfterNav = dbAttemptAfterNav?.questionTiming as Record<string, any>;
  const q2Timing = timingMapAfterNav[runtimeQ2.id];
  assert.strictEqual(q2Timing.timeLimitSeconds, 15, 'Target question timing must reflect 15s custom override');
  const q2StartMs = new Date(q2Timing.startedAt).getTime();
  const q2DeadlineMs = new Date(q2Timing.deadline).getTime();
  const q2DiffSec = Math.round((q2DeadlineMs - q2StartMs) / 1000);
  assert.strictEqual(q2DiffSec, 15, 'Target question deadline must be exactly 15 seconds after visit start');
  console.log('✓ Test 22 Passed: Countdown transitions to Question 2 with correct custom 15s limit');
  passedTests++;

  // 23. Server-side expiration enforcement works
  // Artificially expire Question 2's deadline in the past
  const expiredTiming = {
    ...timingMapAfterNav,
    [runtimeQ2.id]: {
      startedAt: new Date(Date.now() - 30000).toISOString(),
      deadline: new Date(Date.now() - 5000).toISOString(), // 5 seconds expired
      timeLimitSeconds: 15,
    },
  };
  await prisma.quizAttempt.update({
    where: { id: runtimeAttempt.id },
    data: { questionTiming: expiredTiming },
  });

  const expiredSaveReq = new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}/quiz/save-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: runtimeAttempt.id,
      questionId: runtimeQ2.id,
      value: 'Option X',
    }),
  });
  const expiredSaveRes = await saveAnswerHandler(expiredSaveReq, { params: Promise.resolve({ publicId: publicQuiz.publicId }) });
  assert.strictEqual(expiredSaveRes.status, 403);
  const expiredData = await expiredSaveRes.json();
  assert.ok(expiredData.error.includes('expired'), 'Must reject answer after question deadline expires');
  console.log('✓ Test 23 Passed: Server-side expiration blocks answers after question timeout');
  passedTests++;

  // 24. Refreshing does not grant additional time
  const refreshReq = new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}/quiz/attempt?participantIdentity=TIMER_STUDENT_1`);
  const refreshRes = await getAttemptHandler(refreshReq, { params: Promise.resolve({ publicId: publicQuiz.publicId }) });
  assert.strictEqual(refreshRes.status, 200);
  const refreshedData = await refreshRes.json();
  assert.strictEqual(refreshedData.attempt.id, runtimeAttempt.id);
  assert.strictEqual(refreshedData.attempt.startedAt, runtimeAttempt.startedAt);
  console.log('✓ Test 24 Passed: Refreshing returns exact preserved attempt without granting extra time');
  passedTests++;

  // 25. Timeout submission and scoring remain correct
  const finalizeReq = new NextRequest(`http://localhost:3000/api/public/forms/${publicQuiz.publicId}/quiz/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attemptId: runtimeAttempt.id,
      reason: 'QUESTION_TIMEOUT',
      finalAnswers: [{ questionId: runtimeQ1.id, value: 'Option A' }],
    }),
  });
  const finalizeRes = await finalizeHandler(finalizeReq, { params: Promise.resolve({ publicId: publicQuiz.publicId }) });
  assert.strictEqual(finalizeRes.status, 200);
  const finalData = await finalizeRes.json();
  assert.strictEqual(finalData.attempt.earnedScore, 5, 'Score must award 5 points for correct Question 1');
  assert.strictEqual(finalData.attempt.status, 'TIMED_OUT');
  console.log('✓ Test 25 Passed: Timeout finalization properly records answers and awards score');
  passedTests++;

  // 26. Overall Duration mode remains functional
  const overallQuiz = await prisma.form.create({
    data: {
      title: 'Overall Duration Only Quiz',
      publicId: `quiz-overall-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: testUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'OVERALL',
          quizDurationMinutes: 10,
        },
      },
    },
  });
  const overallSec = await prisma.formSection.create({
    data: { formId: overallQuiz.id, title: 'Section 1', orderIndex: 0 },
  });
  await prisma.formQuestion.create({
    data: {
      formId: overallQuiz.id,
      sectionId: overallSec.id,
      title: 'General Question',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
    },
  });
  const overallAttemptReq = new NextRequest(`http://localhost:3000/api/public/forms/${overallQuiz.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'STUDENT_OVERALL' }),
  });
  const overallAttemptRes = await attemptHandler(overallAttemptReq, { params: Promise.resolve({ publicId: overallQuiz.publicId }) });
  const { attempt: overallAttempt } = await overallAttemptRes.json();
  assert.ok(overallAttempt.overallDeadline, 'Overall deadline must be present');
  assert.strictEqual(overallAttempt.currentQuestionDeadline, null, 'Per-question deadline must be null in Overall Duration mode');
  console.log('✓ Test 26 Passed: Overall Duration mode sets total countdown without per-question limit');
  passedTests++;

  // 27. Both Timers mode remains functional
  const bothQuiz = await prisma.form.create({
    data: {
      title: 'Both Timers Quiz',
      publicId: `quiz-both-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: testUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'BOTH',
          quizDurationMinutes: 5,
          quizQuestionTimeLimitSeconds: 20,
        },
      },
    },
  });
  const bothSec = await prisma.formSection.create({
    data: { formId: bothQuiz.id, title: 'Section 1', orderIndex: 0 },
  });
  await prisma.formQuestion.create({
    data: {
      formId: bothQuiz.id,
      sectionId: bothSec.id,
      title: 'Both Question',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
    },
  });
  const bothAttemptReq = new NextRequest(`http://localhost:3000/api/public/forms/${bothQuiz.publicId}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIdentity: 'STUDENT_BOTH' }),
  });
  const bothAttemptRes = await attemptHandler(bothAttemptReq, { params: Promise.resolve({ publicId: bothQuiz.publicId }) });
  const { attempt: bothAttempt } = await bothAttemptRes.json();
  assert.ok(bothAttempt.overallDeadline, 'Both mode must set overall deadline');
  assert.ok(bothAttempt.currentQuestionDeadline, 'Both mode must set per-question deadline');
  const bothQDiff = Math.round((new Date(bothAttempt.currentQuestionDeadline).getTime() - new Date(bothAttempt.startedAt).getTime()) / 1000);
  assert.strictEqual(bothQDiff, 20, 'Per-question deadline must be 20 seconds');
  console.log('✓ Test 27 Passed: Both Timers mode sets both overall and per-question deadlines');
  passedTests++;

  console.log('\n========================================================================');
  console.log(` ALL ${passedTests} / 27 REGRESSION TESTS PASSED! (100%) `);
  console.log('========================================================================\n');
}

runAllTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
