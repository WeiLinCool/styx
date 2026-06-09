import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWorkflowVideoMvpInput,
  renderWorkflowVideoMvpPrompt,
  WorkflowVideoMvpValidationError,
} from './workflow-video-mvp';

test('renderWorkflowVideoMvpPrompt replaces known placeholders and preserves unknown placeholders', () => {
  const prompt = renderWorkflowVideoMvpPrompt({
    template: 'A {{workflow_prompt}} {{duration_seconds}} {{missing_value}}',
    values: {
      workflow_prompt: '石头印画',
      source_image_url: 'https://signed/source.png',
      storyboard_image_url: 'https://signed/storyboard.png',
      scene_background_url: 'https://signed/scene.png',
      storyboard_prompt_map: '{"1":"开场"}',
      duration_seconds: '5',
      resolution: '720p',
    },
  });

  assert.equal(prompt, 'A 石头印画 5 {{missing_value}}');
});

test('parseWorkflowVideoMvpInput rejects missing configured scene background', () => {
  assert.throws(
    () =>
      parseWorkflowVideoMvpInput({
        sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
        storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
        storyboardPromptMap: { shot1: '开场' },
      }),
    WorkflowVideoMvpValidationError,
  );
});

test('parseWorkflowVideoMvpInput accepts configured scene background id', () => {
  const parsed = parseWorkflowVideoMvpInput({
    sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
    storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
    sceneBackgroundId: 'wood-table-handmade-1',
    storyboardPromptMap: { shot1: '开场' },
  });

  assert.equal(parsed.sceneBackgroundId, 'wood-table-handmade-1');
});
