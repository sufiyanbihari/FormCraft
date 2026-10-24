import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { getUserFormRole, canViewResponses } from '@/lib/auth/rbac';

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

    if (!canViewResponses(role) && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const [form, submissions] = await Promise.all([
      prisma.form.findUnique({
        where: { id },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
                include: { options: true },
              },
            },
          },
        },
      }),
      prisma.formSubmission.findMany({
        where: { formId: id },
        include: {
          answers: true,
        },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const totalSubmissions = submissions.length;

    // Timeline data: submissions grouped by date (YYYY-MM-DD)
    const timelineMap: Record<string, number> = {};
    submissions.forEach((sub) => {
      const dateKey = sub.submittedAt.toISOString().split('T')[0];
      timelineMap[dateKey] = (timelineMap[dateKey] || 0) + 1;
    });

    const timeline = Object.entries(timelineMap).map(([date, count]) => ({
      date,
      count,
    }));

    // Average score calculation if quiz
    let avgScore = 0;
    let maxQuizScore = 0;
    if (form.isQuiz && totalSubmissions > 0) {
      const scored = submissions.filter((s) => s.totalScore !== null);
      if (scored.length > 0) {
        const sum = scored.reduce((acc, s) => acc + (s.totalScore || 0), 0);
        avgScore = Math.round((sum / scored.length) * 10) / 10;
        maxQuizScore = scored[0].maxScore || 10;
      }
    }

    // Question-level metrics
    const allQuestions = form.sections.flatMap((s) => s.questions);
    const questionAnalytics = allQuestions.map((q) => {
      const answersForQuestion = submissions.flatMap((s) =>
        s.answers.filter((a) => a.questionId === q.id)
      );

      const answeredCount = answersForQuestion.length;

      // Multiple choice, dropdown, or single select
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'DROPDOWN') {
        const counts: Record<string, number> = {};
        q.options.forEach((opt) => {
          counts[opt.label] = 0;
        });

        answersForQuestion.forEach((ans) => {
          const val = typeof ans.value === 'string' ? ans.value : String(ans.value || '');
          if (val) {
            counts[val] = (counts[val] || 0) + 1;
          }
        });

        // If there are custom "Other: ..." answers with counts, remove redundant 0-count placeholder option
        const hasCustomOther = Object.keys(counts).some(
          (k) => (k.startsWith('Other: ') || k.startsWith('other: ')) && counts[k] > 0
        );
        if (hasCustomOther) {
          ['Other...', 'Other', 'other...', 'other'].forEach((lbl) => {
            if (counts[lbl] === 0) delete counts[lbl];
          });
        }

        const distribution = Object.entries(counts).map(([name, count]) => ({
          name,
          count,
          percentage: answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0,
        }));

        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          answeredCount,
          distribution,
        };
      }

      // Checkboxes (multiple select)
      if (q.type === 'CHECKBOXES') {
        const counts: Record<string, number> = {};
        q.options.forEach((opt) => {
          counts[opt.label] = 0;
        });

        answersForQuestion.forEach((ans) => {
          const selected = Array.isArray(ans.value) ? ans.value : [ans.value];
          selected.forEach((item) => {
            if (typeof item === 'string' && item) {
              counts[item] = (counts[item] || 0) + 1;
            }
          });
        });

        // If there are custom "Other: ..." answers with counts, remove redundant 0-count placeholder option
        const hasCustomOther = Object.keys(counts).some(
          (k) => (k.startsWith('Other: ') || k.startsWith('other: ')) && counts[k] > 0
        );
        if (hasCustomOther) {
          ['Other...', 'Other', 'other...', 'other'].forEach((lbl) => {
            if (counts[lbl] === 0) delete counts[lbl];
          });
        }

        const distribution = Object.entries(counts).map(([name, count]) => ({
          name,
          count,
          percentage: answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0,
        }));

        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          answeredCount,
          distribution,
        };
      }

      // Rating or Linear Scale
      if (q.type === 'LINEAR_SCALE' || q.type === 'RATING' || q.type === 'NUMBER') {
        const numericValues = answersForQuestion
          .map((a) => Number(a.value))
          .filter((n) => !isNaN(n));

        const avg =
          numericValues.length > 0
            ? Math.round(
                (numericValues.reduce((acc, curr) => acc + curr, 0) / numericValues.length) * 10
              ) / 10
            : 0;

        const counts: Record<string, number> = {};
        numericValues.forEach((val) => {
          const key = String(val);
          counts[key] = (counts[key] || 0) + 1;
        });

        const distribution = Object.entries(counts)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([name, count]) => ({
            name: `${name}`,
            count,
          }));

        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          answeredCount,
          average: avg,
          distribution,
        };
      }

      // Text answers: return latest 10 responses
      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        answeredCount,
        recentAnswers: answersForQuestion
          .slice(-15)
          .reverse()
          .map((a) => (typeof a.value === 'string' ? a.value : JSON.stringify(a.value))),
      };
    });

    return NextResponse.json({
      summary: {
        totalSubmissions,
        isQuiz: form.isQuiz,
        avgScore,
        maxQuizScore,
      },
      timeline,
      questionAnalytics,
    });
  } catch (error) {
    console.error('Failed to get analytics:', error);
    return NextResponse.json({ error: 'Failed to retrieve analytics' }, { status: 500 });
  }
}
