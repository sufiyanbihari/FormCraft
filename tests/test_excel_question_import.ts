import fs from 'fs';
import path from 'path';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import { parseExcelQuestions, generateQuizTemplateBuffer, QUIZ_TEMPLATE_HEADERS } from '../src/lib/excel/questionParser';
import { POST as parseExcelHandler } from '../src/app/api/forms/[id]/import-questions/parse-excel/route';
import { POST as importExcelHandler } from '../src/app/api/forms/[id]/import-questions/from-excel/route';
import { GET as templateDownloadHandler } from '../src/app/api/forms/[id]/import-questions/template/route';
import { POST as existingImportHandler } from '../src/app/api/forms/[id]/import-questions/route';
import { POST as submitHandler } from '../src/app/api/public/forms/[publicId]/submissions/route';
import * as XLSX from 'xlsx';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createAuthCookie(user: { id: string; email: string; role: string }): string {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `formcraft_session=${token}`;
}

async function runExcelImportAcceptanceTests() {
  console.log('====================================================');
  console.log(' FormCraft Excel Question Import End-to-End Tests   ');
  console.log('====================================================\n');

  const samplePath = path.join(__dirname, '../sample_format.xlsx');
  if (!fs.existsSync(samplePath)) {
    throw new Error(`sample_format.xlsx not found at ${samplePath}`);
  }
  const sampleBuffer = fs.readFileSync(samplePath);

  // Setup Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin_excel_test@example.com' },
    update: {},
    create: {
      email: 'admin_excel_test@example.com',
      name: 'Excel Import Admin',
      passwordHash: 'dummyhash',
      role: 'ADMIN',
    },
  });
  const adminCookie = createAuthCookie(adminUser);

  // Setup Regular (unauthorized) user
  const regularUser = await prisma.user.upsert({
    where: { email: 'user_excel_test@example.com' },
    update: {},
    create: {
      email: 'user_excel_test@example.com',
      name: 'Regular User',
      passwordHash: 'dummyhash',
      role: 'USER',
    },
  });
  const regularCookie = createAuthCookie(regularUser);

  const cleanupFormIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Pure Parser Acceptance on sample_format.xlsx
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Parsing sample_format.xlsx ---');
    const parseRes = parseExcelQuestions(sampleBuffer);

    assert.deepStrictEqual(parseRes.sheetNames, ['Quiz Template'], 'Worksheet name should be "Quiz Template"');
    assert.strictEqual(parseRes.activeSheet, 'Quiz Template');
    assert.strictEqual(parseRes.totalQuestions, 30, 'Should detect exactly 30 questions');
    assert.strictEqual(parseRes.validQuestions, 30, 'All 30 questions must be valid');
    assert.strictEqual(parseRes.invalidQuestions, 0, 'No invalid questions allowed');
    assert.strictEqual(parseRes.totalMarks, 120, 'Total marks must equal 120 (30 x 4 pts)');

    console.log(`✓ Detected ${parseRes.totalQuestions} questions across sheet "${parseRes.activeSheet}"`);
    console.log(`✓ All ${parseRes.validQuestions} questions valid, Total Marks: ${parseRes.totalMarks}`);

    // Verify first question structure
    const q1 = parseRes.questions[0];
    assert.strictEqual(q1.title, 'What is the main purpose of Red Tag activity?');
    assert.strictEqual(q1.options.length, 4);
    assert.strictEqual(q1.correctAnswerKey, 'B');
    assert.strictEqual(q1.correctAnswerText, 'Identify and control unnecessary items');
    assert.strictEqual(q1.marks, 4);
    assert.strictEqual(q1.options[1].isCorrect, true);
    console.log('✓ Question 1 parsed correctly with Option B as correct answer and 4 marks');

    // -------------------------------------------------------------------------
    // TEST 2: API Route Auth and Security Checks
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: API Route Security & Permissions ---');

    // Create target form
    const targetForm = await prisma.form.create({
      data: {
        title: '7S Workplace Safety Quiz',
        description: 'Excel import target form',
        publicId: `quiz-7s-${Date.now()}`,
        status: 'DRAFT',
        isQuiz: true,
        ownerId: adminUser.id,
        sections: {
          create: {
            title: 'Section 1',
            orderIndex: 0,
          },
        },
      },
      include: { sections: true },
    });
    cleanupFormIds.push(targetForm.id);
    const targetSectionId = targetForm.sections[0].id;

    // 2a. Unauthenticated parse request
    const unauthParseReq = new NextRequest(`http://localhost/api/forms/${targetForm.id}/import-questions/parse-excel`, {
      method: 'POST',
      body: new FormData(),
    });
    const unauthParseRes = await parseExcelHandler(unauthParseReq, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(unauthParseRes.status, 401, 'Unauthenticated request must return 401');
    console.log('✓ Unauthenticated parse rejected with 401');

    // 2b. Unauthorized user parse request
    const unauthzFormData = new FormData();
    unauthzFormData.append('file', new Blob([sampleBuffer]), 'sample.xlsx');
    const unauthzParseReq = new NextRequest(`http://localhost/api/forms/${targetForm.id}/import-questions/parse-excel`, {
      method: 'POST',
      headers: { cookie: regularCookie },
      body: unauthzFormData,
    });
    const unauthzParseRes = await parseExcelHandler(unauthzParseReq, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(unauthzParseRes.status, 403, 'Unauthorized user must return 403');
    console.log('✓ Unauthorized parse rejected with 403');

    // -------------------------------------------------------------------------
    // TEST 3: Full 30-Question Import Transaction into Database
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Database Import of All 30 Questions ---');
    const importPayload = {
      targetSectionId,
      createNewSection: false,
      questions: parseRes.questions.map((q) => ({
        title: q.title,
        type: 'MULTIPLE_CHOICE' as const,
        options: q.options.map((o) => ({
          label: o.label,
          value: o.label,
          isCorrect: o.isCorrect,
        })),
        marks: q.marks,
        correctAnswerText: q.correctAnswerText,
      })),
    };

    const importReq = new NextRequest(`http://localhost/api/forms/${targetForm.id}/import-questions/from-excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify(importPayload),
    });

    const importRes = await importExcelHandler(importReq, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(importRes.status, 200, 'Import must succeed with 200');
    const importData = await importRes.json();
    assert.strictEqual(importData.count, 30, 'Must report 30 imported questions');
    assert.strictEqual(importData.totalMarks, 120, 'Must report 120 total marks');
    console.log(`✓ API imported ${importData.count} questions with ${importData.totalMarks} total marks`);

    // Verify database state directly
    const dbQuestions = await prisma.formQuestion.findMany({
      where: { formId: targetForm.id },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { orderIndex: 'asc' },
    });
    assert.strictEqual(dbQuestions.length, 30, 'Database must contain 30 questions');

    let dbTotalMarks = 0;
    for (let i = 0; i < 30; i++) {
      const dbQ = dbQuestions[i];
      const parsedQ = parseRes.questions[i];

      assert.strictEqual(dbQ.title, parsedQ.title, `Title mismatch at question ${i + 1}`);
      assert.strictEqual(dbQ.quizPoints, 4, `Points must be 4 at question ${i + 1}`);
      assert.strictEqual(dbQ.options.length, 4, `Must have 4 options at question ${i + 1}`);

      const correctOpt = parsedQ.options.find((o) => o.isCorrect);
      assert.ok(correctOpt, `Parsed question ${i + 1} must have a correct option`);
      const qAns: any = dbQ.quizAnswer;
      assert.strictEqual(
        qAns?.correctValue,
        correctOpt.label,
        `Answer key correctValue must match option text at question ${i + 1}`
      );

      dbTotalMarks += dbQ.quizPoints;
    }
    assert.strictEqual(dbTotalMarks, 120, 'Sum of question quizPoints must be 120');
    console.log('✓ All 30 questions verified in database: 4 options each, correct answer key, and 4 marks');

    // -------------------------------------------------------------------------
    // TEST 4: Quiz Grading Engine Verification (100% and 50% Submissions)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Quiz Grading Engine End-to-End ---');

    // Publish target form so it accepts public submissions
    await prisma.form.update({
      where: { id: targetForm.id },
      data: {
        status: 'PUBLISHED',
        settings: {
          create: {
            isAcceptingResponses: true,
            quizReleaseGrade: 'IMMEDIATE',
            quizPassPercentage: 70,
            quizShowCorrectAnswers: true,
            quizShowPointsEarned: true,
            quizShowFeedback: true,
          },
        },
      },
    });

    // 4a. Perfect Submission (all 30 questions answered with correct answers)
    const perfectAnswers = dbQuestions.map((q) => {
      const qAns: any = q.quizAnswer;
      return {
        questionId: q.id,
        value: qAns.correctValue,
      };
    });

    const perfectSubmitReq = new NextRequest(`http://localhost/api/public/forms/${targetForm.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: perfectAnswers,
        respondentEmail: 'perfect_student@example.com',
      }),
    });

    const perfectRes = await submitHandler(perfectSubmitReq, { params: Promise.resolve({ publicId: targetForm.publicId }) });
    assert.strictEqual(perfectRes.status, 200, 'Perfect submission must return 200');
    const perfectData = await perfectRes.json();
    assert.ok(perfectData.submissionId, 'Must return submissionId');
    assert.strictEqual(perfectData.score?.total, 120, 'Perfect score must be 120');
    assert.strictEqual(perfectData.score?.max, 120, 'Max score must be 120');
    assert.strictEqual(perfectData.score?.percentage, 100, 'Percentage must be 100%');
    assert.strictEqual(perfectData.score?.isPassed, true, 'Student must pass with 100%');

    // Verify database record
    const perfectSubDb = await prisma.formSubmission.findUnique({ where: { id: perfectData.submissionId } });
    assert.strictEqual(perfectSubDb?.totalScore, 120);
    assert.strictEqual(perfectSubDb?.maxScore, 120);
    console.log('✓ Perfect Submission: 120/120 points (100%) — PASSED');

    // 4b. Half Submission (15 correct, 15 incorrect)
    const halfAnswers = dbQuestions.map((q, idx) => {
      const qAns: any = q.quizAnswer;
      if (idx < 15) {
        return { questionId: q.id, value: qAns.correctValue };
      } else {
        // Pick wrong option
        const wrongOpt = q.options.find((o) => o.label !== qAns.correctValue);
        return { questionId: q.id, value: wrongOpt ? wrongOpt.label : 'wrong_answer' };
      }
    });

    const halfSubmitReq = new NextRequest(`http://localhost/api/public/forms/${targetForm.publicId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: halfAnswers,
        respondentEmail: 'half_student@example.com',
      }),
    });

    const halfRes = await submitHandler(halfSubmitReq, { params: Promise.resolve({ publicId: targetForm.publicId }) });
    assert.strictEqual(halfRes.status, 200, 'Half submission must return 200');
    const halfData = await halfRes.json();
    assert.strictEqual(halfData.score?.total, 60, 'Half score must be 60');
    assert.strictEqual(halfData.score?.max, 120, 'Max score must be 120');
    assert.strictEqual(halfData.score?.percentage, 50, 'Percentage must be 50%');
    assert.strictEqual(halfData.score?.isPassed, false, 'Student must fail with 50% (< 70%)');

    const halfSubDb = await prisma.formSubmission.findUnique({ where: { id: halfData.submissionId } });
    assert.strictEqual(halfSubDb?.totalScore, 60);
    console.log('✓ Half Submission: 60/120 points (50%) — PASSED');

    // -------------------------------------------------------------------------
    // TEST 5: Partial Selection and New Section Import
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Partial Selection and Dynamic New Section ---');
    const partialPayload = {
      createNewSection: true,
      newSectionTitle: 'Safety Audit Checklist',
      questions: parseRes.questions.slice(0, 5).map((q) => ({
        title: q.title,
        type: 'MULTIPLE_CHOICE' as const,
        options: q.options.map((o) => ({
          label: o.label,
          value: o.label,
          isCorrect: o.isCorrect,
        })),
        marks: q.marks,
        correctAnswerText: q.correctAnswerText,
      })),
    };

    const partialReq = new NextRequest(`http://localhost/api/forms/${targetForm.id}/import-questions/from-excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify(partialPayload),
    });

    const partialRes = await importExcelHandler(partialReq, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(partialRes.status, 200);
    const partialData = await partialRes.json();
    assert.strictEqual(partialData.count, 5, 'Must import exactly 5 selected questions');
    assert.ok(partialData.newSections && partialData.newSections.length === 5, 'Must create 5 new sections');
    assert.strictEqual(partialData.newSections[0].title, 'Safety Audit Checklist 1');
    assert.strictEqual(partialData.newSections[1].title, 'Safety Audit Checklist 2');
    assert.strictEqual(partialData.questions[0].sectionId, partialData.newSections[0].id);
    assert.strictEqual(partialData.questions[1].sectionId, partialData.newSections[1].id);
    assert.strictEqual(partialData.questions[0].orderIndex, 0);
    console.log('✓ Partial selection imported into 5 dynamically created sections (one per question)');

    // -------------------------------------------------------------------------
    // TEST 6: Regression Test — Existing FormCraft Form Import Still Works
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Regression — Import from FormCraft Form Still Works ---');
    const destinationForm = await prisma.form.create({
      data: {
        title: 'Destination Form for Regression',
        description: 'Verifying FormCraft-to-FormCraft import',
        publicId: `fc-dest-${Date.now()}`,
        status: 'DRAFT',
        ownerId: adminUser.id,
        sections: {
          create: {
            title: 'Section 1',
            orderIndex: 0,
          },
        },
      },
      include: { sections: true },
    });
    cleanupFormIds.push(destinationForm.id);

    // Pick 3 questions from targetForm to import into destinationForm
    const questionsToCopy = dbQuestions.slice(0, 3).map((q) => q.id);
    const fcImportReq = new NextRequest(`http://localhost/api/forms/${destinationForm.id}/import-questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify({
        sourceFormId: targetForm.id,
        questionIds: questionsToCopy,
        targetSectionId: destinationForm.sections[0].id,
      }),
    });

    const fcImportRes = await existingImportHandler(fcImportReq, { params: Promise.resolve({ id: destinationForm.id }) });
    assert.strictEqual(fcImportRes.status, 200, 'FormCraft-to-FormCraft import must succeed with 200');
    const fcImportData = await fcImportRes.json();
    assert.strictEqual(fcImportData.count, 3, 'Must import 3 questions');
    console.log('✓ FormCraft-to-FormCraft import verified and fully functioning');

    // -------------------------------------------------------------------------
    // TEST 7: Download Blank Excel Template API & Validation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Download Blank Excel Template API & Buffer Validation ---');
    const templateReq = new NextRequest(`http://localhost/api/forms/${targetForm.id}/import-questions/template`, {
      method: 'GET',
      headers: {
        cookie: adminCookie,
      },
    });

    const templateRes = await templateDownloadHandler(templateReq, { params: Promise.resolve({ id: targetForm.id }) });
    assert.strictEqual(templateRes.status, 200, 'Template download must return 200');
    assert.strictEqual(
      templateRes.headers.get('Content-Type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Should have correct Excel MIME type'
    );
    assert.ok(
      templateRes.headers.get('Content-Disposition')?.includes('filename="Quiz_Question_Template.xlsx"'),
      'Content-Disposition must specify Quiz_Question_Template.xlsx'
    );

    // Read binary response body
    const arrayBuf = await templateRes.arrayBuffer();
    const templateBuffer = Buffer.from(arrayBuf);
    assert.ok(templateBuffer.length > 0, 'Template buffer must not be empty');

    // Parse the generated template with xlsx
    const parsedWb = XLSX.read(templateBuffer, { type: 'buffer' });
    assert.deepStrictEqual(parsedWb.SheetNames, ['Quiz Template'], 'Worksheet must be named "Quiz Template"');

    const sheet = parsedWb.Sheets['Quiz Template'];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    assert.strictEqual(rows.length, 1, 'Blank template should only have 1 row (the header row)');
    assert.deepStrictEqual(
      rows[0],
      [...QUIZ_TEMPLATE_HEADERS],
      'Header row must match the exact 7 sample headers'
    );

    // Also verify our parser handles the blank template gracefully without crashing
    const blankParseRes = parseExcelQuestions(templateBuffer);
    assert.strictEqual(blankParseRes.totalQuestions, 0, 'Blank template should have 0 questions');
    assert.deepStrictEqual(blankParseRes.sheetNames, ['Quiz Template']);
    console.log('✓ Blank Quiz Template generated, verified with 7 headers, and tested against parser');

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    for (const fId of cleanupFormIds) {
      await prisma.form.delete({ where: { id: fId } }).catch(() => {});
    }
    await prisma.user.deleteMany({
      where: { email: { in: ['admin_excel_test@example.com', 'user_excel_test@example.com'] } },
    }).catch(() => {});
    console.log(`Cleaned up ${cleanupFormIds.length} test forms and test users.`);
  }

  console.log('\n====================================================');
  console.log(' ALL EXCEL IMPORT ACCEPTANCE TESTS PASSED (30/30)!   ');
  console.log('====================================================\n');
}

runExcelImportAcceptanceTests()
  .catch((err) => {
    console.error('\n[FAIL] Test suite error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
