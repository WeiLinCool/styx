import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import { listActiveUserEntitlements } from '@/server/ai/model-entitlements';
import { listAvailableVideoModelsForUser, type PublicVideoModelDto } from '@/server/repositories/ai-models';
import {
  membershipPlanVersionRepository,
  resolvePlanVersionForEntitlement,
  type MembershipPlanVersionRecord,
} from '@/server/repositories/membership-plan-versions';
import {
  getVideoPlanConfigByVersionId,
  listEnabledVideoStylePresets,
  type VideoPlanConfig,
  type VideoStylePreset,
} from '@/server/repositories/video-generation-config';
import {
  readWorkflowVideoMvpCapabilityConfig,
  resolveDefaultAgentCapabilityBundle,
} from '@/server/repositories/agent-capabilities';
import type { AgentCapabilitySnapshot } from '@/server/agent/types';
import { resolveVideoGenerationPolicy } from '@/server/video/video-generation-policy';

type SessionLike = {
  user: {
    id: string;
  };
};

type MembershipEntitlement = Pick<
  ActiveUserEntitlement,
  'planCode' | 'planVersionId' | 'expiresAt'
>;

export type AgentVideoConfigDto = ReturnType<typeof toVideoConfigDto>;

function selectMembershipEntitlement(
  entitlements: ActiveUserEntitlement[],
): MembershipEntitlement | null {
  const membershipEntitlements = entitlements.filter(
    (entitlement) =>
      entitlement.source === 'membership' &&
      entitlement.benefitCode === null &&
      (entitlement.planVersionId || entitlement.planCode),
  );

  return membershipEntitlements.toSorted(compareMembershipEntitlements)[0] ?? null;
}

function compareMembershipEntitlements(
  left: MembershipEntitlement,
  right: MembershipEntitlement,
) {
  const leftHasVersion = left.planVersionId ? 1 : 0;
  const rightHasVersion = right.planVersionId ? 1 : 0;
  if (leftHasVersion !== rightHasVersion) {
    return rightHasVersion - leftHasVersion;
  }

  const leftExpiry = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  const rightExpiry = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  if (leftExpiry !== rightExpiry) {
    return rightExpiry - leftExpiry;
  }

  const leftPlanCode = left.planCode ?? '';
  const rightPlanCode = right.planCode ?? '';
  if (leftPlanCode !== rightPlanCode) {
    return leftPlanCode.localeCompare(rightPlanCode);
  }

  return (left.planVersionId ?? '').localeCompare(right.planVersionId ?? '');
}

function toVideoConfigDto(
  policy: ReturnType<typeof resolveVideoGenerationPolicy>,
  models: PublicVideoModelDto[],
  workflowCapabilitySnapshot: AgentCapabilitySnapshot | null,
) {
  const workflowVideoConfig = workflowCapabilitySnapshot
    ? readWorkflowVideoMvpCapabilityConfig(workflowCapabilitySnapshot)
    : null;
  const workflowSceneBackgrounds =
    policy.enabled && workflowVideoConfig
      ? workflowVideoConfig.sceneBackgrounds
          .filter((background) => background.enabled)
          .map((background) => ({
            id: background.id,
            name: background.name,
            styleName: background.styleName,
            publicUrl: background.publicUrl,
          }))
      : [];

  return {
    enabled: policy.enabled,
    upgradeRequired: policy.upgradeRequired,
    message: policy.message,
    styles: policy.enabled
      ? policy.styles.map((style) => ({
          id: style.id,
          code: style.code,
          name: style.name,
          prompt: style.prompt,
        }))
      : [],
    durations: policy.enabled ? policy.durations : [],
    resolutions: policy.enabled ? policy.resolutions : [],
    defaults: policy.enabled
      ? policy.defaults
      : {
          styleCode: null,
          durationSeconds: null,
          resolution: null,
        },
    models: policy.enabled ? models : [],
    workflowSceneBackgrounds,
  };
}

export function createAgentVideoConfigRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  listEntitlements: (userId: string) => Promise<ActiveUserEntitlement[]>;
  resolvePlanVersion: (
    planCode: string,
  ) => Promise<Pick<MembershipPlanVersionRecord, 'id' | 'videoGenerationPolicy'> | null>;
  getVideoPlanConfigByVersionId: (versionId: string) => Promise<VideoPlanConfig | null>;
  listStyles: () => Promise<VideoStylePreset[]>;
  listVideoModels: (userId: string) => Promise<PublicVideoModelDto[]>;
  resolveWorkflowCapabilityBundle: () => Promise<AgentCapabilitySnapshot | null>;
}) {
  async function resolvePlanConfig(
    entitlement: MembershipEntitlement | null,
  ): Promise<VideoPlanConfig | null> {
    if (!entitlement) {
      return null;
    }

    if (entitlement.planVersionId) {
      return dependencies.getVideoPlanConfigByVersionId(entitlement.planVersionId);
    }

    if (!entitlement.planCode) {
      return null;
    }

    const version = await dependencies.resolvePlanVersion(entitlement.planCode);
    if (!version) {
      return null;
    }

    return (
      version.videoGenerationPolicy ??
      dependencies.getVideoPlanConfigByVersionId(version.id)
    );
  }

  return {
    async GET() {
      try {
        const session = await dependencies.requireSession();
        const [entitlements, styles] = await Promise.all([
          dependencies.listEntitlements(session.user.id),
          dependencies.listStyles(),
        ]);
        const entitlement = selectMembershipEntitlement(entitlements);
        const planConfig = await resolvePlanConfig(entitlement);
        const policy = resolveVideoGenerationPolicy({
          entitlement,
          planConfig,
          styles,
        });
        const [models, workflowCapabilitySnapshot] = policy.enabled
          ? await Promise.all([
              dependencies.listVideoModels(session.user.id),
              dependencies.resolveWorkflowCapabilityBundle(),
            ])
          : [[], null];

        return NextResponse.json(toVideoConfigDto(policy, models, workflowCapabilitySnapshot));
      } catch (error) {
        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
  };
}

const handlers = createAgentVideoConfigRouteHandlers({
  requireSession: requireActiveAccount,
  listEntitlements: listActiveUserEntitlements,
  resolvePlanVersion: async (planCode) =>
    resolvePlanVersionForEntitlement(planCode, {
      loader: membershipPlanVersionRepository,
    }),
  getVideoPlanConfigByVersionId,
  listStyles: listEnabledVideoStylePresets,
  listVideoModels: listAvailableVideoModelsForUser,
  resolveWorkflowCapabilityBundle: () => resolveDefaultAgentCapabilityBundle('workflow'),
});

export const GET = handlers.GET;
