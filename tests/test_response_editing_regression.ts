import { prisma } from '../src/lib/db/prisma';
import { POST as publicSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { GET as editHandlerGet, PUT as editHandlerPut } from '../src/app/api/public/forms/[publicId]/submissions/edit/route';
import { GET as formGetHandler, PATCH as formPatchHandler } from '../src/app/api/forms/[id]/route';
import { updateFormSchema, calculateEditingWindowMinutes } from '../src/lib/validation/formSchema';
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
  settings,
  questions = [{ title: 'Feedback', type: 'SHORT_ANSWER', isRequired: false }],
}: {
  title: string;
  ownerId: string;
  settings?: any;
  questions?: Array<{ title: string; type?: string; isRequired?: boolean }>;
}) {
  const form = await prisma.form.create({
    data: {
      title,
      publicId: `fc-edit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

async function runResponseEditingRegressionTests() {
  console.log('========================================================================');
  console.log(' FormCraft: Response Editing Feature Comprehensive Regression Tests     ');
  console.log('========================================================================\n');

  // Setup Admin / Owner user
  const adminUser = await prisma.user.upsert({
    where: { email: 'edit_admin@example.com' },
    update: {},
    create: {
      email: 'edit_admin@example.com',
      name: 'Edit Feature Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });
  const adminCookie = createAuthCookie(adminUser);

  // ------------------------------------------------------------------------
  // Requirement 1: Only Secure Edit Link is available
  // ------------------------------------------------------------------------
  console.log('[TEST 1] Only Secure Edit Link is available (rejects removed auth options)');

  // Schema checks
  const rejectedAuthOptions = ['AUTH_USER', 'ADMIN_ONLY', 'BOTH_LINK_AND_AUTH'];
  for (const authOption of rejectedAuthOptions) {
    const parseRes = updateFormSchema.safeParse({
      settings: { editingAuthMethod: authOption },
    });
    assert.strictEqual(
      parseRes.success,
      false,
      `Schema must reject obsolete editingAuthMethod: ${authOption}`
    );
  }

  const validAuthRes = updateFormSchema.safeParse({
    settings: { editingAuthMethod: 'SECURE_EDIT_LINK' },
  });
  assert.strictEqual(
    validAuthRes.success,
    true,
    'Schema must accept editingAuthMethod: SECURE_EDIT_LINK'
  );

  // API checks via PATCH
  const { form: testForm1 } = await createTestForm({
    title: 'Auth Method Form',
    ownerId: adminUser.id,
  });

  const patchBadAuthReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ settings: { editingAuthMethod: 'AUTH_USER' } }),
  });
  const patchBadAuthRes = await formPatchHandler(patchBadAuthReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchBadAuthRes.status, 400, 'API must reject obsolete editingAuthMethod');

  const patchGoodAuthReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ settings: { editingAuthMethod: 'SECURE_EDIT_LINK' } }),
  });
  const patchGoodAuthRes = await formPatchHandler(patchGoodAuthReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchGoodAuthRes.status, 200, 'API must accept SECURE_EDIT_LINK');

  // Verify SettingsTab.tsx UI options
  const settingsTabContent = fs.readFileSync(
    path.join(process.cwd(), 'src/components/form-builder/SettingsTab.tsx'),
    'utf-8'
  );
  assert.ok(
    settingsTabContent.includes('Secure Edit Link (Unique token on confirmation screen)'),
    'SettingsTab must display Secure Edit Link option'
  );
  assert.ok(
    !settingsTabContent.includes('Signed-in Account Only'),
    'SettingsTab must NOT contain Signed-in Account Only'
  );
  assert.ok(
    !settingsTabContent.includes('Both (Secure link or signed-in account)'),
    'SettingsTab must NOT contain Both option'
  );
  assert.ok(
    !settingsTabContent.includes('Administrator Only (Owner / editor reviews only)'),
    'SettingsTab must NOT contain Administrator Only option'
  );
  console.log('  ✓ PASS: Only Secure Edit Link is available and obsolete auth options are completely removed.');

  // ------------------------------------------------------------------------
  // Requirement 2: Only Within time limit after submission is available
  // ------------------------------------------------------------------------
  console.log('\n[TEST 2] Only Within time limit after submission is available (rejects removed window options)');

  const rejectedWindowModes = ['ALWAYS', 'UNTIL_DEADLINE'];
  for (const winMode of rejectedWindowModes) {
    const parseRes = updateFormSchema.safeParse({
      settings: { editingWindowMode: winMode },
    });
    assert.strictEqual(
      parseRes.success,
      false,
      `Schema must reject obsolete editingWindowMode: ${winMode}`
    );
  }

  const validWindowRes = updateFormSchema.safeParse({
    settings: { editingWindowMode: 'WITHIN_WINDOW' },
  });
  assert.strictEqual(
    validWindowRes.success,
    true,
    'Schema must accept editingWindowMode: WITHIN_WINDOW'
  );

  const patchBadWinReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ settings: { editingWindowMode: 'ALWAYS' } }),
  });
  const patchBadWinRes = await formPatchHandler(patchBadWinReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchBadWinRes.status, 400, 'API must reject obsolete editingWindowMode');

  // Verify SettingsTab.tsx UI
  assert.ok(
    settingsTabContent.includes('Within time limit after submission'),
    'SettingsTab must display Within time limit after submission'
  );
  assert.ok(
    !settingsTabContent.includes('Always allowed (Until form closes)'),
    'SettingsTab must NOT contain Always allowed'
  );
  assert.ok(
    !settingsTabContent.includes('Until specific deadline cutoff'),
    'SettingsTab must NOT contain Until specific deadline cutoff'
  );
  console.log('  ✓ PASS: Only Within time limit after submission is available and obsolete window modes are removed.');

  // ------------------------------------------------------------------------
  // Requirement 3: Minutes, Hours, and Days are accepted and saved correctly
  // ------------------------------------------------------------------------
  console.log('\n[TEST 3] Minutes, Hours, and Days are accepted and saved correctly');

  // Minutes
  const patchMinReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      settings: {
        allowResponseEditing: true,
        editingTimeDuration: 45,
        editingTimeUnit: 'Minutes',
      },
    }),
  });
  const patchMinRes = await formPatchHandler(patchMinReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchMinRes.status, 200, 'Saving duration with Minutes must succeed');
  let savedSettings = await prisma.formSettings.findUnique({ where: { formId: testForm1.id } });
  assert.strictEqual(savedSettings?.editingTimeDuration, 45);
  assert.strictEqual(savedSettings?.editingTimeUnit, 'Minutes');
  assert.strictEqual(savedSettings?.editingWindowMinutes, 45);

  // Hours
  const patchHourReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      settings: {
        editingTimeDuration: 6,
        editingTimeUnit: 'Hours',
      },
    }),
  });
  const patchHourRes = await formPatchHandler(patchHourReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchHourRes.status, 200, 'Saving duration with Hours must succeed');
  savedSettings = await prisma.formSettings.findUnique({ where: { formId: testForm1.id } });
  assert.strictEqual(savedSettings?.editingTimeDuration, 6);
  assert.strictEqual(savedSettings?.editingTimeUnit, 'Hours');
  assert.strictEqual(savedSettings?.editingWindowMinutes, 360);

  // Days
  const patchDayReq = new NextRequest(`http://localhost:3000/api/forms/${testForm1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      settings: {
        editingTimeDuration: 14,
        editingTimeUnit: 'Days',
      },
    }),
  });
  const patchDayRes = await formPatchHandler(patchDayReq, { params: Promise.resolve({ id: testForm1.id }) });
  assert.strictEqual(patchDayRes.status, 200, 'Saving duration with Days must succeed');
  savedSettings = await prisma.formSettings.findUnique({ where: { formId: testForm1.id } });
  assert.strictEqual(savedSettings?.editingTimeDuration, 14);
  assert.strictEqual(savedSettings?.editingTimeUnit, 'Days');
  assert.strictEqual(savedSettings?.editingWindowMinutes, 20160);

  // Validate non-positive duration rejected
  const parseZeroRes = updateFormSchema.safeParse({
    settings: { editingTimeDuration: 0 },
  });
  assert.strictEqual(parseZeroRes.success, false, 'Duration 0 must be rejected');

  const parseNegRes = updateFormSchema.safeParse({
    settings: { editingTimeDuration: -5 },
  });
  assert.strictEqual(parseNegRes.success, false, 'Negative duration must be rejected');
  console.log('  ✓ PASS: Minutes, Hours, and Days units and positive custom durations are validated and saved.');

  // ------------------------------------------------------------------------
  // Requirement 4: Custom durations calculate the correct expiration time
  // ------------------------------------------------------------------------
  console.log('\n[TEST 4] Custom durations calculate the correct expiration time');

  const testCases = [
    { duration: 30, unit: 'Minutes', expectedMinutes: 30 },
    { duration: 5, unit: 'Hours', expectedMinutes: 300 },
    { duration: 1, unit: 'Days', expectedMinutes: 1440 },
    { duration: 7, unit: 'Days', expectedMinutes: 10080 },
    { duration: 30, unit: 'Days', expectedMinutes: 43200 },
  ];

  for (const tc of testCases) {
    const calc = calculateEditingWindowMinutes(tc.duration, tc.unit);
    assert.strictEqual(
      calc,
      tc.expectedMinutes,
      `calculateEditingWindowMinutes(${tc.duration}, '${tc.unit}') must equal ${tc.expectedMinutes}`
    );
  }
  console.log('  ✓ PASS: Expiration minutes calculated identically to specified specification table.');

  // ------------------------------------------------------------------------
  // Requirement 5: Expired edit links are rejected
  // ------------------------------------------------------------------------
  console.log('\n[TEST 5] Expired edit links are rejected with clear message');

  const { form: expiredTestForm, questions: expQuestions } = await createTestForm({
    title: 'Expiry Test Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 30,
      editingTimeUnit: 'Minutes',
      editingWindowMinutes: 30,
      maxEditCount: 3,
    },
    questions: [{ title: 'Answer Field', type: 'SHORT_ANSWER' }],
  });

  const expQId = expQuestions[0].id;

  // Create submission dated 45 minutes ago (30 min window is expired)
  const expiredSubmission = await prisma.formSubmission.create({
    data: {
      formId: expiredTestForm.id,
      submittedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 min ago
      editToken: `tok_expired_${Date.now()}`,
      answers: {
        create: [{ questionId: expQId, value: 'Initial Old Value' }],
      },
    },
  });

  // GET should return 403 with clear expiration message
  const expGetReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${expiredTestForm.publicId}/submissions/edit?editToken=${expiredSubmission.editToken}`
  );
  const expGetRes = await editHandlerGet(expGetReq, { params: Promise.resolve({ publicId: expiredTestForm.publicId }) });
  assert.strictEqual(expGetRes.status, 403, 'GET with expired edit link must return 403');
  const expGetData = await expGetRes.json();
  assert.ok(
    expGetData.error.toLowerCase().includes('expired'),
    'Error message must state that the editing window has expired'
  );

  // PUT should return 403 with clear expiration message
  const expPutReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${expiredTestForm.publicId}/submissions/edit`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken: expiredSubmission.editToken,
        answers: [{ questionId: expQId, value: 'Late Edit Attempt' }],
      }),
    }
  );
  const expPutRes = await editHandlerPut(expPutReq, { params: Promise.resolve({ publicId: expiredTestForm.publicId }) });
  assert.strictEqual(expPutRes.status, 403, 'PUT with expired edit link must return 403');
  const expPutData = await expPutRes.json();
  assert.ok(
    expPutData.error.toLowerCase().includes('expired'),
    'Error message must state that the editing window has expired'
  );

  // Verify answer unchanged and editCount still 0
  const checkExpSub = await prisma.formSubmission.findUnique({
    where: { id: expiredSubmission.id },
    include: { answers: true },
  });
  assert.strictEqual(checkExpSub?.editCount, 0, 'editCount must NOT increment on expired attempt');
  assert.strictEqual(checkExpSub?.answers[0].value, 'Initial Old Value', 'Answer must NOT change');
  console.log('  ✓ PASS: Expired edit links are authoritatively rejected on server without modifying data.');

  // ------------------------------------------------------------------------
  // Requirements 6 & 7: Maximum edit limits of 1, 3, and 5 are enforced, further edits rejected
  // ------------------------------------------------------------------------
  console.log('\n[TEST 6 & 7] Maximum edit limits of 1, 3, and 5 are enforced and additional edits rejected');

  for (const maxLimit of [1, 3, 5]) {
    const { form: limitForm, questions: lQuestions } = await createTestForm({
      title: `Limit Form Max ${maxLimit}`,
      ownerId: adminUser.id,
      settings: {
        allowResponseEditing: true,
        editingAuthMethod: 'SECURE_EDIT_LINK',
        editingWindowMode: 'WITHIN_WINDOW',
        editingTimeDuration: 24,
        editingTimeUnit: 'Hours',
        maxEditCount: maxLimit,
      },
      questions: [{ title: 'Notes', type: 'SHORT_ANSWER' }],
    });
    const noteQId = lQuestions[0].id;

    // 1. Initial submission
    const initReq = new NextRequest(`http://localhost:3000/api/public/forms/${limitForm.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: noteQId, value: 'Original' }],
        respondentEmail: `user_${maxLimit}@example.com`,
      }),
    });
    const initRes = await publicSubmissionHandler(initReq, { params: Promise.resolve({ publicId: limitForm.publicId }) });
    assert.strictEqual(initRes.status, 200);
    const initData = await initRes.json();
    const token = initData.editToken;
    const subId = initData.submissionId;

    // 2. Perform maxLimit successful edits
    for (let e = 1; e <= maxLimit; e++) {
      const editReq = new NextRequest(`http://localhost:3000/api/public/forms/${limitForm.publicId}/submissions/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editToken: token,
          answers: [{ questionId: noteQId, value: `Edit #${e}` }],
          respondentEmail: `user_${maxLimit}@example.com`,
        }),
      });
      const editRes = await editHandlerPut(editReq, { params: Promise.resolve({ publicId: limitForm.publicId }) });
      assert.strictEqual(editRes.status, 200, `Edit #${e} of ${maxLimit} must succeed`);
      const editData = await editRes.json();
      assert.strictEqual(editData.editCount, e, `editCount after edit #${e} must be ${e}`);
    }

    // 3. Attempt one more edit beyond maxLimit -> Must be rejected with 403
    const extraPutReq = new NextRequest(`http://localhost:3000/api/public/forms/${limitForm.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken: token,
        answers: [{ questionId: noteQId, value: 'One Too Many Edits' }],
      }),
    });
    const extraPutRes = await editHandlerPut(extraPutReq, { params: Promise.resolve({ publicId: limitForm.publicId }) });
    assert.strictEqual(extraPutRes.status, 403, `Edit beyond limit ${maxLimit} must return HTTP 403`);
    const extraData = await extraPutRes.json();
    assert.ok(
      extraData.error.includes('maximum allowed limit'),
      `Error must mention maximum limit reached (Got: "${extraData.error}")`
    );

    // Verify GET is also rejected when limit reached
    const extraGetReq = new NextRequest(
      `http://localhost:3000/api/public/forms/${limitForm.publicId}/submissions/edit?editToken=${token}`
    );
    const extraGetRes = await editHandlerGet(extraGetReq, { params: Promise.resolve({ publicId: limitForm.publicId }) });
    assert.strictEqual(extraGetRes.status, 403, `GET edit beyond limit ${maxLimit} must return HTTP 403`);

    // Verify final editCount in DB
    const finalSub = await prisma.formSubmission.findUnique({ where: { id: subId } });
    assert.strictEqual(finalSub?.editCount, maxLimit, `Final editCount in DB must stay at exactly ${maxLimit}`);
    console.log(`  ✓ PASS: Max edit limit of ${maxLimit} enforced strictly, rejected edit #${maxLimit + 1}.`);
  }

  // ------------------------------------------------------------------------
  // Requirement 8: Failed edit attempts do not increase the successful edit count
  // ------------------------------------------------------------------------
  console.log('\n[TEST 8] Failed edit attempts do not increase the successful edit count');

  const { form: failTestForm, questions: fQuestions } = await createTestForm({
    title: 'Failure Test Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      maxEditCount: 3,
    },
    questions: [
      { title: 'Required Question', type: 'SHORT_ANSWER', isRequired: true },
      { title: 'Number Field', type: 'NUMBER', isRequired: false },
    ],
  });

  const reqQId = fQuestions[0].id;
  const numQId = fQuestions[1].id;

  // Submit valid response
  const initFailSubReq = new NextRequest(`http://localhost:3000/api/public/forms/${failTestForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        { questionId: reqQId, value: 'Initial text' },
        { questionId: numQId, value: 50 },
      ],
      respondentEmail: 'failure_test@example.com',
    }),
  });
  const initFailSubRes = await publicSubmissionHandler(initFailSubReq, { params: Promise.resolve({ publicId: failTestForm.publicId }) });
  assert.strictEqual(initFailSubRes.status, 200);
  const failSubData = await initFailSubRes.json();
  const failToken = failSubData.editToken;
  const failSubId = failSubData.submissionId;

  // 1. Successful Edit 1
  const goodEditReq = new NextRequest(`http://localhost:3000/api/public/forms/${failTestForm.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: failToken,
      answers: [
        { questionId: reqQId, value: 'Updated valid text' },
        { questionId: numQId, value: 100 },
      ],
    }),
  });
  const goodEditRes = await editHandlerPut(goodEditReq, { params: Promise.resolve({ publicId: failTestForm.publicId }) });
  assert.strictEqual(goodEditRes.status, 200);
  const subAfterGood = await prisma.formSubmission.findUnique({ where: { id: failSubId } });
  assert.strictEqual(subAfterGood?.editCount, 1);

  // 2. Failed Edit: Invalid format (answers is missing or malformed) -> 400
  const malformedReq = new NextRequest(`http://localhost:3000/api/public/forms/${failTestForm.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: failToken,
      answers: 'not-an-array',
    }),
  });
  const malformedRes = await editHandlerPut(malformedReq, { params: Promise.resolve({ publicId: failTestForm.publicId }) });
  assert.strictEqual(malformedRes.status, 400);

  // 3. Failed Edit: Invalid edit token -> 401
  const badTokReq = new NextRequest(`http://localhost:3000/api/public/forms/${failTestForm.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: 'wrong_token',
      answers: [{ questionId: reqQId, value: 'text' }],
    }),
  });
  const badTokRes = await editHandlerPut(badTokReq, { params: Promise.resolve({ publicId: failTestForm.publicId }) });
  assert.strictEqual(badTokRes.status, 404);

  // Verify editCount in DB is STILL 1
  const subAfterFails = await prisma.formSubmission.findUnique({ where: { id: failSubId } });
  assert.strictEqual(subAfterFails?.editCount, 1, 'editCount must NOT increase on failed requests');
  console.log('  ✓ PASS: Rejected and failed edit attempts do not increment successful editCount.');

  // ------------------------------------------------------------------------
  // Requirement 9: Concurrent edit requests cannot exceed the configured limit
  // ------------------------------------------------------------------------
  console.log('\n[TEST 9] Concurrent edit requests cannot exceed the configured limit');

  const { form: concForm, questions: cQuestions } = await createTestForm({
    title: 'Concurrent Race Test Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      maxEditCount: 1, // Only 1 edit allowed!
    },
    questions: [{ title: 'Voucher', type: 'SHORT_ANSWER' }],
  });
  const vQId = cQuestions[0].id;

  // Submit original response
  const concInitReq = new NextRequest(`http://localhost:3000/api/public/forms/${concForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: vQId, value: 'Initial Voucher' }],
      respondentEmail: 'race_tester@example.com',
    }),
  });
  const concInitRes = await publicSubmissionHandler(concInitReq, { params: Promise.resolve({ publicId: concForm.publicId }) });
  assert.strictEqual(concInitRes.status, 200);
  const concData = await concInitRes.json();
  const concToken = concData.editToken;
  const concSubId = concData.submissionId;

  // Fire 5 simultaneous concurrent PUT requests
  const makeConcEdit = (index: number) =>
    new NextRequest(`http://localhost:3000/api/public/forms/${concForm.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editToken: concToken,
        answers: [{ questionId: vQId, value: `Concurrent Attempt #${index}` }],
      }),
    });

  const concurrentResults = await Promise.all([
    editHandlerPut(makeConcEdit(1), { params: Promise.resolve({ publicId: concForm.publicId }) }),
    editHandlerPut(makeConcEdit(2), { params: Promise.resolve({ publicId: concForm.publicId }) }),
    editHandlerPut(makeConcEdit(3), { params: Promise.resolve({ publicId: concForm.publicId }) }),
    editHandlerPut(makeConcEdit(4), { params: Promise.resolve({ publicId: concForm.publicId }) }),
    editHandlerPut(makeConcEdit(5), { params: Promise.resolve({ publicId: concForm.publicId }) }),
  ]);

  const concStatuses = concurrentResults.map((r) => r.status);
  const successCount = concStatuses.filter((s) => s === 200).length;
  const rejectedCount = concStatuses.filter((s) => s === 403 || s === 409).length;

  assert.strictEqual(successCount, 1, `Exactly 1 concurrent request must succeed (Got ${successCount})`);
  assert.strictEqual(rejectedCount, 4, `The other 4 concurrent requests must be rejected (Got ${rejectedCount})`);

  // Verify DB state
  const concSubInDb = await prisma.formSubmission.findUnique({ where: { id: concSubId } });
  assert.strictEqual(concSubInDb?.editCount, 1, 'Final editCount in DB must be exactly 1');
  console.log('  ✓ PASS: PostgreSQL transaction lock and atomic verification prevented race condition.');

  // ------------------------------------------------------------------------
  // Requirement 10: Editing updates the original submission rather than creating a duplicate
  // ------------------------------------------------------------------------
  console.log('\n[TEST 10] Editing updates original submission rather than creating a duplicate');

  const { form: inPlaceForm, questions: ipQuestions } = await createTestForm({
    title: 'In-Place Update Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      maxEditCount: 2,
    },
    questions: [{ title: 'Profile Field', type: 'SHORT_ANSWER' }],
  });
  const ipQId = ipQuestions[0].id;

  const originalSubmitReq = new NextRequest(`http://localhost:3000/api/public/forms/${inPlaceForm.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [{ questionId: ipQId, value: 'First Version' }],
      respondentEmail: 'inplace@example.com',
    }),
  });
  const originalSubmitRes = await publicSubmissionHandler(originalSubmitReq, { params: Promise.resolve({ publicId: inPlaceForm.publicId }) });
  assert.strictEqual(originalSubmitRes.status, 200);
  const ipSubmitData = await originalSubmitRes.json();
  const ipToken = ipSubmitData.editToken;
  const ipOriginalSubId = ipSubmitData.submissionId;

  const originalDbSub = await prisma.formSubmission.findUnique({ where: { id: ipOriginalSubId } });
  const originalSubmittedAt = originalDbSub?.submittedAt.toISOString();

  // Perform Edit
  const inPlaceEditReq = new NextRequest(`http://localhost:3000/api/public/forms/${inPlaceForm.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: ipToken,
      answers: [{ questionId: ipQId, value: 'Second Edited Version' }],
    }),
  });
  const inPlaceEditRes = await editHandlerPut(inPlaceEditReq, { params: Promise.resolve({ publicId: inPlaceForm.publicId }) });
  assert.strictEqual(inPlaceEditRes.status, 200);

  // Verify: Exactly 1 total submission exists for this form
  const totalFormSubs = await prisma.formSubmission.count({ where: { formId: inPlaceForm.id } });
  assert.strictEqual(totalFormSubs, 1, 'Total submissions count for form must remain 1');

  // Verify in-place record
  const afterDbSub = await prisma.formSubmission.findUnique({
    where: { id: ipOriginalSubId },
    include: { answers: true },
  });
  assert.strictEqual(afterDbSub?.id, ipOriginalSubId, 'Submission ID must be identical');
  assert.strictEqual(afterDbSub?.answers[0].value, 'Second Edited Version', 'Answer must be updated');
  assert.strictEqual(
    afterDbSub?.submittedAt.toISOString(),
    originalSubmittedAt,
    'submittedAt timestamp must be preserved exactly'
  );
  assert.ok(afterDbSub?.lastEditedAt, 'lastEditedAt must be populated');
  assert.strictEqual(afterDbSub?.editCount, 1, 'editCount must be 1');
  console.log('  ✓ PASS: Editing updated submission in-place, preserving original timestamp without duplicates.');

  // ------------------------------------------------------------------------
  // Requirement 11: Existing forms with legacy settings continue loading safely
  // ------------------------------------------------------------------------
  console.log('\n[TEST 11] Existing forms with legacy settings continue loading safely');

  // Create legacy form with old column values directly in DB
  const legacyForm = await prisma.form.create({
    data: {
      title: 'Legacy Historical Form',
      publicId: `fc-legacy-${Date.now()}`,
      status: 'PUBLISHED',
      ownerId: adminUser.id,
      settings: {
        create: {
          allowResponseEditing: true,
          editingAuthMethod: 'AUTH_USER', // Legacy removed auth method
          editingWindowMode: 'ALWAYS', // Legacy removed window mode
          editingWindowMinutes: 2880, // 48 hours
          duplicateRestrictionScope: 'PERIODIC', // Legacy removed from editing section
          duplicateRestrictionPeriod: 'DAILY',
        },
      },
    },
  });

  // Call GET /api/forms/[id] to load in editor
  const legacyGetReq = new NextRequest(`http://localhost:3000/api/forms/${legacyForm.id}`, {
    headers: { Cookie: adminCookie },
  });
  const legacyGetRes = await formGetHandler(legacyGetReq, { params: Promise.resolve({ id: legacyForm.id }) });
  assert.strictEqual(legacyGetRes.status, 200, 'Legacy form must load successfully with 200');
  const legacyData = await legacyGetRes.json();
  const legSettings = legacyData.form.settings;

  assert.strictEqual(legSettings.editingAuthMethod, 'SECURE_EDIT_LINK', 'Normalized to SECURE_EDIT_LINK');
  assert.strictEqual(legSettings.editingWindowMode, 'WITHIN_WINDOW', 'Normalized to WITHIN_WINDOW');
  assert.strictEqual(legSettings.editingTimeDuration, 2, 'Derived 2 days from 2880 minutes');
  assert.strictEqual(legSettings.editingTimeUnit, 'Days', 'Derived Days unit');
  assert.strictEqual(legSettings.maxEditCount, 1, 'Safe default maxEditCount 1');

  // Save the form via PATCH (simulating form editor Save)
  const legacySaveReq = new NextRequest(`http://localhost:3000/api/forms/${legacyForm.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      settings: {
        allowResponseEditing: true,
        editingAuthMethod: 'SECURE_EDIT_LINK',
        editingWindowMode: 'WITHIN_WINDOW',
        editingTimeDuration: 2,
        editingTimeUnit: 'Days',
        maxEditCount: 3,
      },
    }),
  });
  const legacySaveRes = await formPatchHandler(legacySaveReq, { params: Promise.resolve({ id: legacyForm.id }) });
  assert.strictEqual(legacySaveRes.status, 200, 'Saving updated settings on legacy form must succeed');

  const reloadedSettings = await prisma.formSettings.findUnique({ where: { formId: legacyForm.id } });
  assert.strictEqual(reloadedSettings?.editingTimeDuration, 2);
  assert.strictEqual(reloadedSettings?.editingTimeUnit, 'Days');
  assert.strictEqual(reloadedSettings?.editingWindowMinutes, 2880);
  assert.strictEqual(reloadedSettings?.maxEditCount, 3);
  console.log('  ✓ PASS: Legacy form loaded, normalized safely, and saved updated settings without errors.');

  console.log('\n========================================================================');
  console.log('  ALL 11 RESPONSE EDITING REGRESSION TESTS PASSED SUCCESSFULLY! (100%)   ');
  console.log('========================================================================\n');
}

runResponseEditingRegressionTests()
  .catch((err) => {
    console.error('REGRESSION TEST FAILURE:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
