import type { DocBlock } from '@/server/docs/schema';

export type AdminEditableDocBlock =
  | {
      id: string;
      kind: 'rich_text';
      body: string;
    }
  | {
      id: string;
      kind: 'faq';
      items: Array<{ id: string; question: string; answer: string }>;
    }
  | {
      id: string;
      kind: 'step_media';
      steps: Array<{ id: string; title: string; body: string; imageUrl: string }>;
    }
  | {
      id: string;
      kind: 'gallery';
      items: Array<{ id: string; imageUrl: string; title: string; description: string }>;
    }
  | {
      id: string;
      kind: 'video';
      title: string;
      url: string;
      coverImage: string;
      description: string;
    }
  | {
      id: string;
      kind: 'audio';
      title: string;
      url: string;
      description: string;
    }
  | {
      id: string;
      kind: 'unsupported';
      raw: DocBlock;
    };

function createId() {
  return crypto.randomUUID();
}

function collectRichText(nodes: Array<{ text?: string; content?: unknown[] }>) {
  const lines: string[] = [];
  for (const node of nodes) {
    if (typeof node.text === 'string' && node.text.trim()) {
      lines.push(node.text.trim());
    }
    if (Array.isArray(node.content)) {
      lines.push(collectRichText(node.content as Array<{ text?: string; content?: unknown[] }>));
    }
  }
  return lines.filter(Boolean).join('\n').trim();
}

export function createStarterDocBlocks(): DocBlock[] {
  return [
    {
      type: 'rich_text',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: ' ' }],
        },
      ],
    },
  ];
}

export function createEmptyAdminBlock(
  kind: Exclude<AdminEditableDocBlock['kind'], 'unsupported'>,
): AdminEditableDocBlock {
  switch (kind) {
    case 'faq':
      return {
        id: createId(),
        kind,
        items: [{ id: createId(), question: '', answer: '' }],
      };
    case 'step_media':
      return {
        id: createId(),
        kind,
        steps: [{ id: createId(), title: '', body: '', imageUrl: '' }],
      };
    case 'gallery':
      return {
        id: createId(),
        kind,
        items: [{ id: createId(), imageUrl: '', title: '', description: '' }],
      };
    case 'video':
      return {
        id: createId(),
        kind,
        title: '',
        url: '',
        coverImage: '',
        description: '',
      };
    case 'audio':
      return {
        id: createId(),
        kind,
        title: '',
        url: '',
        description: '',
      };
    case 'rich_text':
    default:
      return {
        id: createId(),
        kind: 'rich_text',
        body: '',
      };
  }
}

export function fromDocBlocks(blocks: DocBlock[]): AdminEditableDocBlock[] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'rich_text':
        return {
          id: createId(),
          kind: 'rich_text',
          body: collectRichText(block.content),
        };
      case 'faq':
        return {
          id: createId(),
          kind: 'faq',
          items: block.items.map((item) => ({
            id: createId(),
            question: item.question,
            answer: item.answer,
          })),
        };
      case 'step_media':
        return {
          id: createId(),
          kind: 'step_media',
          steps: block.steps.map((step) => ({
            id: createId(),
            title: step.title,
            body: step.body,
            imageUrl: step.imageUrl ?? '',
          })),
        };
      case 'gallery':
        return {
          id: createId(),
          kind: 'gallery',
          items: block.items.map((item) => ({
            id: createId(),
            imageUrl: item.imageUrl,
            title: item.title,
            description: item.description,
          })),
        };
      case 'video':
        return {
          id: createId(),
          kind: 'video',
          title: block.title,
          url: block.url,
          coverImage: block.coverImage ?? '',
          description: block.description,
        };
      case 'audio':
        return {
          id: createId(),
          kind: 'audio',
          title: block.title,
          url: block.url,
          description: block.description,
        };
      default:
        return {
          id: createId(),
          kind: 'unsupported',
          raw: block,
        };
    }
  });
}

export function toDocBlocks(blocks: AdminEditableDocBlock[]): DocBlock[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'rich_text':
        return {
          type: 'rich_text',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: block.body }],
            },
          ],
        };
      case 'faq':
        return {
          type: 'faq',
          items: block.items.map((item) => ({
            question: item.question.trim(),
            answer: item.answer.trim(),
          })),
        };
      case 'step_media':
        return {
          type: 'step_media',
          steps: block.steps.map((step) => ({
            title: step.title.trim(),
            body: step.body.trim(),
            ...(step.imageUrl.trim() ? { imageUrl: step.imageUrl.trim() } : {}),
          })),
        };
      case 'gallery':
        return {
          type: 'gallery',
          items: block.items.map((item) => ({
            imageUrl: item.imageUrl.trim(),
            title: item.title.trim(),
            description: item.description.trim(),
          })),
        };
      case 'video':
        return {
          type: 'video',
          title: block.title.trim(),
          url: block.url.trim(),
          ...(block.coverImage.trim() ? { coverImage: block.coverImage.trim() } : {}),
          description: block.description.trim(),
        };
      case 'audio':
        return {
          type: 'audio',
          title: block.title.trim(),
          url: block.url.trim(),
          description: block.description.trim(),
        };
      case 'unsupported':
        return block.raw;
    }
  });
}

export function validateAdminEditableBlocks(blocks: AdminEditableDocBlock[]) {
  const errors: string[] = [];

  if (blocks.length === 0) {
    errors.push('至少需要 1 个内容块。');
  }

  blocks.forEach((block, index) => {
    const prefix = `第 ${index + 1} 个内容块`;
    switch (block.kind) {
      case 'rich_text':
        if (!block.body.trim()) {
          errors.push(`${prefix}：正文不能为空`);
        }
        break;
      case 'faq':
        if (block.items.length === 0) {
          errors.push(`${prefix}：FAQ 至少需要 1 组问答`);
        }
        block.items.forEach((item) => {
          if (!item.question.trim()) {
            errors.push(`${prefix}：FAQ 问题不能为空`);
          }
          if (!item.answer.trim()) {
            errors.push(`${prefix}：FAQ 答案不能为空`);
          }
        });
        break;
      case 'step_media':
        if (block.steps.length === 0) {
          errors.push(`${prefix}：步骤块至少需要 1 个步骤`);
        }
        block.steps.forEach((step) => {
          if (!step.title.trim()) {
            errors.push(`${prefix}：步骤标题不能为空`);
          }
          if (!step.body.trim()) {
            errors.push(`${prefix}：步骤说明不能为空`);
          }
        });
        break;
      case 'gallery':
        if (block.items.length === 0) {
          errors.push(`${prefix}：图集至少需要 1 张图片`);
        }
        block.items.forEach((item) => {
          if (!item.imageUrl.trim()) {
            errors.push(`${prefix}：图片地址缺失`);
          }
        });
        break;
      case 'video':
        if (!block.title.trim()) {
          errors.push(`${prefix}：视频标题不能为空`);
        }
        if (!block.url.trim()) {
          errors.push(`${prefix}：视频地址不能为空`);
        }
        break;
      case 'audio':
        if (!block.title.trim()) {
          errors.push(`${prefix}：音频标题不能为空`);
        }
        if (!block.url.trim()) {
          errors.push(`${prefix}：音频地址不能为空`);
        }
        break;
      case 'unsupported':
        break;
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}
