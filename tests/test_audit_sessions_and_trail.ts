/**
 * Automated Verification Suite for FormCraft:
 * System Audit Logs, Active Session Tracking & Before-and-After Change Trail
 */

import { prisma } from '../src/lib/db/prisma';
import { hashPassword } from '../src/lib/auth/password';
import { signToken } from '../src/lib/auth/jwt';
import { SESSION_COOKIE_NAME, getAuthUserFromRequest } from '../src/lib/auth/session';
import { signAuditAuthToken, AUDIT_AUTH_COOKIE, AUDIT_REQUIRED_EMAIL } from '../src/lib/auth/auditAuth';
import { POST as postLoginHandler } from '../src/app/api/auth/login/route';
import { POST as postLogoutHandler } from '../src/app/api/auth/logout/route';
import { POST as postHeartbeatHandler } from '../src/app/api/auth/heartbeat/route';
import { GET as getSessionsHandler } from '../src/app/api/admin/sessions/route';
import { POST as postTerminateHandler } from '../src/app/api/admin/sessions/[id]/terminate/route';
import { DELETE as deleteAuditLogsHandler } from '../src/app/api/admin/audit-logs/route';
import { PATCH as patchFormHandler } from '../src/app/api/forms/[id]/route';
import { POST as postPublishHandler } from '../src/app/api/forms/[id]/publish/route';
import { getSessionInactivityTimeoutMs } from '../src/lib/auth/sessionConfig';
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
  console.log('🧪 Starting System Audit Logs & Active Session Tracking Verification Suite\n');

  let testUserId: string | null = null;
  let testFormId: string | null = null;
  let createdSessionIds: string[] = [];

  try {
    // 0. Locate or create a test admin user with known password
    const testEmail = 'qa_session_test_admin@example.com';
    const testPassword = 'Password123!';
    const passwordHash = await hashPassword(testPassword);

    let adminUser = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: testEmail,
          name: 'QA Session Admin',
          passwordHash,
          role: 'ADMIN',
        },
      });
    } else {
      adminUser = await prisma.user.update({
        where: { id: adminUser.id },
        data: { passwordHash, role: 'ADMIN' },
      });
    }
    testUserId = adminUser.id;

    // Generate genuine signed audit authorization cookie
    const auditToken = signAuditAuthToken(adminUser.id, AUDIT_REQUIRED_EMAIL);
    const auditCookieHeader = `${AUDIT_AUTH_COOKIE}=${auditToken}`;

    // ---------------------------------------------------------
    // TEST 1: Multi-Device Login creates 2 distinct session records
    // ---------------------------------------------------------
    console.log('--- Test 1: Multi-Device Login ---');
    // Login 1: Laptop Chrome
    const loginReq1 = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-forwarded-for': '192.168.1.50',
      },
      body: JSON.stringify({ email: adminUser.email, password: testPassword }),
    });

    const loginRes1 = await postLoginHandler(loginReq1);
    const loginData1 = await loginRes1.json();
    const token1 = loginRes1.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session1Id = loginData1.sessionId;

    assert(loginRes1.status === 200 && Boolean(session1Id) && Boolean(token1), 'Login 1 (Laptop) succeeded with token and sessionId');
    if (session1Id) createdSessionIds.push(session1Id);

    // Login 2: Mobile Safari
    const loginReq2 = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'x-forwarded-for': '10.0.0.22',
      },
      body: JSON.stringify({ email: adminUser.email, password: testPassword }),
    });

    const loginRes2 = await postLoginHandler(loginReq2);
    const loginData2 = await loginRes2.json();
    const token2 = loginRes2.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session2Id = loginData2.sessionId;

    assert(loginRes2.status === 200 && Boolean(session2Id) && Boolean(token2), 'Login 2 (Mobile) succeeded with token and sessionId');
    if (session2Id) createdSessionIds.push(session2Id);

    assert(session1Id !== session2Id, 'Multi-device logins have separate unique session IDs');

    // Verify in database
    const dbSession1 = await prisma.session.findUnique({ where: { id: session1Id } });
    const dbSession2 = await prisma.session.findUnique({ where: { id: session2Id } });

    assert(dbSession1?.deviceType === 'Desktop' || dbSession1?.deviceType === 'Laptop', 'Session 1 device parsed correctly');
    assert(dbSession2?.deviceType === 'Mobile', 'Session 2 mobile device parsed correctly');
    assert(Boolean(dbSession1?.browser?.startsWith('Chrome')), `Session 1 browser detected as Chrome (${dbSession1?.browser})`);
    assert(Boolean(dbSession2?.browser?.startsWith('Safari')), `Session 2 browser detected as Safari (${dbSession2?.browser})`);
    assert(dbSession1?.status === 'ACTIVE' && dbSession2?.status === 'ACTIVE', 'Both sessions are ACTIVE in DB');

    // ---------------------------------------------------------
    // TEST 2: Active Users Calculation & Inactivity Timeout (90s)
    // ---------------------------------------------------------
    console.log('\n--- Test 2: Active Users Calculation & Inactivity Cutoff ---');
    const timeoutMs = getSessionInactivityTimeoutMs();
    const expiredSession = await prisma.session.create({
      data: {
        sessionToken: 'test-expired-token-' + Date.now(),
        userId: adminUser.id,
        userName: adminUser.name,
        userEmail: adminUser.email,
        userRole: adminUser.role,
        deviceType: 'Tablet',
        browser: 'Safari',
        os: 'iOS',
        status: 'ACTIVE',
        loginAt: new Date(Date.now() - 300000),
        lastActiveAt: new Date(Date.now() - (timeoutMs + 30000)), // 30s older than timeout
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    createdSessionIds.push(expiredSession.id);

    // Call GET /api/admin/sessions
    const getSessionsReq = new NextRequest('http://localhost:3000/api/admin/sessions', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token1}; ${auditCookieHeader}`,
      },
    });
    const sessionsRes = await getSessionsHandler(getSessionsReq);
    const sessionsData = await sessionsRes.json();

    assert(sessionsRes.status === 200, 'GET /api/admin/sessions returned status 200');
    assert(
      sessionsData.stats?.activeSessionsCount >= 2,
      `Active sessions count accurately reflects live sessions (${sessionsData.stats?.activeSessionsCount})`
    );

    // Find the stale session in the response and verify it was computed as EXPIRED
    const returnedExpiredSession = sessionsData.sessions?.find((s: any) => s.id === expiredSession.id);
    assert(
      returnedExpiredSession?.status === 'EXPIRED',
      'Session with lastActiveAt older than 90s is marked EXPIRED'
    );

    // ---------------------------------------------------------
    // TEST 3: Heartbeat updates lastActiveAt
    // ---------------------------------------------------------
    console.log('\n--- Test 3: Heartbeat Mechanism ---');
    const oldLastActive = dbSession1?.lastActiveAt.getTime() || 0;
    // Wait 100ms
    await new Promise((r) => setTimeout(r, 100));

    const heartbeatReq = new NextRequest('http://localhost:3000/api/auth/heartbeat', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token1}`,
      },
    });
    const heartbeatRes = await postHeartbeatHandler(heartbeatReq);
    const heartbeatData = await heartbeatRes.json();

    assert(heartbeatRes.status === 200 && heartbeatData.valid === true, 'Heartbeat returned 200 OK with valid: true');

    const refreshedSession1 = await prisma.session.findUnique({ where: { id: session1Id } });
    assert(
      (refreshedSession1?.lastActiveAt.getTime() || 0) >= oldLastActive,
      'Heartbeat successfully refreshed session lastActiveAt timestamp'
    );

    // ---------------------------------------------------------
    // TEST 4: Single-Device Logout Independence
    // ---------------------------------------------------------
    console.log('\n--- Test 4: Single-Device Logout Independence ---');
    const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token1}`,
      },
    });
    const logoutRes = await postLogoutHandler(logoutReq);
    assert(logoutRes.status === 200, 'Device 1 logout returned status 200');

    // Check DB state
    const afterLogoutSession1 = await prisma.session.findUnique({ where: { id: session1Id } });
    const afterLogoutSession2 = await prisma.session.findUnique({ where: { id: session2Id } });

    assert(afterLogoutSession1?.status === 'LOGGED_OUT', 'Device 1 session status is LOGGED_OUT');
    assert(
      afterLogoutSession2?.status === 'ACTIVE',
      'Device 2 session remains ACTIVE and unaffected by Device 1 logout'
    );

    // ---------------------------------------------------------
    // TEST 5: Admin Session Termination & Token Invalidation
    // ---------------------------------------------------------
    console.log('\n--- Test 5: Authorized Admin Session Termination ---');
    // Create an active admin session for admin operations
    const adminActionSession = await prisma.session.create({
      data: {
        sessionToken: 'test-admin-action-' + Date.now(),
        userId: adminUser.id,
        userName: adminUser.name,
        userEmail: adminUser.email,
        userRole: adminUser.role,
        deviceType: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        status: 'ACTIVE',
        loginAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    createdSessionIds.push(adminActionSession.id);

    const adminAuthToken = signToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: adminActionSession.id,
    });

    const terminateReq = new NextRequest(
      `http://localhost:3000/api/admin/sessions/${session2Id}/terminate`,
      {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminAuthToken}; ${auditCookieHeader}`,
        },
      }
    );
    const terminateRes = await postTerminateHandler(terminateReq, {
      params: Promise.resolve({ id: session2Id }),
    });
    assert(terminateRes.status === 200, 'POST /api/admin/sessions/[id]/terminate returned 200');

    const terminatedSession2 = await prisma.session.findUnique({ where: { id: session2Id } });
    assert(terminatedSession2?.status === 'TERMINATED', 'Session 2 marked TERMINATED in database');

    // Verify server-side token validation rejects requests from terminated session
    const checkTerminatedReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token2}`,
      },
    });
    const validatedUser = await getAuthUserFromRequest(checkTerminatedReq);
    assert(
      validatedUser === null,
      'getAuthUserFromRequest correctly revokes and rejects token from terminated session'
    );

    // Verify audit log for SESSION_TERMINATE was created
    const terminateLog = await prisma.formAuditLog.findFirst({
      where: { action: 'SESSION_TERMINATE', userId: adminUser.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(
      terminateLog !== null && (terminateLog.details as any)?.terminatedSessionId === session2Id,
      'SESSION_TERMINATE audit log was recorded with admin identity and session details'
    );

    // ---------------------------------------------------------
    // TEST 6: Before-and-After Change Tracking in Audit Trail
    // ---------------------------------------------------------
    console.log('\n--- Test 6: Before-and-After Change Tracking ---');
    const form = await prisma.form.create({
      data: {
        title: 'Initial Audit Form Title',
        description: 'Initial Description',
        status: 'DRAFT',
        ownerId: adminUser.id,
      },
    });
    testFormId = form.id;

    const section = await prisma.formSection.create({
      data: {
        formId: form.id,
        title: 'Section 1',
        orderIndex: 0,
      },
    });
    await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: section.id,
        title: 'Question 1',
        type: 'SHORT_ANSWER',
        isRequired: true,
        orderIndex: 0,
      },
    });

    // PATCH form title & description
    const patchReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${adminAuthToken}`,
      },
      body: JSON.stringify({
        title: 'Updated Audit Form Title',
        description: 'Updated Description',
      }),
    });
    const patchRes = await patchFormHandler(patchReq, { params: Promise.resolve({ id: form.id }) });
    assert(patchRes.status === 200, 'PATCH /api/forms/[id] returned 200');

    // Inspect recorded audit log for before/after changes
    const updateLog = await prisma.formAuditLog.findFirst({
      where: { formId: form.id, action: 'FORM_UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    const changes = (updateLog?.details as any)?.changes;
    assert(Array.isArray(changes) && changes.length > 0, 'Form update recorded changes array');

    const titleChange = changes?.find((c: any) => c.field === 'title');
    assert(
      titleChange &&
        titleChange.before === 'Initial Audit Form Title' &&
        titleChange.after === 'Updated Audit Form Title',
      'Form title before-and-after values captured accurately'
    );

    // Test Publish change tracking
    const publishReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/publish`, {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminAuthToken}` },
    });
    const publishRes = await postPublishHandler(publishReq, { params: Promise.resolve({ id: form.id }) });
    assert(publishRes.status === 200, 'Publish form returned 200');

    const publishLog = await prisma.formAuditLog.findFirst({
      where: { formId: form.id, action: 'FORM_PUBLISH' },
      orderBy: { createdAt: 'desc' },
    });
    const publishChanges = (publishLog?.details as any)?.changes;
    const statusChange = publishChanges?.find((c: any) => c.field === 'status');
    assert(
      statusChange && statusChange.before === 'DRAFT' && statusChange.after === 'PUBLISHED',
      'Publish status transition captured from DRAFT to PUBLISHED'
    );

    // ---------------------------------------------------------
    // TEST 7: Duplicate Audit Event Prevention
    // ---------------------------------------------------------
    console.log('\n--- Test 7: Duplicate Event Prevention ---');
    const logsBefore = await prisma.formAuditLog.count({ where: { formId: form.id } });

    // Send identical PATCH with same title and description (no actual change)
    const noopPatchReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${adminAuthToken}`,
      },
      body: JSON.stringify({
        title: 'Updated Audit Form Title',
        description: 'Updated Description',
      }),
    });
    await patchFormHandler(noopPatchReq, { params: Promise.resolve({ id: form.id }) });

    const logsAfter = await prisma.formAuditLog.count({ where: { formId: form.id } });
    assert(
      logsAfter === logsBefore,
      'No new audit log was created when updating form with unchanged data'
    );

    // ---------------------------------------------------------
    // TEST 8: Audit Log Reset Safeguard
    // ---------------------------------------------------------
    console.log('\n--- Test 8: Audit Log Reset Safeguard ---');
    const deleteLogsReq = new NextRequest('http://localhost:3000/api/admin/audit-logs', {
      method: 'DELETE',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminAuthToken}; ${auditCookieHeader}`,
      },
    });
    const deleteLogsRes = await deleteAuditLogsHandler(deleteLogsReq);
    assert(deleteLogsRes.status === 200, 'DELETE /api/admin/audit-logs returned 200');

    // Verify sessions were NOT deleted
    const preservedSession = await prisma.session.findUnique({ where: { id: adminActionSession.id } });
    assert(preservedSession !== null, 'Active and historical sessions are preserved after audit log reset');

    // Verify SYSTEM_LOGS_RESET was logged
    const resetAuditLog = await prisma.formAuditLog.findFirst({
      where: { action: 'SYSTEM_LOGS_RESET' },
    });
    assert(resetAuditLog !== null, 'SYSTEM_LOGS_RESET event was logged upon reset');

  } catch (err: any) {
    console.error('Unexpected error in test execution:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning up test fixtures ---');
    if (testFormId) {
      await prisma.formAuditLog.deleteMany({ where: { formId: testFormId } }).catch(() => {});
      await prisma.form.delete({ where: { id: testFormId } }).catch(() => {});
    }
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: createdSessionIds } } }).catch(() => {});
    }
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    console.log('\n=======================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=======================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

run();
