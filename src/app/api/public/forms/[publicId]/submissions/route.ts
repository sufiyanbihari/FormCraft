import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { submitFormSchema } from '@/lib/validation/submissionSchema';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';
import { findLookupRecord } from '@/lib/lookup/lookupService';
import { FieldMapping } from '@/lib/lookup/lookupTypes';
import { formatSizeMb } from '@/lib/utils';
import crypto from 'crypto';
import { ensureQuizSchema } from '@/lib/db/ensureQuizSchema';
import { ensureResponseControlSchema } from '@/lib/db/ensureResponseControlSchema';
import { resolveParticipantIdentifier, checkDuplicateSubmission } from '@/lib/submission/duplicatePreventionService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    await ensureQuizSchema();
    await ensureResponseControlSchema();
    const { publicId } = await params;

    const form = await prisma.form.findUnique({
      where: { publicId },
      include: {
        settings: true,
        lookupMappings: true,
        sections: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!form || form.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This form is not found or is currently closed.' },
        { status: 404 }
      );
    }

    const settings = form.settings;
    const now = new Date();

    // 1. Enforce availability constraints
    if (settings) {
      if (!settings.isAcceptingResponses) {
        return NextResponse.json(
          { error: settings.closedMessage || 'This form is no longer accepting responses.' },
          { status: 403 }
        );
      }
      if (settings.startDate && new Date(settings.startDate) > now) {
        return NextResponse.json(
          { error: 'This form has not opened for submissions yet.' },
          { status: 403 }
        );
      }
      if (settings.endDate && new Date(settings.endDate) < now) {
        return NextResponse.json(
          { error: settings.closedMessage || 'Submission deadline has passed.' },
          { status: 403 }
        );
      }
      if (settings.maxResponses && form._count.submissions >= settings.maxResponses) {
        return NextResponse.json(
          { error: 'This form has reached its response limit.' },
          { status: 403 }
        );
      }
    }

    // 2. Validate session if authentication is required
    const authenticatedUser = await getAuthUserFromRequest(request);
    if (settings?.requireAuth && !authenticatedUser) {
      return NextResponse.json(
        { error: 'Authentication is required to submit this form.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parseResult = submitFormSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid submission data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { answers, cattleOwners, respondentEmail, idempotencyKey } = parseResult.data;

    // Client IP hashing
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32);

    // 3. Resolve participant identity for duplicate response prevention if active
    let resolvedIdentity: any = null;
    if (settings?.restrictOneResponse) {
      const idResult = resolveParticipantIdentifier({
        settings,
        authenticatedUser,
        respondentEmail,
        answers,
        ipHash,
      });

      if (!idResult.success) {
        return NextResponse.json(
          { error: idResult.error },
          { status: idResult.statusCode }
        );
      }
      resolvedIdentity = idResult.identity;
    }

    // Validate cattle owners entries if provided
    if (cattleOwners && cattleOwners.length > 0) {
      for (let i = 0; i < cattleOwners.length; i++) {
        const owner = cattleOwners[i];
        const prefix = `Cattle Owner ${i + 1}`;
        if (!owner.ownerName || !owner.ownerName.trim()) {
          return NextResponse.json({ error: `${prefix}: Full Name is required.` }, { status: 400 });
        }
        const cleanMobile = (owner.ownerMobile || '').replace(/\D/g, '');
        if (cleanMobile.length !== 10) {
          return NextResponse.json({ error: `${prefix}: Mobile number must be exactly 10 digits.` }, { status: 400 });
        }
        if (owner.largeCattleCount === undefined || owner.largeCattleCount === null || isNaN(Number(owner.largeCattleCount)) || Number(owner.largeCattleCount) < 0) {
          return NextResponse.json({ error: `${prefix}: Large cattle count must be a non-negative number.` }, { status: 400 });
        }
        if (owner.smallCattleCount === undefined || owner.smallCattleCount === null || isNaN(Number(owner.smallCattleCount)) || Number(owner.smallCattleCount) < 0) {
          return NextResponse.json({ error: `${prefix}: Small cattle count must be a non-negative number.` }, { status: 400 });
        }
        if (!owner.flooringType || !owner.flooringType.trim()) {
          return NextResponse.json({ error: `${prefix}: Flooring Type is required.` }, { status: 400 });
        }
        if (!owner.supplyDung || !owner.supplyDung.trim()) {
          return NextResponse.json({ error: `${prefix}: Supply Dung agreement is required.` }, { status: 400 });
        }
      }
    }

    // Check idempotency key if provided
    if (idempotencyKey) {
      const existingSub = await prisma.formSubmission.findUnique({
        where: { idempotencyKey },
      });
      if (existingSub) {
        return NextResponse.json({
          message: 'Submission already recorded',
          submissionId: existingSub.id,
        });
      }
    }

    // Check collectEmail setting
    if (settings?.collectEmail && !respondentEmail && !authenticatedUser?.email) {
      return NextResponse.json(
        { error: 'Email address is required to submit this form.' },
        { status: 400 }
      );
    }

    // Map answers by questionId
    const answerMap = new Map<string, any>();
    answers.forEach((a) => answerMap.set(a.questionId, a.value));

    // Validate required questions and data formats
    const allQuestions = form.sections.flatMap((s) => s.questions);
    for (const q of allQuestions) {
      const val = answerMap.get(q.id);
      const isEmpty =
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0);

      if (q.isRequired && isEmpty) {
        return NextResponse.json(
          { error: `Question "${q.title}" is required.` },
          { status: 400 }
        );
      }

      // Format validations when value is provided
      if (!isEmpty) {
        if (q.type === 'NUMBER') {
          const strVal = String(val).trim();
          if (isNaN(Number(strVal)) || !/^-?\d+(\.\d+)?$/.test(strVal)) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be a valid number without characters.` },
              { status: 400 }
            );
          }
          const num = Number(strVal);
          const validationConfig = (q.validation as any) || {};
          if (validationConfig.minVal !== undefined && num < validationConfig.minVal) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be at least ${validationConfig.minVal}.` },
              { status: 400 }
            );
          }
          if (validationConfig.maxVal !== undefined && num > validationConfig.maxVal) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be at most ${validationConfig.maxVal}.` },
              { status: 400 }
            );
          }
        } else if (q.type === 'PHONE') {
          const strVal = String(val).trim();
          const digits = strVal.replace(/\D/g, '');
          if (digits.length < 10) {
            return NextResponse.json(
              { error: `Question "${q.title}" requires a valid phone number (at least 10 digits).` },
              { status: 400 }
            );
          }
          if (digits.length > 15) {
            return NextResponse.json(
              { error: `Question "${q.title}" phone number cannot exceed 15 digits.` },
              { status: 400 }
            );
          }
        } else if (q.type === 'DATE') {
          const strVal = String(val).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(strVal) || isNaN(Date.parse(strVal))) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be a valid date formatted as YYYY-MM-DD.` },
              { status: 400 }
            );
          }
        } else if (q.type === 'TIME') {
          const strVal = String(val).trim();
          if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(strVal)) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be a valid time in HH:MM format.` },
              { status: 400 }
            );
          }
        } else if (q.type === 'EMAIL') {
          const strVal = String(val).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
            return NextResponse.json(
              { error: `Question "${q.title}" must be a valid email address.` },
              { status: 400 }
            );
          }
        } else if (q.type === 'FILE_UPLOAD') {
          if (typeof val === 'object' && val !== null) {
            const config = (q.config as any) || {};
            const maxMb = config.maxFileSizeMb || 10;
            if (val.fileSize && val.fileSize > maxMb * 1024 * 1024) {
              return NextResponse.json(
                { error: `File uploaded for "${q.title}" exceeds maximum allowed limit of ${formatSizeMb(maxMb)}.` },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Compute quiz grading if applicable
    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers: {
      questionId: string;
      value: any;
      score: number;
      isCorrect: boolean;
    }[] = [];

    if (form.isQuiz) {
      for (const q of allQuestions) {
        maxScore += q.quizPoints || 0;
        const submittedVal = answerMap.get(q.id);
        const qAnswerConfig: any = q.quizAnswer || {};

        let isCorrect = false;
        let pointsEarned = 0;

        if (q.quizPoints > 0 && submittedVal !== undefined && submittedVal !== null) {
          if (q.type === 'MULTIPLE_CHOICE' || q.type === 'DROPDOWN') {
            const correctVal = qAnswerConfig.correctValue;
            if (correctVal && String(submittedVal).trim().toLowerCase() === String(correctVal).trim().toLowerCase()) {
              isCorrect = true;
              pointsEarned = q.quizPoints;
            }
          } else if (q.type === 'CHECKBOXES') {
            const correctVals: string[] = qAnswerConfig.correctValues || [];
            if (Array.isArray(submittedVal)) {
              const sSorted = [...submittedVal].map((v) => String(v).trim().toLowerCase()).sort();
              const cSorted = [...correctVals].map((v) => String(v).trim().toLowerCase()).sort();
              if (
                sSorted.length === cSorted.length &&
                sSorted.every((v, i) => v === cSorted[i])
              ) {
                isCorrect = true;
                pointsEarned = q.quizPoints;
              }
            }
          } else if (q.type === 'SHORT_ANSWER') {
            const accepted: string[] = Array.isArray(qAnswerConfig.acceptedAnswers) && qAnswerConfig.acceptedAnswers.length > 0
              ? qAnswerConfig.acceptedAnswers
              : (qAnswerConfig.correctValue ? [qAnswerConfig.correctValue] : []);
            const caseSensitive = Boolean(qAnswerConfig.caseSensitive);
            const subStr = String(submittedVal).trim();
            if (
              accepted.some((ans: string) => {
                const a = String(ans).trim();
                return caseSensitive ? subStr === a : subStr.toLowerCase() === a.toLowerCase();
              })
            ) {
              isCorrect = true;
              pointsEarned = q.quizPoints;
            }
          } else if (q.type === 'NUMBER') {
            const numVal = Number(submittedVal);
            if (!isNaN(numVal)) {
              const mode = qAnswerConfig.numberMode || 'exact';
              if (mode === 'exact') {
                const target = Number(qAnswerConfig.exactValue ?? qAnswerConfig.correctValue);
                if (!isNaN(target) && numVal === target) {
                  isCorrect = true;
                  pointsEarned = q.quizPoints;
                }
              } else if (mode === 'tolerance') {
                const target = Number(qAnswerConfig.exactValue);
                const tol = Math.abs(Number(qAnswerConfig.tolerance || 0));
                if (!isNaN(target) && Math.abs(numVal - target) <= tol) {
                  isCorrect = true;
                  pointsEarned = q.quizPoints;
                }
              } else if (mode === 'range') {
                const min = Number(qAnswerConfig.minVal);
                const max = Number(qAnswerConfig.maxVal);
                if (!isNaN(min) && !isNaN(max) && numVal >= min && numVal <= max) {
                  isCorrect = true;
                  pointsEarned = q.quizPoints;
                }
              }
            }
          }
        }

        totalScore += pointsEarned;
        gradedAnswers.push({
          questionId: q.id,
          value: submittedVal,
          score: pointsEarned,
          isCorrect,
        });
      }
    }

    // Enforce authoritative values for read-only lookup mapped fields
    if (form.lookupMappings && form.lookupMappings.length > 0) {
      for (const mapping of form.lookupMappings) {
        const triggerVal = answerMap.get(mapping.triggerQuestionId);
        if (triggerVal && String(triggerVal).trim() !== '') {
          const authRecord = await findLookupRecord(
            mapping.datasetId,
            mapping.keyColumn,
            String(triggerVal)
          );
          if (authRecord) {
            const fieldMappings = (mapping.mappings as unknown as FieldMapping[]) || [];
            for (const fm of fieldMappings) {
              if (fm.isReadOnly) {
                const authoritativeVal =
                  authRecord[fm.column] !== undefined && authRecord[fm.column] !== null
                    ? String(authRecord[fm.column])
                    : '';
                answerMap.set(fm.targetQuestionId, authoritativeVal);
                const existingAns = answers.find((a) => a.questionId === fm.targetQuestionId);
                if (existingAns) {
                  existingAns.value = authoritativeVal;
                } else {
                  answers.push({ questionId: fm.targetQuestionId, value: authoritativeVal });
                }
              }
            }
          }
        }
      }
    }

    // Release grade determination
    const isImmediate = (form.settings?.quizReleaseGrade ?? 'IMMEDIATE') === 'IMMEDIATE';
    const isGradeReleased = form.isQuiz ? isImmediate : true;
    const gradeReleasedAt = isGradeReleased ? new Date() : null;

    // Persist submission transactionally
    const submission = await prisma.$transaction(async (tx) => {
      // Enforce duplicate restriction inside transaction with advisory lock
      if (settings?.restrictOneResponse && resolvedIdentity) {
        const dupCheck = await checkDuplicateSubmission(tx, {
          formId: form.id,
          settings,
          identity: resolvedIdentity,
          now,
        });

        if (dupCheck.isDuplicate) {
          const err = new Error('DUPLICATE_SUBMISSION_DETECTED');
          (err as any).dupCheck = dupCheck;
          throw err;
        }
      }

      const sub = await tx.formSubmission.create({
        data: {
          formId: form.id,
          formVersionId: form.publishedVersionId,
          respondentUserId: authenticatedUser?.id,
          respondentEmail: respondentEmail || authenticatedUser?.email,
          ipHash,
          idempotencyKey,
          totalScore: form.isQuiz ? totalScore : null,
          maxScore: form.isQuiz ? maxScore : null,
          isGradeReleased,
          gradeReleasedAt,
        },
      });

      // Save each answer
      for (const ans of answers) {
        const graded = gradedAnswers.find((g) => g.questionId === ans.questionId);
        await tx.submissionAnswer.create({
          data: {
            submissionId: sub.id,
            questionId: ans.questionId,
            value: ans.value,
            textAnswer:
              typeof ans.value === 'string'
                ? ans.value
                : Array.isArray(ans.value)
                  ? ans.value.join(', ')
                  : JSON.stringify(ans.value),
            score: graded?.score ?? null,
            isCorrect: graded?.isCorrect ?? null,
          },
        });
      }

      // Persist cattle owner records if provided or fallback for single owner
      if (cattleOwners && cattleOwners.length > 0) {
        await tx.cattleOwnerEntry.createMany({
          data: cattleOwners.map((owner, idx) => ({
            submissionId: sub.id,
            orderIndex: idx,
            ownerName: owner.ownerName.trim(),
            ownerMobile: owner.ownerMobile.trim(),
            largeCattleCount: Math.max(0, Math.floor(Number(owner.largeCattleCount) || 0)),
            smallCattleCount: Math.max(0, Math.floor(Number(owner.smallCattleCount) || 0)),
            flooringType: owner.flooringType.trim(),
            supplyDung: owner.supplyDung.trim(),
          })),
        });
      } else {
        // Fallback: If form has cattle survey questions, extract single owner entry from answers
        const ownerNameQ = allQuestions.find((q) => q.title.includes('Cattle Owner') || q.title.includes('પશુ માલિકનું'));
        const ownerMobileQ = allQuestions.find((q) => (q.title.includes('Owner Mobile') || q.title.includes('માલિકનો')) && !q.title.includes('Surveyor'));
        const largeCattleQ = allQuestions.find((q) => q.title.includes('Large Cattle') || q.title.includes('મોટા પશુ'));
        const smallCattleQ = allQuestions.find((q) => q.title.includes('Small Cattle') || q.title.includes('નાના પશુ'));
        const flooringQ = allQuestions.find((q) => q.title.includes('Flooring') || q.title.includes('ભોંયતળિયું'));
        const dungQ = allQuestions.find((q) => q.title.includes('Supply Dung') || q.title.includes('છાણ આપવા'));

        if (ownerNameQ && answerMap.get(ownerNameQ.id)) {
          await tx.cattleOwnerEntry.create({
            data: {
              submissionId: sub.id,
              orderIndex: 0,
              ownerName: String(answerMap.get(ownerNameQ.id) || '').trim(),
              ownerMobile: String(answerMap.get(ownerMobileQ?.id || '') || '').trim(),
              largeCattleCount: Math.max(0, Math.floor(Number(answerMap.get(largeCattleQ?.id || '')) || 0)),
              smallCattleCount: Math.max(0, Math.floor(Number(answerMap.get(smallCattleQ?.id || '')) || 0)),
              flooringType: String(answerMap.get(flooringQ?.id || '') || '').trim(),
              supplyDung: String(answerMap.get(dungQ?.id || '') || '').trim(),
            },
          });
        }
      }

      // Link uploaded files to this submission
      const fileUrls: string[] = [];
      for (const ans of answers) {
        if (ans.value && typeof ans.value === 'object') {
          if (typeof ans.value.publicUrl === 'string') {
            fileUrls.push(ans.value.publicUrl);
          }
          if (Array.isArray(ans.value)) {
            for (const item of ans.value) {
              if (item && typeof item.publicUrl === 'string') {
                fileUrls.push(item.publicUrl);
              }
            }
          }
        }
      }

      if (fileUrls.length > 0) {
        await tx.uploadedFile.updateMany({
          where: {
            publicUrl: { in: fileUrls },
          },
          data: {
            submissionId: sub.id,
            formId: form.id,
          },
        });
      }

      return sub;
    });

    await logActivity({
      action: 'SUBMISSION_CREATE',
      category: 'SUBMISSION',
      status: 'SUCCESS',
      formId: form.id,
      formTitle: form.title,
      publicId: form.publicId,
      userId: authenticatedUser?.id,
      userEmail: respondentEmail || authenticatedUser?.email || 'Anonymous Respondent',
      userName: authenticatedUser?.name,
      userRole: authenticatedUser?.role,
      req: request,
      details: {
        submissionId: submission.id,
        answerCount: answers.length,
        isQuiz: form.isQuiz,
        score: form.isQuiz ? { total: totalScore, max: maxScore } : null,
        isGradeReleased,
        summary: `New response received for "${form.title}" (${answers.length} answers)`,
      },
    });

    let quizResult: any = null;
    if (form.isQuiz) {
      if (isImmediate) {
        const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        const passPercentage = form.settings?.quizPassPercentage;
        const hasPassRule = passPercentage !== null && passPercentage !== undefined;
        const isPassed = hasPassRule ? percentage >= Number(passPercentage) : null;
        const customMessage =
          isPassed === true
            ? form.settings?.quizPassMessage
            : isPassed === false
              ? form.settings?.quizFailMessage
              : null;

        const showCorrect = Boolean(form.settings?.quizShowCorrectAnswers);
        const showFeedback = Boolean(form.settings?.quizShowFeedback);
        const showPoints = form.settings?.quizShowPointsEarned !== false;

        const breakdown = gradedAnswers.map((g) => {
          const q = allQuestions.find((item) => item.id === g.questionId);
          const cfg = (q?.quizAnswer as any) || {};
          return {
            questionId: g.questionId,
            questionTitle: q?.title,
            score: showPoints ? g.score : undefined,
            maxPoints: showPoints ? (q?.quizPoints || 0) : undefined,
            isCorrect: g.isCorrect,
            submittedValue: g.value,
            correctAnswer: showCorrect
              ? cfg.correctValues || cfg.correctValue || cfg.acceptedAnswers || (cfg.numberMode ? cfg : null)
              : undefined,
            explanation: showFeedback ? q?.quizExplanation : undefined,
            feedback: showFeedback ? (g.isCorrect ? cfg.correctFeedback : cfg.incorrectFeedback) : undefined,
          };
        });

        quizResult = {
          total: showPoints ? totalScore : undefined,
          max: showPoints ? maxScore : undefined,
          percentage: showPoints ? percentage : undefined,
          isPassed,
          customMessage,
          showPoints,
          showCorrect,
          showFeedback,
          breakdown: showCorrect || showFeedback || showPoints ? breakdown : undefined,
        };
      }
    }

    return NextResponse.json({
      message: (!form.isQuiz || isGradeReleased)
        ? settings?.confirmationMessage || 'Your response has been recorded.'
        : 'Your response has been recorded. Grades will be released after manual review.',
      submissionId: submission.id,
      editToken: settings?.allowResponseEditing ? submission.editToken : undefined,
      allowResponseEditing: Boolean(settings?.allowResponseEditing),
      restrictOneResponse: Boolean(settings?.restrictOneResponse),
      isGradeReleased: form.isQuiz ? isGradeReleased : true,
      score: quizResult,
    });
  } catch (error: any) {
    if (error?.message === 'DUPLICATE_SUBMISSION_DETECTED' || error?.dupCheck) {
      const dup = error?.dupCheck;
      return NextResponse.json(
        {
          error: dup?.message || 'You have already submitted a response for this form.',
          isDuplicate: true,
          canEdit: Boolean(dup?.canEdit),
          editToken: dup?.editToken,
        },
        { status: 409 }
      );
    }
    console.error('Failed to submit form:', error);
    return NextResponse.json({ error: 'Failed to process submission' }, { status: 500 });
  }
}
