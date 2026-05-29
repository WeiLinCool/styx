export type AgentTaskType = 'chat' | 'image' | 'video' | 'workflow';
export type AgentCapabilityKind = 'model' | 'skill' | 'mcp_server' | 'plugin';
export type AgentCapabilityStatus = 'enabled' | 'disabled' | 'archived';
export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AgentArtifactKind = 'text' | 'image' | 'video' | 'document' | 'workflow' | 'json';

export type AgentCapabilityRecord = {
  id: string;
  kind: AgentCapabilityKind;
  code: string;
  name: string;
  status: AgentCapabilityStatus;
  config: Record<string, unknown>;
};

export type AgentCapabilityBundleRecord = {
  id: string;
  code: string;
  taskType: AgentTaskType;
  name: string;
  status: AgentCapabilityStatus;
  capabilityIds: string[];
};

export type ResolvedAgentCapability = {
  id: string;
  kind: AgentCapabilityKind;
  code: string;
  name: string;
  config: Record<string, unknown>;
};

export type AgentCapabilitySnapshot = {
  bundleId: string;
  bundleCode: string;
  provider: string;
  model: string;
  capabilities: ResolvedAgentCapability[];
};

export type AgentArtifactDto = {
  id: string;
  kind: AgentArtifactKind;
  title: string;
  status: 'ready' | 'failed';
  body: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentRunDto = {
  id: string;
  taskType: AgentTaskType;
  status: AgentRunStatus;
  prompt: string;
  finalMessage: string | null;
  errorMessage: string | null;
  capabilitySummary: {
    provider: string;
    model: string;
    capabilities: Array<Pick<ResolvedAgentCapability, 'kind' | 'code' | 'name'>>;
  };
  artifacts: AgentArtifactDto[];
  createdAt: string;
  updatedAt: string;
};
