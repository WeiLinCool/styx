import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { agentRunStreamEvents } from './schema';

test('agent run stream events table exposes replayable event schema', () => {
  const config = getTableConfig(agentRunStreamEvents);
  const columns = new Map(config.columns.map((column) => [column.name, column]));

  assert.equal(config.name, 'agent_run_stream_events');
  assert.ok(columns.has('run_id'));
  assert.ok(columns.has('sequence'));
  assert.ok(columns.has('event_type'));
  assert.ok(columns.has('payload'));

  const orderedUniqueIndex = config.indexes.find(
    (index) => index.config.name === 'agent_run_stream_events_run_id_sequence_unique_idx',
  );
  assert.ok(orderedUniqueIndex);
  assert.equal(orderedUniqueIndex.config.unique, true);
  const indexColumns = orderedUniqueIndex.config.columns as Array<{ name?: string }>;
  assert.deepEqual(indexColumns.map((column) => column.name), ['run_id', 'sequence']);
});
