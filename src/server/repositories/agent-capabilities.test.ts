import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSeedAgentCapabilityAdminData,
  getDefaultAgentCapabilityBundle,
  seedAgentCapabilities,
  seedAgentCapabilityBundles,
} from './agent-capabilities';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('seed agent capability and bundle ids are stable UUID strings', () => {
  const ids = [
    ...seedAgentCapabilities.map((capability) => capability.id),
    ...seedAgentCapabilityBundles.map((bundle) => bundle.id),
  ];

  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.match(id, uuidPattern);
  }
});

test('getSeedAgentCapabilityAdminData exposes capability records and metrics', () => {
  const data = getSeedAgentCapabilityAdminData();

  assert.equal(data.source, 'seed');
  assert.ok(data.records.some((record) => record.kind === 'skill'));
  assert.ok(data.bundles.some((bundle) => bundle.code === 'workflow-default'));
  assert.ok(data.metrics.some((metric) => metric.label === '能力数'));
});

test('seed default bundle resolves model, skill, mcp and plugin capabilities for user runtime', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');

  assert.equal(snapshot?.provider, 'pi');
  assert.equal(snapshot?.model, 'pi-default');
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'skill'));
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'mcp_server'));
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'plugin'));
});
