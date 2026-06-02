## Context

`/admin/content` currently reads `content_assets` and renders disabled action buttons. The homepage still renders static arrays and hardcoded text. The local database already has enough fields for a lightweight content workflow: slug, title, kind, status, body, url, metadata, published timestamp, creator, and timestamps.

The user-approved scope is the minimum useful loop: selected `/home` homepage blocks become admin-managed content, while all other public pages remain static until this loop is proven.

## Decisions

### Reuse `content_assets` For The First Closure

The change SHALL use existing `content_assets` rows for homepage blocks. Structured block data lives in `metadata`, with `body` and `url` used only where they naturally describe the block.

Alternative considered: new CMS tables for pages and blocks. Rejected for the first release because the current schema already supports the necessary state and the target is one page.

Alternative considered: a single `home-page` JSON record. Rejected because publishing one small section would require replacing a whole-page blob and would make later reuse harder.

### Use Block Slugs As The Content Contract

The initial contract reserves predictable slugs:

- `home.hero`
- `home.nav`
- `home.stone_intro`
- `home.join_us`
- `home.ai_tools`

The repository validates these slugs and maps each one to a typed homepage view-model section.

### Separate Admin Drafts From Public Reads

Admin pages can show draft, published, and archived records. Public homepage reads SHALL only consume `status = published` records with `published_at` set. Draft edits do not change production output until an explicit publish action succeeds.

### Preserve Static Fallback

The existing homepage content remains the fallback source. Public normalization merges published records over defaults. If a section is missing, malformed, or unavailable because the database cannot be read, the homepage still renders the current static experience.

### Keep Route Files Thin

Admin API route handlers validate request bodies and admin session, then call repository-owned operations. Repository code owns query shape, slug/status rules, and status transitions. UI components render forms and action states but do not own durable truth.

## Data Flow

```
Admin content form/action
  -> /api/admin/content route validation
  -> content repository mutation
  -> content_assets row
  -> /home server loader
  -> public content repository read/normalize
  -> homepage client component
```

## Status Transitions

- create -> draft
- draft -> published
- published -> draft
- draft or published -> archived

Archived records are not public. Editing archived records is out of scope unless the implementation explicitly supports restore; otherwise the admin can create a new draft with a new slug or restore in a later change.

## Risks

- JSON metadata can drift without validation. The implementation must include validators and tests for each supported homepage block.
- The current homepage is client-heavy. Split only the server data wrapper from the interactive client component to avoid broad visual churn.
- Admin forms for nested arrays can become noisy. Use compact controls or validated JSON inputs for nested arrays in the first release, and keep publish validation strict.
