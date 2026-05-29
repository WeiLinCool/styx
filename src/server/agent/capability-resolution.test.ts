import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCapabilitySnapshot,
  resolveDefaultBundle,
} from './capability-resolution';
import type { AgentCapabilityRecord, AgentCapabilityBundleRecord } from './types';

const capabilities: AgentCapabilityRecord[] = [
  {
    id: 'model-1',
    kind: 'model',
    code: 'pi-chat',
    name: 'Pi Chat',
    status: 'enabled',
    config: { provider: 'pi', model: 'pi-default' },
  },
  {
    id: 'skill-1',
    kind: 'skill',
    code: 'stone-script',
    name: 'Stone Script',
    status: 'enabled',
    config: { prompt: '石头印画脚本' },
  },
  {
    id: 'plugin-1',
    kind: 'plugin',
    code: 'unsafe-plugin',
    name: 'Unsafe Plugin',
    status: 'disabled',
    config: {},
  },
];

const bundles: AgentCapabilityBundleRecord[] = [
  {
    id: 'bundle-chat',
    code: 'chat-default',
    taskType: 'chat',
    name: 'Chat Default',
    status: 'enabled',
    capabilityIds: ['model-1', 'skill-1', 'plugin-1'],
  },
];

test('resolveDefaultBundle returns enabled bundle for task type', () => {
  const bundle = resolveDefaultBundle(bundles, 'chat');
  assert.equal(bundle?.id, 'bundle-chat');
});

test('buildCapabilitySnapshot includes enabled capabilities and excludes disabled capabilities', () => {
  const snapshot = buildCapabilitySnapshot({ bundle: bundles[0], capabilities });
  assert.deepEqual(snapshot.capabilities.map((capability) => capability.code), ['pi-chat', 'stone-script']);
  assert.equal(snapshot.provider, 'pi');
  assert.equal(snapshot.model, 'pi-default');
});

test('buildCapabilitySnapshot clones capability config objects', () => {
  const snapshot = buildCapabilitySnapshot({ bundle: bundles[0], capabilities });

  assert.notEqual(snapshot.capabilities[0].config, capabilities[0].config);
  snapshot.capabilities[0].config.model = 'mutated-model';

  assert.equal(capabilities[0].config.model, 'pi-default');
});
