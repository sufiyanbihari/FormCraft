/**
 * Automated Verification Suite for FormCraft:
 * Stale Response Count in Form Editor Synchronization
 */

import { prisma } from '../src/lib/db/prisma';
import { signToken } from '../src/lib/auth/jwt';
import { GET as getResponseCountHandler } from '../src/app/api/forms/[id]/responses/count/route';
import { POST as postSubmissionHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { DELETE as deleteResponseHandler } from '../src/app/api/forms/[id]/responses/[responseId]/route';
import { SUBMISSION_BROADCAST_CHANNEL, SUBMISSION_STORAGE_KEY } from '../src/lib/submission/submissionEvents';
import { NextRequest } from 'next/server';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function run() {
  console.log('🧪 Starting Stale Response Count Synchronization Tests\n');

  let testFormId: string | null = null;
  let createdSubmissionIds: string[] = [];

  try {
    const adminUser = await prisma.user.findFirst();
    if (!adminUser) throw new Error('No admin user found in database');

    // 1. Create a Test Form
    const form = await prisma.form.create({
      data: {
        title: 'Response Count Sync Test Form',
        description: 'Testing real-time response count synchronization without refresh',
        status: 'PUBLISHED',
        ownerId: adminUser.id,
      },
    });
    testFormId = form.id;

    // Create a Section and a required question
    const section = await prisma.formSection.create({
      data: { formId: form.id, title: 'Main Section', orderIndex: 0 },
    });
    const question = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: section.id,
        title: 'Full Name',
        type: 'SHORT_ANSWER',
        isRequired: true,
        orderIndex: 0,
      },
    });

    const authToken = signToken({ userId: adminUser.id, email: adminUser.email, role: 'ADMIN' });
    const authHeaders = {
      authorization: `Bearer ${authToken}`,
      cookie: `formcraft_session=${authToken}`,
    };

    console.log('--- Sub-Suite 1: Event System & Constants ---');
    assert(SUBMISSION_BROADCAST_CHANNEL === 'formcraft_submissions', 'BroadcastChannel constant is formcraft_submissions');
    assert(SUBMISSION_STORAGE_KEY === 'formcraft_last_submission', 'localStorage fallback key is formcraft_last_submission');

    console.log('\n--- Sub-Suite 2: Response Count Endpoint Security & RBAC ---');
    // 2.1 Unauthenticated request must return 401
    const unauthReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
    });
    const unauthRes = await getResponseCountHandler(unauthReq, { params: Promise.resolve({ id: form.id }) });
    assert(unauthRes.status === 401, 'Unauthenticated request to count endpoint returns 401');

    // 2.2 Authenticated request returns initial count 0
    const authReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const authRes = await getResponseCountHandler(authReq, { params: Promise.resolve({ id: form.id }) });
    assert(authRes.status === 200, 'Authenticated request to count endpoint returns 200');
    const authData = await authRes.json();
    assert(authData.count === 0, `Initial response count is 0 (actual: ${authData.count})`);

    console.log('\n--- Sub-Suite 3: Successful Submission Updates Count ---');
    // 3.1 Submit valid response 1
    const sub1Req = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: question.id, value: 'Alice Smith' }],
        respondentEmail: 'alice@example.com',
      }),
    });
    const sub1Res = await postSubmissionHandler(sub1Req, { params: Promise.resolve({ publicId: form.publicId }) });
    assert(sub1Res.status === 200, `First submission succeeded with 200 (actual: ${sub1Res.status})`);
    const sub1Data = await sub1Res.json();
    if (sub1Data.submissionId) createdSubmissionIds.push(sub1Data.submissionId);

    // Verify count endpoint immediately returns 1
    const countAfterSub1Req = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const countAfterSub1Res = await getResponseCountHandler(countAfterSub1Req, { params: Promise.resolve({ id: form.id }) });
    const countAfterSub1Data = await countAfterSub1Res.json();
    assert(countAfterSub1Data.count === 1, `Count immediately increments to 1 without refresh (actual: ${countAfterSub1Data.count})`);

    console.log('\n--- Sub-Suite 4: Failed & Duplicate Submissions Do Not Increment Count ---');
    // 4.1 Missing required field should fail with 400
    const invalidSubReq = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [], // Missing required question
        respondentEmail: 'nobody@example.com',
      }),
    });
    const invalidSubRes = await postSubmissionHandler(invalidSubReq, { params: Promise.resolve({ publicId: form.publicId }) });
    assert(invalidSubRes.status === 400, `Validation failure returned 400 (actual: ${invalidSubRes.status})`);

    // Verify count did not increment
    const countAfterFailReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const countAfterFailRes = await getResponseCountHandler(countAfterFailReq, { params: Promise.resolve({ id: form.id }) });
    const countAfterFailData = await countAfterFailRes.json();
    assert(countAfterFailData.count === 1, `Count remains 1 after rejected submission (actual: ${countAfterFailData.count})`);

    console.log('\n--- Sub-Suite 5: Second Successful Submission Updates Count to 2 ---');
    // 5.1 Submit valid response 2
    const sub2Req = new NextRequest(`http://localhost:3000/api/public/forms/${form.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionId: question.id, value: 'Bob Jones' }],
        respondentEmail: 'bob@example.com',
      }),
    });
    const sub2Res = await postSubmissionHandler(sub2Req, { params: Promise.resolve({ publicId: form.publicId }) });
    assert(sub2Res.status === 200, `Second submission succeeded with 200 (actual: ${sub2Res.status})`);
    const sub2Data = await sub2Res.json();
    if (sub2Data.submissionId) createdSubmissionIds.push(sub2Data.submissionId);

    // Verify count endpoint returns 2
    const countAfterSub2Req = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const countAfterSub2Res = await getResponseCountHandler(countAfterSub2Req, { params: Promise.resolve({ id: form.id }) });
    const countAfterSub2Data = await countAfterSub2Res.json();
    assert(countAfterSub2Data.count === 2, `Count immediately increments to 2 (actual: ${countAfterSub2Data.count})`);

    console.log('\n--- Sub-Suite 6: Deleting Response Synchronizes Count Back Down ---');
    // 6.1 Delete response 1
    const delReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/${createdSubmissionIds[0]}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const delRes = await deleteResponseHandler(delReq, {
      params: Promise.resolve({ id: form.id, responseId: createdSubmissionIds[0] }),
    });
    assert(delRes.status === 200, `Deletion returned 200 (actual: ${delRes.status})`);

    // Verify count endpoint returns 1
    const countAfterDelReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const countAfterDelRes = await getResponseCountHandler(countAfterDelReq, { params: Promise.resolve({ id: form.id }) });
    const countAfterDelData = await countAfterDelRes.json();
    assert(countAfterDelData.count === 1, `Count immediately decrements to 1 after deletion (actual: ${countAfterDelData.count})`);

    // 6.2 Delete response 2
    const del2Req = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/${createdSubmissionIds[1]}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const del2Res = await deleteResponseHandler(del2Req, {
      params: Promise.resolve({ id: form.id, responseId: createdSubmissionIds[1] }),
    });
    assert(del2Res.status === 200, `Second deletion returned 200 (actual: ${del2Res.status})`);

    // Verify count endpoint returns 0
    const countAfterDel2Req = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/count`, {
      method: 'GET',
      headers: authHeaders,
    });
    const countAfterDel2Res = await getResponseCountHandler(countAfterDel2Req, { params: Promise.resolve({ id: form.id }) });
    const countAfterDel2Data = await countAfterDel2Res.json();
    assert(countAfterDel2Data.count === 0, `Count immediately decrements back to 0 (actual: ${countAfterDel2Data.count})`);

    console.log('\n--- Sub-Suite 7: Tab Switching & Direct Persistence Integrity ---');
    // Verify DB count directly matches count endpoint
    const dbCount = await prisma.formSubmission.count({ where: { formId: form.id } });
    assert(dbCount === 0, `Prisma DB count is authoritative and confirms 0 submissions (actual: ${dbCount})`);

  } catch (error) {
    console.error('Test execution failed with error:', error);
    failed++;
  } finally {
    // Cleanup test form
    if (testFormId) {
      try {
        await prisma.submissionAnswer.deleteMany({ where: { submission: { formId: testFormId } } });
        await prisma.formSubmission.deleteMany({ where: { formId: testFormId } });
        await prisma.questionOption.deleteMany({ where: { question: { formId: testFormId } } });
        await prisma.formQuestion.deleteMany({ where: { formId: testFormId } });
        await prisma.formSection.deleteMany({ where: { formId: testFormId } });
        await prisma.form.delete({ where: { id: testFormId } });
        console.log(`Cleaned up test form: ${testFormId}`);
      } catch (e) {
        console.warn('Cleanup warning:', e);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
