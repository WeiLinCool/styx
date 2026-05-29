## ADDED Requirements

### Requirement: Account Lifecycle
The system SHALL track each user account lifecycle state as pending activation, active, suspended, or archived.

#### Scenario: New invited account is created
- **WHEN** an account is created from an invitation, admin action, or pre-registration flow
- **THEN** the account starts in pending activation unless the creating operation explicitly activates it

#### Scenario: Suspended account attempts protected access
- **WHEN** a suspended account attempts to access protected public or admin flows
- **THEN** the system blocks access and reports the account is unavailable

### Requirement: Activation Flow
The system SHALL support secure account activation by activation token, activation code, verified email/phone flow, or authorized admin action.

#### Scenario: User activates with valid token
- **WHEN** a pending user submits a valid, unexpired activation token
- **THEN** the system marks the account active and records the activation timestamp

#### Scenario: User activates with invalid token
- **WHEN** a pending user submits an invalid or expired activation token
- **THEN** the system rejects activation without changing account state

### Requirement: Identity Binding
The system SHALL allow users to bind verified email, phone, and provider identities to a single account.

#### Scenario: User binds phone identity
- **WHEN** an active or pending user completes phone verification
- **THEN** the phone identity is bound to that user and marked verified

#### Scenario: Verified identity already belongs to another active user
- **WHEN** a user attempts to bind an identity already verified for another active account
- **THEN** the system rejects the binding and requires account recovery or admin resolution

### Requirement: Admin-Assisted Account Resolution
The system SHALL allow authorized admins to inspect activation/binding state and perform approved recovery actions.

#### Scenario: Admin reissues activation
- **WHEN** an authorized admin reissues activation for a pending user
- **THEN** a new activation token or code is created and the action is audited

#### Scenario: Admin changes account state
- **WHEN** an authorized admin activates, suspends, or archives an account
- **THEN** the state change is persisted with actor, reason, and timestamp

### Requirement: Activation And Binding Audit
The system SHALL audit security-relevant activation and binding events.

#### Scenario: Identity is bound
- **WHEN** an identity is bound, unbound, or verification status changes
- **THEN** an audit event records the actor, target user, identity type, action, and timestamp
