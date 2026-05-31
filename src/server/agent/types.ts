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

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AgentRunSelectedModelDto = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  entitlementLabel: string;
};

export type AgentRunBillingDto = {
  status: 'not_required' | 'pending' | 'billed' | 'failed';
  creditCost: number | null;
  ledgerEntryId: string | null;
};

export type AgentRunStreamEventType =
  | 'run_started'
  | 'assistant_message_started'
  | 'assistant_delta'
  | 'assistant_message_completed'
  | 'billing_recorded'
  | 'run_completed'
  | 'run_failed'
  | 'artifact_started'
  | 'artifact_progress'
  | 'artifact_completed'
  | 'artifact_failed';

export type AgentRunStreamEventDto = {
  id: string;
  runId: string;
  sequence: number;
  eventType: AgentRunStreamEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AgentRunDetailDto = {
  run: AgentRunDto;
  events: AgentRunStreamEventDto[];
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
  selectedModel?: AgentRunSelectedModelDto | null;
  usage?: AiUsage | null;
  billing?: AgentRunBillingDto | null;
  artifacts: AgentArtifactDto[];
  createdAt: string;
  updatedAt: string;
};
