## ADDED Requirements

### Requirement: Chinese Admin Console Copy
The system SHALL present admin-console navigation, headers, controls, action labels, placeholders, empty states, and operation feedback in Chinese.

#### Scenario: Admin browses localized console
- **WHEN** an authorized admin opens any admin management page
- **THEN** the visible operator-facing shell, navigation, module controls, table empty states, and action labels are shown in Chinese

### Requirement: Activation Binding Work Order Review
The system SHALL expose browser-bound activation binding work orders in the admin console for customer support review.

#### Scenario: Support reviews pending activation work orders
- **WHEN** an authorized admin opens the relevant user or activation work order management view
- **THEN** pending work orders show work order code, target user, status, expiry, request time, and limited device review metadata

#### Scenario: Support completes activation binding
- **WHEN** an authorized admin approves or rejects an activation work order
- **THEN** the admin console shows localized success or error feedback and refreshes the work order state
