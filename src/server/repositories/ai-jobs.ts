import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
  metadataText,
} from './admin-shared';

export type AdminAiJobRow = {
  id: string;
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

function getSeedAiJobs(): AdminModuleData<AdminAiJobRow> {
  const records: AdminAiJobRow[] = [
    {
      id: 'seed-job-1',
      type: 'image',
      status: 'succeeded',
      user: 'Seed Member',
      promptSummary: 'A clean product hero image',
      provider: 'seed',
      model: 'seed-image-model',
      outputReference: '/seed/image.png',
      errorSummary: 'none',
      createdAt: '2026-05-29T07:40:00.000Z',
      duration: '10s',
      actions: ['Review output', 'Rerun', 'Mark resolved'],
    },
    {
      id: 'seed-job-2',
      type: 'video',
      status: 'failed',
      user: '视频团队账号',
      promptSummary: '短视频产品展示，包含三段镜头。',
      provider: 'seed',
      model: 'seed-video-model',
      outputReference: 'none',
      errorSummary: 'provider timeout',
      createdAt: '2026-05-29T07:12:00.000Z',
      duration: 'timeout',
      actions: ['Review error', 'Rerun', 'Cancel'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '任务数', value: '2', hint: '24h sample', tone: 'info' },
      { label: '成功', value: '1', hint: 'succeeded', tone: 'success' },
      { label: '失败', value: '1', hint: 'needs review', tone: 'danger' },
      { label: '待复跑', value: '1', hint: 'rerun-ready', tone: 'warning' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 2 },
      { label: 'Image', value: 'image', count: 1 },
      { label: 'Video', value: 'video', count: 1 },
      { label: 'Failed', value: 'failed', count: 1 },
    ],
    records,
  };
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

  const records = rows.map(({ job, user }) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    user: user?.displayName ?? '未知用户',
    promptSummary: summarizePrompt(job.prompt),
    provider: job.provider ?? '未配置',
    model: job.model ?? '未配置',
    outputReference: metadataText(job.output, 'assetUrl', job.output ? 'has output JSON' : 'none'),
    errorSummary: job.errorMessage ?? 'none',
    createdAt: formatIso(job.createdAt),
    duration:
      job.startedAt && job.completedAt
        ? `${Math.max(0, Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 1000))}s`
        : '未完成',
    actions: ['Review output', 'Rerun', 'Cancel'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '任务数', value: String(records.length), hint: 'PostgreSQL', tone: 'info' },
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
