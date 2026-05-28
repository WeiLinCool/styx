## ADDED Requirements

### Requirement: Admin Access Control
The system SHALL require an authorized admin session for management routes.

#### Scenario: Unauthorized visitor opens admin
- **WHEN** a visitor without admin authorization opens `/admin`
- **THEN** the system blocks access and presents an authentication or access-denied state

#### Scenario: Authorized admin opens admin
- **WHEN** an authorized admin opens `/admin`
- **THEN** the system renders the management console layout

### Requirement: Admin Navigation
The system SHALL provide persistent navigation for all management modules.

#### Scenario: Admin browses modules
- **WHEN** an admin uses the management console
- **THEN** dashboard, users, memberships, benefits, shop/orders, AI jobs, partners, content/assets, and settings are reachable from navigation

### Requirement: Operational Dashboard
The system SHALL provide a dashboard with operational KPIs and recent activity.

#### Scenario: Admin opens dashboard
- **WHEN** an admin opens `/admin`
- **THEN** the dashboard shows key metrics, recent AI jobs, recent orders, user activity, partner leads, and system notices

### Requirement: User Management
The system SHALL allow admins to inspect and manage user records.

#### Scenario: Admin searches users
- **WHEN** an admin filters or searches the user list
- **THEN** matching users show identity, status, membership, credits, and recent activity

#### Scenario: Admin reviews account binding state
- **WHEN** an admin opens a user detail view
- **THEN** activation state, bound identities, verification state, and account risk/audit summary are visible

#### Scenario: Admin assists activation
- **WHEN** an authorized admin activates or reissues activation for a user
- **THEN** the account lifecycle changes are persisted and an audit event is recorded

### Requirement: Membership And Benefits Management
The system SHALL allow admins to manage membership plans, benefit definitions, and entitlement adjustments.

#### Scenario: Admin reviews membership plans
- **WHEN** an admin opens the membership management section
- **THEN** plans, benefit rules, status, pricing labels, and entitlement summaries are visible

### Requirement: Shop And Order Management
The system SHALL allow admins to manage shop products and order states.

#### Scenario: Admin updates an order
- **WHEN** an admin changes an order status or fulfillment note
- **THEN** the order record reflects the new operational state

### Requirement: AI Job Operations
The system SHALL allow admins to review image, video, and workflow generation jobs.

#### Scenario: Admin reviews failed jobs
- **WHEN** an admin filters AI jobs by failed status
- **THEN** failed jobs show type, user, provider metadata, error summary, and available review actions

### Requirement: Partner Operations
The system SHALL allow admins to manage partner leads and onboarding state.

#### Scenario: Admin opens partner leads
- **WHEN** an admin opens the partner section
- **THEN** leads show contact details, source, stage, benefit interest, and next action

### Requirement: Content And Asset Management
The system SHALL allow admins to review configurable public content and media references.

#### Scenario: Admin reviews content assets
- **WHEN** an admin opens content management
- **THEN** homepage content, banners, tutorials, examples, and media references are listed with status

### Requirement: Settings And Audit Visibility
The system SHALL expose settings placeholders and audit events for operational transparency.

#### Scenario: Admin opens settings
- **WHEN** an admin opens settings
- **THEN** role access, provider configuration placeholders, storage configuration placeholders, and recent audit events are visible
