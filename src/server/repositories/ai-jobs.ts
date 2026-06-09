import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatFullDateTime,
  metadataText,
} from './admin-shared';
import type { AgentCapabilitySnapshot } from '@/server/agent/types';

export type AdminAiJobRow = {
  id: string;
  sourceKind: 'ai_job' | 'agent_run';
  type: string;
  status: string;
  user: string;
  promptSummary: string;
  provider: string;
  model: string;
  outputReference: string;
  errorSummary: string;
  createdAt: string;
  duration: string;
  actions: string[];
};

function summarizePrompt(prompt: string | null) {
  if (!prompt) {
    return '无 prompt';
  }

  return prompt.length > 72 ? `${prompt.slice(0, 72)}...` : prompt;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function capabilitySnapshotSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const snapshot = value as Record<string, unknown>;
  const bundleCode = readString(snapshot.bundleCode);
  const capabilities = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];
  const capabilityCodes = capabilities
    .map((capability) => {
      if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
        return null;
      }

      return readString((capability as Record<string, unknown>).code);
    })
    .filter((code): code is string => Boolean(code));

  if (bundleCode && capabilityCodes.length > 0) {
    return `${bundleCode}: ${capabilityCodes.slice(0, 3).join(', ')}`;
  }

  if (bundleCode) {
    return bundleCode;
  }

  return capabilityCodes.length > 0 ? capabilityCodes.slice(0, 3).join(', ') : null;
}

function metadataRecord(value: Record<string, unknown> | null | undefined, key: string) {
  const nested = value?.[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function resolveProvider(job: { provider: string | null; input: Record<string, unknown> }) {
  const snapshotProvider = readString(metadataRecord(job.input, 'capabilitySnapshot')?.provider);
  return job.provider ?? snapshotProvider ?? '未配置';
}

function resolveModel(job: { model: string | null; input: Record<string, unknown> }) {
  const snapshot = metadataRecord(job.input, 'capabilitySnapshot');
  const snapshotModel = readString(snapshot?.model);
  const summary = capabilitySnapshotSummary(snapshot);

  if (job.model && summary) {
    return `${job.model} · 能力快照 ${summary}`;
  }

  if (job.model) {
    return job.model;
  }

  if (snapshotModel && summary) {
    return `${snapshotModel} · 能力快照 ${summary}`;
  }

  return snapshotModel ?? (summary ? `能力快照 ${summary}` : '未配置');
}

function resolveOutputReference(job: {
  output: Record<string, unknown> | null;
  input: Record<string, unknown>;
}) {
  const outputReference = metadataText(
    job.output,
    'assetUrl',
    job.output ? 'has output JSON' : 'none',
  );
  const agentRunId = readString(job.input.agentRunId);

  return agentRunId ? `${outputReference} · Agent run ${agentRunId}` : outputReference;
}

function getSeedAiJobs(): AdminModuleData<AdminAiJobRow> {
  const records: AdminAiJobRow[] = [
    {
      id: 'seed-job-1',
      sourceKind: 'ai_job',
      type: 'image',
      status: 'succeeded',
      user: 'Seed Member',
      promptSummary: 'A clean product hero image',
      provider: 'seed',
      model: 'seed-image-model',
      outputReference: '/seed/image.png',
      errorSummary: 'none',
      createdAt: '2026-05-29 07:40:00',
      duration: '10s',
      actions: ['Review output', 'Rerun', 'Mark resolved'],
    },
    {
      id: 'seed-job-2',
      sourceKind: 'ai_job',
      type: 'video',
      status: 'failed',
      user: '视频团队账号',
      promptSummary: '短视频产品展示，包含三段镜头。',
      provider: 'seed',
      model: 'seed-video-model',
      outputReference: 'none',
      errorSummary: 'provider timeout',
      createdAt: '2026-05-29 07:12:00',
      duration: 'timeout',
      actions: ['Review error', 'Rerun', 'Cancel'],
    },
    {
      id: 'seed-agent-run-1',
      sourceKind: 'agent_run',
      type: 'workflow',
      status: 'succeeded',
      user: 'Agent Runtime',
      promptSummary: 'Agent run with captured capability snapshot',
      provider: 'pi',
      model: 'pi-default · 能力快照 workflow-default: stone-script, asset-library',
      outputReference: 'Agent run seed-run-1 · has capability snapshot',
      errorSummary: 'none',
      createdAt: '2026-05-29 07:48:00',
      duration: '14s',
      actions: ['Review output', 'Rerun', 'Mark resolved'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '任务数', value: '3', hint: '24h sample', tone: 'info' },
      { label: '成功', value: '2', hint: 'succeeded', tone: 'success' },
      { label: '失败', value: '1', hint: 'needs review', tone: 'danger' },
      { label: '待复跑', value: '1', hint: 'rerun-ready', tone: 'warning' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 3 },
      { label: 'Image', value: 'image', count: 1 },
      { label: 'Video', value: 'video', count: 1 },
      { label: 'Workflow', value: 'workflow', count: 1 },
      { label: 'Failed', value: 'failed', count: 1 },
    ],
    records,
  };
}

function summarizeAgentRunPrompt(prompt: string) {
  return prompt.length > 72 ? `${prompt.slice(0, 72)}...` : prompt;
}

function isAgentCapabilitySnapshot(value: unknown): value is AgentCapabilitySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.bundleCode === 'string' &&
    typeof snapshot.model === 'string' &&
    Array.isArray(snapshot.capabilities)
  );
}

