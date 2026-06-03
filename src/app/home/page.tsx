import { HomePageClient } from '@/features/public/home-page';
import { listUserPermissionCodes } from '@/server/auth/permission-service';
import { resolveSession } from '@/server/auth/session';
import { getPublicHomepageContent } from '@/server/repositories/content';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [content, session] = await Promise.all([getPublicHomepageContent(), resolveSession()]);
  const permissionCodes =
    session.authenticated ? await listUserPermissionCodes(session.user.id) : [];

  return <HomePageClient content={content} permissionCodes={permissionCodes} />;
}
