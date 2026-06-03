import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect(
    'https://github.com/SUAS-STEM/.gcs/releases/download/dev/ssgcs.exe',
    { status: 302 }
  );
}
