import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { docBlockSchema, type DocBlock } from './schema';

export type MarkdownImportResult = {
  title: string;
  summary: string;
  blocks: DocBlock[];
};

type StepMediaBlock = Extract<DocBlock, { type: 'step_media' }>;
type GalleryBlock = Extract<DocBlock, { type: 'gallery' }>;
type FaqBlock = Extract<DocBlock, { type: 'faq' }>;
type VideoBlock = Extract<DocBlock, { type: 'video' }>;
type AudioBlock = Extract<DocBlock, { type: 'audio' }>;
type FlowchartBlock = Extract<DocBlock, { type: 'flowchart' }>;
type FaqItem = { question: string; answer: string };
type GalleryItem = { imageUrl: string; title: string; description: string };
type StepItem = { title: string; body: string; imageUrl?: string };
type Root = { type: 'root'; children: Content[] };
type Heading = { type: 'heading'; depth: number; children: Content[] };
type Text = { type: 'text'; value: string };
type Image = { type: 'image'; url: string; alt?: string | null };
type Paragraph = { type: 'paragraph'; children: Content[] };
type Blockquote = { type: 'blockquote'; children: Content[] };
type ListItem = { type: 'listItem'; children: Content[] };
type List = { type: 'list'; ordered?: boolean | null; children: ListItem[] };
type Code = { type: 'code'; lang?: string | null; value: string };
type Content = Heading | Text | Image | Paragraph | Blockquote | ListItem | List | Code;

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function nodeText(node: Content | Root | undefined) {
  return node ? collapseWhitespace(toString(node as never)) : '';
}

function extractTitle(tree: Root) {
  let title = 'Untitled document';

  visit(tree, 'heading', (node) => {
    if (node.depth === 1 && title === 'Untitled document') {
      const text = nodeText(node);
      if (text) {
        title = text;
      }
    }
  });

  return title;
}

function extractSummary(parts: string[]) {
  const summary = collapseWhitespace(parts.join(' '));
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

function buildRichTextBlock(nodes: Array<Record<string, unknown>>) {
  return docBlockSchema.parse({
    type: 'rich_text',
    content: nodes,
  });
}

function buildFaqBlock(items: FaqItem[]) {
  return docBlockSchema.parse({
    type: 'faq',
    items,
  }) as FaqBlock;
}

function buildGalleryBlock(items: GalleryItem[]) {
  return docBlockSchema.parse({
    type: 'gallery',
    items,
  }) as GalleryBlock;
}

function buildVideoBlock(url: string) {
  return docBlockSchema.parse({
    type: 'video',
    title: 'Imported video',
    url,
    description: '',
  }) as VideoBlock;
}

function buildAudioBlock(url: string) {
  return docBlockSchema.parse({
    type: 'audio',
    title: 'Imported audio',
    url,
    description: '',
  }) as AudioBlock;
}

function buildFlowchartBlock(source: string) {
  return docBlockSchema.parse({
    type: 'flowchart',
    source,
    format: 'mermaid',
  }) as FlowchartBlock;
}

function buildStepMediaBlock(steps: StepItem[]) {
  return docBlockSchema.parse({
    type: 'step_media',
    steps,
  }) as StepMediaBlock;
}

function richTextNodeFromParagraph(node: Paragraph) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: nodeText(node) }],
  };
}

function richTextNodesFromChildren(children: Content[]) {
  const nodes: Array<Record<string, unknown>> = [];

  for (const child of children) {
    if (child.type === 'heading') {
      nodes.push({
        type: 'heading',
        attrs: { level: child.depth },
        content: [{ type: 'text', text: nodeText(child) }],
      });
      continue;
    }

    if (child.type === 'paragraph') {
      nodes.push(richTextNodeFromParagraph(child));
      continue;
    }

    if (child.type === 'blockquote') {
      nodes.push({
        type: 'blockquote',
        content: [richTextNodeFromParagraph({ type: 'paragraph', children: child.children } as Paragraph)],
      });
      continue;
    }

    if (child.type === 'list') {
      nodes.push({
        type: child.ordered ? 'orderedList' : 'bulletList',
        content: child.children.map((item: ListItem) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: nodeText(item) }],
            },
          ],
        })),
      });
      continue;
    }

    if (child.type === 'code') {
      nodes.push({
        type: 'codeBlock',
        attrs: child.lang ? { language: child.lang } : {},
        content: [{ type: 'text', text: child.value }],
      });
    }
  }

  return nodes;
}

function extractFaq(node: Blockquote): FaqItem | null {
  const text = nodeText(node);
  const match = text.match(/^Q:\s*(.+?)\s+A:\s*(.+)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    question: match[1].trim(),
    answer: match[2].trim(),
  };
}

