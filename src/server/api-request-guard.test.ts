import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { buildProtectionHeaders } from './request-security';
import { runProtectedMutation } from './api-request-guard';

test('idempotent replay strips transient artifact data URLs without changing the live response', async () => {
  const requestBody = { prompt: 'stone cat' };
  const headers = buildProtectionHeaders({
    body: requestBody,
    fingerprint: 'fp-user',
    idempotencyKey: `transient-artifact-${randomUUID()}`,
  });
  const context = {
    request: new Request('http://localhost/api/agent/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    }),
    routeKind: 'user-mutation' as const,
    operation: 'POST /api/agent/runs',
    actorType: 'user' as const,
    actorId: 'user-1',
    rawBody: JSON.stringify(requestBody),
    parsedBody: requestBody,
  };
  const liveBody = {
    run: { id: 'run-1', status: 'succeeded' },
    transientArtifacts: [
      {
        kind: 'image',
        title: 'Generated image',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,SHOULD_NOT_PERSIST',
        metadata: {
          transient: true,
          nested: {
            dataUrl: 'data:image/png;base64,NESTED_SHOULD_NOT_PERSIST',
          },
        },
      },
    ],
    ordinary: {
      dataUrl: 'data:application/json;base64,ORDINARY_RESPONSE_FIELD',
    },
  };
  let calls = 0;

  const first = await runProtectedMutation(context, async () => {
    calls += 1;
    return Response.json(liveBody);
  });
  const firstBody = await first.json();

  const replay = await runProtectedMutation(context, async () => {
    calls += 1;
    return Response.json({ ok: false });
  });
  const replayBody = await replay.json();

  assert.equal(calls, 1);
  assert.equal(firstBody.transientArtifacts[0].dataUrl, 'data:image/png;base64,SHOULD_NOT_PERSIST');
  assert.equal(
    firstBody.transientArtifacts[0].metadata.nested.dataUrl,
    'data:image/png;base64,NESTED_SHOULD_NOT_PERSIST',
  );
  assert.equal(firstBody.ordinary.dataUrl, 'data:application/json;base64,ORDINARY_RESPONSE_FIELD');
  assert.equal(replay.headers.get('x-idempotency-replayed'), 'true');
  assert.equal('dataUrl' in replayBody.transientArtifacts[0], false);
  assert.equal('dataUrl' in replayBody.transientArtifacts[0].metadata.nested, false);
  assert.equal(replayBody.ordinary.dataUrl, 'data:application/json;base64,ORDINARY_RESPONSE_FIELD');
});
