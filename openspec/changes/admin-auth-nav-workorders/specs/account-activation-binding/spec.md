## MODIFIED Requirements

### Requirement: Browser-Bound Activation Work Order
The system SHALL allow a pending user to generate an activation binding work order from their browser before admin approval and route that work order through an operator lifecycle suitable for queue management.

#### Scenario: Support starts handling a work order
- **WHEN** an authorized admin claims or starts reviewing a pending work order
- **THEN** the system can move the work order into the `processing` queue without changing the account state yet

### Requirement: Admin-Assisted Account Resolution
The system SHALL allow authorized admins to inspect activation/binding state and complete work orders through queue-based lifecycle management.

#### Scenario: Admin archives a closed work order
- **WHEN** an authorized admin archives a previously closed work order
- **THEN** the work order moves to the archived queue and remains available for paginated historical review
