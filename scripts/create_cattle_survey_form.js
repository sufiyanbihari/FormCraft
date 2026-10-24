const path = require('path');
const xlsx = require('xlsx');
const { PrismaClient } = require(path.resolve(process.cwd(), 'node_modules/@prisma/client'));
const { createDataset } = require(path.resolve(process.cwd(), 'src/lib/lookup/lookupService.ts'));

const prisma = new PrismaClient();

async function main() {
  console.log('--- Creating Cattle Owner & Dung Availability Survey Form ---');

  // 1. Get Admin User
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });
  if (!adminUser) throw new Error('No admin user found');

  // Check if form already exists to avoid duplicates
  let form = await prisma.form.findFirst({
    where: {
      title: 'Cattle Owner & Dung Availability Survey Questionnaire',
    },
    include: {
      sections: { include: { questions: true } },
      lookupDatasets: true,
      lookupMappings: true,
    },
  });

  if (form) {
    console.log('Existing form found with ID:', form.id, 'Cleaning up to recreate fresh...');
    await prisma.form.delete({ where: { id: form.id } });
  }

  // 2. Create the Form
  form = await prisma.form.create({
    data: {
      title: 'Cattle Owner & Dung Availability Survey Questionnaire',
      description: 'પશુપાલન અને છાણ સર્વેક્ષણ પત્રક\nComprehensive Village Cattle & Dung Survey Questionnaire',
      ownerId: adminUser.id,
      status: 'PUBLISHED',
      theme: {
        create: {
          primaryColor: '#004B6E',
          backgroundColor: '#f1f5f9',
          cardColor: '#ffffff',
          borderRadius: 'rounded-xl',
          fontFamily: 'Inter',
        },
      },
      settings: {
        create: {
          accessMode: 'PUBLIC',
          isAcceptingResponses: true,
          requireAuth: false,
          collectEmail: false,
          showProgressBar: true,
          allowMultipleSubmissions: true,
          confirmationMessage: 'Your survey has been recorded successfully. આભાર, આપનું સર્વેક્ષણ સફળતાપૂર્વક નોંધાઈ ગયું છે.',
        },
      },
    },
  });

  console.log('Created Form:', form.id, 'Public ID:', form.publicId);

  // 3. Create Section 1: 1. SOCIETY & LOCATION DETAILS (૧. મંડળી અને ભૌગોલિક વિગતો)
  const sec1 = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: '1. SOCIETY & LOCATION DETAILS (૧. મંડળી અને ભૌગોલિક વિગતો)',
      description: 'મંડળી નો કોડ દાખલ કરો જેથી મંડળી નું નામ, તાલુકો અને જિલ્લો આપોઆપ આવી જશે.',
      orderIndex: 0,
      nextSectionId: 'NEXT',
    },
  });

  const qSocietyCode = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec1.id,
      title: 'Society Code (મંડળી નો કોડ)',
      description: '🔢 e.g. 1, 2, 3, 101, 102...',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
      isRequired: true,
    },
  });

  const qSocietyName = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec1.id,
      title: 'Society Name (મંડળીનું નામ)',
      description: '🏢 Enter society name',
      type: 'SHORT_ANSWER',
      orderIndex: 1,
      isRequired: true,
    },
  });

  const qTaluka = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec1.id,
      title: 'Taluka (Sub-district) (તાલુકો)',
      description: '📍 Enter taluka name',
      type: 'SHORT_ANSWER',
      orderIndex: 2,
      isRequired: true,
    },
  });

  const qDistrict = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec1.id,
      title: 'District (જીલ્લો)',
      description: '🗺️ Enter district name',
      type: 'SHORT_ANSWER',
      orderIndex: 3,
      isRequired: true,
    },
  });

  // 4. Create Section 2: 2. SURVEYOR & OWNER INFO (૨. સર્વેક્ષણ કર્તા અને માલિકની વિગતો)
  const sec2 = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: '2. SURVEYOR & OWNER INFO (૨. સર્વેક્ષણ કર્તા અને માલિકની વિગતો)',
      description: 'સર્વેક્ષણ કરનાર કર્મચારી અને પશુપાલક માલિકની સંપર્ક વિગતો.',
      orderIndex: 1,
      nextSectionId: 'NEXT',
    },
  });

  const qSurveyorName = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec2.id,
      title: 'Surveyor Name (સર્વે કરનાર નું નામ)',
      description: '👤 Enter surveyor name',
      type: 'SHORT_ANSWER',
      orderIndex: 0,
      isRequired: true,
    },
  });

  const qSurveyorMobile = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec2.id,
      title: 'Surveyor Mobile No. (10 Digits) (સર્વે કરનાર નો મોબાઇલ નં.)',
      description: '📱 99********* (10 digit mobile number)',
      type: 'PHONE',
      orderIndex: 1,
      isRequired: true,
    },
  });

  const qOwnerName = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec2.id,
      title: 'Cattle Owner Full Name (પશુ માલિકનું પૂરું નામ)',
      description: '🧑 Enter cattle owner full name',
      type: 'SHORT_ANSWER',
      orderIndex: 2,
      isRequired: true,
    },
  });

  const qOwnerMobile = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec2.id,
      title: 'Owner Mobile No. (10 Digits) (માલિકનો મોબાઇલ નં.)',
      description: '📞 98********* (10 digit mobile number)',
      type: 'PHONE',
      orderIndex: 3,
      isRequired: true,
    },
  });

  // 5. Create Section 3: 3. LIVESTOCK & AGREEMENT INFO (૩. પશુધન અને સંમતિની વિગતો)
  const sec3 = await prisma.formSection.create({
    data: {
      formId: form.id,
      title: '3. LIVESTOCK & AGREEMENT INFO (૩. પશુધન અને સંમતિની વિગતો)',
      description: 'પશુઓની સંખ્યા, ભોંયતળિયાની સ્થિતિ અને છાણ પૂરા પાડવાની સંમતિ.',
      orderIndex: 2,
      nextSectionId: 'SUBMIT',
    },
  });

  const qLargeCattle = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec3.id,
      title: 'Total Large Cattle Count (Over 1 Year Age) (હાજર મોટા પશુઓની કુલ સંખ્યા (૧ વર્ષથી વધુ))',
      description: '🐄 0',
      type: 'NUMBER',
      orderIndex: 0,
      isRequired: true,
    },
  });

  const qSmallCattle = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec3.id,
      title: 'Total Small Cattle Count (હાજર નાના પશુઓની કુલ સંખ્યા)',
      description: '🐐 0',
      type: 'NUMBER',
      orderIndex: 1,
      isRequired: true,
    },
  });

  const qFlooring = await prisma.formQuestion.create({
    data: {
      formId: form.id,
      sectionId: sec3.id,
      title: 'Flooring Type (ભોંયતળિયું (પાકું/કાચું))',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 2,
      isRequired: true,
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
      sectionId: sec3.id,
      title: 'Supply Dung? (છાણ આપવા સંમત?)',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 3,
      isRequired: true,
      options: {
        create: [
          { label: 'Yes (હા)', value: 'Yes (હા)', orderIndex: 0 },
          { label: 'No (ના)', value: 'No (ના)', orderIndex: 1 },
        ],
      },
    },
  });

  console.log('Created 12 questions across 3 sections successfully.');

  // 6. Generate Village Society Excel Dataset
  const societyRows = [
    { SocietyCode: '1', SocietyName: 'Model Cooperative Society 1', Taluka: 'Central Taluka', District: 'Sample District' },
    { SocietyCode: '2', SocietyName: 'Model Cooperative Society 2', Taluka: 'West Taluka', District: 'Sample District' },
    { SocietyCode: '3', SocietyName: 'Model Cooperative Society 3', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '4', SocietyName: 'Model Cooperative Society 4', Taluka: 'East Taluka', District: 'Sample District' },
    { SocietyCode: '5', SocietyName: 'Model Cooperative Society 5', Taluka: 'South Taluka', District: 'Sample District' },
    { SocietyCode: '6', SocietyName: 'Model Cooperative Society 6', Taluka: 'Central Taluka', District: 'Sample District' },
    { SocietyCode: '7', SocietyName: 'Model Cooperative Society 7', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '8', SocietyName: 'Model Cooperative Society 8', Taluka: 'East Taluka', District: 'Sample District' },
    { SocietyCode: '9', SocietyName: 'Model Cooperative Society 9', Taluka: 'West Taluka', District: 'Sample District' },
    { SocietyCode: '10', SocietyName: 'Model Cooperative Society 10', Taluka: 'South Taluka', District: 'Sample District' },
    { SocietyCode: '101', SocietyName: 'Model Cooperative Society 101', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '102', SocietyName: 'Model Cooperative Society 102', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '103', SocietyName: 'Model Cooperative Society 103', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '104', SocietyName: 'Model Cooperative Society 104', Taluka: 'North Taluka', District: 'Sample District' },
    { SocietyCode: '105', SocietyName: 'Model Cooperative Society 105', Taluka: 'West Taluka', District: 'Sample District' },
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(societyRows);
  xlsx.utils.book_append_sheet(wb, ws, 'Societies');
  const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 7. Ingest Dataset into FormCraft
  const uploadResult = await createDataset(form.id, excelBuffer, 'society_data.xlsx', excelBuffer.length);
  console.log('Uploaded and Indexed Dataset:', uploadResult.dataset.id, 'with', uploadResult.dataset.rowCount, 'rows.');

  // 8. Create Universal Lookup Mapping Rule
  const mapping = await prisma.formLookupMapping.create({
    data: {
      formId: form.id,
      datasetId: uploadResult.dataset.id,
      triggerQuestionId: qSocietyCode.id,
      lookupType: 'TEXT_KEY',
      keyColumn: 'SocietyCode',
      noMatchMessage: 'Society Code not found in master database. You can manually enter details.',
      mappings: [
        { column: 'SocietyName', targetQuestionId: qSocietyName.id, isReadOnly: false },
        { column: 'Taluka', targetQuestionId: qTaluka.id, isReadOnly: false },
        { column: 'District', targetQuestionId: qDistrict.id, isReadOnly: false },
      ],
    },
  });
  console.log('Configured Lookup Mapping Rule:', mapping.id);

  // 9. Publish Form Snapshot
  const completeForm = await prisma.form.findUnique({
    where: { id: form.id },
    include: {
      sections: {
        include: {
          questions: {
            include: { options: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
      settings: true,
      lookupMappings: {
        include: {
          dataset: {
            select: {
              id: true,
              fileName: true,
              rowCount: true,
              columns: true,
              version: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  const snapshotJson = {
    title: completeForm.title,
    description: completeForm.description,
    settings: completeForm.settings,
    sections: completeForm.sections,
    lookupMappings: completeForm.lookupMappings,
  };

  const version = await prisma.formVersion.create({
    data: {
      formId: form.id,
      versionNumber: 1,
      snapshotJson: snapshotJson,
    },
  });

  await prisma.form.update({
    where: { id: form.id },
    data: {
      publishedVersionId: version.id,
    },
  });

  console.log('--- Form Created & Published Successfully! ---');
  console.log('Form ID:', form.id);
  console.log('Public ID:', form.publicId);
  console.log('Form Editor URL: http://localhost:3000/forms/' + form.id);
  console.log('Public Form URL: http://localhost:3000/f/' + form.publicId);
}

main().catch(console.error).finally(() => prisma.$disconnect());
