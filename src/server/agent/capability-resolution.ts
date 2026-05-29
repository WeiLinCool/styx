import type {
  AgentCapabilityBundleRecord,
  AgentCapabilityRecord,
  AgentCapabilitySnapshot,
  AgentTaskType,
  ResolvedAgentCapability,
} from './types';

function readStringConfig(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function cloneConfig(config: Record<string, unknown>) {
  return structuredClone(config);
}

export function resolveDefaultBundle(
  bundles: AgentCapabilityBundleRecord[],
  taskType: AgentTaskType,
) {
  return bundles.find((bundle) => bundle.taskType === taskType && bundle.status === 'enabled') ?? null;
}

export function buildCapabilitySnapshot(input: {
  bundle: AgentCapabilityBundleRecord;
  capabilities: AgentCapabilityRecord[];
}): AgentCapabilitySnapshot {
  const byId = new Map(input.capabilities.map((capability) => [capability.id, capability]));
  const resolved: ResolvedAgentCapability[] = input.bundle.capabilityIds
    .map((id) => byId.get(id))
    .filter((capability): capability is AgentCapabilityRecord => Boolean(capability))
    .filter((capability) => capability.status === 'enabled')
    .map((capability) => ({
      id: capability.id,
      kind: capability.kind,
      code: capability.code,
      name: capability.name,
      config: cloneConfig(capability.config),
    }));

  const modelCapability = resolved.find((capability) => capability.kind === 'model');

  return {
    bundleId: input.bundle.id,
    bundleCode: input.bundle.code,
    provider: modelCapability ? readStringConfig(modelCapability.config, 'provider', 'pi') : 'pi',
    model: modelCapability ? readStringConfig(modelCapability.config, 'model', 'pi-default') : 'pi-default',
    capabilities: resolved,
  };
}
