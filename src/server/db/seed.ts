import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  adminRoles,
  activationTokens,
  aiModelEntitlementRequirements,
  aiModels,
  aiProviders,
  aiJobs,
  auditEvents,
  benefits,
  contentAssets,
  membershipPlans,
  orderEvents,
  orders,
  partnerLeads,
  products,
  systemSettings,
  userEntitlements,
  userIdentities,
  users,
} from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to seed the database.');
  process.exit(1);
}

const ids = {
  adminUser: '00000000-0000-4000-8000-000000000001',
  memberUser: '00000000-0000-4000-8000-000000000002',
  superUser: '00000000-0000-4000-8000-000000000004',
  adminEmailIdentity: '00000000-0000-4000-8000-000000000011',
  memberEmailIdentity: '00000000-0000-4000-8000-000000000012',
  activationToken: '00000000-0000-4000-8000-000000000013',
  proPlan: '00000000-0000-4000-8000-000000000021',
  teamPlan: '00000000-0000-4000-8000-000000000022',
  imageBenefit: '00000000-0000-4000-8000-000000000031',
  videoBenefit: '00000000-0000-4000-8000-000000000032',
  entitlement: '00000000-0000-4000-8000-000000000041',
  product: '00000000-0000-4000-8000-000000000051',
  order: '00000000-0000-4000-8000-000000000061',
  orderEvent: '00000000-0000-4000-8000-000000000071',
  aiJob: '00000000-0000-4000-8000-000000000081',
  partnerLead: '00000000-0000-4000-8000-000000000091',
  contentAsset: '00000000-0000-4000-8000-000000000101',
  auditEvent: '00000000-0000-4000-8000-000000000111',
  aiProviderDevelopment: '00000000-0000-4000-8000-000000000121',
  aiModelFree: '00000000-0000-4000-8000-000000000122',
  aiModelPro: '00000000-0000-4000-8000-000000000123',
  aiModelFreeRequirement: '00000000-0000-4000-8000-000000000124',
  aiModelProRequirement: '00000000-0000-4000-8000-000000000125',
};

