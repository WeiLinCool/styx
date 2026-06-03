import { drizzle } from 'drizzle-orm/node-postgres';
import * as dotenv from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { defaultMembershipPlanPermissionCodes } from '@/server/repositories/membership-plan-permissions';
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
  membershipPlanVersionBenefits,
  membershipPlanPermissionBindings,
  membershipPlans,
  membershipPlanVersions,
  membershipPlanVersionPermissionBindings,
  orderEvents,
  orders,
  partnerLeads,
  permissionResources,
  products,
  systemSettings,
  userEntitlements,
  userIdentities,
  users,
} from './schema';

dotenv.config({ path: '.env.local' });
dotenv.config();

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
  proPlanVersion1: '00000000-0000-4000-8000-000000000023',
  teamPlanVersion1: '00000000-0000-4000-8000-000000000024',
  imageBenefit: '00000000-0000-4000-8000-000000000031',
  videoBenefit: '00000000-0000-4000-8000-000000000032',
  proPlanVersionImageBenefit: '00000000-0000-4000-8000-000000000033',
  teamPlanVersionVideoBenefit: '00000000-0000-4000-8000-000000000034',
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
  aiModelFreeImage: '00000000-0000-4000-8000-000000000124',
  aiModelProImage: '00000000-0000-4000-8000-000000000125',
  aiModelFreeVideo: '00000000-0000-4000-8000-000000000130',
  aiModelProVideo: '00000000-0000-4000-8000-000000000131',
  aiModelFreeRequirement: '00000000-0000-4000-8000-000000000126',
  aiModelProRequirement: '00000000-0000-4000-8000-000000000127',
  aiModelFreeImageRequirement: '00000000-0000-4000-8000-000000000128',
  aiModelProImageRequirement: '00000000-0000-4000-8000-000000000129',
  aiModelFreeVideoRequirement: '00000000-0000-4000-8000-000000000132',
  aiModelProVideoRequirement: '00000000-0000-4000-8000-000000000133',
  permissionResourceUserCenterPage: '00000000-0000-4000-8000-000000000141',
  permissionResourceUserCenterCopyInvite: '00000000-0000-4000-8000-000000000142',
  membershipPlanPermissionBindingUserCenterPage: '00000000-0000-4000-8000-000000000151',
  membershipPlanPermissionBindingUserCenterCopyInvite: '00000000-0000-4000-8000-000000000152',
  membershipPlanPermissionBindingTeamUserCenterPage: '00000000-0000-4000-8000-000000000153',
  proPlanVersionPermissionBindingUserCenterPage: '00000000-0000-4000-8000-000000000154',
  proPlanVersionPermissionBindingUserCenterCopyInvite: '00000000-0000-4000-8000-000000000155',
  teamPlanVersionPermissionBindingUserCenterPage: '00000000-0000-4000-8000-000000000156',
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
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        billingPeriod: sql`excluded.billing_period`,
        priceCents: sql`excluded.price_cents`,
        isActive: true,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: new Date(),
      },
    });

  const publishedAt = new Date('2026-01-01T00:00:00.000Z');

  await db
    .insert(membershipPlanVersions)
    .values([
      {
        id: ids.proPlanVersion1,
        planId: ids.proPlan,
        versionNumber: 1,
        status: 'published',
        effectiveFrom: publishedAt,
        publishedAt,
        displayName: 'Pro Monthly',
        description: 'Representative paid creator plan.',
        billingPeriod: 'month',
        priceCents: 9900,
        currency: 'CNY',
        metadata: { seed: true },
      },
      {
        id: ids.teamPlanVersion1,
        planId: ids.teamPlan,
        versionNumber: 1,
        status: 'published',
        effectiveFrom: publishedAt,
        publishedAt,
        displayName: 'Team Yearly',
        description: 'Representative team collaboration plan.',
        billingPeriod: 'year',
        priceCents: 99900,
        currency: 'CNY',
        metadata: { seed: true },
      },
    ])
    .onConflictDoUpdate({
      target: membershipPlanVersions.id,
      set: {
        status: sql`excluded.status`,
        effectiveFrom: sql`excluded.effective_from`,
        publishedAt: sql`excluded.published_at`,
        displayName: sql`excluded.display_name`,
        description: sql`excluded.description`,
        billingPeriod: sql`excluded.billing_period`,
        priceCents: sql`excluded.price_cents`,
        currency: sql`excluded.currency`,
        metadata: sql`excluded.metadata`,
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
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        quantity: sql`excluded.quantity`,
        unit: sql`excluded.unit`,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(membershipPlanVersionBenefits)
    .values([
      {
        id: ids.proPlanVersionImageBenefit,
        versionId: ids.proPlanVersion1,
        code: 'image-credits',
        name: 'Image generation credits',
        kind: 'quota',
        quantity: 500,
        unit: 'credit',
        metadata: { seed: true },
      },
      {
        id: ids.teamPlanVersionVideoBenefit,
        versionId: ids.teamPlanVersion1,
        code: 'video-minutes',
        name: 'Video generation minutes',
        kind: 'quota',
        quantity: 120,
        unit: 'minute',
        metadata: { seed: true },
      },
    ])
    .onConflictDoUpdate({
      target: membershipPlanVersionBenefits.id,
      set: {
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        quantity: sql`excluded.quantity`,
        unit: sql`excluded.unit`,
        metadata: sql`excluded.metadata`,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(userEntitlements)
    .values({
      id: ids.entitlement,
      userId: ids.memberUser,
      planId: ids.proPlan,
      planVersionId: ids.proPlanVersion1,
      benefitId: ids.imageBenefit,
      source: 'membership',
      remainingQuantity: 500,
      metadata: { seed: true },
    })
    .onConflictDoUpdate({
      target: userEntitlements.id,
      set: {
        planId: ids.proPlan,
        planVersionId: ids.proPlanVersion1,
        benefitId: ids.imageBenefit,
        remainingQuantity: 500,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(permissionResources)
    .values([
      {
        id: ids.permissionResourceUserCenterPage,
        code: 'page.user_center',
        name: '用户中心页面',
        resourceType: 'page',
        module: 'user-center',
        description: '允许访问用户中心页面。',
        routePattern: '/user-center',
        metadata: { seed: true, dependsOn: [], recommendedWith: [] },
      },
      {
        id: ids.permissionResourceUserCenterCopyInvite,
        code: 'action.user_center.copy_invite_code',
        name: '复制邀请码按钮',
        resourceType: 'action',
        module: 'user-center',
        description: '允许在用户中心复制邀请码。',
        actionKey: 'copy_invite_code',
        metadata: {
          seed: true,
          dependsOn: ['page.user_center'],
          recommendedWith: [],
        },
      },
    ])
    .onConflictDoUpdate({
      target: permissionResources.id,
      set: {
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        resourceType: sql`excluded.resource_type`,
        module: sql`excluded.module`,
        description: sql`excluded.description`,
        routePattern: sql`excluded.route_pattern`,
        actionKey: sql`excluded.action_key`,
        isActive: true,
        metadata: sql`excluded.metadata`,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(membershipPlanPermissionBindings)
    .values([
      ...defaultMembershipPlanPermissionCodes['pro-monthly'].map((code) => ({
        id:
          code === 'page.user_center'
            ? ids.membershipPlanPermissionBindingUserCenterPage
            : ids.membershipPlanPermissionBindingUserCenterCopyInvite,
        planId: ids.proPlan,
        permissionResourceId:
          code === 'page.user_center'
            ? ids.permissionResourceUserCenterPage
            : ids.permissionResourceUserCenterCopyInvite,
      })),
      ...defaultMembershipPlanPermissionCodes['team-yearly'].map((code) => ({
        id: ids.membershipPlanPermissionBindingTeamUserCenterPage,
        planId: ids.teamPlan,
        permissionResourceId:
          code === 'page.user_center'
            ? ids.permissionResourceUserCenterPage
            : ids.permissionResourceUserCenterCopyInvite,
      })),
    ])
    .onConflictDoNothing();

  await db
    .insert(membershipPlanVersionPermissionBindings)
    .values([
      ...defaultMembershipPlanPermissionCodes['pro-monthly'].map((code) => ({
        id:
          code === 'page.user_center'
            ? ids.proPlanVersionPermissionBindingUserCenterPage
            : ids.proPlanVersionPermissionBindingUserCenterCopyInvite,
        versionId: ids.proPlanVersion1,
        permissionResourceId:
          code === 'page.user_center'
            ? ids.permissionResourceUserCenterPage
            : ids.permissionResourceUserCenterCopyInvite,
      })),
      ...defaultMembershipPlanPermissionCodes['team-yearly'].map((code) => ({
        id: ids.teamPlanVersionPermissionBindingUserCenterPage,
        versionId: ids.teamPlanVersion1,
        permissionResourceId:
          code === 'page.user_center'
            ? ids.permissionResourceUserCenterPage
            : ids.permissionResourceUserCenterCopyInvite,
      })),
    ])
    .onConflictDoNothing();

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
        metadata: {
          seed: true,
          billingRules: {
            chat: {
              mode: 'token_breakdown',
              inputCreditsPer1k: 1,
              cachedInputCreditsPer1k: 0,
              cacheMissInputCreditsPer1k: 1,
              outputCreditsPer1k: 2,
              minimumCredits: 1,
            },
            image: {
              mode: 'fixed',
              fixedCredits: 1,
              minimumCredits: 1,
            },
            video: {
              mode: 'provider_usage_tokens',
              tokenCreditsPer1k: 1,
              minimumCredits: 3,
            },
          },
        },
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

  const seedAiModels: (typeof aiModels.$inferInsert)[] = [
    {
        id: ids.aiModelFree,
        providerId: developmentProvider.id,
        code: 'dev-free-chat',
        name: 'Development Free Chat',
        model: 'development-free-chat',
        status: 'enabled',
        supportsChat: true,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultChat: true,
        isDefaultImage: false,
        isDefaultVideo: false,
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
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultChat: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        sortOrder: 20,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 2,
          completionCreditsPer1k: 4,
          minimumCredits: 2,
        },
        metadata: { seed: true },
      },
      {
        id: ids.aiModelFreeImage,
        providerId: developmentProvider.id,
        code: 'dev-free-image',
        name: 'Development Free Image',
        model: 'development-free-image',
        status: 'enabled',
        supportsChat: false,
        supportsImageGeneration: true,
        supportsImageEdit: true,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultChat: false,
        isDefaultImage: true,
        isDefaultVideo: false,
        sortOrder: 30,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 1,
          completionCreditsPer1k: 0,
          minimumCredits: 1,
        },
        metadata: { seed: true },
      },
      {
        id: ids.aiModelProImage,
        providerId: developmentProvider.id,
        code: 'dev-pro-image',
        name: 'Development Pro Image',
        model: 'development-pro-image',
        status: 'enabled',
        supportsChat: false,
        supportsImageGeneration: true,
        supportsImageEdit: true,
        supportsImageUpscale: true,
        supportsVideoGeneration: false,
        isDefaultChat: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        sortOrder: 40,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 4,
          completionCreditsPer1k: 0,
          minimumCredits: 4,
        },
        metadata: { seed: true },
      },
      {
        id: ids.aiModelFreeVideo,
        providerId: developmentProvider.id,
        code: 'dev-free-video',
        name: 'Development Free Video',
        model: 'development-free-video',
        status: 'enabled',
        supportsChat: false,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: true,
        isDefaultChat: false,
        isDefaultImage: false,
        isDefaultVideo: true,
        sortOrder: 50,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 0,
          completionCreditsPer1k: 1,
          minimumCredits: 3,
        },
        metadata: { seed: true },
      },
      {
        id: ids.aiModelProVideo,
        providerId: developmentProvider.id,
        code: 'dev-pro-video',
        name: 'Development Pro Video',
        model: 'development-pro-video',
        status: 'enabled',
        supportsChat: false,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: true,
        isDefaultChat: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        sortOrder: 60,
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 0,
          completionCreditsPer1k: 2,
          minimumCredits: 8,
        },
        metadata: { seed: true },
      },
    ];

  for (const model of seedAiModels) {
    await db
      .insert(aiModels)
      .values(model)
      .onConflictDoUpdate({
        target: aiModels.id,
        set: {
          providerId: developmentProvider.id,
          code: model.code,
          name: model.name,
          model: model.model,
          status: model.status,
          supportsChat: model.supportsChat,
          supportsImageGeneration: model.supportsImageGeneration,
          supportsImageEdit: model.supportsImageEdit,
          supportsImageUpscale: model.supportsImageUpscale,
          supportsVideoGeneration: model.supportsVideoGeneration,
          isDefaultChat: model.isDefaultChat,
          isDefaultImage: model.isDefaultImage,
          isDefaultVideo: model.isDefaultVideo,
          sortOrder: model.sortOrder,
          pricing: model.pricing,
          metadata: model.metadata,
          updatedAt: new Date(),
        },
      });
  }

  const seededModels = await db
    .select({ id: aiModels.id, code: aiModels.code })
    .from(aiModels)
    .where(sql`${aiModels.code} in ('dev-free-chat', 'dev-pro-chat', 'dev-free-image', 'dev-pro-image', 'dev-free-video', 'dev-pro-video')`);
  const freeModel = seededModels.find((model) => model.code === 'dev-free-chat');
  const proModel = seededModels.find((model) => model.code === 'dev-pro-chat');
  const freeImageModel = seededModels.find((model) => model.code === 'dev-free-image');
  const proImageModel = seededModels.find((model) => model.code === 'dev-pro-image');
  const freeVideoModel = seededModels.find((model) => model.code === 'dev-free-video');
  const proVideoModel = seededModels.find((model) => model.code === 'dev-pro-video');

  if (!freeModel || !proModel || !freeImageModel || !proImageModel || !freeVideoModel || !proVideoModel) {
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
      ),
      (
        ${ids.aiModelFreeImageRequirement},
        ${freeImageModel.id},
        'none',
        null,
        'Free'
      ),
      (
        ${ids.aiModelProImageRequirement},
        ${proImageModel.id},
        'membership_plan',
        'pro-monthly',
        'Pro'
      ),
      (
        ${ids.aiModelFreeVideoRequirement},
        ${freeVideoModel.id},
        'none',
        null,
        'Free'
      ),
      (
        ${ids.aiModelProVideoRequirement},
        ${proVideoModel.id},
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
