## ADDED Requirements

### Requirement: Browser-Bound Activation Work Order
The system SHALL allow a pending user to generate an activation binding work order from their browser before admin approval.

#### Scenario: Pending user generates activation work order
- **WHEN** a pending user clicks the activation binding request action from the user-facing activation panel
- **THEN** the system records a pending activation work order with a user-visible work order code, browser fingerprint digest, expiry, and audit metadata

#### Scenario: User receives work order code
- **WHEN** the activation work order is created successfully
- **THEN** the system shows the user a work order code that can be provided to customer support

### Requirement: Fingerprint Privacy Boundary
The system SHALL avoid storing raw browser fingerprint material for activation binding.

#### Scenario: Browser fingerprint is submitted
- **WHEN** the browser sends activation binding fingerprint data
- **THEN** the server stores a derived digest and limited review metadata instead of persisting the full raw fingerprint payload

## MODIFIED Requirements

### Requirement: Admin-Assisted Account Resolution
The system SHALL allow authorized admins to inspect activation/binding state and perform approved recovery actions.

#### Scenario: Admin reviews activation work order
- **WHEN** an authorized admin reviews a pending browser-bound activation work order
- **THEN** the admin can see the work order code, target user, request age, expiry, status, and limited device review metadata

#### Scenario: Admin approves activation work order
- **WHEN** an authorized admin approves a valid pending activation work order
- **THEN** the account is activated, the work order is marked approved, the browser/device binding context is persisted, and the action is audited

#### Scenario: Admin rejects activation work order
- **WHEN** an authorized admin rejects a pending activation work order
- **THEN** the work order is marked rejected with actor, reason, and timestamp without activating the account

#### Scenario: Admin changes account state
- **WHEN** an authorized admin activates, suspends, or archives an account
- **THEN** the state change is persisted with actor, reason, and timestamp
