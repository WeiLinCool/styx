import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStarterDocBlocks,
  fromDocBlocks,
  toDocBlocks,
} from './admin-doc-blocks';

test('starter blocks create one editable rich text block', () => {
  const blocks = createStarterDocBlocks();

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, 'rich_text');
});

test('unsupported blocks round-trip as readonly fallback items', () => {
  const state = fromDocBlocks([{ type: 'flowchart', source: 'graph TD;A-->B', format: 'mermaid' }]);

  assert.equal(state[0]?.kind, 'unsupported');
  assert.deepEqual(toDocBlocks(state), [{ type: 'flowchart', source: 'graph TD;A-->B', format: 'mermaid' }]);
});
