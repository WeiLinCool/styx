import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import {
  getAdminPermissionResourceOverview,
  syncPermissionResourcesFromCatalog,
} from '@/server/repositories/permission-resources';

export async function GET() {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();

    return NextResponse.json(await getAdminPermissionResourceOverview(), { status: 200 });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
