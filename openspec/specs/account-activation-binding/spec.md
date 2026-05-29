## MODIFIED Requirements

### Requirement: Browser-Bound Activation Work Order
The system SHALL allow a pending user to generate an activation binding work order from their browser before admin approval and route that work order through an operator lifecycle suitable for queue management.

#### Scenario: Pending user generates activation work order
- **WHEN** a pending user clicks the activation binding request action from the user-facing activation panel
- **THEN** the system records a new work order in the `pending` operator queue with a user-visible work order code, browser fingerprint digest, expiry, and audit metadata
#### Scenario: Support starts handling a work order
- **WHEN** an authorized admin claims or starts reviewing a pending work order
- **THEN** the system can move the work order into the `processing` queue without changing the account state yet

### Requirement: Admin-Assisted Account Resolution
The system SHALL allow authorized admins to inspect activation/binding state and complete work orders through queue-based lifecycle management.

#### Scenario: Admin approves activation work order
- **WHEN** an authorized admin approves a valid work order under review
- **THEN** the account is activated, the work order is closed with approval outcome metadata, the browser/device binding context is persisted, and the action is audited

#### Scenario: Admin rejects activation work order
- **WHEN** an authorized admin rejects a valid work order under review
- **THEN** the work order is closed with rejection outcome metadata, actor, reason, and timestamp without activating the account
#### Scenario: Admin archives a closed work order
- **WHEN** an authorized admin archives a previously closed work order
- **THEN** the work order moves to the archived queue and remains available for paginated historical review
