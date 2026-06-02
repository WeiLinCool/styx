import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('users_account_state_idx').on(table.accountState),
    uniqueIndex('users_email_unique_idx')
      .on(table.email)
      .where(sql`${table.email} is not null`),
    uniqueIndex('users_phone_unique_idx')
      .on(table.phone)
      .where(sql`${table.phone} is not null`),
  ],
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
    isDefaultChat: boolean('is_default_chat').notNull().default(false),
    isDefaultImage: boolean('is_default_image').notNull().default(false),
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
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after'),
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
