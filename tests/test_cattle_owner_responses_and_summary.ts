/**
 * Automated Verification Suite for FormCraft:
 * Registered Cattle Owners Individual Response View & Summary Aggregation
 */

import { prisma } from '../src/lib/db/prisma';
import { signToken } from '../src/lib/auth/jwt';
import {
  getCattleOwnerFieldForQuestion,
  getOwnerFieldValue,
  isOwnerNameQ,
  isOwnerMobileQ,
  isLargeCattleQ,
  isSmallCattleQ,
  isFlooringQ,
  isSupplyDungQ,
} from '../src/lib/submission/cattleOwnerHelpers';
import { GET as getAnalyticsHandler } from '../src/app/api/forms/[id]/responses/analytics/route';
import { GET as getResponsesHandler } from '../src/app/api/forms/[id]/responses/route';
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
  console.log('🧪 Starting Registered Cattle Owners Individual View & Summary Aggregation Tests\n');

  let testFormId: string | null = null;

  try {
    const adminUser = await prisma.user.findFirst();
    if (!adminUser) throw new Error('No user found in database');

    // 1. Create a Cattle Survey Form
    const form = await prisma.form.create({
      data: {
        title: 'Cattle Owner & Dung Availability Survey Questionnaire',
        description: 'Testing Individual View & Summary Aggregation with Multi-Owner Logic',
        status: 'PUBLISHED',
        ownerId: adminUser.id,
      },
    });
    testFormId = form.id;

    // Create Sections
    const sec1 = await prisma.formSection.create({
      data: { formId: form.id, title: 'Society & Surveyor Info', orderIndex: 0 },
    });
    const sec2 = await prisma.formSection.create({
      data: { formId: form.id, title: 'Cattle Owners Info', orderIndex: 1 },
    });

    // Create Questions
    const qSocietyCode = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec1.id, title: 'Society Code (મંડળી નો કોડ)', type: 'SHORT_ANSWER', orderIndex: 0 },
    });
    const qSurveyorName = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec1.id, title: 'Surveyor Name (સર્વે કરનાર નું નામ)', type: 'SHORT_ANSWER', orderIndex: 1 },
    });

    const qOwnerName = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Cattle Owner Full Name (પશુ માલિકનું પૂરું નામ)', type: 'SHORT_ANSWER', orderIndex: 0 },
    });
    const qOwnerMobile = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Owner Mobile No. (10 Digits) (માલિકનો મોબાઇલ નં.)', type: 'PHONE', orderIndex: 1 },
    });
    const qLargeCattle = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Total Large Cattle Count (Over 1 Year Age) (હાજર મોટા પશુઓની કુલ સંખ્યા (૧ વર્ષથી વધુ))', type: 'NUMBER', orderIndex: 2 },
    });
    const qSmallCattle = await prisma.formQuestion.create({
      data: { formId: form.id, sectionId: sec2.id, title: 'Total Small Cattle Count (હાજર નાના પશુઓની કુલ સંખ્યા)', type: 'NUMBER', orderIndex: 3 },
    });
    const qFlooring = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: sec2.id,
        title: 'Flooring Type (ભોંયતળિયું (પાકું/કાચું))',
        type: 'MULTIPLE_CHOICE',
        orderIndex: 4,
        options: {
          create: [
            { label: 'Concrete (પાકું)', value: 'Concrete (પાકું)', orderIndex: 0 },
            { label: 'Mud (કાચું)', value: 'Mud (કાચું)', orderIndex: 1 },
          ],
        },
      },
    });
    const qSupplyDung = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: sec2.id,
        title: 'Supply Dung? (છાણ આપવા સંમત?)',
        type: 'MULTIPLE_CHOICE',
        orderIndex: 5,
        options: {
          create: [
            { label: 'Yes (હા)', value: 'Yes (હા)', orderIndex: 0 },
            { label: 'No (ના)', value: 'No (ના)', orderIndex: 1 },
          ],
        },
      },
    });

    // ----------------------------------------------------------------------
    // TEST SECTION A: Question Title Helpers
    // ----------------------------------------------------------------------
    console.log('--- Sub-Suite A: Cattle Owner Question Helpers ---');
    assert(isOwnerNameQ(qOwnerName), 'isOwnerNameQ correctly matches Cattle Owner Full Name');
    assert(isOwnerMobileQ(qOwnerMobile), 'isOwnerMobileQ correctly matches Owner Mobile');
    assert(!isOwnerMobileQ(qSurveyorName), 'isOwnerMobileQ does not match Surveyor question');
    assert(isLargeCattleQ(qLargeCattle), 'isLargeCattleQ correctly matches Large Cattle Count');
    assert(isSmallCattleQ(qSmallCattle), 'isSmallCattleQ correctly matches Small Cattle Count');
    assert(isFlooringQ(qFlooring), 'isFlooringQ correctly matches Flooring Type');
    assert(isSupplyDungQ(qSupplyDung), 'isSupplyDungQ correctly matches Supply Dung?');
    assert(getCattleOwnerFieldForQuestion(qSocietyCode) === null, 'getCattleOwnerFieldForQuestion returns null for Society Code');
    assert(getCattleOwnerFieldForQuestion(qFlooring) === 'flooringType', 'getCattleOwnerFieldForQuestion returns flooringType for Flooring question');
    assert(getCattleOwnerFieldForQuestion(qLargeCattle) === 'largeCattleCount', 'getCattleOwnerFieldForQuestion returns largeCattleCount for Large Cattle');

    // ----------------------------------------------------------------------
    // TEST SECTION B: Seed Test Submissions
    // ----------------------------------------------------------------------
    console.log('\n--- Sub-Suite B: Seeding Multi-Owner Submissions ---');

    // Submission 1: Single owner
    const sub1 = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        respondentEmail: 'surveyor1@example.com',
        answers: {
          create: [
            { questionId: qSocietyCode.id, value: '101' },
            { questionId: qSurveyorName.id, value: 'Ramesh Surveyor' },
            { questionId: qOwnerName.id, value: 'Kiran Patel' },
            { questionId: qOwnerMobile.id, value: '9876543210' },
            { questionId: qLargeCattle.id, value: 5 },
            { questionId: qSmallCattle.id, value: 2 },
            { questionId: qFlooring.id, value: 'Concrete (પાકું)' },
            { questionId: qSupplyDung.id, value: 'Yes (હા)' },
          ],
        },
        cattleOwners: {
          create: [
            {
              orderIndex: 0,
              ownerName: 'Kiran Patel',
              ownerMobile: '9876543210',
              largeCattleCount: 5,
              smallCattleCount: 2,
              flooringType: 'Concrete (પાકું)',
              supplyDung: 'Yes (હા)',
            },
          ],
        },
      },
    });

    // Submission 2: Exactly Two owners
    const sub2 = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        respondentEmail: 'surveyor2@example.com',
        answers: {
          create: [
            { questionId: qSocietyCode.id, value: '102' },
            { questionId: qSurveyorName.id, value: 'Prakash Surveyor' },
            // Backward-compatibility answer row for owner 1
            { questionId: qOwnerName.id, value: 'Suresh Kumar' },
            { questionId: qOwnerMobile.id, value: '9876543211' },
            { questionId: qLargeCattle.id, value: 10 },
            { questionId: qSmallCattle.id, value: 4 },
            { questionId: qFlooring.id, value: 'Concrete (પાકું)' },
            { questionId: qSupplyDung.id, value: 'Yes (હા)' },
          ],
        },
        cattleOwners: {
          create: [
            {
              orderIndex: 0,
              ownerName: 'Suresh Kumar',
              ownerMobile: '9876543211',
              largeCattleCount: 10,
              smallCattleCount: 4,
              flooringType: 'Concrete (પાકું)',
              supplyDung: 'Yes (હા)',
            },
            {
              orderIndex: 1,
              ownerName: 'Mahesh Shah',
              ownerMobile: '9876543212',
              largeCattleCount: 8,
              smallCattleCount: 3,
              flooringType: 'Mud (કાચું)',
              supplyDung: 'No (ના)',
            },
          ],
        },
      },
    });

    // Submission 3: Three owners, including a partially populated record
    const sub3 = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        respondentEmail: 'surveyor3@example.com',
        answers: {
          create: [
            { questionId: qSocietyCode.id, value: '103' },
            { questionId: qSurveyorName.id, value: 'Anil Surveyor' },
            { questionId: qOwnerName.id, value: 'Dinesh Bhai' },
            { questionId: qOwnerMobile.id, value: '9876543213' },
            { questionId: qLargeCattle.id, value: 15 },
            { questionId: qSmallCattle.id, value: 5 },
            { questionId: qFlooring.id, value: 'Mud (કાચું)' },
            { questionId: qSupplyDung.id, value: 'Yes (હા)' },
          ],
        },
        cattleOwners: {
          create: [
            {
              orderIndex: 0,
              ownerName: 'Dinesh Bhai',
              ownerMobile: '9876543213',
              largeCattleCount: 15,
              smallCattleCount: 5,
              flooringType: 'Mud (કાચું)',
              supplyDung: 'Yes (હા)',
            },
            {
              orderIndex: 1,
              ownerName: 'Hitesh Bhai',
              ownerMobile: '9876543214',
              largeCattleCount: 2,
              smallCattleCount: 1,
              flooringType: 'Concrete (પાકું)',
              supplyDung: 'Yes (હા)',
            },
            {
              orderIndex: 2,
              ownerName: 'Jayesh Bhai',
              ownerMobile: '',
              largeCattleCount: 0,
              smallCattleCount: 0,
              flooringType: '',
              supplyDung: '',
            },
          ],
        },
      },
    });

    // Submission 4: Legacy submission without cattleOwners table entries
    const sub4 = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        respondentEmail: 'legacy@example.com',
        answers: {
          create: [
            { questionId: qSocietyCode.id, value: '104' },
            { questionId: qSurveyorName.id, value: 'Legacy Officer' },
            { questionId: qOwnerName.id, value: 'Legacy Farmer' },
            { questionId: qOwnerMobile.id, value: '9876543219' },
            { questionId: qLargeCattle.id, value: 6 },
            { questionId: qSmallCattle.id, value: 3 },
            { questionId: qFlooring.id, value: 'Concrete (પાકું)' },
            { questionId: qSupplyDung.id, value: 'No (ના)' },
          ],
        },
      },
    });

    console.log('Successfully created 4 test submissions (single-owner, two-owners, three-owners, and legacy).');

    // ----------------------------------------------------------------------
    // TEST SECTION C: Individual Response Selection & Details Verification
    // ----------------------------------------------------------------------
    console.log('\n--- Sub-Suite C: Individual Response Selection & Rendering ---');

    // Fetch submissions with cattleOwners and answers as ResponsesTab does
    const fetchedSubmissions = await prisma.formSubmission.findMany({
      where: { formId: form.id },
      include: {
        cattleOwners: { orderBy: { orderIndex: 'asc' } },
        answers: { include: { question: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Test C.1: Single-owner submission (sub1)
    const singleSub = fetchedSubmissions.find((s) => s.id === sub1.id)!;
    assert(singleSub.cattleOwners.length === 1, 'Single-owner submission has exactly 1 cattleOwner');
    assert(singleSub.cattleOwners[0].ownerName === 'Kiran Patel', 'Single-owner details match owner name');
    assert(singleSub.cattleOwners[0].largeCattleCount === 5, 'Single-owner large cattle count is 5');

    // Test C.2: Two-owner submission (sub2)
    const twoOwnerSub = fetchedSubmissions.find((s) => s.id === sub2.id)!;
    assert(twoOwnerSub.cattleOwners.length === 2, 'Two-owner submission has exactly 2 cattleOwners');
    const owner1 = twoOwnerSub.cattleOwners[0];
    const owner2 = twoOwnerSub.cattleOwners[1];

    assert(owner1.ownerName === 'Suresh Kumar', 'Owner 1 name is Suresh Kumar');
    assert(owner2.ownerName === 'Mahesh Shah', 'Owner 2 name is Mahesh Shah');

    // Simulate selecting Owner 1 in ResponsesTab
    let selectedOwnerIdx = 0;
    let safeIdx = Math.min(Math.max(0, selectedOwnerIdx), twoOwnerSub.cattleOwners.length - 1);
    let activeOwner = twoOwnerSub.cattleOwners[safeIdx];
    assert(activeOwner.ownerName === 'Suresh Kumar', 'Selecting Owner 1 displays Owner 1 name');
    assert(activeOwner.largeCattleCount === 10, 'Selecting Owner 1 displays Owner 1 large cattle: 10');
    assert(activeOwner.flooringType === 'Concrete (પાકું)', 'Selecting Owner 1 displays Flooring: Concrete');
    assert(activeOwner.supplyDung === 'Yes (હા)', 'Selecting Owner 1 displays Dung: Yes');

    // Simulate switching to Owner 2 in ResponsesTab
    selectedOwnerIdx = 1;
    safeIdx = Math.min(Math.max(0, selectedOwnerIdx), twoOwnerSub.cattleOwners.length - 1);
    activeOwner = twoOwnerSub.cattleOwners[safeIdx];
    assert(activeOwner.ownerName === 'Mahesh Shah', 'Selecting Owner 2 displays Owner 2 name');
    assert(activeOwner.largeCattleCount === 8, 'Selecting Owner 2 displays Owner 2 large cattle: 8');
    assert(activeOwner.flooringType === 'Mud (કાચું)', 'Selecting Owner 2 displays Flooring: Mud');
    assert(activeOwner.supplyDung === 'No (ના)', 'Selecting Owner 2 displays Dung: No');

    // Switch repeatedly between Owner 1 and Owner 2 to ensure no state leakage or mixed data
    for (let cycle = 0; cycle < 3; cycle++) {
      const o1 = twoOwnerSub.cattleOwners[0];
      const o2 = twoOwnerSub.cattleOwners[1];
      assert(o1.ownerName === 'Suresh Kumar' && o1.largeCattleCount === 10, `Cycle ${cycle + 1}: Owner 1 data intact`);
      assert(o2.ownerName === 'Mahesh Shah' && o2.largeCattleCount === 8, `Cycle ${cycle + 1}: Owner 2 data intact`);
    }

    // Verify Answers List mapping with active owner
    // When Owner 2 is active, answers for owner questions reflect Owner 2
    const ansListOwner2 = twoOwnerSub.answers.map((ans) => {
      const ownerField = getCattleOwnerFieldForQuestion(ans.question);
      return {
        questionTitle: ans.question.title,
        val: ownerField ? activeOwner[ownerField] : ans.value,
      };
    });

    const ownerNameAns = ansListOwner2.find((a) => a.questionTitle.includes('Cattle Owner Full Name'));
    const largeCattleAns = ansListOwner2.find((a) => a.questionTitle.includes('Large Cattle'));
    const flooringAns = ansListOwner2.find((a) => a.questionTitle.includes('Flooring'));
    const societyAns = ansListOwner2.find((a) => a.questionTitle.includes('Society Code'));

    assert(ownerNameAns?.val === 'Mahesh Shah', 'Answers List displays Owner 2 name when Owner 2 selected');
    assert(largeCattleAns?.val === 8, 'Answers List displays Owner 2 large cattle (8) when Owner 2 selected');
    assert(flooringAns?.val === 'Mud (કાચું)', 'Answers List displays Owner 2 flooring (Mud) when Owner 2 selected');
    assert(societyAns?.val === '102', 'Answers List displays unchanged Society Code (102)');

    // Test C.3: Three-owner submission with partially populated fields (sub3)
    const threeOwnerSub = fetchedSubmissions.find((s) => s.id === sub3.id)!;
    assert(threeOwnerSub.cattleOwners.length === 3, 'Three-owner submission has 3 cattleOwners');
    const partialOwner = threeOwnerSub.cattleOwners[2];
    assert(partialOwner.ownerName === 'Jayesh Bhai', 'Partial owner 3 has name');
    assert(partialOwner.ownerMobile === '', 'Partial owner 3 has empty mobile');
    assert(getOwnerFieldValue(partialOwner, 'largeCattleCount') === 0, 'Partial owner 3 large count defaults to 0 safely');
    assert(getOwnerFieldValue(partialOwner, 'flooringType') === '', 'Partial owner 3 flooring defaults to empty string safely');

    // ----------------------------------------------------------------------
    // TEST SECTION D: Summary View Analytics & Aggregation
    // ----------------------------------------------------------------------
    console.log('\n--- Sub-Suite D: Summary Aggregation Verification ---');

    // Create valid auth token for request
    const token = signToken({ userId: adminUser.id, email: adminUser.email, role: 'ADMIN' });

    const req = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses/analytics`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: `formcraft_session=${token}`,
      },
    });

    // Directly test the route handler response
    const analyticsRes = await getAnalyticsHandler(req, {
      params: Promise.resolve({ id: form.id }),
    });

    assert(analyticsRes.status === 200, `Analytics endpoint returned 200 OK (status: ${analyticsRes.status})`);
    const analyticsData = await analyticsRes.json();

    // D.1: Total submissions count
    assert(
      analyticsData.summary?.totalSubmissions === 4,
      `Form submission count remains 4 (actual: ${analyticsData.summary?.totalSubmissions}) - NOT inflated by multi-owners`
    );

    // D.2: Flooring Type Question aggregation
    const flooringAnalytics = analyticsData.questionAnalytics.find((q: any) =>
      q.title.includes('Flooring')
    );
    assert(Boolean(flooringAnalytics), 'Flooring analytics exists in response');

    // Expected flooring values across all owners:
    // Sub 1: Concrete (1)
    // Sub 2: Concrete (1), Mud (1)
    // Sub 3: Mud (1), Concrete (1) [Owner 3 had empty flooring so filtered out]
    // Sub 4 (legacy): Concrete (1)
    // Total Concrete = 4
    // Total Mud = 2
    // Total answeredCount = 6
    console.log('Flooring distribution:', flooringAnalytics.distribution);
    console.log('Flooring answeredCount:', flooringAnalytics.answeredCount);

    assert(
      flooringAnalytics.answeredCount === 6,
      `Flooring answeredCount is 6 across all owners (actual: ${flooringAnalytics.answeredCount})`
    );

    const concreteEntry = flooringAnalytics.distribution.find((d: any) => d.name.includes('Concrete'));
    const mudEntry = flooringAnalytics.distribution.find((d: any) => d.name.includes('Mud'));

    assert(concreteEntry?.count === 4, `Concrete count is 4 (actual: ${concreteEntry?.count})`);
    assert(mudEntry?.count === 2, `Mud count is 2 (actual: ${mudEntry?.count})`);

    // Percentage check: 4 / 6 = 67%, 2 / 6 = 33%
    assert(concreteEntry?.percentage === 67, `Concrete percentage is 67% (actual: ${concreteEntry?.percentage}%)`);
    assert(mudEntry?.percentage === 33, `Mud percentage is 33% (actual: ${mudEntry?.percentage}%)`);

    // D.3: Supply Dung? Question aggregation
    // Expected dung values across all owners:
    // Sub 1: Yes (1)
    // Sub 2: Yes (1), No (1)
    // Sub 3: Yes (1), Yes (1) [Owner 3 empty dung filtered out]
    // Sub 4: No (1)
    // Total Yes = 4, Total No = 2
    // Total answeredCount = 6
    const dungAnalytics = analyticsData.questionAnalytics.find((q: any) =>
      q.title.includes('Supply Dung')
    );
    assert(dungAnalytics?.answeredCount === 6, `Supply Dung answeredCount is 6 (actual: ${dungAnalytics?.answeredCount})`);

    const yesEntry = dungAnalytics.distribution.find((d: any) => d.name.includes('Yes'));
    const noEntry = dungAnalytics.distribution.find((d: any) => d.name.includes('No'));
    assert(yesEntry?.count === 4, `Supply Dung 'Yes' count is 4 (actual: ${yesEntry?.count})`);
    assert(noEntry?.count === 2, `Supply Dung 'No' count is 2 (actual: ${noEntry?.count})`);

    // D.4: Large Cattle Count (NUMBER)
    // Values across all owners:
    // Sub 1: 5
    // Sub 2: 10, 8
    // Sub 3: 15, 2, 0
    // Sub 4: 6
    // Total values: [5, 10, 8, 15, 2, 0, 6] -> Sum = 46, Count = 7
    // Average = 46 / 7 = 6.6
    const largeCattleAnalytics = analyticsData.questionAnalytics.find((q: any) =>
      q.title.includes('Large Cattle')
    );
    assert(
      largeCattleAnalytics?.answeredCount === 7,
      `Large cattle answeredCount is 7 across all owners (actual: ${largeCattleAnalytics?.answeredCount})`
    );
    assert(
      largeCattleAnalytics?.average === 6.6,
      `Large cattle average is 6.6 across all owners (actual: ${largeCattleAnalytics?.average})`
    );

    // Distribution includes all owner count buckets
    const bucket15 = largeCattleAnalytics.distribution.find((d: any) => d.name === '15');
    const bucket10 = largeCattleAnalytics.distribution.find((d: any) => d.name === '10');
    assert(bucket15?.count === 1, 'Bucket for 15 cattle exists with count 1');
    assert(bucket10?.count === 1, 'Bucket for 10 cattle exists with count 1');

    // D.5: Ordinary question aggregation (Society Code)
    // Society Code is entered once per submission, so answeredCount must be 4 (not 7!)
    const societyAnalytics = analyticsData.questionAnalytics.find((q: any) =>
      q.title.includes('Society Code')
    );
    assert(
      societyAnalytics?.answeredCount === 4,
      `Ordinary question (Society Code) answeredCount is 4 (actual: ${societyAnalytics?.answeredCount})`
    );

    // D.6: Recent answers list for Cattle Owner Full Name
    const nameAnalytics = analyticsData.questionAnalytics.find((q: any) =>
      q.title.includes('Cattle Owner Full Name')
    );
    assert(
      nameAnalytics?.recentAnswers?.includes('Mahesh Shah'),
      'Recent answers include Owner 2 from multi-owner submission (Mahesh Shah)'
    );
    assert(
      nameAnalytics?.recentAnswers?.includes('Hitesh Bhai'),
      'Recent answers include Owner 2 from 3-owner submission (Hitesh Bhai)'
    );

    // ----------------------------------------------------------------------
    // TEST SECTION E: Responses Export Compatibility
    // ----------------------------------------------------------------------
    console.log('\n--- Sub-Suite E: Export & Responses Route Compatibility ---');

    const responsesReq = new NextRequest(`http://localhost:3000/api/forms/${form.id}/responses`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: `formcraft_session=${token}`,
      },
    });
    const responsesRes = await getResponsesHandler(responsesReq, {
      params: Promise.resolve({ id: form.id }),
    });

    assert(responsesRes.status === 200, `Responses API returned 200 (actual: ${responsesRes.status})`);
    const responsesData = await responsesRes.json();
    assert(
      responsesData.submissions?.length === 4,
      `Responses API returns all 4 submissions (actual: ${responsesData.submissions?.length})`
    );

    const subWith2OwnersInApi = responsesData.submissions.find((s: any) => s.id === sub2.id);
    assert(
      subWith2OwnersInApi?.cattleOwners?.length === 2,
      `Responses API returns cattleOwners array with 2 records for submission 2`
    );
    assert(
      subWith2OwnersInApi?.cattleOwners[0]?.ownerName === 'Suresh Kumar' &&
        subWith2OwnersInApi?.cattleOwners[1]?.ownerName === 'Mahesh Shah',
      'Both owners preserve order and data in GET /api/forms/[id]/responses'
    );
  } catch (err) {
    console.error('Unexpected error in test execution:', err);
    failed++;
  } finally {
    // Cleanup created test form and cascade-delete all test submissions & cattle owners
    if (testFormId) {
      try {
        await prisma.form.delete({ where: { id: testFormId } });
        console.log(`\n🧹 Cleaned up test form ${testFormId} and associated records.`);
      } catch (cleanErr) {
        console.error('Failed to clean up test form:', cleanErr);
      }
    }
  }

  console.log('\n==================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
