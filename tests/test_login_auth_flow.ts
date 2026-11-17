import crypto from 'crypto';
import { prisma } from '../src/lib/db/prisma';
import { hashPassword } from '../src/lib/auth/password';
import { verifyToken } from '../src/lib/auth/jwt';
import { SESSION_COOKIE_NAME, getAuthUserFromRequest } from '../src/lib/auth/session';
import { POST as postLoginHandler } from '../src/app/api/auth/login/route';
import { POST as postLogoutHandler } from '../src/app/api/auth/logout/route';
import { POST as postHeartbeatHandler } from '../src/app/api/auth/heartbeat/route';
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
  console.log('🧪 Starting Login Auth Flow & Error Handling Verification Suite\n');

  const testEmail = 'production_login_qa@example.com';
  const testPassword = 'SecurePassword123!';
  let testUserId: string | null = null;
  let createdSessionIds: string[] = [];

  try {
    // Setup test user
    const passwordHash = await hashPassword(testPassword);
    let user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: testEmail,
          name: 'Production Login QA',
          passwordHash,
          role: 'ADMIN',
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, role: 'ADMIN' },
      });
    }
    testUserId = user.id;

    // 1. Invalid email or password format
    console.log('--- Test 1: Invalid Input Validation ---');
    const invalidFormatReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '' }),
    });
    const invalidFormatRes = await postLoginHandler(invalidFormatReq);
    assert(invalidFormatRes.status === 400, 'Invalid email/password format returns HTTP 400');

    // 2. Non-existent account
    console.log('\n--- Test 2: Non-existent Account ---');
    const notFoundReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'non_existent_account_12345@example.com', password: testPassword }),
    });
    const notFoundRes = await postLoginHandler(notFoundReq);
    assert(notFoundRes.status === 401, 'Non-existent account returns HTTP 401');
    const notFoundData = await notFoundRes.json();
    assert(notFoundData.error === 'Invalid email or password', 'Generic error message on missing account');

    // 3. Incorrect password
    console.log('\n--- Test 3: Incorrect Password ---');
    const wrongPassReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999!' }),
    });
    const wrongPassRes = await postLoginHandler(wrongPassReq);
    assert(wrongPassRes.status === 401, 'Incorrect password returns HTTP 401');
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassData.error === 'Invalid email or password', 'Generic error message on wrong password');

    // 4. Valid Login Execution
    console.log('\n--- Test 4: Valid Login Execution ---');
    const validLoginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'x-forwarded-for': '203.0.113.195',
      },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const validLoginRes = await postLoginHandler(validLoginReq);
    assert(validLoginRes.status === 200, 'Valid login returns HTTP 200');
    const validLoginData = await validLoginRes.json();
    assert(validLoginData.message === 'Login successful', 'Response message is Login successful');
    assert(Boolean(validLoginData.sessionId), 'Response includes sessionId');
    if (validLoginData.sessionId) createdSessionIds.push(validLoginData.sessionId);

    // 5. Cookie Attributes & JWT Validation
    console.log('\n--- Test 5: Cookie Attributes & JWT Verification ---');
    const cookie = validLoginRes.cookies.get(SESSION_COOKIE_NAME);
    assert(Boolean(cookie?.value), 'Session cookie is set in response');
    const token = cookie?.value || '';
    const payload = verifyToken(token);
    assert(payload?.userId === user.id, 'JWT payload contains correct userId');
    assert(payload?.email === testEmail, 'JWT payload contains correct email');
    assert(payload?.role === 'ADMIN', 'JWT payload contains correct role');
    assert(payload?.sessionId === validLoginData.sessionId, 'JWT payload contains matching sessionId');

    // 6. Database Session Record Verification
    console.log('\n--- Test 6: Database Session Record ---');
    const dbSession = await prisma.session.findUnique({ where: { id: validLoginData.sessionId } });
    assert(Boolean(dbSession), 'Session record persists in database');
    assert(dbSession?.status === 'ACTIVE', 'Session record status is ACTIVE');
    assert(dbSession?.deviceType === 'Desktop', 'Device parsed as Desktop');
    assert(dbSession?.browser?.includes('Chrome') === true, 'Browser detected as Chrome');
    assert(dbSession?.ipAddress === '203.0.113.195', 'IP address captured correctly');

    // 7. Session Heartbeat Validation
    console.log('\n--- Test 7: Session Heartbeat ---');
    const heartbeatReq = new NextRequest('http://localhost:3000/api/auth/heartbeat', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const heartbeatRes = await postHeartbeatHandler(heartbeatReq);
    assert(heartbeatRes.status === 200, 'Heartbeat returns HTTP 200');
    const heartbeatData = await heartbeatRes.json();
    assert(heartbeatData.valid === true, 'Heartbeat confirms session is valid');

    // 8. Session Logout
    console.log('\n--- Test 8: Session Logout ---');
    const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const logoutRes = await postLogoutHandler(logoutReq);
    assert(logoutRes.status === 200, 'Logout returns HTTP 200');
    const updatedDbSession = await prisma.session.findUnique({ where: { id: validLoginData.sessionId } });
    assert(updatedDbSession?.status === 'LOGGED_OUT', 'Database session status updated to LOGGED_OUT');

    // 9. Logged Out Session Rejected by Auth
    console.log('\n--- Test 9: Logged Out Session Rejection in getAuthUserFromRequest ---');
    const loggedOutAuthReq = new NextRequest('http://localhost:3000/api/protected', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const userAfterLogout = await getAuthUserFromRequest(loggedOutAuthReq);
    assert(userAfterLogout === null, 'getAuthUserFromRequest rejects LOGGED_OUT session');

    // 10. Admin Termination Lifecycle Enforcement
    console.log('\n--- Test 10: Terminated Session Lifecycle Enforcement ---');
    const termSession = await prisma.session.create({
      data: {
        sessionToken: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        status: 'ACTIVE',
        loginAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    createdSessionIds.push(termSession.id);
    const { signToken } = await import('../src/lib/auth/jwt');
    const termToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: termSession.id,
    });
    const termReqBefore = new NextRequest('http://localhost:3000/api/protected', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${termToken}` },
    });
    const userBeforeTerm = await getAuthUserFromRequest(termReqBefore);
    assert(userBeforeTerm?.id === user.id, 'Active session is recognized by getAuthUserFromRequest');

    // Terminate the session
    await prisma.session.update({
      where: { id: termSession.id },
      data: { status: 'TERMINATED', logoutAt: new Date() },
    });
    const termReqAfter = new NextRequest('http://localhost:3000/api/protected', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${termToken}` },
    });
    const userAfterTerm = await getAuthUserFromRequest(termReqAfter);
    assert(userAfterTerm === null, 'getAuthUserFromRequest rejects TERMINATED session');

    const termHeartbeatReq = new NextRequest('http://localhost:3000/api/auth/heartbeat', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${termToken}` },
    });
    const termHeartbeatRes = await postHeartbeatHandler(termHeartbeatReq);
    assert(termHeartbeatRes.status === 401, 'Heartbeat rejects TERMINATED session with HTTP 401');

    // 11. Expired Session Lifecycle Enforcement
    console.log('\n--- Test 11: Expired Session Lifecycle Enforcement ---');
    const expSession = await prisma.session.create({
      data: {
        sessionToken: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        status: 'ACTIVE',
        loginAt: new Date(Date.now() - 100000),
        lastActiveAt: new Date(Date.now() - 100000),
        expiresAt: new Date(Date.now() - 1000), // in the past
      },
    });
    createdSessionIds.push(expSession.id);
    const expToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: expSession.id,
    });
    const expReq = new NextRequest('http://localhost:3000/api/protected', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${expToken}` },
    });
    const userAfterExp = await getAuthUserFromRequest(expReq);
    assert(userAfterExp === null, 'getAuthUserFromRequest rejects expired database session');

    // 12. Non-existent Session ID in Token
    console.log('\n--- Test 12: Non-existent Session ID in Token ---');
    const fakeToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: 'non-existent-session-id-1234567890',
    });
    const fakeReq = new NextRequest('http://localhost:3000/api/protected', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${fakeToken}` },
    });
    const userAfterFake = await getAuthUserFromRequest(fakeReq);
    assert(userAfterFake === null, 'getAuthUserFromRequest rejects non-existent database session');

  } catch (err: any) {
    console.error('Unexpected error in test:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning up test records ---');
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: createdSessionIds } } }).catch(() => {});
    }
    if (testUserId) {
      await prisma.formAuditLog.deleteMany({ where: { userId: testUserId } }).catch(() => {});
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
