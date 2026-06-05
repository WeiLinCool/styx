import {
  bigint,
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { DOC_BLOCK_TYPES } from '@/server/docs/constants';

export const userAccountState = pgEnum('user_account_state', [
  'pending_activation',
  'active',
  'suspended',
  'archived',
]);

export const identityProvider = pgEnum('identity_provider', [
  'email',
  'phone',
  'github',
  'google',
  'wechat',
]);

export const activationTokenPurpose = pgEnum('activation_token_purpose', [
  'account_activation',
  'identity_binding',
  'password_reset',
]);

export const activationWorkOrderStatus = pgEnum('activation_work_order_status', [
  'pending',
  'processing',
  'closed',
  'archived',
]);

export const passwordResetWorkOrderStatus = pgEnum('password_reset_work_order_status', [
  'pending',
  'processing',
  'closed',
  'archived',
]);

export const subscriptionWorkOrderStatus = pgEnum('subscription_work_order_status', [
  'pending',
  'processing',
  'closed',
  'archived',
]);

export const subscriptionWorkOrderResult = pgEnum('subscription_work_order_result', [
  'approved',
  'rejected',
]);

export const adminRole = pgEnum('admin_role', [
  'owner',
  'admin',
  'operator',
  'support',
  'auditor',
]);

export const planBillingPeriod = pgEnum('plan_billing_period', [
  'month',
  'year',
  'one_time',
]);

export const benefitKind = pgEnum('benefit_kind', [
  'quota',
  'feature',
  'discount',
  'support',
]);

export const membershipPlanVersionStatus = pgEnum('membership_plan_version_status', [
  'draft',
  'scheduled',
  'published',
  'archived',
]);

export const entitlementSource = pgEnum('entitlement_source', [
  'membership',
  'order',
  'manual',
  'promotion',
]);

export const productStatus = pgEnum('product_status', [
  'draft',
  'active',
  'archived',
]);

export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
]);

export const orderEventType = pgEnum('order_event_type', [
  'created',
  'payment_authorized',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
  'note',
]);

export const aiJobType = pgEnum('ai_job_type', [
  'chat',
  'image',
  'video',
  'workflow',
]);

export const aiJobStatus = pgEnum('ai_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const agentCapabilityKind = pgEnum('agent_capability_kind', [
  'model',
  'skill',
  'mcp_server',
  'plugin',
]);

export const agentCapabilityStatus = pgEnum('agent_capability_status', [
  'enabled',
  'disabled',
  'archived',
]);

export const agentRunStatus = pgEnum('agent_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const aiProviderStatus = pgEnum('ai_provider_status', [
  'enabled',
  'disabled',
  'archived',
]);

export const aiProviderType = pgEnum('ai_provider_type', [
  'openai_compatible',
  'development',
]);

export const aiModelStatus = pgEnum('ai_model_status', [
  'enabled',
  'disabled',
  'archived',
]);

export const aiModelExecutionProtocol = pgEnum('ai_model_execution_protocol', [
  'chat_openai_compatible',
  'image_openai_compatible',
  'video_task_polling',
]);

export const aiModelEntitlementRequirementType = pgEnum(
  'ai_model_entitlement_requirement_type',
  ['none', 'membership_plan', 'benefit_code', 'user_grant'],
);

export const creditLedgerEntryType = pgEnum('credit_ledger_entry_type', [
  'grant',
  'debit',
  'adjustment',
]);

export const userInviteCodeStatus = pgEnum('user_invite_code_status', [
  'active',
  'disabled',
]);

export const referralConversionTrigger = pgEnum('referral_conversion_trigger', [
  'order_paid',
  'membership_activated',
]);

export const agentArtifactKind = pgEnum('agent_artifact_kind', [
  'text',
  'image',
  'video',
  'document',
  'workflow',
  'json',
]);

export const partnerLeadStatus = pgEnum('partner_lead_status', [
  'new',
  'contacted',
  'qualified',
  'converted',
  'closed',
]);

export const contentAssetKind = pgEnum('content_asset_kind', [
  'image',
  'video',
  'document',
  'page',
  'prompt',
]);

export const contentAssetStatus = pgEnum('content_asset_status', [
  'draft',
  'published',
  'archived',
]);

export const permissionResourceType = pgEnum('permission_resource_type', [
  'menu',
  'page',
  'action',
  'api',
]);

