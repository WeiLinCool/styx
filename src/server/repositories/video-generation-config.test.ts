import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryVideoGenerationConfigRepository,
  normalizeVideoPlanConfig,
} from './video-generation-config';

test('memory video config repository returns enabled styles in sort order', async () => {
  const repository = createMemoryVideoGenerationConfigRepository({
    styles: [
      {
        id: 'style-disabled',
        code: 'disabled',
        name: 'Disabled',
        prompt: 'Hidden style.',
        enabled: false,
        sortOrder: 1,
      },
      {
        id: 'style-cinematic',
        code: 'cinematic',
        name: 'Cinematic',
        prompt: 'Cinematic movement.',
        enabled: true,
        sortOrder: 20,
      },
      {
        id: 'style-documentary',
        code: 'documentary',
        name: 'Documentary',
        prompt: 'Documentary pacing.',
        enabled: true,
        sortOrder: 10,
      },
    ],
  });

  const styles = await repository.listEnabledVideoStylePresets();

  assert.deepEqual(
    styles.map((style) => style.code),
    ['documentary', 'cinematic'],
  );
});

test('memory video config repository lists disabled styles for admin', async () => {
  const repository = createMemoryVideoGenerationConfigRepository({
    styles: [
      {
        id: 'style-disabled',
        code: 'disabled',
        name: 'Disabled',
        prompt: 'Hidden style.',
        enabled: false,
        sortOrder: 1,
      },
      {
        id: 'style-enabled',
        code: 'enabled',
        name: 'Enabled',
        prompt: 'Visible style.',
        enabled: true,
        sortOrder: 2,
      },
    ],
  });

  const styles = await repository.listAdminVideoStylePresets();

  assert.deepEqual(
    styles.map((style) => style.code),
    ['disabled', 'enabled'],
  );
});

test('memory video config repository resolves plan version policy', async () => {
  const repository = createMemoryVideoGenerationConfigRepository({
    planConfigs: [
      {
        planVersionId: 'version-pro',
        config: {
          enabled: true,
          allowedDurations: [5, 10],
          allowedResolutions: ['720p', '1080p'],
          defaultDuration: 10,
          defaultResolution: '1080p',
        },
      },
    ],
  });

  const config = await repository.getVideoPlanConfigByVersionId('version-pro');

  assert.deepEqual(config, {
    enabled: true,
    allowedDurations: [5, 10],
    allowedResolutions: ['720p', '1080p'],
    defaultDuration: 10,
    defaultResolution: '1080p',
  });
  assert.equal(await repository.getVideoPlanConfigByVersionId('missing-version'), null);
});

test('normalizeVideoPlanConfig rejects defaults outside allowed options', () => {
  assert.throws(
    () =>
      normalizeVideoPlanConfig({
        enabled: true,
        allowedDurations: [5, 10],
        allowedResolutions: ['720p'],
        defaultDuration: 15,
        defaultResolution: '720p',
      }),
    /default duration/i,
  );

  assert.throws(
    () =>
      normalizeVideoPlanConfig({
        enabled: true,
        allowedDurations: [5],
        allowedResolutions: ['720p'],
        defaultDuration: 5,
        defaultResolution: '1080p',
      }),
    /default resolution/i,
  );
});

test('normalizeVideoPlanConfig rejects empty allowed arrays', () => {
  assert.throws(
    () =>
      normalizeVideoPlanConfig({
        enabled: true,
        allowedDurations: [],
        allowedResolutions: ['720p'],
        defaultDuration: 5,
        defaultResolution: '720p',
      }),
    /allowed durations/i,
  );

  assert.throws(
    () =>
      normalizeVideoPlanConfig({
        enabled: true,
        allowedDurations: [5],
        allowedResolutions: [],
        defaultDuration: 5,
        defaultResolution: '720p',
      }),
    /allowed resolutions/i,
  );
});