async function main() {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
  const [existingSuperUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, '18120810787'))
    .limit(1);

  const superUserId = existingSuperUser?.id ?? ids.superUser;

  await db
    .insert(users)
    .values([
      {
        id: ids.adminUser,
        email: 'admin@styx.local',
        displayName: 'Styx Admin',
        accountState: 'active',
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { seed: true },
      },
      {
        id: ids.memberUser,
        email: 'member@styx.local',
        displayName: 'Seed Member',
        accountState: 'active',
        activatedAt: new Date('2026-01-02T00:00:00.000Z'),
        metadata: { seed: true },
      },
      {
        id: superUserId,
        phone: '18120810787',
        displayName: 'Super Owner',
        accountState: 'active',
        activatedAt: new Date('2026-01-06T00:00:00.000Z'),
        metadata: { seed: true, superuser: true },
      },
    ])
    .onConflictDoUpdate({
      target: users.id,
      set: {
        accountState: 'active',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(userIdentities)
    .values([
      {
        id: ids.adminEmailIdentity,
        userId: ids.adminUser,
        provider: 'email',
        providerSubject: 'admin@styx.local',
        label: 'admin@styx.local',
        isVerified: true,
        verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: ids.memberEmailIdentity,
        userId: ids.memberUser,
        provider: 'email',
        providerSubject: 'member@styx.local',
        label: 'member@styx.local',
        isVerified: true,
        verifiedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ])
    .onConflictDoUpdate({
      target: userIdentities.id,
      set: {
        isVerified: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(adminRoles)
    .values([
      {
        userId: ids.adminUser,
        role: 'owner',
        grantedByUserId: ids.adminUser,
      },
      {
        userId: superUserId,
        role: 'owner',
        grantedByUserId: ids.adminUser,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(activationTokens)
    .values({
      id: ids.activationToken,
      userId: ids.memberUser,
      identityId: ids.memberEmailIdentity,
      purpose: 'identity_binding',
      tokenHash: 'seed-activation-token-hash',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      consumedAt: new Date('2026-01-02T00:00:00.000Z'),
    })
    .onConflictDoNothing();

  await db
    .insert(membershipPlans)
    .values([
      {
        id: ids.proPlan,
        code: 'pro-monthly',
        name: 'Pro Monthly',
        description: 'Representative paid creator plan.',
        billingPeriod: 'month',
        priceCents: 9900,
        sortOrder: 10,
      },
      {
        id: ids.teamPlan,
        code: 'team-yearly',
        name: 'Team Yearly',
        description: 'Representative team collaboration plan.',
        billingPeriod: 'year',
        priceCents: 99900,
        sortOrder: 20,
      },
    ])
    .onConflictDoUpdate({
      target: membershipPlans.id,
      set: {
        isActive: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(benefits)
    .values([
      {
        id: ids.imageBenefit,
        planId: ids.proPlan,
        code: 'image-credits',
        name: 'Image generation credits',
        kind: 'quota',
        quantity: 500,
        unit: 'credit',
      },
      {
        id: ids.videoBenefit,
        planId: ids.teamPlan,
        code: 'video-minutes',
        name: 'Video generation minutes',
        kind: 'quota',
        quantity: 120,
        unit: 'minute',
      },
    ])
    .onConflictDoUpdate({
      target: benefits.id,
      set: {
        updatedAt: new Date(),
      },
    });

  await db
    .insert(userEntitlements)
    .values({
      id: ids.entitlement,
      userId: ids.memberUser,
      planId: ids.proPlan,
      benefitId: ids.imageBenefit,
      source: 'membership',
      remainingQuantity: 500,
      metadata: { seed: true },
    })
    .onConflictDoUpdate({
      target: userEntitlements.id,
      set: {
        remainingQuantity: 500,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(aiProviders)
    .values({
      id: ids.aiProviderDevelopment,
      code: 'development',
      name: 'Development Provider',
      providerType: 'development',
      status: 'enabled',
      metadata: { seed: true },
    })
    .onConflictDoUpdate({
      target: aiProviders.code,
      set: {
        name: 'Development Provider',
        providerType: 'development',
        status: 'enabled',
        baseUrl: null,
        credentialEnvKey: null,
        metadata: { seed: true },
        updatedAt: new Date(),
      },
    });

  const [developmentProvider] = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(eq(aiProviders.code, 'development'))
    .limit(1);

  if (!developmentProvider) {
    throw new Error('Development AI provider seed row was not created.');
  }

  await db
    .insert(aiModels)
    .values([
      {
        id: ids.aiModelFree,
        providerId: developmentProvider.id,
        code: 'dev-free-chat',
        name: 'Development Free Chat',
        model: 'development-free-chat',
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: true,
        sortOrder: 10,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 1,
          completionCreditsPer1k: 2,
          minimumCredits: 1,
        },
        metadata: { seed: true },
      },
      {
        id: ids.aiModelPro,
        providerId: developmentProvider.id,
        code: 'dev-pro-chat',
        name: 'Development Pro Chat',
        model: 'development-pro-chat',
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: false,
        sortOrder: 20,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 2,
          completionCreditsPer1k: 4,
          minimumCredits: 2,
        },
        metadata: { seed: true },
      },
    ])
    .onConflictDoUpdate({
      target: aiModels.code,
      set: {
        providerId: developmentProvider.id,
        name: sql.raw(`excluded.name`),
        model: sql.raw(`excluded.model`),
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: sql.raw(`excluded.is_default_chat`),
        sortOrder: sql.raw(`excluded.sort_order`),
        pricing: sql.raw(`excluded.pricing`),
        metadata: sql.raw(`excluded.metadata`),
        updatedAt: new Date(),
      },
    });

  const seededModels = await db
    .select({ id: aiModels.id, code: aiModels.code })
    .from(aiModels)
    .where(sql`${aiModels.code} in ('dev-free-chat', 'dev-pro-chat')`);
  const freeModel = seededModels.find((model) => model.code === 'dev-free-chat');
  const proModel = seededModels.find((model) => model.code === 'dev-pro-chat');

  if (!freeModel || !proModel) {
    throw new Error('Development AI model seed rows were not created.');
  }

  await db.execute(sql`
    insert into ${aiModelEntitlementRequirements} (
      id,
      model_id,
      requirement_type,
      requirement_value,
      label
    )
    values
      (
        ${ids.aiModelFreeRequirement},
        ${freeModel.id},
        'none',
        null,
        'Free'
      ),
      (
        ${ids.aiModelProRequirement},
        ${proModel.id},
        'membership_plan',
        'pro-monthly',
        'Pro'
      )
    on conflict (
      model_id,
      requirement_type,
      (coalesce(requirement_value, ''))
    )
    do update set label = excluded.label
  `);

  await db
    .insert(products)
    .values({
      id: ids.product,
      sku: 'credit-pack-100',
      name: '100 Credit Pack',
      description: 'One-time AI generation credit pack.',
      status: 'active',
      priceCents: 2900,
      inventoryQuantity: null,
    })
    .onConflictDoUpdate({
      target: products.id,
      set: {
        status: 'active',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(orders)
    .values({
      id: ids.order,
      orderNumber: 'SEED-ORDER-0001',
      userId: ids.memberUser,
      productId: ids.product,
      status: 'paid',
      subtotalCents: 2900,
      discountCents: 0,
      totalCents: 2900,
      paidAt: new Date('2026-01-03T00:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: orders.id,
      set: {
        status: 'paid',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(orderEvents)
    .values({
      id: ids.orderEvent,
      orderId: ids.order,
      type: 'paid',
      actorUserId: ids.memberUser,
      message: 'Seed order paid.',
    })
    .onConflictDoNothing();

  await db
    .insert(aiJobs)
    .values({
      id: ids.aiJob,
      userId: ids.memberUser,
      type: 'image',
      status: 'succeeded',
      provider: 'seed',
      model: 'seed-image-model',
      prompt: 'A clean product hero image',
      input: { size: '1024x1024' },
      output: { assetUrl: '/seed/image.png' },
      startedAt: new Date('2026-01-04T00:00:00.000Z'),
      completedAt: new Date('2026-01-04T00:00:10.000Z'),
    })
    .onConflictDoUpdate({
      target: aiJobs.id,
      set: {
        status: 'succeeded',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(partnerLeads)
    .values({
      id: ids.partnerLead,
      companyName: 'Seed Partner Co.',
      contactName: 'Seed Contact',
      contactEmail: 'partner@styx.local',
      status: 'qualified',
      source: 'seed',
      ownerUserId: ids.adminUser,
      notes: 'Representative partner lead for admin views.',
    })
    .onConflictDoUpdate({
      target: partnerLeads.id,
      set: {
        status: 'qualified',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(contentAssets)
    .values({
      id: ids.contentAsset,
      slug: 'home-hero',
      title: 'Home Hero',
      kind: 'page',
      status: 'published',
      body: 'Seed content asset for the landing page.',
      createdByUserId: ids.adminUser,
      publishedAt: new Date('2026-01-05T00:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: contentAssets.id,
      set: {
        status: 'published',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(systemSettings)
    .values({
      key: 'site.general',
      value: { name: 'Styx', maintenance: false },
      description: 'General site settings.',
      updatedByUserId: ids.adminUser,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: { name: 'Styx', maintenance: false },
        updatedAt: new Date(),
        updatedByUserId: ids.adminUser,
      },
    });

  await db
    .insert(auditEvents)
    .values({
      id: ids.auditEvent,
      actorUserId: ids.adminUser,
      targetUserId: ids.memberUser,
      action: 'seed.database',
      entityType: 'system',
      entityId: 'seed',
      metadata: { seed: true },
    })
    .onConflictDoNothing();

  console.log('Database seed completed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
