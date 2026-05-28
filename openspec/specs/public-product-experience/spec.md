## ADDED Requirements

### Requirement: Public Routes
The system SHALL provide the public product routes currently represented by the prototype.

#### Scenario: Visitor opens public pages
- **WHEN** a visitor navigates to splash, home, chat, image generation, video generation, workflow, membership, benefits, shop, partner benefits, or user center pages
- **THEN** the page renders from the root Next.js application

### Requirement: Visual Direction Preservation
The public product experience SHALL preserve the 南风AI restrained white-background visual direction.

#### Scenario: Public page renders
- **WHEN** a public page is displayed
- **THEN** typography, spacing, color, border radius, and motion follow the existing `projects/DESIGN.md` direction

### Requirement: Shared User State
The system SHALL provide shared user/session state to public pages that need identity-aware rendering.

#### Scenario: User-facing page requests session state
- **WHEN** a page such as user center, membership, or shop needs user context
- **THEN** it can consume a shared typed session abstraction

### Requirement: Protected Public Flows Require Active Accounts
The system SHALL require an active account for protected product flows.

#### Scenario: Pending user opens protected flow
- **WHEN** a pending activation user opens user center, membership purchase, shop checkout, or AI generation history
- **THEN** the system directs the user to complete account activation or binding before continuing

### Requirement: Public Flow Fallback Data
The system SHALL render public flows with stable development data when external services are not configured.

#### Scenario: External credentials are unavailable
- **WHEN** the app runs in local development without production service credentials
- **THEN** public pages still render meaningful content and do not crash
