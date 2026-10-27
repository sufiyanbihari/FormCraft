import { prisma } from '../src/lib/db/prisma';
import { POST as attemptHandler, GET as getAttemptHandler } from '../src/app/api/public/forms/[publicId]/quiz/attempt/route';
import { POST as rosterHandler, GET as getRosterHandler } from '../src/app/api/forms/[id]/quiz/roster/route';
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

async function runPhase1Tests() {
  console.log('====================================================');
  console.log('   FormCraft Phase 1: Quiz Config & Attempts Test   ');
  console.log('====================================================\n');

  // 1. Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'phase1_admin@example.com' },
    update: {},
    create: {
      email: 'phase1_admin@example.com',
      name: 'Phase 1 Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });
  const adminCookie = createAuthCookie(adminUser);

  // 2. Create Quiz Form with Advanced Quiz Settings
  console.log('Step 1: Creating Quiz Form with Advanced Settings...');
  const quizForm = await prisma.form.create({
    data: {
      title: 'Banas Dairy Knowledge Assessment',
      description: 'Advanced Quiz Mode Verification Form',
      publicId: `quiz-p1-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizTimerMode: 'BOTH',
          quizDurationMinutes: 30,
          quizNavigationPolicy: 'FORWARD_ONLY',
          quizTimeoutBehavior: 'AUTO_FINALIZE',
          quizRosterMode: 'ROSTER',
          quizExpectedParticipants: 50,
          quizReleaseGrade: 'IMMEDIATE',
        },
      },
    },
  });

  const section = await prisma.formSection.create({
    data: {
      formId: quizForm.id,
      title: 'General Section',
      orderIndex: 0,
    },
  });

  const empQ = await prisma.formQuestion.create({
    data: {
      formId: quizForm.id,
      sectionId: section.id,
      title: 'Employee ID',
      type: 'SHORT_ANSWER',
      isRequired: true,
      orderIndex: 0,
      timeLimitSeconds: 60,
    },
  });

  const quizQ = await prisma.formQuestion.create({
    data: {
      formId: quizForm.id,
      sectionId: section.id,
      title: 'Which year was Banas Dairy founded?',
      type: 'MULTIPLE_CHOICE',
      quizPoints: 10,
      quizAnswer: { correctValue: '1969' },
      timeLimitSeconds: 45,
      orderIndex: 1,
    },
  });

  await prisma.questionOption.createMany({
    data: [
      { questionId: quizQ.id, label: '1969', value: '1969', orderIndex: 0 },
      { questionId: quizQ.id, label: '1975', value: '1975', orderIndex: 1 },
      { questionId: quizQ.id, label: '1980', value: '1980', orderIndex: 2 },
    ],
  });
  await prisma.formSettings.update({
    where: { formId: quizForm.id },
    data: { quizIdentityQuestionId: empQ.id },
  });

  console.log('✓ Advanced quiz created with publicId:', quizForm.publicId);

  // 3. Test Roster API: Add authorized participants
  console.log('\nStep 2: Testing Roster API (Upload & Duplicate Prevention)...');
  const rosterReq = new NextRequest(
    `http://localhost:3000/api/forms/${quizForm.id}/quiz/roster`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        participants: [
          { participantId: 'EMP101', name: 'Ramesh Patel', email: 'ramesh@banas.com' },
          { participantId: 'EMP102', name: 'Sita Desai', email: 'sita@banas.com' },
          { participantId: 'EMP101', name: 'Ramesh Patel Dupe' }, // Duplicate check
        ],
      }),
    }
  );

  const rosterRes = await rosterHandler(rosterReq, {
    params: Promise.resolve({ id: quizForm.id }),
  });
  assert.strictEqual(rosterRes.status, 200, 'Roster import should succeed');
  const rosterData = await rosterRes.json();
  console.log('Roster import response:', rosterData.message);
  assert.strictEqual(rosterData.count, 2, 'Duplicate EMP101 should be deduplicated to 2 participants');

  // Verify Roster GET
  const getRosterReq = new NextRequest(
    `http://localhost:3000/api/forms/${quizForm.id}/quiz/roster`,
    {
      method: 'GET',
      headers: { Cookie: adminCookie },
    }
  );
  const getRosterRes = await getRosterHandler(getRosterReq, {
    params: Promise.resolve({ id: quizForm.id }),
  });
  const getRosterData = await getRosterRes.json();
  assert.strictEqual(getRosterData.totalCount, 2);
  assert.strictEqual(getRosterData.roster[0].status, 'NOT_STARTED');
  console.log('✓ Roster lists 2 authorized participants with status NOT_STARTED.');

  // 4. Test Attempt Start: Unauthorized participant rejected
  console.log('\nStep 3: Testing Attempt Access Control (Roster Rejection)...');
  const unauthReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${quizForm.publicId}/quiz/attempt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'UNAUTHORIZED_ID_999',
      }),
    }
  );
  const unauthRes = await attemptHandler(unauthReq, {
    params: Promise.resolve({ publicId: quizForm.publicId }),
  });
  assert.strictEqual(unauthRes.status, 403, 'Unauthorized participant should be rejected with 403');
  const unauthData = await unauthRes.json();
  console.log('✓ Unauthorized participant successfully rejected:', unauthData.error);

  // 5. Test Attempt Start: Authorized participant creates attempt
  console.log('\nStep 4: Testing Authorized Attempt Creation & Deadline Calculation...');
  const authReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${quizForm.publicId}/quiz/attempt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'EMP101',
      }),
    }
  );
  const authRes = await attemptHandler(authReq, {
    params: Promise.resolve({ publicId: quizForm.publicId }),
  });
  assert.strictEqual(authRes.status, 200, 'Authorized attempt should be created');
  const authData = await authRes.json();
  const attempt = authData.attempt;

  assert.strictEqual(attempt.participantIdentity, 'EMP101');
  assert.strictEqual(attempt.status, 'IN_PROGRESS');
  assert.ok(attempt.startedAt, 'Must have server-recorded startedAt');
  assert.ok(attempt.overallDeadline, 'Must have server-calculated overallDeadline');
  assert.ok(attempt.currentQuestionDeadline, 'Must have server-calculated question deadline');
  assert.strictEqual(authData.navigationPolicy, 'FORWARD_ONLY');
  console.log('✓ Attempt created successfully with server deadlines. Overall deadline:', attempt.overallDeadline);

  // 6. Test Attempt Resuming (Page Refresh): Clock must NOT reset, same attempt returned
  console.log('\nStep 5: Testing Attempt Resuming & Refresh Clock Persistence...');
  const resumeReq = new NextRequest(
    `http://localhost:3000/api/public/forms/${quizForm.publicId}/quiz/attempt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'EMP101',
      }),
    }
  );
  const resumeRes = await attemptHandler(resumeReq, {
    params: Promise.resolve({ publicId: quizForm.publicId }),
  });
  assert.strictEqual(resumeRes.status, 200);
  const resumeData = await resumeRes.json();
  const resumedAttempt = resumeData.attempt;

  assert.strictEqual(resumedAttempt.id, attempt.id, 'Must return identical attempt ID on refresh');
  assert.strictEqual(
    new Date(resumedAttempt.startedAt).getTime(),
    new Date(attempt.startedAt).getTime(),
    'Server startedAt must be preserved'
  );
  assert.strictEqual(
    new Date(resumedAttempt.overallDeadline).getTime(),
    new Date(attempt.overallDeadline).getTime(),
    'Overall deadline must remain authoritative and identical across refresh'
  );
  console.log('✓ Refresh test passed: attempt resumed with identical deadlines and no reset.');

  // 7. Verify Attempt Status in Roster
  console.log('\nStep 6: Verifying Roster Status updated to IN_PROGRESS...');
  const updatedRosterRes = await getRosterHandler(getRosterReq, {
    params: Promise.resolve({ id: quizForm.id }),
  });
  const updatedRosterData = await updatedRosterRes.json();
  const emp101Roster = updatedRosterData.roster.find((r: any) => r.participantId === 'EMP101');
  const emp102Roster = updatedRosterData.roster.find((r: any) => r.participantId === 'EMP102');
  assert.strictEqual(emp101Roster.status, 'IN_PROGRESS', 'EMP101 should now be IN_PROGRESS');
  assert.strictEqual(emp102Roster.status, 'NOT_STARTED', 'EMP102 should still be NOT_STARTED');
  console.log('✓ Roster accurately tracks participant statuses (EMP101: IN_PROGRESS, EMP102: NOT_STARTED).');

  // Cleanup
  console.log('\nCleaning up test form...');
  await prisma.form.delete({ where: { id: quizForm.id } });
  console.log('✓ Cleanup complete.');

  console.log('\n🎉 ALL PHASE 1 TESTS PASSED SUCCESSFULLY!');
}

runPhase1Tests()
  .catch((err) => {
    console.error('Phase 1 test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