export const generatedMediaAssetStatus = pgEnum('generated_media_asset_status', [
  'ready',
  'deleted',
]);

export const mediaAssetSourceType = pgEnum('media_asset_source_type', [
  'ai_generated',
  'user_uploaded',
]);

export const mediaAssetShareStatus = pgEnum('media_asset_share_status', [
  'disabled',
  'active',
]);

export const requestIdempotencyActorType = pgEnum('request_idempotency_actor_type', [
  'anonymous',
  'user',
  'admin',
]);

export const requestIdempotencyStatus = pgEnum('request_idempotency_status', [
  'processing',
  'completed',
  'failed',
]);

export const docAudienceScope = pgEnum('doc_audience_scope', ['user', 'admin', 'shared']);

export const docArticleStatus = pgEnum('doc_article_status', ['draft', 'published', 'archived']);

export const docArticleBlockType = pgEnum('doc_article_block_type', DOC_BLOCK_TYPES);

export const docImportStatus = pgEnum('doc_import_status', ['parsed', 'failed', 'imported']);

const id = uuid('id').primaryKey().defaultRandom();
const now = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id,
    email: text('email'),
    phone: text('phone'),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    accountState: userAccountState('account_state')
      .notNull()
      .default('pending_activation'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }).notNull().default(0),
    storageUsedBytes: bigint('storage_used_bytes', { mode: 'number' }).notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('users_account_state_idx').on(table.accountState),
    check('users_storage_quota_bytes_non_negative', sql`${table.storageQuotaBytes} >= 0`),
    check('users_storage_used_bytes_non_negative', sql`${table.storageUsedBytes} >= 0`),
    uniqueIndex('users_email_unique_idx')
      .on(table.email)
      .where(sql`${table.email} is not null`),
    uniqueIndex('users_phone_unique_idx')
      .on(table.phone)
      .where(sql`${table.phone} is not null`),
  ],
);

export const docCategories = pgTable(
  'doc_categories',
  {
    id,
    parentId: uuid('parent_id').references((): AnyPgColumn => docCategories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    audienceScope: docAudienceScope('audience_scope').notNull().default('shared'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('doc_categories_slug_idx').on(table.slug),
    index('doc_categories_audience_sort_idx').on(table.audienceScope, table.sortOrder),
  ],
);

export const docArticles = pgTable(
  'doc_articles',
  {
    id,
    categoryId: uuid('category_id')
      .notNull()
      .references(() => docCategories.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').notNull().default(''),
    coverImage: text('cover_image'),
    status: docArticleStatus('status').notNull().default('draft'),
    searchText: text('search_text').notNull().default(''),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('doc_articles_category_slug_idx').on(table.categoryId, table.slug),
    index('doc_articles_status_updated_idx').on(table.status, table.updatedAt),
  ],
);

export const docArticleBlocks = pgTable(
  'doc_article_blocks',
  {
    id,
    articleId: uuid('article_id')
      .notNull()
      .references(() => docArticles.id, { onDelete: 'cascade' }),
    blockType: docArticleBlockType('block_type').notNull(),
    sortOrder: integer('sort_order').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('doc_article_blocks_article_sort_idx').on(table.articleId, table.sortOrder),
  ],
);

export const docImportJobs = pgTable(
  'doc_import_jobs',
  {
    id,
    sourceFilename: text('source_filename').notNull(),
    sourceChecksum: text('source_checksum').notNull(),
    importStatus: docImportStatus('import_status').notNull(),
    errorSummary: text('error_summary'),
    previewSnapshot: jsonb('preview_snapshot').notNull(),
    createdArticleId: uuid('created_article_id').references(() => docArticles.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now,
  },
);

export const userIdentities = pgTable(
  'user_identities',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProvider('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    label: text('label'),
    isVerified: boolean('is_verified').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('user_identities_user_id_idx').on(table.userId),
    uniqueIndex('user_identities_provider_subject_unique_idx').on(
      table.provider,
      table.providerSubject,
    ),
    uniqueIndex('user_identities_verified_owner_unique_idx')
      .on(table.provider, table.providerSubject)
      .where(sql`${table.isVerified} = true`),
  ],
);

export const activationTokens = pgTable(
  'activation_tokens',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id').references(() => userIdentities.id, {
      onDelete: 'cascade',
    }),
    purpose: activationTokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: now,
  },
  (table) => [
    index('activation_tokens_user_id_idx').on(table.userId),
    uniqueIndex('activation_tokens_token_hash_unique_idx').on(table.tokenHash),
  ],
);

export const activationWorkOrders = pgTable(
  'activation_work_orders',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: activationWorkOrderStatus('status').notNull().default('pending'),
    fingerprintDigest: text('fingerprint_digest').notNull(),
    deviceMetadata: jsonb('device_metadata').$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedByUserId: uuid('rejected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('activation_work_orders_user_id_idx').on(table.userId),
    index('activation_work_orders_status_idx').on(table.status),
    uniqueIndex('activation_work_orders_code_unique_idx').on(table.code),
  ],
);

export const passwordResetWorkOrders = pgTable(
  'password_reset_work_orders',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    reason: text('reason').notNull(),
    status: passwordResetWorkOrderStatus('status').notNull().default('pending'),
    temporaryPassword: text('temporary_password'),
    processedByUserId: uuid('processed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('password_reset_work_orders_user_id_idx').on(table.userId),
    index('password_reset_work_orders_status_idx').on(table.status),
    index('password_reset_work_orders_created_at_idx').on(table.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionTokenHash: text('session_token_hash').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    uniqueIndex('sessions_token_hash_unique_idx').on(table.sessionTokenHash),
  ],
);

export const enterpriseOauthAuthorizationCodes = pgTable(
  'enterprise_oauth_authorization_codes',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    scope: text('scope').notNull().default(''),
    state: text('state'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('enterprise_oauth_authorization_codes_user_id_idx').on(table.userId),
    index('enterprise_oauth_authorization_codes_expires_at_idx').on(table.expiresAt),
    uniqueIndex('enterprise_oauth_authorization_codes_code_hash_unique_idx').on(
      table.codeHash,
    ),
  ],
);

export const enterpriseOauthAccessTokens = pgTable(
  'enterprise_oauth_access_tokens',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    clientId: text('client_id').notNull(),
    scope: text('scope').notNull().default(''),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('enterprise_oauth_access_tokens_user_id_idx').on(table.userId),
    index('enterprise_oauth_access_tokens_expires_at_idx').on(table.expiresAt),
    uniqueIndex('enterprise_oauth_access_tokens_token_hash_unique_idx').on(
      table.tokenHash,
    ),
  ],
);

export const adminRoles = pgTable(
  'admin_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: adminRole('role').notNull(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: now,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index('admin_roles_role_idx').on(table.role),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id,
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('audit_events_actor_user_id_idx').on(table.actorUserId),
    index('audit_events_target_user_id_idx').on(table.targetUserId),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
  ],
);

