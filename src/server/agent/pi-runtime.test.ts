import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeterministicPiRuntime } from './pi-runtime';

test('deterministic runtime returns a workflow storyboard image artifact', async () => {
  const runtime = createDeterministicPiRuntime();
  const result = await runtime.run({
    runId: 'run-1',
    userId: 'user-1',
    taskType: 'workflow',
    prompt: 'server-owned storyboard prompt',
    provider: 'pi',
    model: 'pi-default',
    capabilities: [],
    input: {
      stage: 'storyboard',
      sourceImageOrigin: 'manual',
    },
  });

  const artifact = result.artifacts[0];
  assert.ok(artifact);
  const metadata = artifact.metadata ?? {};
  assert.equal(result.finalMessage, '12宫格分镜图已生成，请及时查看。');
  assert.equal(artifact.kind, 'image');
  assert.equal(artifact.title, '12宫格分镜图');
  assert.equal(metadata.mimeType, 'image/svg+xml');
  assert.equal(metadata.width, 821);
  assert.equal(metadata.height, 1916);
  assert.match(artifact.body ?? '', /^data:image\/svg\+xml;base64,/);
});
