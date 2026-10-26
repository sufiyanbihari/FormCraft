import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canExportResponses } from '@/lib/auth/rbac';
import { sanitizeSpreadsheetField } from '@/lib/utils';
import { logActivity } from '@/lib/audit/auditLogger';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const role = await getUserFormRole(id, user.id);

    if (!canExportResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase(); // 'csv', 'xlsx', 'json'

    const [form, submissions] = await Promise.all([
      prisma.form.findUnique({
        where: { id },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
      }),
      prisma.formSubmission.findMany({
        where: { formId: id },
        include: {
          respondent: true,
          answers: true,
          cattleOwners: {
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
    ]);

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const questions = form.sections.flatMap((s) => s.questions);

    // Helpers to match cattle owner question titles
    const isOwnerNameQ = (q: any) =>
      q.title.includes('Cattle Owner Full Name') ||
      q.title.includes('પશુ માલિકનું પૂરું નામ') ||
      (q.title.includes('Cattle Owner') && !q.title.includes('Mobile'));

    const isOwnerMobileQ = (q: any) =>
      (q.title.includes('Owner Mobile') || q.title.includes('માલિકનો મોબાઇલ')) &&
      !q.title.includes('Surveyor');

    const isLargeCattleQ = (q: any) =>
      q.title.includes('Large Cattle') || q.title.includes('મોટા પશુ');

    const isSmallCattleQ = (q: any) =>
      q.title.includes('Small Cattle') || q.title.includes('નાના પશુ');

    const isFlooringQ = (q: any) =>
      q.title.includes('Flooring') || q.title.includes('ભોંયતળિયું');

    const isSupplyDungQ = (q: any) =>
      q.title.includes('Supply Dung') || q.title.includes('છાણ આપવા');

    await logActivity({
      action: 'SUBMISSION_EXPORT',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: form.id,
      formTitle: form.title,
      publicId: form.publicId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        format,
        exportedCount: submissions.length,
      },
    });

    // If ZIP format requested (for all submissions or a specific submission)
    if (format === 'zip') {
      const submissionId = searchParams.get('submissionId');
      const zip = new JSZip();

      // Target submissions: either specific submission or all
      const targetSubmissions = submissionId
        ? submissions.filter((s) => s.id === submissionId)
        : submissions;

      if (submissionId && targetSubmissions.length === 0) {
        return NextResponse.json({ error: 'Form submission not found' }, { status: 404 });
      }

      // Query any uploaded files linked in DB
      const dbUploadedFiles = await prisma.uploadedFile.findMany({
        where: submissionId
          ? { submissionId }
          : { formId: id },
      });

      interface FileToZip {
        fileName: string;
        publicUrl: string;
        folder?: string;
      }

      const filesToZip: FileToZip[] = [];
      const seenUrls = new Set<string>();

      // 1. Collect files from target submission answers
      targetSubmissions.forEach((sub, sIdx) => {
        const folderName =
          targetSubmissions.length > 1
            ? `${(sub.respondentEmail || 'response').replace(/[^a-zA-Z0-9@._-]/g, '_')}_${sub.id.slice(-6)}`
            : '';

        sub.answers.forEach((ans) => {
          let val = ans.value;
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try {
              val = JSON.parse(val);
            } catch {}
          }

          const addCandidate = (item: any) => {
            if (!item || typeof item !== 'object') return;
            const url = item.publicUrl || item.url || item.fileUrl;
            if (url && typeof url === 'string') {
              const fileName = item.fileName || item.name || url.split('/').pop() || 'file';
              filesToZip.push({
                fileName,
                publicUrl: url,
                folder: folderName,
              });
              seenUrls.add(url);
            }
          };

          if (Array.isArray(val)) {
            val.forEach(addCandidate);
          } else {
            addCandidate(val);
          }
        });
      });

      // 2. Collect any DB UploadedFiles not already seen
      for (const dbFile of dbUploadedFiles) {
        if (!seenUrls.has(dbFile.publicUrl)) {
          filesToZip.push({
            fileName: dbFile.fileName || 'uploaded_file',
            publicUrl: dbFile.publicUrl,
            folder: targetSubmissions.length > 1 ? 'additional_uploads' : '',
          });
          seenUrls.add(dbFile.publicUrl);
        }
      }

      if (filesToZip.length === 0) {
        zip.file(
          'README.txt',
          `No uploaded files were found for ${
            submissionId ? `submission ID ${submissionId}` : `form "${form.title}"`
          }.\r\nGenerated at: ${new Date().toISOString()}`
        );
      } else {
        const folderFileCounts = new Map<string, number>();

        for (const f of filesToZip) {
          try {
            let buffer: Buffer | null = null;
            // Try reading using persistent fileStorage getFile
            if (f.publicUrl.startsWith('/uploads/') || f.publicUrl.startsWith('uploads/')) {
              const cleanRel = f.publicUrl.replace(/^\/?uploads\//, '');
              try {
                const { getFile } = await import('@/lib/storage/fileStorage');
                const fileRes = await getFile(cleanRel);
                if (fileRes?.buffer) {
                  buffer = fileRes.buffer;
                } else if (fileRes?.redirectUrl) {
                  const resp = await fetch(fileRes.redirectUrl);
                  if (resp.ok) {
                    const arrBuf = await resp.arrayBuffer();
                    buffer = Buffer.from(arrBuf);
                  }
                }
              } catch {
                // fall through to fetch
              }
            } else if (f.publicUrl.startsWith('/')) {
              const localPath = path.join(process.cwd(), 'public', f.publicUrl.replace(/^\//, ''));
              try {
                buffer = await fs.readFile(localPath);
              } catch {}
            }

            if (!buffer) {
              const fetchUrl = f.publicUrl.startsWith('http')
                ? f.publicUrl
                : `${request.nextUrl.origin}${f.publicUrl.startsWith('/') ? '' : '/'}${f.publicUrl}`;
              const resp = await fetch(fetchUrl);
              if (resp.ok) {
                const arrBuf = await resp.arrayBuffer();
                buffer = Buffer.from(arrBuf);
              }
            }

            if (buffer) {
              const folderPrefix = f.folder ? `${f.folder}/` : '';
              const ext = path.extname(f.fileName);
              const base = path.basename(f.fileName, ext);
              const key = `${folderPrefix}${f.fileName}`;
              const count = folderFileCounts.get(key) || 0;
              folderFileCounts.set(key, count + 1);

              const finalName = count === 0 ? f.fileName : `${base} (${count})${ext}`;
              zip.file(`${folderPrefix}${finalName}`, buffer);
            }
          } catch (fileErr) {
            console.error('Failed to include file in zip:', f.fileName, fileErr);
          }
        }
      }

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const singleSub = submissionId ? targetSubmissions[0] : null;
      const downloadName = singleSub
        ? `${(singleSub.respondentEmail || 'response').replace(/[^a-zA-Z0-9@._-]/g, '_')}_files.zip`
        : `${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_all_files.zip`;

      return new NextResponse(zipBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${downloadName}"`,
        },
      });
    }

    // If JSON format requested
    if (format === 'json') {
      const jsonData = submissions.flatMap<any>((s) => {
        if (s.cattleOwners && s.cattleOwners.length > 0) {
          return s.cattleOwners.map((co) => ({
            id: `${s.id}-${co.orderIndex + 1}`,
            submissionId: s.id,
            ownerOrderIndex: co.orderIndex + 1,
            submittedAt: s.submittedAt,
            respondentEmail: s.respondentEmail || s.respondent?.email || 'Anonymous',
            cattleOwner: {
              ownerName: co.ownerName,
              ownerMobile: co.ownerMobile,
              largeCattleCount: co.largeCattleCount,
              smallCattleCount: co.smallCattleCount,
              flooringType: co.flooringType,
              supplyDung: co.supplyDung,
            },
            answers: questions.map((q) => {
              let val: any = undefined;
              if (isOwnerNameQ(q)) val = co.ownerName;
              else if (isOwnerMobileQ(q)) val = co.ownerMobile;
              else if (isLargeCattleQ(q)) val = co.largeCattleCount;
              else if (isSmallCattleQ(q)) val = co.smallCattleCount;
              else if (isFlooringQ(q)) val = co.flooringType;
              else if (isSupplyDungQ(q)) val = co.supplyDung;
              else {
                const a = s.answers.find((item) => item.questionId === q.id);
                val = a ? a.value : null;
              }
              return {
                questionId: q.id,
                questionTitle: q.title,
                value: val,
              };
            }),
          }));
        }

        return [{
          id: s.id,
          submittedAt: s.submittedAt,
          respondentEmail: s.respondentEmail || s.respondent?.email || 'Anonymous',
          totalScore: s.totalScore,
          answers: s.answers.map((a) => {
            const q = questions.find((item) => item.id === a.questionId);
            return {
              questionId: a.questionId,
              questionTitle: q?.title || 'Unknown Question',
              value: a.value,
            };
          }),
        }];
      });

      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.json"`,
        },
      });
    }

    // Build tabular rows for CSV & XLSX
    const headers = [
      'Submission ID',
      'Submission Date',
      'Respondent Email',
      ...(form.isQuiz ? ['Quiz Score', 'Max Score', 'Percentage', 'Grade Status'] : []),
      ...questions.map((q) => q.title),
    ];

    const rows = submissions.flatMap((sub) => {
      const answerMap = new Map<string, any>();
      sub.answers.forEach((ans) => answerMap.set(ans.questionId, ans.value));

      const quizStats = form.isQuiz
        ? [
            sub.totalScore ?? 0,
            sub.maxScore ?? 0,
            sub.maxScore && sub.maxScore > 0
              ? `${Math.round(((sub.totalScore ?? 0) / sub.maxScore) * 100)}%`
              : '0%',
            sub.isGradeReleased ? 'Released' : 'Pending Review',
          ]
        : [];

      if (sub.cattleOwners && sub.cattleOwners.length > 0) {
        return sub.cattleOwners.map((co) => {
          const rowValues = [
            `${sub.id}-${co.orderIndex + 1}`,
            sub.submittedAt.toISOString(),
            sub.respondentEmail || sub.respondent?.email || 'Anonymous',
            ...quizStats,
            ...questions.map((q) => {
              if (isOwnerNameQ(q)) return co.ownerName;
              if (isOwnerMobileQ(q)) return co.ownerMobile;
              if (isLargeCattleQ(q)) return String(co.largeCattleCount);
              if (isSmallCattleQ(q)) return String(co.smallCattleCount);
              if (isFlooringQ(q)) return co.flooringType;
              if (isSupplyDungQ(q)) return co.supplyDung;

              const raw = answerMap.get(q.id);
              if (raw === undefined || raw === null) return '';
              if (Array.isArray(raw)) return raw.join(', ');
              if (typeof raw === 'object') {
                if (raw.publicUrl) return raw.publicUrl;
                return JSON.stringify(raw);
              }
              return String(raw);
            }),
          ];
          return rowValues;
        });
      }

      const rowValues = [
        sub.id,
        sub.submittedAt.toISOString(),
        sub.respondentEmail || sub.respondent?.email || 'Anonymous',
        ...quizStats,
        ...questions.map((q) => {
          const raw = answerMap.get(q.id);
          if (raw === undefined || raw === null) return '';
          if (Array.isArray(raw)) return raw.join(', ');
          if (typeof raw === 'object') {
            if (raw.publicUrl) return raw.publicUrl;
            return JSON.stringify(raw);
          }
          return String(raw);
        }),
      ];

      return [rowValues];
    });

    // XLSX format
    if (format === 'xlsx') {
      const worksheetData = [
        headers,
        ...rows.map((r) => r.map((c) => sanitizeSpreadsheetField(c))),
      ];
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Responses');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.xlsx"`,
        },
      });
    }

    // CSV format (default)
    const csvRows = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const sanitized = sanitizeSpreadsheetField(cell);
            return `"${sanitized.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ];

    // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
    const csvContent = '\uFEFF' + csvRows.join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export responses:', error);
    return NextResponse.json({ error: 'Failed to export responses' }, { status: 500 });
  }
}
