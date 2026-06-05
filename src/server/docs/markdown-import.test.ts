import assert from 'node:assert/strict';
import test from 'node:test';

import { importMarkdownToDocBlocks } from './markdown-import';
import { docBlockSchema } from './schema';

test('markdown import maps faq, gallery, video, audio, flowchart, and step media blocks', () => {
  const result = importMarkdownToDocBlocks(`# Getting Started

> Q: How do I log in?
> A: Use your bound account.

![Shot 1](https://cdn.example.com/shot-1.png)
![Shot 2](https://cdn.example.com/shot-2.png)

Video: https://cdn.example.com/demo.mp4
Audio: https://cdn.example.com/guide.mp3

\`\`\`mermaid
flowchart TD
  A[Open] --> B[Run]
\`\`\`

1. Open settings
Go to the account settings page.
![Settings](https://cdn.example.com/settings.png)

2. Confirm changes
Review the summary and save.`);

  assert.equal(result.title, 'Getting Started');
  assert.equal(result.blocks[0]?.type, 'faq');
  assert.equal(result.blocks[1]?.type, 'gallery');
  assert.equal(result.blocks[2]?.type, 'video');
  assert.equal(result.blocks[3]?.type, 'audio');
  assert.equal(result.blocks[4]?.type, 'flowchart');
  assert.equal(result.blocks[5]?.type, 'step_media');
  for (const block of result.blocks) {
    assert.doesNotThrow(() => docBlockSchema.parse(block));
  }
  assert.match(result.summary, /How do I log in/);
  assert.match(result.summary, /shot-1\.png/);
});

test('markdown import degrades unsupported content into rich text', () => {
  const result = importMarkdownToDocBlocks(`## Notes

This paragraph should stay as rich text.

| A | B |
| - | - |
| 1 | 2 |`);

  assert.equal(result.title, 'Untitled document');
  assert.ok(result.blocks.length >= 1);
  assert.ok(result.blocks.every((block) => block.type === 'rich_text'));
});

test('markdown import ignores unsupported media syntax instead of fabricating blocks', () => {
  const result = importMarkdownToDocBlocks(`Video: not-a-url

Audio: not-a-url`);

  assert.ok(result.blocks.every((block) => block.type === 'rich_text'));
});
