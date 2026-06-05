- `pnpm exec tsx --test src/server/repositories/docs.test.ts` — PASS
  - 覆盖文档列表筛选、分类删除约束、文章/分类/query entrypoints。
- `cd src/app/api/admin/docs/categories/[categoryId] && node --import tsx --test route.test.ts` — PASS
  - 覆盖分类维护路由的输入解析。
- `pnpm exec tsx --test src/features/admin/admin-docs-module.test.tsx src/server/repositories/docs.test.ts` — PASS
  - 覆盖文档列表活动筛选 UI 与 repository 组合查询。
- `pnpm exec tsx --test src/features/admin/admin-doc-categories-manager.test.tsx` — PASS
  - 覆盖父子分类分组渲染与新增二级分类入口。
- `pnpm exec tsx --test src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx src/server/repositories/docs.test.ts` — PASS
  - 覆盖 starter block、unsupported fallback、块编辑器骨架渲染。
- `cd src/app/api/admin/docs/categories/[categoryId] && node --import tsx --test route.test.ts && cd /Users/wlz/Documents/codeSpace/styx && pnpm exec tsx --test src/server/repositories/docs.test.ts src/features/admin/admin-docs-module.test.tsx src/features/admin/admin-doc-categories-manager.test.tsx src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx` — PASS
  - 15/15 focused tests 通过。
- `pnpm run validate` — BLOCKED by pre-existing repository issue
  - `src/server/docs/markdown-import.ts` 无法解析 `mdast-util-to-string`、`remark-parse`、`unified`、`unist-util-visit`，并伴随 1 个已有 implicit `any`。
- `pnpm run build` — BLOCKED by pre-existing repository issue
  - 与 `validate` 相同，构建在 `src/server/docs/markdown-import.ts` 的既有依赖解析失败处中断。

浏览器验证：

- 目标页面：`/admin/docs`、`/admin/docs/categories`、`/admin/docs/articles/new`
- 阻塞原因 1：现有 `127.0.0.1:4000` 进程确认为本仓库 `next-server`，但 `curl --max-time 15` 对 `/admin/login` 与 `/admin/docs` 均在 15 秒内无任何响应。
- 阻塞原因 2：尝试在其他端口启动隔离 `next dev` 时，仓库已有 `.next/dev/lock` 被占用，无法在不干扰现有本地环境的前提下启动独立实例。
- 结论：本轮未完成浏览器级页面交互验证，原因是本地运行环境阻塞，不是当前补丁已确认的功能失败。
