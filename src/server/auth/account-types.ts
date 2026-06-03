export type AccountState = 'pending_activation' | 'active' | 'suspended' | 'archived';

export type IdentityProvider = 'email' | 'phone' | 'github' | 'google' | 'wechat';

export type ActivationTokenPurpose =
  | 'account_activation'
  | 'identity_binding'
  | 'password_reset';

export type AccountErrorCode =
  | 'account_not_found'
  | 'account_not_active'
  | 'password_setup_required'
  | 'activation_token_invalid'
  | 'activation_token_expired'
  | 'activation_token_consumed'
  | 'work_order_not_found'
  | 'work_order_not_pending'
  | 'work_order_expired'
  | 'subscription_work_order_not_found'
  | 'invalid_subscription_work_order_transition'
  | 'unsupported_membership_billing_period'
  | 'membership_plan_not_found'
  | 'membership_plan_unavailable'
  | 'identity_conflict'
  | 'permission_denied'
  | 'session_required'
  | 'admin_required'
  | 'database_unavailable';

export class AccountDomainError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AccountDomainError';
  }
}

export type UserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  accountState: AccountState;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type UserIdentityRecord = {
  id: string;
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  label: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type ActivationTokenRecord = {
  id: string;
  userId: string;
  identityId: string | null;
  purpose: ActivationTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type SessionUser = UserRecord & {
  adminRoles: string[];
};

export type SessionContext =
  | {
      authenticated: true;
      user: SessionUser;
      sessionId: string | null;
      source: 'cookie' | 'development';
    }
  | {
      authenticated: false;
      user: null;
      sessionId: null;
      source: 'none';
    };

export type BindIdentityInput = {
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  label?: string | null;
  metadata?: Record<string, unknown>;
};

export type BindingResult =
  | {
      ok: true;
      identity: UserIdentityRecord;
    }
  | {
      ok: false;
      error: AccountDomainError;
    };

export function assertActivationTokenUsable(
  token: Pick<ActivationTokenRecord, 'consumedAt' | 'expiresAt'> | null,
  now = new Date(),
): asserts token is Pick<ActivationTokenRecord, 'consumedAt' | 'expiresAt'> {
  if (!token) {
    throw new AccountDomainError(
      'activation_token_invalid',
      'Activation token is invalid.',
      404,
    );
  }

  if (token.consumedAt) {
    throw new AccountDomainError(
      'activation_token_consumed',
      'Activation token has already been consumed.',
      409,
    );
  }

  if (token.expiresAt <= now) {
    throw new AccountDomainError(
      'activation_token_expired',
      'Activation token has expired.',
      410,
    );
  }
}

export function assertIdentityCanBind(input: {
  requestedUserId: string;
  existingIdentity: Pick<UserIdentityRecord, 'userId' | 'isVerified'> | null;
}): void {
  if (
    input.existingIdentity?.isVerified &&
    input.existingIdentity.userId !== input.requestedUserId
  ) {
    throw new AccountDomainError(
      'identity_conflict',
      'Verified identity is already bound to another account.',
      409,
    );
  }
}

export function accountErrorToResponse(error: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (error instanceof AccountDomainError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'internal_error',
        message: 'Unexpected account service error.',
      },
    },
  };
}