function agentRunSnapshotSummary(snapshot: AgentCapabilitySnapshot) {
  const codes = snapshot.capabilities.map((capability) => capability.code).slice(0, 3);
  return codes.length > 0 ? `${snapshot.bundleCode}: ${codes.join(', ')}` : snapshot.bundleCode;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readSnapshotRecord(snapshot: AgentCapabilitySnapshot, key: string) {
  const value = (snapshot as AgentCapabilitySnapshot & Record<string, unknown>)[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readAgentRunSelectedModel(snapshot: AgentCapabilitySnapshot | null) {
  const selectedModel = snapshot ? readSnapshotRecord(snapshot, 'selectedModel') : null;
  const name = readString(selectedModel?.name);
  const code = readString(selectedModel?.code);
  const providerName = readString(selectedModel?.providerName);

  if (name && providerName) {
    return `${providerName} / ${name}`;
  }

  return name ?? code;
}

function readAgentRunUsageSummary(snapshot: AgentCapabilitySnapshot | null) {
  const usage = snapshot ? readSnapshotRecord(snapshot, 'usage') : null;
  const totalTokens = readNumber(usage?.totalTokens);
  const promptTokens = readNumber(usage?.promptTokens);
  const completionTokens = readNumber(usage?.completionTokens);

  if (totalTokens !== null) {
    return `${totalTokens} tokens`;
  }

  if (promptTokens !== null || completionTokens !== null) {
    return `${promptTokens ?? 0}/${completionTokens ?? 0} tokens`;
  }

  return null;
}

function readAgentRunBillingSummary(snapshot: AgentCapabilitySnapshot | null) {
  const billing = snapshot ? readSnapshotRecord(snapshot, 'billing') : null;
  const status = readString(billing?.status);
  const creditCost = readNumber(billing?.creditCost);
  const ledgerEntryId = readString(billing?.ledgerEntryId);
  const ledgerSummary = ledgerEntryId ? `ledger ${ledgerEntryId}` : null;

  if (status && creditCost !== null) {
    return combineSummaryParts([`${creditCost} credits`, status, ledgerSummary]);
  }

  if (creditCost !== null) {
    return combineSummaryParts([`${creditCost} credits`, ledgerSummary]);
  }

  return combineSummaryParts([status, ledgerSummary]) || null;
}

function combineSummaryParts(parts: Array<string | null>) {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

export async function getAdminAiJobs(): Promise<AdminModuleData<AdminAiJobRow>> {
  const database = ensureAdminReadSource('AI jobs');

  if (!database) {
    return getSeedAiJobs();
  }

  const rows = await database
    .select({
      job: schema.aiJobs,
      user: schema.users,
    })
    .from(schema.aiJobs)
    .leftJoin(schema.users, eq(schema.users.id, schema.aiJobs.userId))
    .orderBy(desc(schema.aiJobs.createdAt))
    .limit(100);

  const aiJobRecords = rows.map(({ job, user }) => ({
    id: job.id,
    sourceKind: 'ai_job' as const,
    type: job.type,
    status: job.status,
    user: user?.displayName ?? '未知用户',
    promptSummary: summarizePrompt(job.prompt),
    provider: resolveProvider(job),
    model: resolveModel(job),
    outputReference: resolveOutputReference(job),
    errorSummary: job.errorMessage ?? 'none',
    createdAt: formatFullDateTime(job.createdAt),
    duration:
      job.startedAt && job.completedAt
        ? `${Math.max(0, Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 1000))}s`
        : '未完成',
    actions: ['Review output', 'Rerun', 'Cancel'],
  }));

  const agentRunRows = await database
    .select({
      run: schema.agentRuns,
      user: schema.users,
    })
    .from(schema.agentRuns)
    .leftJoin(schema.users, eq(schema.users.id, schema.agentRuns.userId))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(100);

  const agentRunRecords: AdminAiJobRow[] = agentRunRows.map(({ run, user }) => {
    const snapshot = isAgentCapabilitySnapshot(run.capabilitySnapshot)
      ? run.capabilitySnapshot
      : null;
    const completedAt = run.completedAt ?? run.updatedAt;
    const selectedModelSummary = readAgentRunSelectedModel(snapshot);
    const usageSummary = readAgentRunUsageSummary(snapshot);
    const billingSummary = readAgentRunBillingSummary(snapshot);
    const modelSummary = combineSummaryParts([
      selectedModelSummary ?? run.model,
      snapshot ? `能力快照 ${agentRunSnapshotSummary(snapshot)}` : null,
      usageSummary,
      billingSummary,
    ]);

    return {
      id: run.id,
      sourceKind: 'agent_run',
      type: run.taskType,
      status: run.status,
      user: user?.displayName ?? '未知用户',
      promptSummary: summarizeAgentRunPrompt(run.prompt),
      provider: run.provider,
      model: modelSummary || run.model,
      outputReference: `Agent run ${run.id}`,
      errorSummary: run.errorMessage ?? 'none',
      createdAt: formatFullDateTime(run.createdAt),
      duration:
        run.startedAt && completedAt
          ? `${Math.max(0, Math.round((completedAt.getTime() - run.startedAt.getTime()) / 1000))}s`
          : '未完成',
      actions: ['Review output', 'Rerun', 'Cancel'],
    };
  });

  const records = [...agentRunRecords, ...aiJobRecords]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  return {
    source: 'database',
    metrics: [
      { label: '任务数', value: String(records.length), hint: '数据库', tone: 'info' },
      {
        label: '成功',
        value: String(records.filter((record) => record.status === 'succeeded').length),
        hint: 'succeeded',
        tone: 'success',
      },
      {
        label: '失败',
        value: String(records.filter((record) => record.status === 'failed').length),
        hint: 'needs review',
        tone: 'danger',
      },
      {
        label: '运行中',
        value: String(records.filter((record) => record.status === 'running').length),
        hint: 'active queue',
        tone: 'warning',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Chat', value: 'chat' },
      { label: 'Image', value: 'image' },
      { label: 'Video', value: 'video' },
      { label: 'Workflow', value: 'workflow' },
      { label: 'Failed', value: 'failed' },
    ],
    records,
  };
}
