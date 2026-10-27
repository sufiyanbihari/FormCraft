import { prisma } from '../src/lib/db/prisma';
import { POST as publicSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { GET as editHandlerGet, PUT as editHandlerPut } from '../src/app/api/public/forms/[publicId]/submissions/edit/route';
import { GET as exportHandler } from '../src/app/api/forms/[id]/responses/export/route';
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

async function createTestForm({
  title,
  ownerId,
  settings,
  questions,
}: {
  title: string;
  ownerId: string;
  settings?: any;
  questions: Array<{ title: string; type?: string; isRequired?: boolean }>;
}) {
  const form = await prisma.form.create({
    data: {
      title,
      publicId: `fc-rc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      status: 'PUBLISHED',
      ownerId,
      settings: settings ? { create: settings } : undefined,
    },
  });

  const section = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: 'General',
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
        type: (q.type || 'SHORT_ANSWER') as any,
        isRequired: q.isRequired || false,
        orderIndex: i,
      },
    });
    createdQuestions.push(createdQ);
  }

  return { form, section, questions: createdQuestions };
}

async function runResponseControlE2ETests() {
  console.log('========================================================================');
  console.log('  FormCraft E2E: Configurable Duplicate Prevention & Controlled Editing ');
  console.log('========================================================================\n');

  // 1. Setup Test Users
  const adminUser = await prisma.user.upsert({
    where: { email: 'rc_admin@example.com' },
    update: {},
    create: {
      email: 'rc_admin@example.com',
      name: 'RC Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });

  const respondentA = await prisma.user.upsert({
    where: { email: 'rc_respondent_a@example.com' },
    update: {},
    create: {
      email: 'rc_respondent_a@example.com',
      name: 'Respondent Alpha',
      passwordHash: 'dummyhash',
      role: 'USER',
    },
  });

  const respondentB = await prisma.user.upsert({
    where: { email: 'rc_respondent_b@example.com' },
    update: {},
    create: {
      email: 'rc_respondent_b@example.com',
      name: 'Respondent Beta',
      passwordHash: 'dummyhash',
      role: 'USER',
    },
  });

  const adminCookie = createAuthCookie(adminUser);
  const cookieA = createAuthCookie(respondentA);
  const cookieB = createAuthCookie(respondentB);

  // ------------------------------------------------------------------------
  // TEST 1: Default / Legacy Form (Duplicate Prevention Disabled)
  // ------------------------------------------------------------------------
  console.log('--- TEST 1: Legacy Form (Duplicate Prevention & Editing Disabled) ---');
  const { form: legacyForm, questions: legQuestions } = await createTestForm({
    title: 'Legacy Survey',
    ownerId: adminUser.id,
    settings: {
      restrictOneResponse: false,
      allowResponseEditing: false,
    },
    questions: [{ title: 'Feedback', type: 'SHORT_ANSWER' }],
  });

  const legQId = legQuestions[0].id;

  // First submission
  const legReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${legacyForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      answers: [{ questionId: legQId, value: 'Submission 1' }],
      respondentEmail: 'rc_respondent_a@example.com',
    }),
  });
  const legRes1 = await publicSubmissionHandler(legReq1, { params: Promise.resolve({ publicId: legacyForm.publicId }) });
  assert.strictEqual(legRes1.status, 200, 'Legacy submission 1 should succeed');

  // Second submission from same respondent (should succeed because duplicate prevention is disabled)
  const legReq2 = new NextRequest(`http://localhost:3000/api/public/forms/${legacyForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      answers: [{ questionId: legQId, value: 'Submission 2' }],
      respondentEmail: 'rc_respondent_a@example.com',
    }),
  });
  const legRes2 = await publicSubmissionHandler(legReq2, { params: Promise.resolve({ publicId: legacyForm.publicId }) });
  assert.strictEqual(legRes2.status, 200, 'Legacy submission 2 should succeed when feature is disabled');

  const legCount = await prisma.formSubmission.count({ where: { formId: legacyForm.id } });
  assert.strictEqual(legCount, 2, 'Legacy form should record two distinct submissions');
  console.log('✓ PASS: Unrestricted form accepts multiple submissions without interference.');

  // ------------------------------------------------------------------------
  // TEST 2: Duplicate Prevention with AUTH_USER & ONCE_PER_FORM
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 2: Duplicate Prevention with AUTH_USER & ONCE_PER_FORM ---');
  const { form: authDupForm, questions: authQuestions } = await createTestForm({
    title: 'Annual Employee Election',
    ownerId: adminUser.id,
    settings: {
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'AUTH_USER',
      duplicateRestrictionScope: 'ONCE_PER_FORM',
      allowResponseEditing: false,
    },
    questions: [{ title: 'Candidate Choice', type: 'SHORT_ANSWER' }],
  });

  const authQId = authQuestions[0].id;

  // First submission by Respondent A (must succeed)
  const authReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${authDupForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      answers: [{ questionId: authQId, value: 'Candidate 1' }],
    }),
  });
  const authRes1 = await publicSubmissionHandler(authReq1, { params: Promise.resolve({ publicId: authDupForm.publicId }) });
  assert.strictEqual(authRes1.status, 200, 'First submission from Respondent A should succeed');

  // Second submission by Respondent A (must be rejected with HTTP 409 Conflict)
  const authReq2 = new NextRequest(`http://localhost:3000/api/public/forms/${authDupForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      answers: [{ questionId: authQId, value: 'Candidate 2' }],
    }),
  });
  const authRes2 = await publicSubmissionHandler(authReq2, { params: Promise.resolve({ publicId: authDupForm.publicId }) });
  assert.strictEqual(authRes2.status, 409, 'Duplicate submission by Respondent A must return HTTP 409 Conflict');
  const authData2 = await authRes2.json();
  assert.strictEqual(authData2.isDuplicate, true, 'Error response must specify isDuplicate: true');
  assert.strictEqual(authData2.canEdit, false, 'canEdit must be false when editing is not enabled');

  // Third submission by Respondent B (different user, must succeed)
  const authReq3 = new NextRequest(`http://localhost:3000/api/public/forms/${authDupForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({
      answers: [{ questionId: authQId, value: 'Candidate 1' }],
    }),
  });
  const authRes3 = await publicSubmissionHandler(authReq3, { params: Promise.resolve({ publicId: authDupForm.publicId }) });
  assert.strictEqual(authRes3.status, 200, 'Submission from Respondent B must succeed');

  const authSubCount = await prisma.formSubmission.count({ where: { formId: authDupForm.id } });
  assert.strictEqual(authSubCount, 2, 'Exactly 2 submissions should exist in DB (no duplicates created)');
  console.log('✓ PASS: Authenticated duplicate prevention blocks second submission from same user.');

  // ------------------------------------------------------------------------
  // TEST 3: Duplicate Prevention with QUESTION_FIELD (e.g. Employee ID)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 3: Duplicate Prevention with QUESTION_FIELD Identifier ---');
  const { form: qFieldForm, questions: qfQuestions } = await createTestForm({
    title: 'Staff Equipment Request',
    ownerId: adminUser.id,
    questions: [
      { title: 'Employee ID', type: 'SHORT_ANSWER', isRequired: true },
      { title: 'Requested Device', type: 'SHORT_ANSWER' },
    ],
  });

  const empIdQId = qfQuestions[0].id;
  const devQId = qfQuestions[1].id;

  // Configure duplicate prevention using Employee ID question
  await prisma.formSettings.create({
    data: {
      formId: qFieldForm.id,
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'QUESTION_FIELD',
      duplicateIdentifierQuestionId: empIdQId,
      duplicateRestrictionScope: 'ONCE_PER_FORM',
    },
  });

  // First submission with EMP-9001
  const qfReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${qFieldForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: empIdQId, value: 'EMP-9001' },
        { questionId: devQId, value: 'MacBook Pro' },
      ],
    }),
  });
  const qfRes1 = await publicSubmissionHandler(qfReq1, { params: Promise.resolve({ publicId: qFieldForm.publicId }) });
  assert.strictEqual(qfRes1.status, 200, 'First submission with EMP-9001 should succeed');

  // Second submission with SAME Employee ID EMP-9001 (different device) -> Rejected
  const qfReq2 = new NextRequest(`http://localhost:3000/api/public/forms/${qFieldForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: empIdQId, value: 'EMP-9001' },
        { questionId: devQId, value: 'iPad Pro' },
      ],
    }),
  });
  const qfRes2 = await publicSubmissionHandler(qfReq2, { params: Promise.resolve({ publicId: qFieldForm.publicId }) });
  assert.strictEqual(qfRes2.status, 409, 'Second submission with same EMP-9001 must return 409');
  const qfData2 = await qfRes2.json();
  assert.strictEqual(qfData2.isDuplicate, true);

  // Third submission with DIFFERENT Employee ID EMP-9002 -> Succeeds
  const qfReq3 = new NextRequest(`http://localhost:3000/api/public/forms/${qFieldForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: empIdQId, value: 'EMP-9002' },
        { questionId: devQId, value: 'ThinkPad' },
      ],
    }),
  });
  const qfRes3 = await publicSubmissionHandler(qfReq3, { params: Promise.resolve({ publicId: qFieldForm.publicId }) });
  assert.strictEqual(qfRes3.status, 200, 'Submission with EMP-9002 should succeed');
  console.log('✓ PASS: Question field identifier accurately blocks duplicates based on question answer.');

  // ------------------------------------------------------------------------
  // TEST 4: Periodic Restriction (Time-based Window)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 4: Periodic Time-Based Restriction Scope ---');
  const { form: periodicForm, questions: perQuestions } = await createTestForm({
    title: 'Daily Attendance Form',
    ownerId: adminUser.id,
    settings: {
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'VERIFIED_EMAIL',
      duplicateRestrictionScope: 'PERIODIC',
      duplicateRestrictionPeriod: 'CUSTOM_HOURS',
      duplicateCustomHours: 4,
      allowResponseEditing: false,
    },
    questions: [{ title: 'Shift', type: 'SHORT_ANSWER' }],
  });

  const periodQId = perQuestions[0].id;

  // First submission
  const perReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${periodicForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: periodQId, value: 'Morning Shift' }],
      respondentEmail: 'worker_daily@example.com',
    }),
  });
  const perRes1 = await publicSubmissionHandler(perReq1, { params: Promise.resolve({ publicId: periodicForm.publicId }) });
  assert.strictEqual(perRes1.status, 200, 'First attendance submission should succeed');

  // Second submission within the 4-hour window
  const perReq2 = new NextRequest(`http://localhost:3000/api/public/forms/${periodicForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: periodQId, value: 'Evening Shift' }],
      respondentEmail: 'worker_daily@example.com',
    }),
  });
  const perRes2 = await publicSubmissionHandler(perReq2, { params: Promise.resolve({ publicId: periodicForm.publicId }) });
  assert.strictEqual(perRes2.status, 409, 'Duplicate submission within period window must be blocked');
  const perData2 = await perRes2.json();
  assert.strictEqual(perData2.isDuplicate, true);
  console.log('✓ PASS: Periodic time window correctly restricts repeated submissions within duration.');

  // ------------------------------------------------------------------------
  // TEST 5: Atomic Concurrency Protection (PostgreSQL Advisory Locking)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 5: Atomic Concurrency Protection (Race Condition Test) ---');
  const { form: concurrentForm, questions: concQuestions } = await createTestForm({
    title: 'Limited Flash Voucher Registration',
    ownerId: adminUser.id,
    settings: {
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'VERIFIED_EMAIL',
      duplicateRestrictionScope: 'ONCE_PER_FORM',
      allowResponseEditing: false,
    },
    questions: [{ title: 'Voucher Note', type: 'SHORT_ANSWER' }],
  });

  const concQId = concQuestions[0].id;
  const targetEmail = 'fast_clicker@example.com';

  const makeConcurrentReq = () =>
    new NextRequest(`http://localhost:3000/api/public/forms/${concurrentForm.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: concQId, value: 'Fast click ' + Math.random() }],
        respondentEmail: targetEmail,
      }),
    });

  // Fire 2 simultaneous requests
  const [concRes1, concRes2] = await Promise.all([
    publicSubmissionHandler(makeConcurrentReq(), { params: Promise.resolve({ publicId: concurrentForm.publicId }) }),
    publicSubmissionHandler(makeConcurrentReq(), { params: Promise.resolve({ publicId: concurrentForm.publicId }) }),
  ]);

  const statuses = [concRes1.status, concRes2.status].sort();
  assert.deepStrictEqual(statuses, [200, 409], 'Exactly one concurrent request must succeed (200) and one must be rejected (409)');

  const concCount = await prisma.formSubmission.count({
    where: { formId: concurrentForm.id, respondentEmail: targetEmail },
  });
  assert.strictEqual(concCount, 1, 'Only one submission must exist in database after concurrent attempts');
  console.log('✓ PASS: Concurrency protection via PostgreSQL advisory locking prevented race condition.');

  // ------------------------------------------------------------------------
  // TEST 6: Controlled Response Editing via SECURE_EDIT_LINK
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 6: Controlled Response Editing via Secure Edit Link ---');
  const { form: editForm, questions: editQuestions } = await createTestForm({
    title: 'Farmer Crop Survey',
    ownerId: adminUser.id,
    settings: {
      restrictOneResponse: true,
      duplicateIdentifierMethod: 'VERIFIED_EMAIL',
      duplicateRestrictionScope: 'ONCE_PER_FORM',
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'ALWAYS',
    },
    questions: [
      { title: 'Acres of Wheat', type: 'NUMBER' },
      { title: 'Preferred Fertilizer', type: 'SHORT_ANSWER' },
    ],
  });

  const acresQId = editQuestions[0].id;
  const fertQId = editQuestions[1].id;

  // 1. Initial Submission
  const initialSubmitReq = new NextRequest(`http://localhost:3000/api/public/forms/${editForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: acresQId, value: 15 },
        { questionId: fertQId, value: 'Urea' },
      ],
      respondentEmail: 'farmer_ramesh@example.com',
    }),
  });
  const initialSubmitRes = await publicSubmissionHandler(initialSubmitReq, { params: Promise.resolve({ publicId: editForm.publicId }) });
  assert.strictEqual(initialSubmitRes.status, 200, 'Initial submission must succeed');
  const initialData = await initialSubmitRes.json();
  const editToken = initialData.editToken;
  const originalSubId = initialData.submissionId;
  assert.ok(editToken, 'Initial response must return a secure editToken');

  // Verify DB state
  const beforeEditSub = await prisma.formSubmission.findUnique({
    where: { id: originalSubId },
    include: { answers: true },
  });
  assert.strictEqual(beforeEditSub?.editCount, 0, 'Initial editCount must be 0');
  assert.strictEqual(beforeEditSub?.lastEditedAt, null, 'Initial lastEditedAt must be null');

  // 2. Fetch Submission for Editing via GET /submissions/edit?editToken=...
  const getEditReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${editForm.publicId}/submissions/edit?editToken=${encodeURIComponent(editToken)}`
  );
  const getEditRes = await editHandlerGet(getEditReq, { params: Promise.resolve({ publicId: editForm.publicId }) });
  assert.strictEqual(getEditRes.status, 200, 'GET edit submission must succeed');
  const getEditData = await getEditRes.json();
  assert.strictEqual(getEditData.submission.id, originalSubId, 'Must return the original submission ID');
  assert.strictEqual(getEditData.submission.answers[acresQId], 15, 'Saved answer for acres must be 15');
  assert.strictEqual(getEditData.submission.answers[fertQId], 'Urea', 'Saved answer for fertilizer must be Urea');

  // 3. Update Submission via PUT /submissions/edit
  const putEditReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${editForm.publicId}/submissions/edit`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken,
        answers: [
          { questionId: acresQId, value: 25 }, // Changed from 15 to 25
          { questionId: fertQId, value: 'Organic Compost' }, // Changed
        ],
        respondentEmail: 'farmer_ramesh@example.com',
      }),
    }
  );
  const putEditRes = await editHandlerPut(putEditReq, { params: Promise.resolve({ publicId: editForm.publicId }) });
  assert.strictEqual(putEditRes.status, 200, 'PUT edit submission must succeed');
  const putData = await putEditRes.json();
  assert.strictEqual(putData.submissionId, originalSubId, 'Updated submission ID must match original');

  // 4. Verify Database Integrity: In-Place Update
  const totalSubsAfter = await prisma.formSubmission.count({ where: { formId: editForm.id } });
  assert.strictEqual(totalSubsAfter, 1, 'Total submission count must NOT increase when editing response');

  const afterEditSub = await prisma.formSubmission.findUnique({
    where: { id: originalSubId },
    include: { answers: true },
  });
  assert.strictEqual(afterEditSub?.editCount, 1, 'editCount must be incremented to 1');
  assert.ok(afterEditSub?.lastEditedAt, 'lastEditedAt must be recorded');
  const acresAns = afterEditSub?.answers.find((a) => a.questionId === acresQId);
  const fertAns = afterEditSub?.answers.find((a) => a.questionId === fertQId);
  assert.strictEqual(acresAns?.value, 25, 'Updated answer for acres must be 25');
  assert.strictEqual(fertAns?.value, 'Organic Compost', 'Updated answer for fertilizer must be Organic Compost');
  console.log('✓ PASS: Controlled response editing successfully updated original submission in-place without creating duplicates.');

  // ------------------------------------------------------------------------
  // TEST 7: Response Editing Window Expiry Enforcement
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 7: Response Editing Window Expiry Enforcement ---');
  const { form: windowForm, questions: winQuestions } = await createTestForm({
    title: 'Time-Limited Feedback',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingWindowMinutes: 30, // 30 minutes window
    },
    questions: [{ title: 'Comments', type: 'SHORT_ANSWER' }],
  });

  const winQId = winQuestions[0].id;

  // Create submission artificially dated 2 hours ago
  const expiredSub = await prisma.formSubmission.create({
    data: {
      formId: windowForm.id,
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      editToken: `tok_expired_${Date.now()}`,
      answers: {
        create: [{ questionId: winQId, value: 'Initial Old Comment' }],
      },
    },
  });

  // Attempt to GET edit submission (must be 403 Forbidden because 2 hours > 30 minutes)
  const expiredGetReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${windowForm.publicId}/submissions/edit?editToken=${expiredSub.editToken}`
  );
  const expiredGetRes = await editHandlerGet(expiredGetReq, { params: Promise.resolve({ publicId: windowForm.publicId }) });
  assert.strictEqual(expiredGetRes.status, 403, 'GET expired edit window must return HTTP 403');
  const expGetData = await expiredGetRes.json();
  assert.ok(expGetData.error.includes('expired'), 'Error message must mention window expiry');

  // Attempt to PUT edit submission (must also be 403)
  const expiredPutReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${windowForm.publicId}/submissions/edit`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken: expiredSub.editToken,
        answers: [{ questionId: winQId, value: 'Attempted Late Update' }],
      }),
    }
  );
  const expiredPutRes = await editHandlerPut(expiredPutReq, { params: Promise.resolve({ publicId: windowForm.publicId }) });
  assert.strictEqual(expiredPutRes.status, 403, 'PUT expired edit window must return HTTP 403');
  console.log('✓ PASS: Editing window duration limits are authoritatively enforced on the server.');

  // ------------------------------------------------------------------------
  // TEST 8: Unauthorized Editing & Tampering Prevention
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 8: Unauthorized Editing & Tampering Prevention ---');
  // Bogus token
  const bogusReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${editForm.publicId}/submissions/edit?editToken=totally_fake_token_123`
  );
  const bogusRes = await editHandlerGet(bogusReq, { params: Promise.resolve({ publicId: editForm.publicId }) });
  assert.strictEqual(bogusRes.status, 404, 'Bogus edit token must return 404 Not Found');

  // Editing disabled form
  const disabledReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${legacyForm.publicId}/submissions/edit?editToken=any_token`
  );
  const disabledRes = await editHandlerGet(disabledReq, { params: Promise.resolve({ publicId: legacyForm.publicId }) });
  assert.strictEqual(disabledRes.status, 404, 'Editing on non-existent token / disabled form must fail');
  console.log('✓ PASS: Unauthorized access and invalid tokens are safely rejected.');

  // ------------------------------------------------------------------------
  // TEST 9: Response Exports Reflect Updated Answers & Edit Metadata
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 9: Export Route Accuracy for Edited Responses ---');
  const exportReq = new NextRequest(
    `http://localhost:3000/api/forms/${editForm.id}/responses/export?format=json`,
    {
      headers: { Cookie: adminCookie },
    }
  );
  const exportRes = await exportHandler(exportReq, { params: Promise.resolve({ id: editForm.id }) });
  assert.strictEqual(exportRes.status, 200, 'JSON export must succeed');
  const exportData = await exportRes.json();
  assert.strictEqual(exportData.length, 1, 'Export must have 1 response');
  assert.strictEqual(exportData[0].editCount, 1, 'Exported response must have editCount: 1');
  assert.ok(exportData[0].lastEditedAt, 'Exported response must have lastEditedAt timestamp');
  const exportedAcres = exportData[0].answers.find((a: any) => a.questionId === acresQId);
  assert.strictEqual(exportedAcres.value, 25, 'Exported answer value must be the updated value (25)');
  console.log('✓ PASS: Export route accurately reflects in-place edited answers and audit metadata.');

  console.log('\n========================================================================');
  console.log('  ALL 9 END-TO-END VERIFICATION TESTS PASSED SUCCESSFULLY! (100%)       ');
  console.log('========================================================================\n');
}

runResponseControlE2ETests()
  .catch((err) => {
    console.error('E2E TEST SUITE FAILURE:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
