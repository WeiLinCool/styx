## MODIFIED Requirements

### Requirement: AI Provider And Model Management
The system SHALL provide admin console workflows for configuring AI providers, models, and pricing used by user chat.

#### Scenario: Admin opens AI model settings
- **WHEN** an authorized admin opens the AI settings or AI jobs management area
- **THEN** the console provides access to provider and model configuration
- **AND** shows enabled state, provider type, supported task types, default model status, and pricing summary

#### Scenario: Admin updates model availability
- **WHEN** an authorized admin enables, disables, reprices, or changes the default chat model
- **THEN** subsequent user chat model lists and chat requests use the updated configuration
- **AND** existing run history keeps the pricing and model snapshot used at execution time

#### Scenario: Admin validates provider configuration
- **WHEN** an authorized admin reviews a provider configuration
- **THEN** the console indicates whether required credential references and endpoint fields are present
- **AND** does not reveal stored secret values

#### Scenario: Admin creates or edits an OpenAI-compatible provider
- **WHEN** an authorized admin submits a provider form with code, name, provider type, endpoint, credential env key reference, and status
- **THEN** the provider record is created or updated through repository-owned persistence rules
- **AND** incomplete provider state is rejected with validation feedback before it can be enabled

#### Scenario: Admin tests provider connectivity
- **WHEN** an authorized admin runs a provider-level test using a selected model
- **THEN** the server performs local configuration validation first
- **AND** issues a minimal upstream test request through the provider adapter
- **AND** returns only a safe summary of pass/fail state, latency, and normalized error information

#### Scenario: Admin tests a model directly
- **WHEN** an authorized admin runs a model-level test
- **THEN** the server verifies the provider is enabled and the model is configured for chat
- **AND** executes a minimal upstream test request for that exact model
- **AND** returns a safe summary without exposing credentials

### Requirement: Admin User Points Operations
The admin management console SHALL let authorized operators inspect ledger-backed point balances and perform manual point adjustments.

#### Scenario: Admin views user points
- **WHEN** an authorized admin opens the users console
- **THEN** the page shows each user's current point balance derived from the ledger
- **AND** may show referral or recent activity summaries relevant to support operations

#### Scenario: Admin submits manual point adjustment
- **WHEN** an authorized admin submits a signed point adjustment with a required reason
- **THEN** the system persists the adjustment through repository-owned server logic
- **AND** records an audit event tied to the operator and target user

#### Scenario: Unauthorized admin mutation
- **WHEN** a request without the required admin authorization attempts a point adjustment
- **THEN** the system rejects the request
- **AND** does not create a ledger row or audit event
