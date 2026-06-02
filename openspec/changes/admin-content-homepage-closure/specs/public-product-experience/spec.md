## MODIFIED Requirements

### Requirement: Homepage Published Content Rendering
The public homepage SHALL render admin-published homepage content when available and fall back to static defaults when it is not.

#### Scenario: Published homepage content exists
- **WHEN** a visitor opens `/home` and valid homepage content blocks are published
- **THEN** the homepage renders the published content for those blocks
- **AND** keeps existing interactive behaviors such as login, navigation menus, reveal animations, and create-type selection.

#### Scenario: Homepage content is missing or not public
- **WHEN** a homepage content block is missing, draft, archived, or has no `published_at`
- **THEN** the homepage uses the static default content for that block.

#### Scenario: Homepage content is malformed or database is unavailable
- **WHEN** published homepage content cannot be normalized safely or the database cannot be read
- **THEN** the homepage still renders using static defaults
- **AND** does not expose raw malformed content to the user interface.