export const membershipPlans = pgTable(
  'membership_plans',
  {
    id,
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    billingPeriod: planBillingPeriod('billing_period').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plans_code_unique_idx').on(table.code),
    index('membership_plans_active_idx').on(table.isActive),
    check('membership_plans_price_non_negative', sql`${table.priceCents} >= 0`),
  ],
);

export const benefits = pgTable(
  'benefits',
  {
    id,
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: benefitKind('kind').notNull(),
    quantity: integer('quantity'),
    unit: text('unit'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('benefits_plan_code_unique_idx').on(table.planId, table.code),
    index('benefits_plan_id_idx').on(table.planId),
  ],
);

export const membershipPlanVersions = pgTable(
  'membership_plan_versions',
  {
    id,
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: membershipPlanVersionStatus('status').notNull().default('draft'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    displayName: text('display_name').notNull(),
    description: text('description'),
    billingPeriod: planBillingPeriod('billing_period').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    changeSummary: text('change_summary'),
    mediaStorageQuotaBytes: bigint('media_storage_quota_bytes', { mode: 'number' }).notNull().default(0),
    mediaAllowUserUpload: boolean('media_allow_user_upload').notNull().default(false),
    mediaAllowPublicSharing: boolean('media_allow_public_sharing').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedBy: uuid('published_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_versions_plan_version_unique_idx').on(
      table.planId,
      table.versionNumber,
    ),
    uniqueIndex('membership_plan_versions_single_draft_idx')
      .on(table.planId)
      .where(sql`${table.status} = 'draft'`),
    uniqueIndex('membership_plan_versions_single_scheduled_idx')
      .on(table.planId)
      .where(sql`${table.status} = 'scheduled'`),
    index('membership_plan_versions_status_idx').on(table.status),
    index('membership_plan_versions_effective_from_idx').on(table.effectiveFrom),
    check('membership_plan_versions_price_non_negative', sql`${table.priceCents} >= 0`),
    check(
      'membership_plan_versions_media_storage_quota_non_negative',
      sql`${table.mediaStorageQuotaBytes} >= 0`,
    ),
  ],
);

export const membershipPlanVersionBenefits = pgTable(
  'membership_plan_version_benefits',
  {
    id,
    versionId: uuid('version_id')
      .notNull()
      .references(() => membershipPlanVersions.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: benefitKind('kind').notNull(),
    quantity: integer('quantity'),
    unit: text('unit'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_version_benefits_version_code_unique_idx').on(
      table.versionId,
      table.code,
    ),
    index('membership_plan_version_benefits_version_id_idx').on(table.versionId),
  ],
);

export const userEntitlements = pgTable(
  'user_entitlements',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => membershipPlans.id, {
      onDelete: 'set null',
    }),
    planVersionId: uuid('plan_version_id').references(() => membershipPlanVersions.id, {
      onDelete: 'set null',
    }),
    benefitId: uuid('benefit_id').references(() => benefits.id, {
      onDelete: 'set null',
    }),
    source: entitlementSource('source').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    remainingQuantity: integer('remaining_quantity'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('user_entitlements_user_id_idx').on(table.userId),
    index('user_entitlements_expiry_idx').on(table.expiresAt),
  ],
);

export const permissionResources = pgTable(
  'permission_resources',
  {
    id,
    code: text('code').notNull(),
    name: text('name').notNull(),
    resourceType: permissionResourceType('resource_type').notNull(),
    module: text('module').notNull(),
    description: text('description'),
    routePattern: text('route_pattern'),
    actionKey: text('action_key'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('permission_resources_code_unique_idx').on(table.code),
    index('permission_resources_type_idx').on(table.resourceType),
    index('permission_resources_module_idx').on(table.module),
    index('permission_resources_active_idx').on(table.isActive),
  ],
);

export const membershipPlanPermissionBindings = pgTable(
  'membership_plan_permission_bindings',
  {
    id,
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'cascade' }),
    permissionResourceId: uuid('permission_resource_id')
      .notNull()
      .references(() => permissionResources.id, { onDelete: 'cascade' }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_permission_bindings_unique_idx').on(
      table.planId,
      table.permissionResourceId,
    ),
    index('membership_plan_permission_bindings_plan_idx').on(table.planId),
    index('membership_plan_permission_bindings_resource_idx').on(table.permissionResourceId),
  ],
);

export const membershipPlanVersionPermissionBindings = pgTable(
  'membership_plan_version_permission_bindings',
  {
    id,
    versionId: uuid('version_id')
      .notNull()
      .references(() => membershipPlanVersions.id, { onDelete: 'cascade' }),
    permissionResourceId: uuid('permission_resource_id')
      .notNull()
      .references(() => permissionResources.id, { onDelete: 'cascade' }),
    createdAt: now,
  },
  (table) => [
    uniqueIndex('membership_plan_version_permission_bindings_unique_idx').on(
      table.versionId,
      table.permissionResourceId,
    ),
    index('membership_plan_version_permission_bindings_version_idx').on(table.versionId),
    index('membership_plan_version_permission_bindings_resource_idx').on(table.permissionResourceId),
  ],
);

export const products = pgTable(
  'products',
  {
    id,
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: productStatus('status').notNull().default('draft'),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    inventoryQuantity: integer('inventory_quantity'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('products_sku_unique_idx').on(table.sku),
    index('products_status_idx').on(table.status),
    check('products_price_non_negative', sql`${table.priceCents} >= 0`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id,
    orderNumber: text('order_number').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    planId: uuid('plan_id').references(() => membershipPlans.id, {
      onDelete: 'set null',
    }),
    status: orderStatus('status').notNull().default('pending'),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('orders_order_number_unique_idx').on(table.orderNumber),
    index('orders_user_id_idx').on(table.userId),
    index('orders_status_idx').on(table.status),
    check('orders_total_non_negative', sql`${table.totalCents} >= 0`),
  ],
);

export const subscriptionWorkOrders = pgTable(
  'subscription_work_orders',
  {
    id,
    code: text('code').notNull(),
    status: subscriptionWorkOrderStatus('status').notNull().default('pending'),
    result: subscriptionWorkOrderResult('result'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'restrict' }),
    submittedPaymentMethod: text('submitted_payment_method').notNull(),
    submittedAmountCents: integer('submitted_amount_cents').notNull(),
    submittedPaidAt: timestamp('submitted_paid_at', { withTimezone: true }).notNull(),
    submittedReference: text('submitted_reference').notNull(),
    submittedNote: text('submitted_note'),
    processorAdminId: uuid('processor_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('subscription_work_orders_code_unique_idx').on(table.code),
    index('subscription_work_orders_user_id_idx').on(table.userId),
    index('subscription_work_orders_order_id_idx').on(table.orderId),
    index('subscription_work_orders_plan_id_idx').on(table.planId),
    index('subscription_work_orders_status_idx').on(table.status),
    check('subscription_work_orders_amount_non_negative', sql`${table.submittedAmountCents} >= 0`),
  ],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id,
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: orderEventType('type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('order_events_order_id_idx').on(table.orderId),
    index('order_events_type_idx').on(table.type),
  ],
);

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: aiJobType('type').notNull(),
    status: aiJobStatus('status').notNull().default('queued'),
    provider: text('provider'),
    model: text('model'),
    prompt: text('prompt'),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb('output').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('ai_jobs_user_id_idx').on(table.userId),
    index('ai_jobs_status_idx').on(table.status),
    index('ai_jobs_type_idx').on(table.type),
  ],
);

export const agentCapabilities = pgTable(
  'agent_capabilities',
  {
    id,
    kind: agentCapabilityKind('kind').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: agentCapabilityStatus('status').notNull().default('enabled'),
    scope: text('scope').notNull().default('global'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    secretMetadata: jsonb('secret_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('agent_capabilities_code_unique_idx').on(table.code),
    index('agent_capabilities_kind_idx').on(table.kind),
    index('agent_capabilities_status_idx').on(table.status),
  ],
);

export const agentCapabilityBundles = pgTable(
  'agent_capability_bundles',
  {
    id,
    code: text('code').notNull(),
    taskType: aiJobType('task_type').notNull(),
    name: text('name').notNull(),
    status: agentCapabilityStatus('status').notNull().default('enabled'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('agent_capability_bundles_code_unique_idx').on(table.code),
    index('agent_capability_bundles_task_type_idx').on(table.taskType),
  ],
);

export const agentCapabilityBundleItems = pgTable(
  'agent_capability_bundle_items',
  {
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => agentCapabilityBundles.id, { onDelete: 'cascade' }),
    capabilityId: uuid('capability_id')
      .notNull()
      .references(() => agentCapabilities.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: now,
  },
  (table) => [
    primaryKey({ columns: [table.bundleId, table.capabilityId] }),
    index('agent_capability_bundle_items_capability_idx').on(table.capabilityId),
  ],
);

export const aiProviders = pgTable(
  'ai_providers',
  {
    id,
    code: text('code').notNull(),
    name: text('name').notNull(),
    providerType: aiProviderType('provider_type').notNull(),
    status: aiProviderStatus('status').notNull().default('enabled'),
    baseUrl: text('base_url'),
    credentialEnvKey: text('credential_env_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('ai_providers_code_unique_idx').on(table.code),
    index('ai_providers_status_idx').on(table.status),
  ],
);

export const aiModels = pgTable(
  'ai_models',
  {
    id,
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    model: text('model').notNull(),
    status: aiModelStatus('status').notNull().default('enabled'),
    supportsChat: boolean('supports_chat').notNull().default(false),
    supportsImageGeneration: boolean('supports_image_generation').notNull().default(false),
    supportsImageEdit: boolean('supports_image_edit').notNull().default(false),
    supportsImageUpscale: boolean('supports_image_upscale').notNull().default(false),
    supportsVideoGeneration: boolean('supports_video_generation').notNull().default(false),
    executionProtocol: aiModelExecutionProtocol('execution_protocol')
      .notNull()
      .default('chat_openai_compatible'),
    isDefaultChat: boolean('is_default_chat').notNull().default(false),
    isDefaultImage: boolean('is_default_image').notNull().default(false),
    isDefaultVideo: boolean('is_default_video').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    pricing: jsonb('pricing').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('ai_models_code_unique_idx').on(table.code),
    index('ai_models_provider_id_idx').on(table.providerId),
    index('ai_models_status_idx').on(table.status),
    index('ai_models_chat_idx').on(table.supportsChat),
    index('ai_models_image_generation_idx').on(table.supportsImageGeneration),
    index('ai_models_image_edit_idx').on(table.supportsImageEdit),
    index('ai_models_image_upscale_idx').on(table.supportsImageUpscale),
    index('ai_models_video_generation_idx').on(table.supportsVideoGeneration),
  ],
);

export const aiModelEntitlementRequirements = pgTable(
  'ai_model_entitlement_requirements',
  {
    id,
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id, { onDelete: 'cascade' }),
    requirementType: aiModelEntitlementRequirementType('requirement_type').notNull(),
    requirementValue: text('requirement_value'),
    label: text('label').notNull(),
    createdAt: now,
  },
  (table) => [
    index('ai_model_entitlement_requirements_model_id_idx').on(table.modelId),
    uniqueIndex('ai_model_entitlement_requirements_natural_unique_idx').on(
      table.modelId,
      table.requirementType,
      sql`coalesce("requirement_value", '')`,
    ),
    check(
      'ai_model_entitlement_requirements_value_shape',
      sql`(${table.requirementType} = 'none' and ${table.requirementValue} is null) or (${table.requirementType} <> 'none' and ${table.requirementValue} is not null)`,
    ),
  ],
);

export const agentConversationFolders = pgTable(
  'agent_conversation_folders',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_conversation_folders_user_deleted_idx').on(table.userId, table.deletedAt),
    index('agent_conversation_folders_user_sort_idx').on(table.userId, table.sortOrder),
  ],
);

export const agentConversations = pgTable(
  'agent_conversations',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => agentConversationFolders.id, { onDelete: 'set null' }),
    autoTitle: text('auto_title').notNull(),
    titleOverride: text('title_override'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_conversations_user_deleted_idx').on(table.userId, table.deletedAt),
    index('agent_conversations_user_folder_idx').on(table.userId, table.folderId),
    index('agent_conversations_user_last_run_idx').on(table.userId, table.lastRunAt),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id,
    conversationId: uuid('conversation_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskType: aiJobType('task_type').notNull(),
    status: agentRunStatus('status').notNull().default('queued'),
    prompt: text('prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    capabilitySnapshot: jsonb('capability_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    finalMessage: text('final_message'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_runs_conversation_id_idx').on(table.conversationId),
    index('agent_runs_user_id_idx').on(table.userId),
    index('agent_runs_status_idx').on(table.status),
    index('agent_runs_task_type_idx').on(table.taskType),
  ],
);

export const creditLedgerEntries = pgTable(
  'credit_ledger_entries',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    entryType: creditLedgerEntryType('entry_type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).$type<number>(),
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('credit_ledger_entries_user_id_idx').on(table.userId),
    uniqueIndex('credit_ledger_entries_idempotency_key_unique_idx').on(table.idempotencyKey),
  ],
);

export const userInviteCodes = pgTable(
  'user_invite_codes',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: userInviteCodeStatus('status').notNull().default('active'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('user_invite_codes_code_unique_idx').on(table.code),
    uniqueIndex('user_invite_codes_active_user_unique_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    check(
      'user_invite_codes_status_disabled_at_consistent',
      sql`(${table.status} = 'active' and ${table.disabledAt} is null) or (${table.status} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
  ],
);

export const userReferrals = pgTable(
  'user_referrals',
  {
    id,
    referrerUserId: uuid('referrer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: uuid('referred_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteCodeId: uuid('invite_code_id').references(() => userInviteCodes.id, {
      onDelete: 'set null',
    }),
    inviteCodeSnapshot: text('invite_code_snapshot'),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    qualifiedBy: referralConversionTrigger('qualified_by'),
    rewardLedgerEntryId: uuid('reward_ledger_entry_id').references(
      () => creditLedgerEntries.id,
      { onDelete: 'set null' },
    ),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('user_referrals_referrer_user_id_idx').on(table.referrerUserId),
    index('user_referrals_invite_code_id_idx').on(table.inviteCodeId),
    uniqueIndex('user_referrals_referred_user_id_unique_idx').on(table.referredUserId),
  ],
);

export const userDailyCheckins = pgTable(
  'user_daily_checkins',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    checkinDate: date('checkin_date').notNull(),
    streakCount: integer('streak_count').notNull().default(1),
    rewardLedgerEntryId: uuid('reward_ledger_entry_id').references(
      () => creditLedgerEntries.id,
      { onDelete: 'set null' },
    ),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('user_daily_checkins_user_id_idx').on(table.userId),
    uniqueIndex('user_daily_checkins_user_date_unique_idx').on(
      table.userId,
      table.checkinDate,
    ),
    check('user_daily_checkins_streak_count_positive', sql`${table.streakCount} > 0`),
  ],
);

export const agentRunLogEvents = pgTable(
  'agent_run_events',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('agent_run_events_run_id_idx').on(table.runId),
    index('agent_run_events_type_idx').on(table.type),
  ],
);

export const agentRunStreamEvents = pgTable(
  'agent_run_stream_events',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('agent_run_stream_events_run_id_idx').on(table.runId),
    index('agent_run_stream_events_event_type_idx').on(table.eventType),
    uniqueIndex('agent_run_stream_events_run_id_sequence_unique_idx').on(
      table.runId,
      table.sequence,
    ),
  ],
);

export const agentArtifacts = pgTable(
  'agent_artifacts',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: agentArtifactKind('kind').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('ready'),
    body: text('body'),
    url: text('url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_artifacts_run_id_idx').on(table.runId),
    index('agent_artifacts_kind_idx').on(table.kind),
  ],
);

export const generatedMediaAssets = pgTable(
  'generated_media_assets',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    artifactId: uuid('artifact_id'),
    kind: agentArtifactKind('kind').notNull(),
    title: text('title').notNull(),
    sourceType: mediaAssetSourceType('source_type').notNull().default('ai_generated'),
    sourceProvider: text('source_provider'),
    sourceModel: text('source_model'),
    sourceUrl: text('source_url'),
    sourceExpiresAt: timestamp('source_expires_at', { withTimezone: true }),
    originalFilename: text('original_filename'),
    sha256: text('sha256'),
    shareId: text('share_id'),
    shareStatus: mediaAssetShareStatus('share_status').notNull().default('disabled'),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    storageProvider: text('storage_provider').notNull().default('tencent_cos'),
    bucket: text('bucket').notNull(),
    region: text('region').notNull(),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }).$type<number | null>(),
    status: generatedMediaAssetStatus('status').notNull().default('ready'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    saveRequestedAt: timestamp('save_requested_at', { withTimezone: true }).notNull().defaultNow(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('generated_media_assets_user_id_idx').on(table.userId),
    index('generated_media_assets_run_id_idx').on(table.runId),
    index('generated_media_assets_conversation_id_idx').on(table.conversationId),
    index('generated_media_assets_artifact_id_idx').on(table.artifactId),
    index('generated_media_assets_status_idx').on(table.status),
    uniqueIndex('generated_media_assets_object_key_unique_idx').on(table.objectKey),
  ],
);

export const partnerLeads = pgTable(
  'partner_leads',
  {
    id,
    companyName: text('company_name').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    status: partnerLeadStatus('status').notNull().default('new'),
    source: text('source'),
    notes: text('notes'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('partner_leads_status_idx').on(table.status),
    index('partner_leads_owner_user_id_idx').on(table.ownerUserId),
  ],
);

export const contentAssets = pgTable(
  'content_assets',
  {
    id,
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    kind: contentAssetKind('kind').notNull(),
    status: contentAssetStatus('status').notNull().default('draft'),
    url: text('url'),
    body: text('body'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('content_assets_slug_unique_idx').on(table.slug),
    index('content_assets_status_idx').on(table.status),
    index('content_assets_kind_idx').on(table.kind),
  ],
);

export const systemSettings = pgTable(
  'system_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    description: text('description'),
    isSecret: boolean('is_secret').notNull().default(false),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [index('system_settings_secret_idx').on(table.isSecret)],
);

export const requestIdempotencyRecords = pgTable(
  'request_idempotency_records',
  {
    id,
    key: text('key').notNull(),
    actorType: requestIdempotencyActorType('actor_type').notNull(),
    actorId: text('actor_id').notNull().default('anonymous'),
    operation: text('operation').notNull(),
    bodyHash: text('body_hash').notNull(),
    status: requestIdempotencyStatus('status').notNull().default('processing'),
    responseSummary: jsonb('response_summary').$type<Record<string, unknown> | null>(),
    createdAt: now,
    updatedAt: updated,
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('request_idempotency_scope_key_unique_idx').on(
      table.actorType,
      table.actorId,
      table.operation,
      table.key,
    ),
    index('request_idempotency_expires_at_idx').on(table.expiresAt),
    index('request_idempotency_status_idx').on(table.status),
  ],
);
