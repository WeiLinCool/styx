import type { AgentRunStatus } from '@/server/agent/types';

export const VIDEO_RUN_CONNECTION_LOST_MESSAGE =
  '连接已中断，任务仍可能在后台运行，请稍后从历史记录查看。';

export function shouldKeepVideoRunPolling(status: AgentRunStatus) {
  return status === 'queued' || status === 'running';
}
