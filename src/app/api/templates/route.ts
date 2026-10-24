import { NextResponse } from 'next/server';
import { FORM_TEMPLATES } from '@/lib/templates/seedTemplates';

export async function GET() {
  const templates = FORM_TEMPLATES.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    isQuiz: t.isQuiz,
    theme: t.theme,
    questionCount: t.sections.reduce((acc, s) => acc + s.questions.length, 0),
  }));

  return NextResponse.json({ templates });
}
