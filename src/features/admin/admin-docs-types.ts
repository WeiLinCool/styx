import type {
  AdminDocArticleRow,
  AdminDocCategoryRow,
  DocArticleStatus,
  DocAudienceScope,
} from '@/server/repositories/docs';
import type { DocBlock } from '@/server/docs/schema';

export type AdminDocEditorArticle = {
  id?: string;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  coverImage: string;
  status: DocArticleStatus;
  blocks: DocBlock[];
};

export type AdminDocEditorData = {
  categories: AdminDocCategoryRow[];
  article: AdminDocEditorArticle;
};

export type AdminDocImportPreview = {
  title: string;
  summary: string;
  blocks: DocBlock[];
};

export type AdminDocCategoryCreateInput = {
  name: string;
  slug: string;
  description?: string;
  audienceScope?: DocAudienceScope;
  sortOrder?: number;
};

export type AdminDocTableRow = AdminDocArticleRow;
export type { AdminDocCategoryRow };