function extractGallery(node: Paragraph): GalleryItem[] | null {
  const images = node.children.filter((child: Content): child is Image => child.type === 'image');
  if (images.length < 2) {
    return null;
  }

  return images.map((image: Image) => ({
    imageUrl: image.url,
    title: image.alt ?? '',
    description: '',
  }));
}

function paragraphLines(node: Paragraph) {
  const lines: string[] = [];

  for (const child of node.children) {
    if (child.type === 'text') {
      lines.push(...child.value.split('\n').map((line) => line.trim()).filter(Boolean));
    }
  }

  return lines;
}

function extractFlowchart(node: Code) {
  if (node.lang !== 'mermaid') {
    return null;
  }

  return buildFlowchartBlock(node.value);
}

function extractStepMedia(node: List) {
  if (!node.ordered) {
    return null;
  }

  const steps: StepItem[] = [];

  for (const item of node.children) {
    if (item.type !== 'listItem') {
      continue;
    }

    const [firstChild, ...restChildren] = item.children;
    if (!firstChild || firstChild.type !== 'paragraph') {
      continue;
    }

    const title = nodeText(firstChild);
    if (!title) {
      continue;
    }

    let body = '';
    let imageUrl: string | undefined;

    for (const child of restChildren) {
      if (child.type === 'paragraph') {
        body = body ? `${body} ${nodeText(child)}` : nodeText(child);
      }

      if (child.type === 'image' && !imageUrl) {
        imageUrl = child.url;
      }

      if (child.type === 'blockquote') {
        const maybeText = nodeText(child);
        body = body ? `${body} ${maybeText}` : maybeText;
      }
    }

    steps.push({
      title,
      body: collapseWhitespace(body) || title,
      imageUrl,
    });
  }

  return steps.length > 0 ? buildStepMediaBlock(steps) : null;
}

export function importMarkdownToDocBlocks(markdown: string): MarkdownImportResult {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) {
    return { title: 'Untitled document', summary: '', blocks: [] };
  }

  const tree = unified().use(remarkParse).parse(normalized) as Root;
  const title = extractTitle(tree);
  const blocks: DocBlock[] = [];
  const summaryParts: string[] = [];
  const children = [...tree.children];

  for (const node of children) {
    if (node.type === 'heading' && node.depth === 1) {
      continue;
    }

    if (node.type === 'blockquote') {
      const faq = extractFaq(node);
      if (faq) {
        blocks.push(buildFaqBlock([faq]));
        summaryParts.push(faq.question, faq.answer);
        continue;
      }
    }

    if (node.type === 'paragraph') {
      const gallery = extractGallery(node);
      if (gallery) {
        blocks.push(buildGalleryBlock(gallery));
        summaryParts.push(
          ...gallery.flatMap((item: GalleryItem) => [item.title, item.description, item.imageUrl]),
        );
        continue;
      }

      const lines = paragraphLines(node);

      if (
        lines.length > 0 &&
        lines.every(
          (line: string) =>
            /^Video:\s*(https?:\/\/\S+)\s*$/i.test(line) ||
            /^Audio:\s*(https?:\/\/\S+)\s*$/i.test(line),
        )
      ) {
        for (const line of lines as string[]) {
          const videoMatch = line.match(/^Video:\s*(https?:\/\/\S+)\s*$/i);
          if (videoMatch?.[1]) {
            blocks.push(buildVideoBlock(videoMatch[1]));
            summaryParts.push(videoMatch[1]);
            continue;
          }

          const audioMatch = line.match(/^Audio:\s*(https?:\/\/\S+)\s*$/i);
          if (audioMatch?.[1]) {
            blocks.push(buildAudioBlock(audioMatch[1]));
            summaryParts.push(audioMatch[1]);
          }
        }
        continue;
      }
    }

    if (node.type === 'code') {
      const flowchart = extractFlowchart(node);
      if (flowchart) {
        blocks.push(flowchart);
        summaryParts.push(node.value);
        continue;
      }
    }

    if (node.type === 'list') {
      const stepMedia = extractStepMedia(node);
      if (stepMedia) {
        blocks.push(stepMedia);
        summaryParts.push(
          ...stepMedia.steps.flatMap((step) => [step.title, step.body, step.imageUrl ?? '']),
        );
        continue;
      }
    }

    const richTextNodes = richTextNodesFromChildren([node]);
    if (richTextNodes.length > 0) {
      blocks.push(buildRichTextBlock(richTextNodes));
      summaryParts.push(nodeText(node));
    }
  }

  return {
    title,
    summary: extractSummary(summaryParts),
    blocks,
  };
}
