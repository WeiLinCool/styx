export type AgentTaskType = 'chat' | 'image' | 'video' | 'workflow';
export type AgentCapabilityKind = 'model' | 'skill' | 'mcp_server' | 'plugin';
export type AgentCapabilityStatus = 'enabled' | 'disabled' | 'archived';
export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AgentArtifactKind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'workflow' | 'json';

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

export type StoryboardTemplateAsset = {
  storageProvider: 'tencent_cos';
  bucket: string;
  region: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFilename: string;
  uploadedAt: string;
};

export type WorkflowStoryboardLayout = {
  width: number;
  height: number;
  columns: 4;
  rows: 3;
};

export type WorkflowStoryboardCapabilityConfig = {
  code: 'workflow-storyboard-template';
  promptText: string;
  templateAsset: StoryboardTemplateAsset | null;
  layout: WorkflowStoryboardLayout;
  updatedAt: string | null;
  updatedByUserId: string | null;
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

export type GeneratedMediaAssetStatus = 'ready' | 'deleted';
export type MediaAssetSourceType = 'ai_generated' | 'user_uploaded';
export type MediaAssetShareStatus = 'disabled' | 'active';

export type GeneratedMediaAssetDto = {
  id: string;
  userId: string;
  runId: string | null;
  conversationId: string | null;
  artifactId: string | null;
  kind: Extract<AgentArtifactKind, 'image' | 'audio' | 'video'>;
  title: string;
  sourceType: MediaAssetSourceType;
  sourceProvider: string | null;
  sourceModel: string | null;
  sourceUrl: string | null;
  sourceExpiresAt: string | null;
  originalFilename: string | null;
  sha256: string | null;
  shareId: string | null;
  shareStatus: MediaAssetShareStatus;
  sharedAt: string | null;
  storageProvider: string;
  bucket: string;
  region: string;
  objectKey: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: GeneratedMediaAssetStatus;
  metadata: Record<string, unknown>;
  saveRequestedAt: string;
  savedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransientAgentArtifactDto = {
  kind: Extract<AgentArtifactKind, 'image' | 'video'>;
  title: string;
  mimeType: string;
  dataUrl?: string;
  filename?: string;
  metadata: Record<string, unknown> & {
    transient: true;
    width?: number;
    height?: number;
    byteLength?: number;
    model?: string;
  };
};

export type DirectMediaDeliveryMode = 'provider_url' | 'data_url';
export type DirectMediaStorageStatus = 'provider_direct' | 'cached' | 'stored';

export type DirectMediaResultDto = {
  kind: Extract<AgentArtifactKind, 'image' | 'video'>;
  title: string;
  delivery: {
    mode: DirectMediaDeliveryMode;
    url: string;
    expiresAt: string | null;
  };
  metadata: Record<string, unknown> & {
    storageStatus: DirectMediaStorageStatus;
    mimeType?: string;
    filename?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    providerTaskId?: string;
    model?: string;
  };
};

export type DirectMediaArtifactCompletedPayload = {
  artifact: DirectMediaResultDto;
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

export type AgentConversationFolderDto = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentConversationDto = {
  id: string;
  folderId: string | null;
  title: string;
  autoTitle: string;
  titleOverride: string | null;
  lastRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentConversationListDto = {
  folders: AgentConversationFolderDto[];
  conversations: AgentConversationDto[];
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
  internal?: {
    capabilitySnapshot: Record<string, unknown>;
    input: Record<string, unknown>;
  };
};

export type AgentRunDto = {
  id: string;
  conversationId: string;
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

export type CreateAgentRunResult = {
  run: AgentRunDto;
  transientArtifacts: TransientAgentArtifactDto[];
};
