import { HomePageClient } from '@/features/public/home-page';
import { getPublicHomepageContent } from '@/server/repositories/content';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const content = await getPublicHomepageContent();
  return <HomePageClient content={content} />;
}
