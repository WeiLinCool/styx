## ADDED Requirements

### Requirement: User Invite Code Sharing
The system SHALL provide each authenticated user with a stable shareable invite code and registration link from the user center.

#### Scenario: User opens invite section
- **WHEN** an authenticated user opens the user-center invite section
- **THEN** the system returns that user's active invite code and a registration link containing the code
- **AND** creates the invite code lazily if the user does not yet have one

#### Scenario: User revisits invite section
- **WHEN** an authenticated user requests invite details again
- **THEN** the system returns the same active invite code by default
- **AND** does not generate duplicate active codes for the same user

### Requirement: Referral Binding On Registration
The system SHALL bind a newly registered user to at most one referrer when registration includes a valid invite code.

#### Scenario: New user registers with valid invite code
- **WHEN** a newly created account completes registration with a valid invite code owned by another user
- **THEN** the system persists a referral binding between the referrer and the new user
- **AND** does not grant referral points yet

#### Scenario: User attempts self-invite
- **WHEN** a registration flow resolves an invite code owned by the same user being created or otherwise invalid for binding
- **THEN** the system rejects the binding
- **AND** does not create a referral relationship

#### Scenario: User already has referrer
- **WHEN** a registered user already has a referral binding
- **THEN** the system does not replace the existing referrer with a new invite code

### Requirement: Qualified Referral Reward
The system SHALL grant `+200` points to the referrer exactly once when the referred user first reaches a valid conversion state.

#### Scenario: Referred user pays first order
- **WHEN** a referred user's first qualifying order becomes `paid`
- **THEN** the system records the referral as qualified
- **AND** grants `+200` points to the referrer through the credit ledger

#### Scenario: Admin activates referred user into membership first
- **WHEN** an authorized admin activates a referred user into membership before any paid order has qualified that referral
- **THEN** the system records the referral as qualified by membership activation
- **AND** grants `+200` points to the referrer through the credit ledger

#### Scenario: Referral qualification event repeats
- **WHEN** later paid orders or membership-activation retries occur for the same referred user
- **THEN** the system does not grant duplicate referral rewards

### Requirement: Daily Check-In Reward
The system SHALL let an authenticated user check in once per `Asia/Shanghai` natural day for a random integer reward between `1` and `3`.

#### Scenario: User checks in for the first time today
- **WHEN** an authenticated user performs a daily check-in and no check-in record exists for that user on the current business day
- **THEN** the system creates a daily check-in record
- **AND** grants a random integer reward between `1` and `3` through the credit ledger

#### Scenario: User checks in again on the same day
- **WHEN** an authenticated user tries to check in again on the same business day
- **THEN** the system reports that the user has already checked in today
- **AND** does not create a duplicate reward grant

### Requirement: Admin Point Adjustment
The system SHALL allow authorized admins to manually adjust user points with explicit reasons and auditability.

#### Scenario: Admin adds points
- **WHEN** an authorized admin submits a positive point adjustment with a required reason
- **THEN** the system records the adjustment in the credit ledger
- **AND** writes a corresponding audit event

#### Scenario: Admin subtracts points within balance
- **WHEN** an authorized admin submits a negative point adjustment whose absolute value does not exceed the current balance
- **THEN** the system records the adjustment in the credit ledger
- **AND** writes a corresponding audit event

#### Scenario: Admin subtracts points below zero
- **WHEN** an authorized admin submits a negative point adjustment that would drive the balance below zero
- **THEN** the system rejects the adjustment
- **AND** does not create a ledger row

### Requirement: Ledger-Backed Point Visibility
The system SHALL expose consistent ledger-backed point balances and recent activity to both users and admins.

#### Scenario: User loads point summary
- **WHEN** an authenticated user loads the user center or auth-me payload
- **THEN** the system returns the current balance derived from the point ledger
- **AND** includes recent point activity summaries without exposing internal-only metadata

#### Scenario: Admin reviews user points
- **WHEN** an authorized admin opens the users console
- **THEN** the console shows the user's current ledger-backed point balance
- **AND** can show recent balance-changing activity relevant to operator decisions
