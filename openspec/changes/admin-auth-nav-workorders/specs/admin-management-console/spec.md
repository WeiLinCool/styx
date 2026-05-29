## MODIFIED Requirements

### Requirement: Admin Access Control
The system SHALL require an authorized admin session for management routes and expose explicit admin sign-in and sign-out actions in the console shell.

#### Scenario: Unauthorized visitor opens admin
- **WHEN** a visitor without admin authorization opens `/admin`
- **THEN** the system blocks access and presents an authentication or access-denied state with a visible path to sign in during supported environments

#### Scenario: Authorized admin exits admin session
- **WHEN** an authorized admin uses the sign-out action from the admin shell
- **THEN** the system clears the admin session cookie and refreshes the console into an unauthenticated state

### Requirement: Admin Navigation
The system SHALL provide persistent navigation for all management modules and reflect the current route in the active menu state.

#### Scenario: Admin browses modules
- **WHEN** an admin uses the management console
- **THEN** dashboard, users, memberships, benefits, shop/orders, AI jobs, partners, content/assets, and settings are reachable from navigation
#### Scenario: Admin opens a non-dashboard module
- **WHEN** an admin opens `/admin/users`, `/admin/orders`, or another nested admin route
- **THEN** the matching left navigation item is visually active and unrelated items are inactive

### Requirement: Activation Binding Work Order Review
The system SHALL expose browser-bound activation binding work orders in the admin console as a paginated queue with status tabs for customer support review.

#### Scenario: Support reviews work orders by status
- **WHEN** an authorized admin opens the user work-order management view
- **THEN** the console shows tabs for `待处理`, `处理中`, `已办结`, and `已归档` with per-status counts and a paginated list for the selected tab

#### Scenario: Support closes a work order
- **WHEN** an authorized admin completes activation binding handling for a work order
- **THEN** the work order leaves the active queue, records its closure outcome, and appears in the `已办结` or archived workflow according to the selected management action

#### Scenario: Support reviews archive history
- **WHEN** an authorized admin opens the archived tab
- **THEN** only archived work orders are shown and the list remains paginated
