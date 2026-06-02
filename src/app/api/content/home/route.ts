import { NextResponse } from 'next/server';

import { getPublicHomepageContent } from '@/server/repositories/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const content = await getPublicHomepageContent();
  return NextResponse.json({ content });
}
