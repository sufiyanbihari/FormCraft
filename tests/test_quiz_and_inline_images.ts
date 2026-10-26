import { prisma } from '../src/lib/db/prisma';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import { GET as getPublicFormHandler } from '../src/app/api/public/forms/[publicId]/route';
import { PATCH as manualGradeHandler } from '../src/app/api/forms/[id]/responses/[responseId]/route';
import { POST as duplicateHandler } from '../src/app/api/forms/[id]/duplicate/route';
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

async function runQuizAndImageTests() {
  console.log('====================================================');
  console.log('   FormCraft Quiz & Inline Images Verification      ');
  console.log('====================================================\n');

  // 1. Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin_quiz_test@example.com' },
    update: {},
    create: {
      email: 'admin_quiz_test@example.com',
      name: 'Quiz Test Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });

  const adminCookie = createAuthCookie(adminUser);

  // 2. Create Quiz Form 1: Immediate Grade Release, Pass Percentage 70%
  console.log('Creating Quiz Form (Immediate Release, Pass 70%)...');
  const quizForm1 = await prisma.form.create({
    data: {
      title: 'Science & Dairy Quiz (Immediate)',
      description: 'Test quiz with diverse grading rules and option images',
      publicId: `quiz-imm-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizReleaseGrade: 'IMMEDIATE',
          quizPassPercentage: 70,
          quizPassMessage: 'Congratulations! You passed the quiz.',
          quizFailMessage: 'You did not pass. Please review the material and try again.',
          quizShowCorrectAnswers: true,
          quizShowPointsEarned: true,
          quizShowFeedback: true,
        },
      },
    },
  });

  const section1 = await prisma.formSection.create({
    data: {
      formId: quizForm1.id,
      title: 'Quiz Section 1',
      orderIndex: 0,
    },
  });

  // Question 1: Multiple choice with option images
  const qChoice = await prisma.formQuestion.create({
    data: {
      formId: quizForm1.id,
      sectionId: section1.id,
      title: 'Which animal produces milk with the highest fat content?',
      type: 'MULTIPLE_CHOICE',
      isRequired: true,
      orderIndex: 0,
      quizPoints: 10,
      quizAnswer: {
        correctValue: 'Buffalo',
        correctFeedback: 'Correct! Buffalo milk has 7-8% fat content.',
        incorrectFeedback: 'Incorrect. Buffalo milk has higher fat content than cow milk.',
      },
      quizExplanation: 'Buffalo milk typically contains between 7% and 8% fat.',
      config: {
        imageUrl: '/uploads/inline_question_animal.png',
        imageAlt: 'Dairy cattle breeds',
        imageAlignment: 'center',
      },
    },
  });

  await prisma.questionOption.createMany({
    data: [
      {
        questionId: qChoice.id,
        label: 'Cow',
        value: 'Cow',
        orderIndex: 0,
        imageUrl: '/uploads/cow_opt.png',
      },
      {
        questionId: qChoice.id,
        label: 'Buffalo',
        value: 'Buffalo',
        orderIndex: 1,
        imageUrl: '/uploads/buffalo_opt.png',
      },
      {
        questionId: qChoice.id,
        label: 'Goat',
        value: 'Goat',
        orderIndex: 2,
        imageUrl: '/uploads/goat_opt.png',
      },
    ],
  });

  // Question 2: Checkboxes (exact set matching)
  const qCheck = await prisma.formQuestion.create({
    data: {
      formId: quizForm1.id,
      sectionId: section1.id,
      title: 'Select all dairy products derived from milk fat:',
      type: 'CHECKBOXES',
      isRequired: true,
      orderIndex: 1,
      quizPoints: 10,
      quizAnswer: {
        correctValues: ['Butter', 'Ghee'],
        correctFeedback: 'Great job! Butter and Ghee are both milk fat concentrates.',
        incorrectFeedback: 'Remember: Paneer is coagulated protein, Butter and Ghee are pure fats.',
      },
    },
  });

  await prisma.questionOption.createMany({
    data: [
      { questionId: qCheck.id, label: 'Butter', value: 'Butter', orderIndex: 0, imageUrl: '/uploads/butter.png' },
      { questionId: qCheck.id, label: 'Ghee', value: 'Ghee', orderIndex: 1, imageUrl: '/uploads/ghee.png' },
      { questionId: qCheck.id, label: 'Paneer', value: 'Paneer', orderIndex: 2, imageUrl: '/uploads/paneer.png' },
    ],
  });

  // Question 3: Short answer with accepted variations
  const qShort = await prisma.formQuestion.create({
    data: {
      formId: quizForm1.id,
      sectionId: section1.id,
      title: 'Where is the headquarters of Banas Dairy located?',
      type: 'SHORT_ANSWER',
      isRequired: true,
      orderIndex: 2,
      quizPoints: 10,
      quizAnswer: {
        acceptedAnswers: ['Palanpur', 'palanpur', 'Palanpur, Gujarat'],
        caseSensitive: false,
        correctFeedback: 'Correct! Banas Dairy was founded in Palanpur.',
      },
    },
  });

  // Question 4: Number with tolerance
  const qNum = await prisma.formQuestion.create({
    data: {
      formId: quizForm1.id,
      sectionId: section1.id,
      title: 'What is the average boiling point of milk in degrees Celsius?',
      type: 'NUMBER',
      isRequired: true,
      orderIndex: 3,
      quizPoints: 10,
      quizAnswer: {
        numberMode: 'tolerance',
        exactValue: 100.5,
        tolerance: 1.0,
      },
    },
  });

  // -------------------------------------------------------------
  // TEST 1: Public Form Sanitization (Redact Answer Keys & Expose Images)
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Public Form API Data Sanitization ---');
  const getPubReq = new NextRequest(`http://localhost:3000/api/public/forms/${quizForm1.publicId}`, {
    method: 'GET',
  });
  const pubRes = await getPublicFormHandler(getPubReq, {
    params: Promise.resolve({ publicId: quizForm1.publicId }),
  });
  const pubData = await pubRes.json();
  assert.strictEqual(pubRes.status, 200, 'Public form fetch should succeed with 200');

  const pubQ1 = pubData.form.sections[0].questions.find((q: any) => q.id === qChoice.id);
  assert.ok(pubQ1, 'Question 1 must be present');
  assert.strictEqual(pubQ1.quizAnswer, undefined, 'quizAnswer MUST be redacted from public form');
  assert.strictEqual(pubQ1.quizExplanation, undefined, 'quizExplanation MUST be redacted from public form');
  assert.ok(pubQ1.options[0].imageUrl, 'Option 1 imageUrl must be exposed');
  assert.strictEqual(pubQ1.options[0].imageUrl, '/uploads/cow_opt.png', 'Option imageUrl must match');
  assert.strictEqual(pubQ1.config.imageUrl, '/uploads/inline_question_animal.png', 'Question inline image must be present');
  console.log('✓ Public form successfully strips quiz answer keys and exposes inline option/question images.');

  // -------------------------------------------------------------
  // TEST 2: Immediate Quiz Grading with Passing Score (30/40 = 75% -> PASSED)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Server-Side Grading Engine (Immediate Release, Passing) ---');
  const submitReq1 = new NextRequest(`http://localhost:3000/api/public/forms/${quizForm1.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondentEmail: 'student_a@example.com',
      answers: [
        { questionId: qChoice.id, value: 'Buffalo' }, // Correct: 10 pts
        { questionId: qCheck.id, value: ['Butter', 'Ghee'] }, // Correct: 10 pts
        { questionId: qShort.id, value: 'palanpur' }, // Correct (case-insensitive accepted): 10 pts
        { questionId: qNum.id, value: '95' }, // Incorrect (tolerance 100.5 ± 1.0): 0 pts
      ],
    }),
  });

  const subRes1 = await submitHandler(submitReq1, {
    params: Promise.resolve({ publicId: quizForm1.publicId }),
  });
  const subData1 = await subRes1.json();
  assert.strictEqual(subRes1.status, 200, 'Submission must succeed');
  assert.strictEqual(subData1.isGradeReleased, true, 'Grade must be released immediately');
  assert.ok(subData1.score, 'Score object must be present in response');
  assert.strictEqual(subData1.score.total, 30, 'Total score must be 30 pts');
  assert.strictEqual(subData1.score.max, 40, 'Max score must be 40 pts');
  assert.strictEqual(subData1.score.percentage, 75, 'Percentage must be 75%');
  assert.strictEqual(subData1.score.isPassed, true, 'Student must pass (75% >= 70%)');
  assert.strictEqual(subData1.score.customMessage, 'Congratulations! You passed the quiz.');
  assert.ok(subData1.score.breakdown, 'Question breakdown must be provided');
  assert.strictEqual(subData1.score.breakdown.length, 4, 'Breakdown must have 4 questions');
  console.log(`✓ Immediate grading scored 30/40 (75%) — PASSED with feedback and question breakdown.`);

  // -------------------------------------------------------------
  // TEST 3: Delayed Grade Release Form (AFTER_REVIEW)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Delayed Grade Release (AFTER_REVIEW) ---');
  const quizForm2 = await prisma.form.create({
    data: {
      title: 'Essay & Math Quiz (Manual Review)',
      publicId: `quiz-rev-${Date.now()}`,
      status: 'PUBLISHED',
      isQuiz: true,
      ownerId: adminUser.id,
      settings: {
        create: {
          isAcceptingResponses: true,
          quizReleaseGrade: 'AFTER_REVIEW',
        },
      },
    },
  });

  const section2 = await prisma.formSection.create({
    data: { formId: quizForm2.id, title: 'Exam Section', orderIndex: 0 },
  });

  const qEssay = await prisma.formQuestion.create({
    data: {
      formId: quizForm2.id,
      sectionId: section2.id,
      title: 'Explain the benefits of cold-chain logistics in milk collection:',
      type: 'PARAGRAPH',
      isRequired: true,
      orderIndex: 0,
      quizPoints: 20,
    },
  });

  const submitReq2 = new NextRequest(`http://localhost:3000/api/public/forms/${quizForm2.publicId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondentEmail: 'student_b@example.com',
      answers: [
        { questionId: qEssay.id, value: 'Cold chain preserves milk quality and avoids microbial growth.' },
      ],
    }),
  });

  const subRes2 = await submitHandler(submitReq2, {
    params: Promise.resolve({ publicId: quizForm2.publicId }),
  });
  const subData2 = await subRes2.json();
  assert.strictEqual(subRes2.status, 200, 'Delayed release submission must succeed');
  assert.strictEqual(subData2.isGradeReleased, false, 'isGradeReleased must be false');
  assert.strictEqual(subData2.score, null, 'Score must be withheld from client response');
  assert.ok(subData2.message.includes('released after manual review'), 'Confirmation message must indicate review');
  console.log('✓ Grade correctly withheld for AFTER_REVIEW setting with clean review notice.');

  // Verify in database that submission has isGradeReleased: false
  const dbSub2 = await prisma.formSubmission.findUnique({
    where: { id: subData2.submissionId },
    include: { answers: true },
  });
  assert.strictEqual(dbSub2?.isGradeReleased, false, 'DB submission must have isGradeReleased = false');

  // -------------------------------------------------------------
  // TEST 4: Manual Grading & Grade Release via PATCH API
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Manual Grading & Grade Release via Admin PATCH ---');
  const essayAnswer = dbSub2!.answers[0];
  const gradeReq = new NextRequest(`http://localhost:3000/api/forms/${quizForm2.id}/responses/${dbSub2!.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      cookie: adminCookie,
    },
    body: JSON.stringify({
      answerUpdates: [
        {
          answerId: essayAnswer.id,
          score: 18,
          reviewerFeedback: 'Excellent points covering temperature thresholds and quality retention.',
        },
      ],
      isGradeReleased: true,
    }),
  });

  const gradeRes = await manualGradeHandler(gradeReq, {
    params: Promise.resolve({ id: quizForm2.id, responseId: dbSub2!.id }),
  });
  const gradeData = await gradeRes.json();
  assert.strictEqual(gradeRes.status, 200, 'Manual grading must succeed');
  assert.strictEqual(gradeData.submission.totalScore, 18, 'Submission totalScore must be updated to 18');
  assert.strictEqual(gradeData.submission.isGradeReleased, true, 'isGradeReleased must be true after release');
  assert.strictEqual(gradeData.submission.answers[0].score, 18, 'Answer score must be 18');
  assert.strictEqual(
    gradeData.submission.answers[0].reviewerFeedback,
    'Excellent points covering temperature thresholds and quality retention.'
  );
  console.log('✓ Admin successfully graded submission (18 pts), assigned feedback, and released grade.');

  // -------------------------------------------------------------
  // TEST 5: Form Duplication Preserving Option Images & Quiz Settings
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Form Duplication (Quiz Settings & Option Images) ---');
  const dupReq = new NextRequest(`http://localhost:3000/api/forms/${quizForm1.id}/duplicate`, {
    method: 'POST',
    headers: { cookie: adminCookie },
  });

  const dupRes = await duplicateHandler(dupReq, {
    params: Promise.resolve({ id: quizForm1.id }),
  });
  const dupData = await dupRes.json();
  assert.strictEqual(dupRes.status, 200, 'Form duplication must succeed');

  const freshDuplicated = await prisma.form.findUnique({
    where: { id: dupData.form.id },
    include: {
      settings: true,
      sections: {
        include: {
          questions: {
            include: { options: true },
          },
        },
      },
    },
  });

  assert.strictEqual(freshDuplicated?.isQuiz, true, 'Duplicated form must be a quiz');
  assert.strictEqual(freshDuplicated?.settings?.quizReleaseGrade, 'IMMEDIATE', 'quizReleaseGrade must be copied');
  assert.strictEqual(freshDuplicated?.settings?.quizPassPercentage, 70, 'quizPassPercentage must be copied');

  const dupQChoice = freshDuplicated?.sections[0].questions.find((q) => q.title.includes('highest fat'));
  assert.ok(dupQChoice, 'Duplicated question must exist');
  assert.strictEqual(dupQChoice.options.length, 3, 'Duplicated question must have 3 options');
  assert.strictEqual(dupQChoice.options[0].imageUrl, '/uploads/cow_opt.png', 'Option image must be preserved in duplication');
  console.log('✓ Form duplication preserved all quiz settings and option image URLs.');

  // Clean up test data
  console.log('\nCleaning up test forms...');
  await prisma.submissionAnswer.deleteMany({
    where: { submission: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } } },
  });
  await prisma.formSubmission.deleteMany({
    where: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } },
  });
  await prisma.questionOption.deleteMany({
    where: { question: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } } },
  });
  await prisma.formQuestion.deleteMany({
    where: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } },
  });
  await prisma.formSection.deleteMany({
    where: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } },
  });
  await prisma.formSettings.deleteMany({
    where: { formId: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } },
  });
  await prisma.form.deleteMany({
    where: { id: { in: [quizForm1.id, quizForm2.id, freshDuplicated!.id] } },
  });

  console.log('\n🎉 ALL QUIZ & INLINE IMAGE TESTS PASSED SUCCESSFULLY!');
}

runQuizAndImageTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
