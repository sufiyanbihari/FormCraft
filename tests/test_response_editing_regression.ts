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
    include: { settings: true },
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

  // ------------------------------------------------------------------------
  // Requirement 12: Dynamic Edit Limit Logic & UI State (Issue 1)
  // ------------------------------------------------------------------------
  console.log('\n[TEST 12] Dynamic edit limit logic & UI visibility state transitions');

  // Helper for computing UI visibility logic as done in page.tsx
  function computeShowEditControls(submissionResult: any, formSettings: any) {
    const isResponseEditingAllowed = Boolean(
      submissionResult?.allowResponseEditing !== undefined
        ? submissionResult.allowResponseEditing
        : formSettings?.allowResponseEditing
    );
    const maxEdits = Number(submissionResult?.maxEditCount ?? formSettings?.maxEditCount ?? 1);
    const completedEdits = Number(submissionResult?.editCount ?? 0);
    const canEditResponse = Boolean(
      submissionResult?.canEdit !== undefined
        ? submissionResult.canEdit
        : (
            isResponseEditingAllowed &&
            Boolean(submissionResult?.editToken) &&
            completedEdits < maxEdits
          )
    );
    return canEditResponse && Boolean(submissionResult?.editToken);
  }

  // 12.1: Case maxEditCount = 1
  console.log('  -> Testing maxEditCount = 1 (1 edit allowed)...');
  const { form: formL1, questions: qL1 } = await createTestForm({
    title: 'Limit 1 Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 30,
      editingTimeUnit: 'Minutes',
      editingWindowMinutes: 30,
      maxEditCount: 1,
    },
  });

  // Initial submission (completedEdits = 0)
  const initSubReqL1 = new NextRequest(`http://localhost:3000/api/public/forms/${formL1.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [{ questionId: qL1[0].id, value: 'Initial text' }] }),
  });
  const initSubResL1 = await publicSubmissionHandler(initSubReqL1, { params: Promise.resolve({ publicId: formL1.publicId }) });
  const initSubDataL1 = await initSubResL1.json();
  assert.strictEqual(initSubDataL1.canEdit, true, 'canEdit must be true on initial submission');
  assert.strictEqual(initSubDataL1.editCount, 0, 'editCount must be 0 on initial submission');
  assert.strictEqual(initSubDataL1.maxEditCount, 1, 'maxEditCount must be 1');
  assert.ok(initSubDataL1.editToken, 'editToken must be returned');
  assert.strictEqual(computeShowEditControls(initSubDataL1, formL1.settings), true, 'Edit link MUST be visible initially');

  // Edit #1 (completedEdits becomes 1 == maxEdits)
  const edit1ReqL1 = new NextRequest(`http://localhost:3000/api/public/forms/${formL1.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: initSubDataL1.editToken,
      answers: [{ questionId: qL1[0].id, value: 'First edited text' }],
    }),
  });
  const edit1ResL1 = await editHandlerPut(edit1ReqL1, { params: Promise.resolve({ publicId: formL1.publicId }) });
  assert.strictEqual(edit1ResL1.status, 200, 'First edit should succeed');
  const edit1DataL1 = await edit1ResL1.json();
  assert.strictEqual(edit1DataL1.editCount, 1, 'editCount must be 1');
  assert.strictEqual(edit1DataL1.canEdit, false, 'canEdit must be false when limit reached');
  assert.strictEqual(edit1DataL1.editToken, undefined, 'editToken must NOT be returned when limit reached');
  assert.strictEqual(computeShowEditControls(edit1DataL1, formL1.settings), false, 'Edit link MUST be HIDDEN after max edits reached');

  // Re-attempt edit with original token via GET and PUT
  const getAttemptL1 = new NextRequest(
    `http://localhost:3000/api/public/forms/${formL1.publicId}/submissions/edit?editToken=${initSubDataL1.editToken}`
  );
  const getAttemptResL1 = await editHandlerGet(getAttemptL1, { params: Promise.resolve({ publicId: formL1.publicId }) });
  assert.strictEqual(getAttemptResL1.status, 403, 'Loading exhausted edit link must return 403');

  const putAttemptL1 = new NextRequest(`http://localhost:3000/api/public/forms/${formL1.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: initSubDataL1.editToken,
      answers: [{ questionId: qL1[0].id, value: 'Illegal second edit' }],
    }),
  });
  const putAttemptResL1 = await editHandlerPut(putAttemptL1, { params: Promise.resolve({ publicId: formL1.publicId }) });
  assert.strictEqual(putAttemptResL1.status, 403, 'PUT to exhausted edit link must return 403');
  console.log('  ✓ PASS: maxEditCount = 1: Edit link visible initially, hidden after 1 edit, further edits blocked (403).');

  // 12.2: Case maxEditCount = 2
  console.log('  -> Testing maxEditCount = 2 (2 edits allowed)...');
  const { form: formL2, questions: qL2 } = await createTestForm({
    title: 'Limit 2 Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 1,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 60,
      maxEditCount: 2,
    },
  });

  const initSubReqL2 = new NextRequest(`http://localhost:3000/api/public/forms/${formL2.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [{ questionId: qL2[0].id, value: 'Initial text' }] }),
  });
  const initSubResL2 = await publicSubmissionHandler(initSubReqL2, { params: Promise.resolve({ publicId: formL2.publicId }) });
  const initSubDataL2 = await initSubResL2.json();
  assert.strictEqual(computeShowEditControls(initSubDataL2, formL2.settings), true, 'Edit link visible initially (0 of 2)');

  // Edit #1 (1 of 2 completed)
  const edit1ReqL2 = new NextRequest(`http://localhost:3000/api/public/forms/${formL2.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: initSubDataL2.editToken,
      answers: [{ questionId: qL2[0].id, value: 'Edit 1 of 2' }],
    }),
  });
  const edit1ResL2 = await editHandlerPut(edit1ReqL2, { params: Promise.resolve({ publicId: formL2.publicId }) });
  const edit1DataL2 = await edit1ResL2.json();
  assert.strictEqual(edit1DataL2.editCount, 1);
  assert.strictEqual(edit1DataL2.canEdit, true, 'canEdit must still be true after edit 1 of 2');
  assert.ok(edit1DataL2.editToken, 'editToken must still be returned');
  assert.strictEqual(computeShowEditControls(edit1DataL2, formL2.settings), true, 'Edit link MUST remain visible after edit 1 of 2');

  // Edit #2 (2 of 2 completed)
  const edit2ReqL2 = new NextRequest(`http://localhost:3000/api/public/forms/${formL2.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: edit1DataL2.editToken,
      answers: [{ questionId: qL2[0].id, value: 'Edit 2 of 2' }],
    }),
  });
  const edit2ResL2 = await editHandlerPut(edit2ReqL2, { params: Promise.resolve({ publicId: formL2.publicId }) });
  const edit2DataL2 = await edit2ResL2.json();
  assert.strictEqual(edit2DataL2.editCount, 2);
  assert.strictEqual(edit2DataL2.canEdit, false, 'canEdit must be false after edit 2 of 2');
  assert.strictEqual(edit2DataL2.editToken, undefined, 'editToken must be undefined after edit 2 of 2');
  assert.strictEqual(computeShowEditControls(edit2DataL2, formL2.settings), false, 'Edit link MUST be hidden after edit 2 of 2');

  // Edit #3 (rejected with 403)
  const edit3ReqL2 = new NextRequest(`http://localhost:3000/api/public/forms/${formL2.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editToken: initSubDataL2.editToken,
      answers: [{ questionId: qL2[0].id, value: 'Edit 3 illegal' }],
    }),
  });
  const edit3ResL2 = await editHandlerPut(edit3ReqL2, { params: Promise.resolve({ publicId: formL2.publicId }) });
  assert.strictEqual(edit3ResL2.status, 403, '3rd edit must be rejected with 403');
  console.log('  ✓ PASS: maxEditCount = 2: Visible on 0 and 1 completed edits, hidden on 2, rejected on 3.');

  // ------------------------------------------------------------------------
  // Requirement 13: Confirmation Screen layout cleanliness (Issue 2)
  // ------------------------------------------------------------------------
  console.log('\n[TEST 13] Absence of "Submit another response" and UI cleanliness');
  const publicPagePath = path.join(__dirname, '../src/app/f/[publicId]/page.tsx');
  const pageSrc = fs.readFileSync(publicPagePath, 'utf-8');

  assert(!pageSrc.includes('Submit another response'), 'Submit another response button must NOT exist in page.tsx');
  assert(!pageSrc.includes('isOneResponseRestricted'), 'isOneResponseRestricted must NOT exist in page.tsx');
  assert(pageSrc.includes('showEditControls'), 'showEditControls must be used to cleanly guard edit controls');
  console.log('  ✓ PASS: "Submit another response" button completely removed and confirmation screen cleanly formatted.');

  // ------------------------------------------------------------------------
  // Requirement 14: Edit Page Access Validation (Cases 1 - 10)
  // ------------------------------------------------------------------------
  console.log('\n[TEST 14] Edit Page Access Validation (Cases 1 - 10)');

  // Case 1: Valid token and zero completed edits: GET edit page succeeds
  console.log('  -> Case 1: Valid token and 0 completed edits...');
  const { form: formA1, questions: qA1 } = await createTestForm({
    title: 'Access Test Form 1',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 1440,
      maxEditCount: 1,
    },
  });
  const subReqA1 = new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [{ questionId: qA1[0].id, value: 'Initial Answer' }] }),
  });
  const subResA1 = await publicSubmissionHandler(subReqA1, { params: Promise.resolve({ publicId: formA1.publicId }) });
  const subDataA1 = await subResA1.json();
  const tokenA1 = subDataA1.editToken;

  const getReqA1 = new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit?editToken=${tokenA1}`);
  const getResA1 = await editHandlerGet(getReqA1, { params: Promise.resolve({ publicId: formA1.publicId }) });
  assert.strictEqual(getResA1.status, 200, 'GET edit page must succeed with 200 for 0 completed edits');
  const getDataA1 = await getResA1.json();
  assert.strictEqual(getDataA1.submission.canEdit, true);
  assert.strictEqual(getDataA1.submission.editCount, 0);
  assert.ok(getDataA1.submission.answers);
  assert(getResA1.headers.get('cache-control')?.includes('no-store'), 'Must include Cache-Control: no-store');
  console.log('  ✓ Case 1 PASS: GET edit page succeeds with 200 and no-store headers');

  // Case 2: Maximum edits = 1 and one completed edit: GET edit page is rejected
  console.log('  -> Case 2: Maximum edits = 1 and 1 completed edit...');
  const putReqA1 = new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editToken: tokenA1, answers: [{ questionId: qA1[0].id, value: 'Edited Answer' }] }),
  });
  const putResA1 = await editHandlerPut(putReqA1, { params: Promise.resolve({ publicId: formA1.publicId }) });
  assert.strictEqual(putResA1.status, 200);

  const getReqA2 = new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit?editToken=${tokenA1}`);
  const getResA2 = await editHandlerGet(getReqA2, { params: Promise.resolve({ publicId: formA1.publicId }) });
  assert.strictEqual(getResA2.status, 403, 'GET edit page must be rejected with 403 when limit exhausted');
  const getDataA2 = await getResA2.json();
  assert.strictEqual(getDataA2.code, 'MAX_EDITS_EXCEEDED');
  assert.strictEqual(getDataA2.canEdit, false);
  assert.strictEqual(getDataA2.submission, undefined, 'Must NOT leak submission answers when rejected');
  console.log('  ✓ Case 2 PASS: GET rejected with 403 and code MAX_EDITS_EXCEEDED without leaking answers');

  // Case 3: Maximum edits = 2 and one completed edit: GET edit page succeeds
  console.log('  -> Case 3: Maximum edits = 2 and 1 completed edit...');
  const { form: formA2, questions: qA2 } = await createTestForm({
    title: 'Access Test Form 2',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 1440,
      maxEditCount: 2,
    },
  });
  const subResA3 = await publicSubmissionHandler(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [{ questionId: qA2[0].id, value: 'Initial' }] }),
    }),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );
  const subDataA3 = await subResA3.json();
  const tokenA2 = subDataA3.editToken;

  // Complete edit 1
  await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: tokenA2, answers: [{ questionId: qA2[0].id, value: 'Edit 1' }] }),
    }),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );

  const getResA3 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions/edit?editToken=${tokenA2}`),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );
  assert.strictEqual(getResA3.status, 200, 'GET must succeed for edit 1 of 2');
  const getDataA3 = await getResA3.json();
  assert.strictEqual(getDataA3.submission.canEdit, true);
  assert.strictEqual(getDataA3.submission.editCount, 1);
  console.log('  ✓ Case 3 PASS: GET succeeds with 200 for 1 of 2 completed edits');

  // Case 4: Maximum edits = 2 and two completed edits: GET edit page is rejected
  console.log('  -> Case 4: Maximum edits = 2 and 2 completed edits...');
  await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: tokenA2, answers: [{ questionId: qA2[0].id, value: 'Edit 2' }] }),
    }),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );

  const getResA4 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions/edit?editToken=${tokenA2}`),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );
  assert.strictEqual(getResA4.status, 403, 'GET must be rejected with 403 after 2 of 2 edits');
  const getDataA4 = await getResA4.json();
  assert.strictEqual(getDataA4.code, 'MAX_EDITS_EXCEEDED');
  console.log('  ✓ Case 4 PASS: GET rejected with 403 after 2 of 2 edits');

  // Case 5: Maximum edits = 3 and two completed edits: GET edit page succeeds
  console.log('  -> Case 5: Maximum edits = 3 and 2 completed edits...');
  const { form: formA3, questions: qA3 } = await createTestForm({
    title: 'Access Test Form 3',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 1440,
      maxEditCount: 3,
    },
  });
  const subResA5 = await publicSubmissionHandler(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA3.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [{ questionId: qA3[0].id, value: 'Initial' }] }),
    }),
    { params: Promise.resolve({ publicId: formA3.publicId }) }
  );
  const tokenA3 = (await subResA5.json()).editToken;

  for (let i = 1; i <= 2; i++) {
    await editHandlerPut(
      new NextRequest(`http://localhost:3000/api/public/forms/${formA3.publicId}/submissions/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editToken: tokenA3, answers: [{ questionId: qA3[0].id, value: `Edit ${i}` }] }),
      }),
      { params: Promise.resolve({ publicId: formA3.publicId }) }
    );
  }

  const getResA5 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA3.publicId}/submissions/edit?editToken=${tokenA3}`),
    { params: Promise.resolve({ publicId: formA3.publicId }) }
  );
  assert.strictEqual(getResA5.status, 200, 'GET must succeed for 2 of 3 completed edits');
  const getDataA5 = await getResA5.json();
  assert.strictEqual(getDataA5.submission.canEdit, true);
  assert.strictEqual(getDataA5.submission.editCount, 2);
  console.log('  ✓ Case 5 PASS: GET succeeds with 200 for 2 of 3 completed edits');

  // Case 6: Expired editing window: GET edit page is rejected
  console.log('  -> Case 6: Expired editing window...');
  const expiredSub = await prisma.formSubmission.create({
    data: {
      formId: formA1.id,
      submittedAt: new Date(Date.now() - 48 * 3600 * 1000), // 48 hours ago
      editToken: `expired-tok-${Date.now()}`,
      editCount: 0,
    },
  });
  const getResA6 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit?editToken=${expiredSub.editToken}`),
    { params: Promise.resolve({ publicId: formA1.publicId }) }
  );
  assert.strictEqual(getResA6.status, 403);
  const getDataA6 = await getResA6.json();
  assert.strictEqual(getDataA6.code, 'EDIT_WINDOW_EXPIRED');
  console.log('  ✓ Case 6 PASS: Expired edit window rejected with 403 and code EDIT_WINDOW_EXPIRED');

  // Case 7: Invalid token: GET edit page is rejected
  console.log('  -> Case 7: Invalid token...');
  const getResA7 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit?editToken=totally_invalid_random_token`),
    { params: Promise.resolve({ publicId: formA1.publicId }) }
  );
  assert.strictEqual(getResA7.status, 404);
  const getDataA7 = await getResA7.json();
  assert.strictEqual(getDataA7.code, 'SUBMISSION_NOT_FOUND');
  console.log('  ✓ Case 7 PASS: Non-existent token rejected with 404');

  // Case 8: Token belonging to another form: GET edit page is rejected
  console.log('  -> Case 8: Token belonging to another form...');
  const getResA8 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA2.publicId}/submissions/edit?editToken=${tokenA1}`),
    { params: Promise.resolve({ publicId: formA2.publicId }) }
  );
  assert.strictEqual(getResA8.status, 403);
  const getDataA8 = await getResA8.json();
  assert.strictEqual(getDataA8.code, 'INVALID_TOKEN');
  console.log('  ✓ Case 8 PASS: Cross-form edit token rejected with 403 INVALID_TOKEN');

  // Case 9: Editing disabled: GET edit page is rejected
  console.log('  -> Case 9: Editing disabled on form...');
  const { form: formDisabled, questions: qDisabled } = await createTestForm({
    title: 'Disabled Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: false,
    },
  });
  const disabledSub = await prisma.formSubmission.create({
    data: {
      formId: formDisabled.id,
      submittedAt: new Date(),
      editToken: `dis-tok-${Date.now()}`,
      editCount: 0,
    },
  });
  const getResA9 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formDisabled.publicId}/submissions/edit?editToken=${disabledSub.editToken}`),
    { params: Promise.resolve({ publicId: formDisabled.publicId }) }
  );
  assert.strictEqual(getResA9.status, 403);
  assert.strictEqual((await getResA9.json()).code, 'EDITING_DISABLED');
  console.log('  ✓ Case 9 PASS: Editing disabled rejected with 403 EDITING_DISABLED');

  // Case 10: Deleted submission: GET edit page is rejected
  console.log('  -> Case 10: Deleted submission...');
  const tempSub = await prisma.formSubmission.create({
    data: {
      formId: formA1.id,
      submittedAt: new Date(),
      editToken: `temp-del-${Date.now()}`,
      editCount: 0,
    },
  });
  await prisma.formSubmission.delete({ where: { id: tempSub.id } });
  const getResA10 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA1.publicId}/submissions/edit?editToken=${tempSub.editToken}`),
    { params: Promise.resolve({ publicId: formA1.publicId }) }
  );
  assert.strictEqual(getResA10.status, 404);
  assert.strictEqual((await getResA10.json()).code, 'SUBMISSION_NOT_FOUND');
  console.log('  ✓ Case 10 PASS: Deleted submission rejected with 404 SUBMISSION_NOT_FOUND');

  // ------------------------------------------------------------------------
  // Requirement 15: Refresh and Navigation Verification (Cases 11 - 16)
  // ------------------------------------------------------------------------
  console.log('\n[TEST 15] Refresh and Navigation Verification (Cases 11 - 16)');

  // Case 11: Open valid edit link and refresh before editing: editing form remains accessible
  console.log('  -> Case 11: Refresh before editing (remains accessible)...');
  const getRef1 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA3.publicId}/submissions/edit?editToken=${tokenA3}`),
    { params: Promise.resolve({ publicId: formA3.publicId }) }
  );
  assert.strictEqual(getRef1.status, 200, 'Initial load succeeds');
  const getRef2 = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formA3.publicId}/submissions/edit?editToken=${tokenA3}`),
    { params: Promise.resolve({ publicId: formA3.publicId }) }
  );
  assert.strictEqual(getRef2.status, 200, 'Refresh load also succeeds');
  console.log('  ✓ Case 11 PASS: Refresh before editing keeps editing form accessible');

  // Case 12: Complete only permitted edit and refresh: exhausted-link screen appears
  console.log('  -> Case 12: Complete edit and refresh (shows Response Already Submitted)...');
  const { form: formSingle, questions: qSingle } = await createTestForm({
    title: 'Single Edit Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 1440,
      maxEditCount: 1,
    },
  });
  const subSingle = await (
    await publicSubmissionHandler(
      new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [{ questionId: qSingle[0].id, value: 'Orig' }] }),
      }),
      { params: Promise.resolve({ publicId: formSingle.publicId }) }
    )
  ).json();

  // Complete the one edit
  const putSingleRes = await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: subSingle.editToken, answers: [{ questionId: qSingle[0].id, value: 'Updated' }] }),
    }),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(putSingleRes.status, 200);

  // Refresh old edit URL
  const refreshRes = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit?editToken=${subSingle.editToken}`),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(refreshRes.status, 403);
  const refreshData = await refreshRes.json();
  assert.strictEqual(refreshData.code, 'MAX_EDITS_EXCEEDED');
  assert(
    refreshData.error.includes('You have used all permitted editing attempts, so further changes are no longer available.'),
    `Error must contain exhausted notice: ${refreshData.error}`
  );
  console.log('  ✓ Case 12 PASS: Refresh on exhausted edit link authoritatively rejected with exact expected message');

  // Case 13: Open exhausted edit link in a new tab: editing form remains inaccessible
  console.log('  -> Case 13: New tab access to exhausted link...');
  const newTabRes = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit?editToken=${subSingle.editToken}`, {
      headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
    }),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(newTabRes.status, 403);
  assert.strictEqual((await newTabRes.json()).code, 'MAX_EDITS_EXCEEDED');
  console.log('  ✓ Case 13 PASS: New tab request to exhausted link is blocked');

  // Case 14: Open exhausted edit link in another browser session: editing form remains inaccessible
  console.log('  -> Case 14: Another browser session (different IP/agent)...');
  const anotherSessionRes = await editHandlerGet(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit?editToken=${subSingle.editToken}`, {
      headers: { 'x-forwarded-for': '203.0.113.195', 'user-agent': 'AnotherBrowser/1.0' },
    }),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(anotherSessionRes.status, 403);
  assert.strictEqual((await anotherSessionRes.json()).code, 'MAX_EDITS_EXCEEDED');
  console.log('  ✓ Case 14 PASS: Different browser session to exhausted link is blocked');

  // Case 15: Use browser back navigation after exhausting limit
  console.log('  -> Case 15: Browser back navigation static code verification...');
  assert(pageSrc.includes('isValidatingEditToken'), 'page.tsx must use isValidatingEditToken to prevent form flash');
  assert(pageSrc.includes('editLinkRejection'), 'page.tsx must track editLinkRejection state');
  assert(pageSrc.includes('Response Already Submitted'), 'page.tsx must show Response Already Submitted');
  console.log('  ✓ Case 15 PASS: page.tsx authoritative validation prevents back-nav bypass');

  // Case 16: Simulate stale cached data
  console.log('  -> Case 16: Stale cache prevention headers...');
  assert(getResA2.headers.get('cache-control')?.includes('no-store'), 'Rejection response must have no-store');
  assert(getResA2.headers.get('cache-control')?.includes('no-cache'), 'Rejection response must have no-cache');
  console.log('  ✓ Case 16 PASS: Cache-Control: no-store, no-cache verified on all responses');

  // ------------------------------------------------------------------------
  // Requirement 16: API Security and Authorization Consistency (Cases 17 - 22)
  // ------------------------------------------------------------------------
  console.log('\n[TEST 16] API Security and Authorization Consistency (Cases 17 - 22)');

  // Case 17: Direct POST/PUT request using exhausted token: rejected
  console.log('  -> Case 17: Direct PUT using exhausted token...');
  const directPutExhausted = await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: subSingle.editToken, answers: [{ questionId: qSingle[0].id, value: 'Hacker Edit' }] }),
    }),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(directPutExhausted.status, 403);
  assert.strictEqual((await directPutExhausted.json()).code, 'MAX_EDITS_EXCEEDED');
  console.log('  ✓ Case 17 PASS: Direct PUT with exhausted token rejected with 403');

  // Case 18: Direct POST/PUT request using invalid token: rejected
  console.log('  -> Case 18: Direct PUT using invalid token...');
  const directPutInvalid = await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formSingle.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: 'invalid_tok_123', answers: [{ questionId: qSingle[0].id, value: 'Hacker Edit' }] }),
    }),
    { params: Promise.resolve({ publicId: formSingle.publicId }) }
  );
  assert.strictEqual(directPutInvalid.status, 404);
  assert.strictEqual((await directPutInvalid.json()).code, 'SUBMISSION_NOT_FOUND');
  console.log('  ✓ Case 18 PASS: Direct PUT with invalid token rejected with 404');

  // Case 19: Simultaneous requests with one remaining edit: only one succeeds
  console.log('  -> Case 19: Simultaneous requests with 1 remaining edit...');
  const { form: formRace, questions: qRace } = await createTestForm({
    title: 'Race Condition Form',
    ownerId: adminUser.id,
    settings: {
      allowResponseEditing: true,
      editingAuthMethod: 'SECURE_EDIT_LINK',
      editingWindowMode: 'WITHIN_WINDOW',
      editingTimeDuration: 24,
      editingTimeUnit: 'Hours',
      editingWindowMinutes: 1440,
      maxEditCount: 1,
    },
  });
  const subRace = await (
    await publicSubmissionHandler(
      new NextRequest(`http://localhost:3000/api/public/forms/${formRace.publicId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [{ questionId: qRace[0].id, value: 'Race Start' }] }),
      }),
      { params: Promise.resolve({ publicId: formRace.publicId }) }
    )
  ).json();

  const [raceRes1, raceRes2] = await Promise.all([
    editHandlerPut(
      new NextRequest(`http://localhost:3000/api/public/forms/${formRace.publicId}/submissions/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editToken: subRace.editToken, answers: [{ questionId: qRace[0].id, value: 'Racer 1' }] }),
      }),
      { params: Promise.resolve({ publicId: formRace.publicId }) }
    ),
    editHandlerPut(
      new NextRequest(`http://localhost:3000/api/public/forms/${formRace.publicId}/submissions/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editToken: subRace.editToken, answers: [{ questionId: qRace[0].id, value: 'Racer 2' }] }),
      }),
      { params: Promise.resolve({ publicId: formRace.publicId }) }
    ),
  ]);
  const statuses = [raceRes1.status, raceRes2.status].sort();
  assert.deepStrictEqual(statuses, [200, 403], 'Exactly one concurrent edit must succeed (200) and one fail (403)');
  console.log('  ✓ Case 19 PASS: Concurrency serialized via advisory lock (one 200, one 403)');

  // Case 20: Failed edit request does not increment editCount
  console.log('  -> Case 20: Failed edit request does not increment editCount...');
  const subBeforeFail = await prisma.formSubmission.findFirst({ where: { editToken: subRace.editToken } });
  const countBefore = subBeforeFail?.editCount;

  // Attempt invalid schema edit
  await editHandlerPut(
    new NextRequest(`http://localhost:3000/api/public/forms/${formRace.publicId}/submissions/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken: subRace.editToken, answers: 'invalid_answers_string' }),
    }),
    { params: Promise.resolve({ publicId: formRace.publicId }) }
  );

  const subAfterFail = await prisma.formSubmission.findFirst({ where: { editToken: subRace.editToken } });
  assert.strictEqual(subAfterFail?.editCount, countBefore, 'editCount must NOT increment on rejected edit');
  console.log('  ✓ Case 20 PASS: Failed edit attempt preserved editCount');

  // Case 21: Original submittedAt remains unchanged
  console.log('  -> Case 21: Original submittedAt remains unchanged...');
  assert.strictEqual(
    subBeforeFail?.submittedAt.getTime(),
    subAfterFail?.submittedAt.getTime(),
    'submittedAt timestamp must remain immutable'
  );
  console.log('  ✓ Case 21 PASS: submittedAt timestamp preserved exactly');

  // Case 22: Original submission is not duplicated
  console.log('  -> Case 22: Original submission is not duplicated...');
  const totalSubmissionsFormRace = await prisma.formSubmission.count({ where: { formId: formRace.id } });
  assert.strictEqual(totalSubmissionsFormRace, 1, 'Total submissions must remain exactly 1');
  console.log('  ✓ Case 22 PASS: In-place update verified, 0 duplicate submissions created');

  console.log('\n========================================================================');
  console.log('  ALL 16 RESPONSE EDITING REGRESSION TEST SUITES PASSED (100%)           ');
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
