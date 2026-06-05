import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveVideoGenerationPolicy,
  validateVideoGenerationSelection,
} from './video-generation-policy';

test('resolveVideoGenerationPolicy blocks free users', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: null,
    planConfig: null,
    styles: [
      {
        id: 'style-1',
        code: 'stone',
        name: '石头印画',
        prompt: '石头印画动态短片',
        enabled: true,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.upgradeRequired, true);
  assert.deepEqual(policy.durations, []);
  assert.deepEqual(policy.resolutions, []);
});

test('resolveVideoGenerationPolicy exposes enabled member options and defaults', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: {
      enabled: true,
      allowedDurations: [5, 10],
      allowedResolutions: ['720p', '1080p'],
      defaultDuration: 5,
      defaultResolution: '720p',
    },
    styles: [
      {
        id: 'style-disabled',
        code: 'off',
        name: 'Off',
        prompt: 'off',
        enabled: false,
        sortOrder: 0,
      },
      {
        id: 'style-1',
        code: 'stone',
        name: '石头印画',
        prompt: '石头印画动态短片',
        enabled: true,
        sortOrder: 2,
      },
      {
        id: 'style-2',
        code: 'ink',
        name: '水墨',
        prompt: '水墨动态短片',
        enabled: true,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.durations, [5, 10]);
  assert.deepEqual(
    policy.resolutions.map((item) => item.value),
    ['720p', '1080p'],
  );
  assert.equal(policy.resolutions[0]?.label, '720P');
  assert.equal(policy.defaults.durationSeconds, 5);
  assert.equal(policy.defaults.resolution, '720p');
  assert.deepEqual(
    policy.styles.map((style) => style.code),
    ['ink', 'stone'],
  );
});

test('resolveVideoGenerationPolicy disables plans with invalid defaults', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: {
      enabled: true,
      allowedDurations: [5, 10],
      allowedResolutions: ['720p'],
      defaultDuration: 15,
      defaultResolution: '720p',
    },
    styles: [
      {
        id: 'style-1',
        code: 'stone',
        name: '石头印画',
        prompt: '石头印画动态短片',
        enabled: true,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.upgradeRequired, false);
  assert.deepEqual(policy.durations, []);
  assert.deepEqual(policy.resolutions, []);
  assert.deepEqual(policy.defaults, {
    styleCode: null,
    durationSeconds: null,
    resolution: null,
  });
});

test('resolveVideoGenerationPolicy blocks members when plan config is missing', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: null,
    styles: [
      {
        id: 'style-1',
        code: 'stone',
        name: '石头印画',
        prompt: '石头印画动态短片',
        enabled: true,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.upgradeRequired, false);
  assert.deepEqual(policy.durations, []);
  assert.deepEqual(policy.resolutions, []);
});

test('resolveVideoGenerationPolicy blocks members when plan config is disabled', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: {
      enabled: false,
      allowedDurations: [5],
      allowedResolutions: ['720p'],
      defaultDuration: 5,
      defaultResolution: '720p',
    },
    styles: [
      {
        id: 'style-1',
        code: 'stone',
        name: '石头印画',
        prompt: '石头印画动态短片',
        enabled: true,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.upgradeRequired, false);
  assert.deepEqual(policy.durations, []);
  assert.deepEqual(policy.resolutions, []);
});

test('resolveVideoGenerationPolicy keeps valid member policy enabled with no enabled styles', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: {
      enabled: true,
      allowedDurations: [5],
      allowedResolutions: ['720p'],
      defaultDuration: 5,
      defaultResolution: '720p',
    },
    styles: [
      {
        id: 'style-disabled',
        code: 'off',
        name: 'Off',
        prompt: 'off',
        enabled: false,
        sortOrder: 0,
      },
    ],
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.upgradeRequired, false);
  assert.deepEqual(policy.styles, []);
  assert.deepEqual(policy.durations, [5]);
  assert.deepEqual(policy.resolutions, [{ value: '720p', label: '720P' }]);
  assert.deepEqual(policy.defaults, {
    styleCode: null,
    durationSeconds: 5,
    resolution: '720p',
  });
});

test('resolveVideoGenerationPolicy returns fresh disabled defaults for each policy', () => {
  const firstPolicy = resolveVideoGenerationPolicy({
    entitlement: null,
    planConfig: null,
    styles: [],
  });

  firstPolicy.defaults.styleCode = 'mutated';
  firstPolicy.defaults.durationSeconds = 99;
  firstPolicy.defaults.resolution = 'mutated';

  const secondPolicy = resolveVideoGenerationPolicy({
    entitlement: null,
    planConfig: null,
    styles: [],
  });

  assert.deepEqual(secondPolicy.defaults, {
    styleCode: null,
    durationSeconds: null,
    resolution: null,
  });
});

test('resolveVideoGenerationPolicy returns policy data without caller-owned aliases', () => {
  const planConfig = {
    enabled: true,
    allowedDurations: [5, 10],
    allowedResolutions: ['720p'],
    defaultDuration: 5,
    defaultResolution: '720p',
  };
  const styles = [
    {
      id: 'style-1',
      code: 'stone',
      name: '石头印画',
      prompt: '石头印画动态短片',
      enabled: true,
      sortOrder: 1,
    },
  ];

  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig,
    styles,
  });

  policy.durations.push(15);
  policy.styles[0]!.name = 'mutated';

  assert.deepEqual(planConfig.allowedDurations, [5, 10]);
  assert.equal(styles[0]!.name, '石头印画');
});

test('validateVideoGenerationSelection rejects options outside member policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: 'prompt',
          enabled: true,
          sortOrder: 1,
        },
      ],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: {
        styleCode: 'stone',
        durationSeconds: 5,
        resolution: '720p',
      },
    },
    selection: { styleCode: 'stone', durationSeconds: 10, resolution: '720p' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_duration');
});

test('validateVideoGenerationSelection rejects styles outside member policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: 'prompt',
          enabled: true,
          sortOrder: 1,
        },
      ],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: {
        styleCode: 'stone',
        durationSeconds: 5,
        resolution: '720p',
      },
    },
    selection: { styleCode: 'ink', durationSeconds: 5, resolution: '720p' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_style');
});

test('validateVideoGenerationSelection rejects resolutions outside member policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: 'prompt',
          enabled: true,
          sortOrder: 1,
        },
      ],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: {
        styleCode: 'stone',
        durationSeconds: 5,
        resolution: '720p',
      },
    },
    selection: { styleCode: 'stone', durationSeconds: 5, resolution: '1080p' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_resolution');
});

test('validateVideoGenerationSelection rejects disabled policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: false,
      upgradeRequired: true,
      message: 'Upgrade required.',
      styles: [],
      durations: [],
      resolutions: [],
      defaults: {
        styleCode: null,
        durationSeconds: null,
        resolution: null,
      },
    },
    selection: { styleCode: 'stone', durationSeconds: 5, resolution: '720p' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'policy_disabled');
});

test('validateVideoGenerationSelection accepts options inside member policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: 'prompt',
          enabled: true,
          sortOrder: 1,
        },
      ],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: {
        styleCode: 'stone',
        durationSeconds: 5,
        resolution: '720p',
      },
    },
    selection: { styleCode: 'stone', durationSeconds: 5, resolution: '720p' },
  });

  assert.equal(result.ok, true);
});
