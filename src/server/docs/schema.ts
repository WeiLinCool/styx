import { z } from 'zod';
import { DOC_BLOCK_TYPES } from './constants';

export const docBlockTypeSchema = z.enum(DOC_BLOCK_TYPES);

const docRichTextNodeSchema: z.ZodType<{
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Array<{
    type: string;
    text?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  }>;
}> = z
  .object({
    type: z.string().min(1),
    text: z.string().min(1).optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(z.lazy(() => docRichTextNodeSchema)).optional(),
  })
  .strict()
  .refine((node) => node.text !== undefined || node.content !== undefined, {
    message: 'rich text nodes require text or content',
  });

const docStepMediaItemSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    imageUrl: z.string().trim().min(1).optional(),
  })
  .strict();

const docFaqItemSchema = z
  .object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })
  .strict();

const docGalleryItemSchema = z
  .object({
    imageUrl: z.string().url(),
    title: z.string().default(''),
    description: z.string().default(''),
  })
  .strict();

export const docBlockSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('rich_text'),
      content: z.array(docRichTextNodeSchema).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('step_media'),
      steps: z.array(docStepMediaItemSchema).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('video'),
      title: z.string().min(1),
      url: z.string().url(),
      coverImage: z.string().url().optional(),
      description: z.string().default(''),
    })
    .strict(),
  z
    .object({
      type: z.literal('audio'),
      title: z.string().min(1),
      url: z.string().url(),
      description: z.string().default(''),
    })
    .strict(),
  z
    .object({
      type: z.literal('faq'),
      items: z.array(docFaqItemSchema).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('flowchart'),
      source: z.string().min(1),
      format: z.enum(['mermaid', 'json']).default('mermaid'),
    })
    .strict(),
  z
    .object({
      type: z.literal('gallery'),
      items: z.array(docGalleryItemSchema).min(1),
    })
    .strict(),
]);

export type DocBlock = z.infer<typeof docBlockSchema>;
export type DocBlockType = z.infer<typeof docBlockTypeSchema>;
