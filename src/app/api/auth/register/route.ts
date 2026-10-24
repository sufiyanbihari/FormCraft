import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Account registration is disabled. Please sign in with your administrator account.' },
    { status: 403 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'Account registration is disabled.' },
    { status: 403 }
  );
}
