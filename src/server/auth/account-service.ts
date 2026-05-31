import {
  AccountDomainError,
  assertActivationTokenUsable,
  type BindIdentityInput,
  type IdentityProvider,
} from './account-types';
import { createOpaqueToken, hashSecret } from './account-crypto';
import { hashUserPassword, verifyStoredUserPassword } from './public-auth';
import { recordAuditEvent } from '@/server/audit/audit-service';
import { qualifyReferralReward } from '@/server/repositories/admin-mutations';
import { bindReferralForUser, getActiveInviteCodeByCode } from '@/server/repositories/points';
import {
  bindVerifiedIdentity,
  createSession,
  createUser,
  consumeActivationToken,
  createActivationToken,
  getActivationTokenByHash,
  getUserByEmail,
  getUserById,
  getUserByPhone,
  revokeSessionsForUser,
  setUserAccountState,
} from '@/server/repositories/users';

const DEFAULT_ACTIVATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function activateAccountWithToken(input: {
  token: string;
  actorId?: string | null;
}) {
  const tokenHash = hashSecret(input.token);
  const activationToken = await getActivationTokenByHash(tokenHash);

  assertActivationTokenUsable(activationToken);

  const consumedToken = await consumeActivationToken(tokenHash);
  assertActivationTokenUsable(consumedToken);

  const user = await setUserAccountState(
    consumedToken.userId,
    'active',
    input.actorId ?? consumedToken.userId,
    'activation_token',
  );

  await recordAuditEvent({
    actorId: input.actorId ?? user.id,
    targetId: user.id,
    type: 'account.activated_with_token',
    metadata: { tokenId: consumedToken.id },
  });

  return user;
}

export async function activateAccountByAdmin(input: {
  userId: string;
  actorId: string;
  reason?: string | null;
}) {
  const user = await setUserAccountState(
    input.userId,
    'active',
    input.actorId,
    input.reason ?? 'admin_activation',
  );

  // This is the current operator-side entry point that activates a user into an active membership state.
  await qualifyReferralReward({
    referredUserId: input.userId,
    qualifiedBy: 'membership_activated',
  });

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: input.userId,
    type: 'account.activated_by_admin',
    metadata: { reason: input.reason ?? null },
  });

  return user;
}

export async function reissueActivation(input: {
  userId: string;
  actorId?: string | null;
  purpose?: 'account_activation' | 'identity_binding';
  ttlMs?: number;
}) {
  const user = await getUserById(input.userId);
  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_ACTIVATION_TTL_MS));
  const activationToken = await createActivationToken({
    userId: input.userId,
    purpose: input.purpose ?? 'account_activation',
    tokenHash: hashSecret(token),
    expiresAt,
  });

  await recordAuditEvent({
    actorId: input.actorId ?? input.userId,
    targetId: input.userId,
    type: 'account.activation_reissued',
    metadata: {
      purpose: activationToken.purpose,
      tokenId: activationToken.id,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return {
    token,
    expiresAt,
    tokenId: activationToken.id,
  };
}

export async function suspendAccount(input: {
  userId: string;
  actorId: string;
  reason?: string | null;
}) {
  const user = await setUserAccountState(
    input.userId,
    'suspended',
    input.actorId,
    input.reason ?? 'admin_suspend',
  );

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: input.userId,
    type: 'account.suspended',
    metadata: { reason: input.reason ?? null },
  });

  return user;
}

async function bindIdentity(input: BindIdentityInput) {
  const result = await bindVerifiedIdentity(input);
  if (!result.ok) {
    throw result.error;
  }

  await recordAuditEvent({
    actorId: input.userId,
    targetId: input.userId,
    type: 'account.identity_bound',
    metadata: {
      provider: input.provider,
      identityId: result.identity.id,
    },
  });

  return result.identity;
}

export async function bindEmailIdentity(input: {
  userId: string;
  email: string;
  label?: string | null;
}) {
  return bindIdentity({
    userId: input.userId,
    provider: 'email',
    providerSubject: input.email.trim().toLowerCase(),
    label: input.label ?? input.email.trim().toLowerCase(),
  });
}

export async function bindPhoneIdentity(input: {
  userId: string;
  phone: string;
  label?: string | null;
}) {
  return bindIdentity({
    userId: input.userId,
    provider: 'phone',
    providerSubject: input.phone.trim(),
    label: input.label ?? input.phone.trim(),
  });
}

export async function bindProviderIdentity(input: {
  userId: string;
  provider: Exclude<IdentityProvider, 'email' | 'phone'>;
  providerSubject: string;
  label?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return bindIdentity({
    userId: input.userId,
    provider: input.provider,
    providerSubject: input.providerSubject.trim(),
    label: input.label ?? input.providerSubject.trim(),
    metadata: input.metadata,
  });
}

export async function registerOrLoginUser(input: {
  phone: string;
  password: string;
  displayName?: string | null;
  email?: string | null;
  inviteCode?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const normalizedPhone = input.phone.trim();
  const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
  const displayName = input.displayName?.trim() || `用户${normalizedPhone.slice(-4)}`;
  const password = input.password;
  const normalizedInviteCode = input.inviteCode?.trim() || null;

  let user =
    (normalizedPhone ? await getUserByPhone(normalizedPhone) : null) ??
    (normalizedEmail ? await getUserByEmail(normalizedEmail) : null);

  if (!user) {
    user = await createUser({
      phone: normalizedPhone,
      email: normalizedEmail,
      displayName,
      metadata: {
        registrationSource: 'web_auth',
        passwordHash: hashUserPassword(password),
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      targetId: user.id,
      type: 'account.registered',
      metadata: { phone: normalizedPhone, email: normalizedEmail },
    });

    if (normalizedInviteCode) {
      const inviteCode = await getActiveInviteCodeByCode(normalizedInviteCode);
      if (inviteCode && inviteCode.userId !== user.id) {
        await bindReferralForUser({
          referrerUserId: inviteCode.userId,
          referredUserId: user.id,
          inviteCodeId: inviteCode.id,
          inviteCodeSnapshot: inviteCode.code,
        });
      }
    }
  } else if (!('passwordHash' in (user.metadata ?? {}))) {
    throw new AccountDomainError(
      'password_setup_required',
      '当前账号尚未设置密码，请先设置密码后再登录。',
      403,
    );
  } else if (!verifyStoredUserPassword(password, user.metadata)) {
    throw new AccountDomainError('session_required', '手机号或密码错误。', 401);
  }

  await revokeSessionsForUser(user.id);

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
  await createSession({
    userId: user.id,
    sessionTokenHash: hashSecret(token),
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  await recordAuditEvent({
    actorId: user.id,
    targetId: user.id,
    type: 'account.session_created',
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { user, token, expiresAt };
}
