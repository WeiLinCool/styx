## MODIFIED Requirements

### Requirement: Content Management
The system SHALL provide admin console workflows for managing homepage content blocks used by the public homepage.

#### Scenario: Admin lists homepage content blocks
- **WHEN** an authorized admin opens `/admin/content`
- **THEN** the console shows homepage content records with slug, title, block type, status, owner, published time, and updated time
- **AND** draft, published, and archived records are distinguishable.

#### Scenario: Admin creates or edits a homepage content draft
- **WHEN** an authorized admin submits a supported homepage content slug and valid block metadata
- **THEN** the system persists the content through repository-owned rules
- **AND** invalid slugs, invalid metadata, empty required fields, and duplicate slugs are rejected before persistence.

#### Scenario: Admin publishes homepage content
- **WHEN** an authorized admin publishes a valid draft homepage content block
- **THEN** the content status becomes `published`
- **AND** `published_at` is set
- **AND** subsequent public homepage reads can use that block.

#### Scenario: Admin unpublishes or archives homepage content
- **WHEN** an authorized admin unpublishes or archives a homepage content block
- **THEN** subsequent public homepage reads no longer use that block
- **AND** the admin console still provides enough status context for operators to understand the record state.
