import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Starting FormCraft Full-Stack Integration Test Suite...\n');

  let sessionCookie = '';
  let formId = '';
  let publicId = '';
  let questionId = '';
  let submissionId = '';

  // 1. Test Login
  const testAdminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
  const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;

  if (!testAdminPassword || !testAdminPassword.trim()) {
    console.error('❌ TEST_ADMIN_PASSWORD environment variable is missing or empty.');
    console.error('   Please define TEST_ADMIN_PASSWORD in your environment before running integration tests.');
    throw new Error('TEST_ADMIN_PASSWORD is required for integration tests');
  }

  console.log(`1️⃣ Testing Authentication (Login with ${testAdminEmail})...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testAdminEmail, password: testAdminPassword.trim() }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login should succeed with status 200');
  const setCookieHeader = loginRes.headers.get('set-cookie');
  assert.ok(setCookieHeader, 'Set-Cookie header must be present');
  sessionCookie = setCookieHeader.split(';')[0];
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.user.email, testAdminEmail);
  console.log('   ✅ Authentication passed. User:', loginData.user.name);

  // 2. Test Get Session
  console.log('2️⃣ Testing Get Current User (/api/auth/me)...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.user.email, testAdminEmail);
  console.log('   ✅ Session verification passed.');

  // 3. Test Form Creation
  console.log('3️⃣ Testing Form Creation (/api/forms)...');
  const createFormRes = await fetch(`${BASE_URL}/api/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      title: 'Automated Test Feedback Survey',
      description: 'Created by automated integration test runner',
      isQuiz: true,
    }),
  });
  assert.strictEqual(createFormRes.status, 200);
  const createFormData = await createFormRes.json();
  formId = createFormData.form.id;
  publicId = createFormData.form.publicId;
  assert.ok(formId, 'Form ID must be returned');
  console.log(`   ✅ Form created. ID: ${formId}, Public ID: ${publicId}`);

  // 4. Test Fetch Form Details
  console.log('4️⃣ Testing Fetch Form Details (/api/forms/:id)...');
  const getFormRes = await fetch(`${BASE_URL}/api/forms/${formId}`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(getFormRes.status, 200);
  const getFormData = await getFormRes.json();
  assert.strictEqual(getFormData.form.title, 'Automated Test Feedback Survey');
  const sectionId = getFormData.form.sections[0].id;
  console.log('   ✅ Form details retrieved. Section ID:', sectionId);

  // 5. Test Add Question
  console.log('5️⃣ Testing Add Question (/api/forms/:id/questions)...');
  const addQRes = await fetch(`${BASE_URL}/api/forms/${formId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      sectionId,
      title: 'Which cloud provider do you prefer?',
      type: 'MULTIPLE_CHOICE',
      isRequired: true,
      quizPoints: 10,
      quizAnswer: { correctValue: 'PostgreSQL Cloud' },
      options: [
        { label: 'PostgreSQL Cloud', value: 'PostgreSQL Cloud', orderIndex: 0 },
        { label: 'Alternative A', value: 'Alternative A', orderIndex: 1 },
        { label: 'Alternative B', value: 'Alternative B', orderIndex: 2 },
      ],
    }),
  });
  assert.strictEqual(addQRes.status, 200);
  const addQData = await addQRes.json();
  questionId = addQData.question.id;
  assert.strictEqual(addQData.question.options.length, 3);
  console.log('   ✅ Question added. Question ID:', questionId);

  // 6. Test Publish Form
  console.log('6️⃣ Testing Form Publishing (/api/forms/:id/publish)...');
  const publishRes = await fetch(`${BASE_URL}/api/forms/${formId}/publish`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(publishRes.status, 200);
  const publishData = await publishRes.json();
  assert.strictEqual(publishData.form.status, 'PUBLISHED');
  console.log('   ✅ Form published. Version:', publishData.version.versionNumber);

  // 7. Test Public Form Fetch
  console.log('7️⃣ Testing Public Form Endpoint (/api/public/forms/:publicId)...');
  const publicFormRes = await fetch(`${BASE_URL}/api/public/forms/${publicId}`);
  assert.strictEqual(publicFormRes.status, 200);
  const publicFormData = await publicFormRes.json();
  assert.strictEqual(publicFormData.form.title, 'Automated Test Feedback Survey');
  // Verify quizAnswer is NOT exposed publicly!
  const publicQuestion = publicFormData.form.sections[0].questions.find(
    (q: any) => q.id === questionId
  );
  assert.strictEqual(publicQuestion.quizAnswer, undefined, 'Quiz answer must NOT leak to public');
  console.log('   ✅ Public form verified. Security: Answer key is securely stripped.');

  // 8. Test Public Form Submission with Auto-grading
  console.log('8️⃣ Testing Public Form Submission with Auto-grading (/api/public/forms/:publicId/submissions)...');
  const submitRes = await fetch(`${BASE_URL}/api/public/forms/${publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondentEmail: 'test.respondent@example.com',
      answers: [
        {
          questionId,
          value: 'PostgreSQL Cloud', // Correct answer!
        },
      ],
    }),
  });
  assert.strictEqual(submitRes.status, 200);
  const submitData = await submitRes.json();
  submissionId = submitData.submissionId;
  assert.ok(submissionId, 'Submission ID must be generated');
  assert.strictEqual(submitData.score.total, 10, 'Quiz score must equal 10 for correct answer');
  console.log('   ✅ Submission accepted and auto-graded. Score: 10/10 pts.');

  // 9. Test Responses Analytics
  console.log('9️⃣ Testing Responses Analytics (/api/forms/:id/responses/analytics)...');
  const analyticsRes = await fetch(`${BASE_URL}/api/forms/${formId}/responses/analytics`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(analyticsRes.status, 200);
  const analyticsData = await analyticsRes.json();
  assert.strictEqual(analyticsData.summary.totalSubmissions, 1);
  assert.strictEqual(analyticsData.summary.avgScore, 10);
  console.log('   ✅ Analytics verified. Total submissions: 1, Average score: 10 pts.');

  // 10. Test CSV Export
  console.log('🔟 Testing CSV Export (/api/forms/:id/responses/export?format=csv)...');
  const exportRes = await fetch(`${BASE_URL}/api/forms/${formId}/responses/export?format=csv`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(exportRes.status, 200);
  const csvText = await exportRes.text();
  assert.ok(csvText.includes('Which cloud provider do you prefer?'), 'CSV must include question header');
  assert.ok(csvText.includes('PostgreSQL Cloud'), 'CSV must include answer text');
  console.log('   ✅ CSV Export verified. Contains question header and response data.');

  // 11. Test Form Duplication
  console.log('1️⃣1️⃣ Testing Form Duplication (/api/forms/:id/duplicate)...');
  const duplicateRes = await fetch(`${BASE_URL}/api/forms/${formId}/duplicate`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(duplicateRes.status, 200);
  const duplicateData = await duplicateRes.json();
  assert.strictEqual(duplicateData.form.title, 'Copy of Automated Test Feedback Survey');
  console.log('   ✅ Duplicate verified. Cloned Form ID:', duplicateData.form.id);

  console.log('\n🎉 ALL 11 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
