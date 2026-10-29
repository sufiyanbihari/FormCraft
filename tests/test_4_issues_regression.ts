import { prisma } from '../src/lib/db/prisma';
import { GET as publicFormGet } from '../src/app/api/public/forms/[publicId]/route';
import { POST as publicSubmissionPost } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { POST as quizAttemptPost } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { GET as formGet, PATCH as formPatch } from '../src/app/api/forms/[id]/route';
import { updateFormSchema } from '../src/lib/validation/formSchema';
import { resolveParticipantIdentifier } from '../src/lib/submission/duplicatePreventionService';
import { reconcileAttemptTimeout } from '../src/lib/quiz/quizAttemptService';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createAuthCookie(user: { id: string; email: string; role: string }): string {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `formcraft_session=${token}`;
}

async function createTestForm({
  title,
  ownerId,
  isQuiz = false,
  settings,
  questions = [],
}: {
  title: string;
  ownerId: string;
  isQuiz?: boolean;
  settings?: Record<string, unknown>;
  questions?: Array<{
    title: string;
    type?: string;
    isRequired?: boolean;
    quizPoints?: number;
    quizAnswer?: Record<string, unknown>;
  }>;
}) {
  const form = await prisma.form.create({
    data: {
      title,
      publicId: `fc-tst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      status: 'PUBLISHED',
      isQuiz,
      ownerId,
      settings: settings ? { create: settings as never } : undefined,
    },
  });

  const section = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: 'Main Section',
      orderIndex: 0,
    },
  });

  const createdQuestions = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const createdQ = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: section.id,
        title: q.title,
        type: (q.type || 'SHORT_ANSWER') as never,
        isRequired: q.isRequired || false,
        orderIndex: i,
        quizPoints: q.quizPoints || 0,
        quizAnswer: (q.quizAnswer as never) || undefined,
      },
    });
    createdQuestions.push(createdQ);
  }

  return { form, section, questions: createdQuestions };
}

async function runTests() {
  console.log('--- STARTING 4 ISSUES REGRESSION TEST SUITE ---');

  // Ensure test owner
  let owner = await prisma.user.findFirst({ where: { email: 'test_regression_owner@formcraft.local' } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        email: 'test_regression_owner@formcraft.local',
        passwordHash: 'dummyhash',
        name: 'Regression Owner',
        role: 'USER',
      },
    });
  }

  let respondent = await prisma.user.findFirst({ where: { email: 'test_respondent@formcraft.local' } });
  if (!respondent) {
    respondent = await prisma.user.create({
      data: {
        email: 'test_respondent@formcraft.local',
        passwordHash: 'dummyhash',
        name: 'Test Respondent',
        role: 'USER',
      },
    });
  }

  const ownerCookie = createAuthCookie(owner);
  const respondentCookie = createAuthCookie(respondent);

  // ==========================================
  // ISSUE 1: Remove "Collect email addresses"
  // ==========================================
  console.log('\n[TEST ISSUE 1] Verify removal of "Collect email addresses" setting and preservation of ordinary email questions');

  // 1. Verify SettingsTab.tsx has no "Collect email addresses" toggle
  const settingsTabContent = fs.readFileSync(
    path.join(__dirname, '../src/components/form-builder/SettingsTab.tsx'),
    'utf-8'
  );
  assert.strictEqual(
    settingsTabContent.includes('Collect email addresses'),
    false,
    'SettingsTab.tsx must not contain "Collect email addresses"'
  );
  assert.strictEqual(
    settingsTabContent.includes('Require respondents to provide a valid email before submitting'),
    false,
    'SettingsTab.tsx must not contain description for collect email addresses'
  );
  console.log('  ✓ SettingsTab.tsx has no "Collect email addresses" toggle or description');

  // 2. Create form with ordinary email question and submit without collectEmail setting
  const { form: formWithEmailQ, questions: emailQuestions } = await createTestForm({
    title: 'Ordinary Email Question Form',
    ownerId: owner.id,
    settings: {
      requireAuth: false,
      restrictOneResponse: false,
    },
    questions: [
      {
        title: 'Your Contact Email',
        type: 'EMAIL',
        isRequired: true,
      },
      {
        title: 'Your Name',
        type: 'SHORT_ANSWER',
        isRequired: false,
      },
    ],
  });

  const emailQ = emailQuestions[0];
  const nameQ = emailQuestions[1];

  const subReqIssue1 = new NextRequest(
    `http://localhost:3000/api/public/forms/${formWithEmailQ.publicId}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [
          { questionId: emailQ.id, value: 'contact@example.com' },
          { questionId: nameQ.id, value: 'Alice' },
        ],
      }),
    }
  );
  const subResIssue1 = await publicSubmissionPost(subReqIssue1, {
    params: Promise.resolve({ publicId: formWithEmailQ.publicId }),
  });
  assert.strictEqual(subResIssue1.status, 200, 'Form with ordinary EMAIL question submits successfully');
  const subDataIssue1 = await subResIssue1.json();
  assert(subDataIssue1.submissionId, 'Submission ID returned');

  // Verify answer is stored properly in database
  const savedAnswer = await prisma.submissionAnswer.findFirst({
    where: { submissionId: subDataIssue1.submissionId, questionId: emailQ.id },
  });
  assert.strictEqual(savedAnswer?.value, 'contact@example.com', 'Ordinary email question answer stored correctly');
  console.log('  ✓ Ordinary email question functions normally and collects data without collectEmail toggle');

  // ==========================================
  // ISSUE 2: Remove "Require sign-in" completely
  // ==========================================
  console.log('\n[TEST ISSUE 2] Verify complete removal of "Require sign-in" and unauthenticated access for all public forms');

  // 1. Verify SettingsTab.tsx has no "Require sign-in" toggle or description
  assert.strictEqual(
    settingsTabContent.includes('Require sign-in'),
    false,
    'SettingsTab.tsx must not contain "Require sign-in"'
  );
  assert.strictEqual(
    settingsTabContent.includes('Respondents must be logged in to access and submit this form'),
    false,
    'SettingsTab.tsx must not contain "Respondents must be logged in to access and submit this form"'
  );
  console.log('  ✓ SettingsTab.tsx has no "Require sign-in" toggle or description');

  // 2. Existing form with requireAuth = true must allow public access without requiring login
  const { form: formRequireAuth, questions: quizQuestions } = await createTestForm({
    title: 'Legacy Form with requireAuth True',
    ownerId: owner.id,
    isQuiz: true,
    settings: {
      requireAuth: true,
      restrictOneResponse: false,
    },
    questions: [
      {
        title: 'Capital of France?',
        type: 'MULTIPLE_CHOICE',
        isRequired: true,
        quizPoints: 5,
        quizAnswer: { correctValue: 'Paris' },
      },
    ],
  });

  const quizQ = quizQuestions[0];

  // 3. Unauthenticated GET /api/public/forms/[publicId] MUST return 200 with form data
  const unauthGetReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formRequireAuth.publicId}`
  );
  const unauthGetRes = await publicFormGet(unauthGetReq, {
    params: Promise.resolve({ publicId: formRequireAuth.publicId }),
  });
  assert.strictEqual(unauthGetRes.status, 200, 'Unauthenticated GET public form returns 200 even if requireAuth is true');
  const unauthGetData = await unauthGetRes.json();
  assert.strictEqual(unauthGetData.form?.title, 'Legacy Form with requireAuth True', 'Form data exposed to public respondent');
  console.log('  ✓ Public GET /api/public/forms/[publicId] loads without requiring login');

  // 4. Unauthenticated POST /api/public/forms/[publicId]/submissions MUST succeed (200)
  const unauthSubReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formRequireAuth.publicId}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: quizQ.id, value: 'Paris' }],
      }),
    }
  );
  const unauthSubRes = await publicSubmissionPost(unauthSubReq, {
    params: Promise.resolve({ publicId: formRequireAuth.publicId }),
  });
  assert.strictEqual(unauthSubRes.status, 200, 'Unauthenticated submission returns 200 even if requireAuth is true');
  console.log('  ✓ Public POST /submissions succeeds without requiring login');

  // 5. Unauthenticated Quiz Attempt POST MUST return 200
  const unauthAttemptReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formRequireAuth.publicId}/quiz/attempt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'anon@example.com',
      }),
    }
  );
  const unauthAttemptRes = await quizAttemptPost(unauthAttemptReq, {
    params: Promise.resolve({ publicId: formRequireAuth.publicId }),
  });
  assert.strictEqual(unauthAttemptRes.status, 200, 'Unauthenticated quiz attempt returns 200');
  console.log('  ✓ Public POST /quiz/attempt succeeds without requiring login');

  // 6. Verify form with requireAuth = false also allows public access and submission
  const { form: formPublic, questions: pubQuestions } = await createTestForm({
    title: 'Public Form Without Auth',
    ownerId: owner.id,
    settings: {
      requireAuth: false,
    },
    questions: [
      {
        title: 'Feedback',
        type: 'SHORT_ANSWER',
        isRequired: true,
      },
    ],
  });
  const pubGetReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formPublic.publicId}`
  );
  const pubGetRes = await publicFormGet(pubGetReq, {
    params: Promise.resolve({ publicId: formPublic.publicId }),
  });
  assert.strictEqual(pubGetRes.status, 200, 'Public form allows unauthenticated access when requireAuth is false');

  const pubSubReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formPublic.publicId}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: pubQuestions[0].id, value: 'Great form!' }],
      }),
    }
  );
  const pubSubRes = await publicSubmissionPost(pubSubReq, {
    params: Promise.resolve({ publicId: formPublic.publicId }),
  });
  assert.strictEqual(pubSubRes.status, 200, 'Public form submission succeeds without login');
  console.log('  ✓ Public forms with requireAuth false load and submit without login');

  // 7. Verify Form Owner & Admin management authorization remains strictly enforced
  const unauthOwnerGet = new NextRequest(`http://localhost:3000/api/forms/${formRequireAuth.id}`);
  const unauthOwnerGetRes = await formGet(unauthOwnerGet, {
    params: Promise.resolve({ id: formRequireAuth.id }),
  });
  assert.strictEqual(unauthOwnerGetRes.status, 401, 'Unauthenticated form editor GET returns 401');

  const unauthOwnerPatch = new NextRequest(`http://localhost:3000/api/forms/${formRequireAuth.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Hacked Title' }),
  });
  const unauthOwnerPatchRes = await formPatch(unauthOwnerPatch, {
    params: Promise.resolve({ id: formRequireAuth.id }),
  });
  assert.strictEqual(unauthOwnerPatchRes.status, 401, 'Unauthenticated form editor PATCH returns 401');

  // Non-owner (respondent) trying to access editor routes MUST return 403
  const forbiddenOwnerGet = new NextRequest(`http://localhost:3000/api/forms/${formRequireAuth.id}`, {
    headers: { Cookie: respondentCookie },
  });
  const forbiddenOwnerGetRes = await formGet(forbiddenOwnerGet, {
    params: Promise.resolve({ id: formRequireAuth.id }),
  });
  assert.strictEqual(forbiddenOwnerGetRes.status, 403, 'Non-owner form editor GET returns 403');

  // Authorized Owner CAN view and edit form
  const authOwnerGet = new NextRequest(`http://localhost:3000/api/forms/${formRequireAuth.id}`, {
    headers: { Cookie: ownerCookie },
  });
  const authOwnerGetRes = await formGet(authOwnerGet, {
    params: Promise.resolve({ id: formRequireAuth.id }),
  });
  assert.strictEqual(authOwnerGetRes.status, 200, 'Owner form editor GET returns 200');

  const authOwnerPatch = new NextRequest(`http://localhost:3000/api/forms/${formRequireAuth.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ title: 'Updated Legacy Form Title' }),
  });
  const authOwnerPatchRes = await formPatch(authOwnerPatch, {
    params: Promise.resolve({ id: formRequireAuth.id }),
  });
  assert.strictEqual(authOwnerPatchRes.status, 200, 'Owner form editor PATCH returns 200');
  console.log('  ✓ Form owner and administrative authentication and authorization strictly enforced');

  // ==========================================
  // ISSUE 3: Remove Email Address and Signed-in Account identification methods
  // ==========================================
  console.log('\n[TEST ISSUE 3] Verify removal of AUTH_USER and VERIFIED_EMAIL and fallback to IP_ADDRESS');

  // 1. Verify SettingsTab.tsx Participant Identification Method only offers IP_ADDRESS
  const dupSectionMatch = settingsTabContent.match(
    /Participant Identification Method[\s\S]*?<\/Select>/
  );
  assert(dupSectionMatch, 'Participant Identification Method Select found');
  const dupSection = dupSectionMatch[0];
  assert.strictEqual(
    dupSection.includes('value="AUTH_USER"'),
    false,
    'Participant Identification Method dropdown must not contain AUTH_USER'
  );
  assert.strictEqual(
    dupSection.includes('value="VERIFIED_EMAIL"'),
    false,
    'Participant Identification Method dropdown must not contain VERIFIED_EMAIL'
  );
  assert(
    dupSection.includes('value="IP_ADDRESS"'),
    'Participant Identification Method dropdown must contain IP_ADDRESS'
  );
  console.log('  ✓ SettingsTab.tsx dropdown options removed AUTH_USER and VERIFIED_EMAIL, retaining IP_ADDRESS');

  // 2. Verify backend schema validation rejects AUTH_USER and VERIFIED_EMAIL
  const schemaAuthUserResult = updateFormSchema.safeParse({
    settings: {
      duplicateIdentifierMethod: 'AUTH_USER',
    },
  });
  assert.strictEqual(
    schemaAuthUserResult.success,
    false,
    'Zod schema must reject duplicateIdentifierMethod: AUTH_USER'
  );

  const schemaEmailResult = updateFormSchema.safeParse({
    settings: {
      duplicateIdentifierMethod: 'VERIFIED_EMAIL',
    },
  });
  assert.strictEqual(
    schemaEmailResult.success,
    false,
    'Zod schema must reject duplicateIdentifierMethod: VERIFIED_EMAIL'
  );

  const schemaIpResult = updateFormSchema.safeParse({
    settings: {
      duplicateIdentifierMethod: 'IP_ADDRESS',
    },
  });
  assert.strictEqual(
    schemaIpResult.success,
    true,
    'Zod schema must accept duplicateIdentifierMethod: IP_ADDRESS'
  );
  console.log('  ✓ Backend validation rejects AUTH_USER and VERIFIED_EMAIL, accepts IP_ADDRESS');

  // 3. Verify resolveParticipantIdentifier falls back legacy AUTH_USER and VERIFIED_EMAIL safely to IP_ADDRESS
  const legacyAuthResolved = resolveParticipantIdentifier({
    settings: { duplicateIdentifierMethod: 'AUTH_USER' },
    authenticatedUser: null,
    respondentEmail: null,
    answers: [],
    ipHash: 'hash-ip-1234',
  });
  assert.strictEqual(legacyAuthResolved.success, true);
  if (legacyAuthResolved.success) {
    assert.strictEqual(legacyAuthResolved.identity.method, 'IP_ADDRESS');
    assert.strictEqual(legacyAuthResolved.identity.identifier, 'hash-ip-1234');
  }

  const legacyEmailResolved = resolveParticipantIdentifier({
    settings: { duplicateIdentifierMethod: 'VERIFIED_EMAIL' },
    authenticatedUser: null,
    respondentEmail: null,
    answers: [],
    ipHash: 'hash-ip-5678',
  });
  assert.strictEqual(legacyEmailResolved.success, true);
  if (legacyEmailResolved.success) {
    assert.strictEqual(legacyEmailResolved.identity.method, 'IP_ADDRESS');
    assert.strictEqual(legacyEmailResolved.identity.identifier, 'hash-ip-5678');
  }
  console.log('  ✓ resolveParticipantIdentifier safely falls back legacy AUTH_USER & VERIFIED_EMAIL to IP_ADDRESS');

  // 4. Test duplicate prevention enforcement with IP_ADDRESS
  const { form: formDupIp, questions: dupQuestions } = await createTestForm({
    title: 'Duplicate Prevention Form',
    ownerId: owner.id,
    settings: {
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'IP_ADDRESS',
      duplicateRestrictionScope: 'ONCE_PER_FORM',
    },
    questions: [
      {
        title: 'Feedback',
        type: 'SHORT_ANSWER',
      },
    ],
  });

  const dupQ = dupQuestions[0];

  // First submission with client IP
  const firstSubReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formDupIp.publicId}/submissions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.1',
      },
      body: JSON.stringify({
        answers: [{ questionId: dupQ.id, value: 'First Response' }],
      }),
    }
  );
  const firstSubRes = await publicSubmissionPost(firstSubReq, {
    params: Promise.resolve({ publicId: formDupIp.publicId }),
  });
  assert.strictEqual(firstSubRes.status, 200, 'First submission from client IP succeeds');

  // Second submission with same client IP MUST be rejected with 409
  const secondSubReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${formDupIp.publicId}/submissions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.1',
      },
      body: JSON.stringify({
        answers: [{ questionId: dupQ.id, value: 'Duplicate Response' }],
      }),
    }
  );
  const secondSubRes = await publicSubmissionPost(secondSubReq, {
    params: Promise.resolve({ publicId: formDupIp.publicId }),
  });
  assert.strictEqual(secondSubRes.status, 409, 'Duplicate submission from same IP is blocked with 409 Conflict');
  console.log('  ✓ Duplicate prevention with IP_ADDRESS successfully blocks second submission (409 Conflict)');

  // ==========================================
  // ISSUE 4: Validate Both Timers correctly
  // ==========================================
  console.log('\n[TEST ISSUE 4] Verify "Both Timers" cross-validation and overall timeout precedence');

  // 1. Zod schema validation: Both Timers mode
  // Example 1: Overall = 1 min (60s), Per-Question = 1s, 5s, 50s, 60s (VALID)
  for (const validSec of [1, 5, 50, 60]) {
    const validRes = updateFormSchema.safeParse({
      settings: {
        quizTimerMode: 'BOTH',
        quizDurationMinutes: 1,
        quizQuestionTimeLimitSeconds: validSec,
      },
    });
    assert.strictEqual(validRes.success, true, `1 min duration with ${validSec}s question limit must be valid`);
  }

  // Example 2: Overall = 1 min (60s), Per-Question = 120s (INVALID)
  const invalid120Res = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'BOTH',
      quizDurationMinutes: 1,
      quizQuestionTimeLimitSeconds: 120,
    },
  });
  assert.strictEqual(invalid120Res.success, false, '1 min duration with 120s question limit must be rejected');

  // Example 3: Overall = 30 min (1800s), Per-Question = 1, 10, 50, 100, 1800s (VALID)
  for (const validSec of [1, 10, 50, 100, 1800]) {
    const validRes = updateFormSchema.safeParse({
      settings: {
        quizTimerMode: 'BOTH',
        quizDurationMinutes: 30,
        quizQuestionTimeLimitSeconds: validSec,
      },
    });
    assert.strictEqual(validRes.success, true, `30 min duration with ${validSec}s question limit must be valid`);
  }

  // Example 4: Overall = 30 min (1800s), Per-Question > 1800s (INVALID)
  const invalid1801Res = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'BOTH',
      quizDurationMinutes: 30,
      quizQuestionTimeLimitSeconds: 1801,
    },
  });
  assert.strictEqual(invalid1801Res.success, false, '30 min duration with 1801s question limit must be rejected');

  // Example 5: Question limit <= 0 must be rejected
  const invalidZeroRes = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'BOTH',
      quizDurationMinutes: 10,
      quizQuestionTimeLimitSeconds: 0,
    },
  });
  assert.strictEqual(invalidZeroRes.success, false, 'Question limit of 0s must be rejected in BOTH mode');

  const invalidNegRes = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'BOTH',
      quizDurationMinutes: 10,
      quizQuestionTimeLimitSeconds: -10,
    },
  });
  assert.strictEqual(invalidNegRes.success, false, 'Negative question limit must be rejected in BOTH mode');

  console.log('  ✓ Zod schema correctly validates Both Timers combinations');

  // 2. Other timer modes must NOT be restricted by the BOTH constraint
  const questionOnlyRes = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'QUESTION',
      quizQuestionTimeLimitSeconds: 5000,
    },
  });
  assert.strictEqual(questionOnlyRes.success, true, 'QUESTION mode alone is not restricted by BOTH rule');

  const overallOnlyRes = updateFormSchema.safeParse({
    settings: {
      quizTimerMode: 'OVERALL',
      quizDurationMinutes: 5,
    },
  });
  assert.strictEqual(overallOnlyRes.success, true, 'OVERALL mode alone is not restricted by BOTH rule');
  console.log('  ✓ Other timer modes (QUESTION, OVERALL, NONE) are not constrained');

  // 3. API validation on PATCH /api/forms/[id]:
  // Create quiz form to test PATCH API
  const { form: quizForm } = await createTestForm({
    title: 'Timer Validation Quiz',
    isQuiz: true,
    ownerId: owner.id,
    settings: {
      quizTimerMode: 'BOTH',
      quizDurationMinutes: 5, // 300 seconds
      quizQuestionTimeLimitSeconds: 60,
    },
  });

  // Test PATCH with question limit > overall duration (e.g. 400s > 300s)
  const patchInvalidReq = new NextRequest(
    `http://localhost:3000/api/forms/${quizForm.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        settings: {
          quizQuestionTimeLimitSeconds: 400,
        },
      }),
    }
  );
  const patchInvalidRes = await formPatch(patchInvalidReq, {
    params: Promise.resolve({ id: quizForm.id }),
  });
  assert.strictEqual(patchInvalidRes.status, 400, 'PATCH with question limit > overall duration returns 400');
  console.log('  ✓ API rejects question limit exceeding overall duration (400)');

  // Test PATCH when overall duration is REDUCED after configuring question limit:
  // Current settings: question limit = 60s. Reduce overall duration to 0.5 min = 30s.
  const patchReducedReq = new NextRequest(
    `http://localhost:3000/api/forms/${quizForm.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        settings: {
          quizDurationMinutes: 0.5,
        },
      }),
    }
  );
  // Note: 0.5 * 60 = 30s < 60s question limit, must be rejected
  const patchReducedRes = await formPatch(patchReducedReq, {
    params: Promise.resolve({ id: quizForm.id }),
  });
  assert.strictEqual(patchReducedRes.status, 400, 'PATCH reducing overall duration below question limit returns 400');
  console.log('  ✓ API rejects reducing overall duration below existing question limit (400)');

  // 4. Test server-enforced overall timer ends quiz when total duration expires even if question timer has time remaining
  const now = new Date();
  const pastDeadline = new Date(now.getTime() - 10000); // 10 seconds ago
  const futureQuestionDeadline = new Date(now.getTime() + 60000); // 60s remaining on question

  const actualAttempt = await prisma.quizAttempt.create({
    data: {
      formId: quizForm.id,
      participantIdentity: 'timer-test@example.com',
      status: 'IN_PROGRESS',
      startedAt: new Date(now.getTime() - 70000),
      overallDeadline: pastDeadline,
      currentQuestionDeadline: futureQuestionDeadline,
      savedAnswers: {},
      lockedQuestionIds: [],
    },
  });

  const formDummy = {
    id: quizForm.id,
    publishedVersionId: null,
    settings: { quizReleaseGrade: 'IMMEDIATE' },
    sections: [],
  };

  const reconciled = await reconcileAttemptTimeout(actualAttempt, formDummy);
  assert.strictEqual(reconciled.status, 'TIMED_OUT', 'Attempt finalized due to overall timeout');
  assert.strictEqual(reconciled.timeoutReason, 'OVERALL_TIMEOUT', 'Timeout reason is OVERALL_TIMEOUT');
  console.log('  ✓ Server-enforced overall timer takes precedence over question timer remaining');

  console.log('\n=========================================');
  console.log('ALL 4 REGRESSION ISSUES VERIFIED SUCCESSFULLY!');
  console.log('=========================================\n');
}

runTests()
  .catch((err) => {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
