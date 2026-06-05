## Purpose
Define AI provider/model configuration, user model availability, runtime model entitlement enforcement, real chat execution, usage-based credit billing, and billing auditability.

## Requirements

### Requirement: AI Provider Configuration
The system SHALL allow authorized admins to configure AI providers used for real chat execution.

#### Scenario: Admin creates provider
- **WHEN** an authorized admin saves a provider with name, provider type, endpoint configuration, credential reference, and enabled state
- **THEN** the provider is persisted for server-side model routing
- **AND** secret values are not exposed back to browser clients

#### Scenario: Disabled provider is hidden from users
- **WHEN** a provider is disabled
- **THEN** models under that provider are unavailable for new user chat requests
- **AND** previous runs retain their provider snapshot for history and audit

### Requirement: AI Model Configuration
The system SHALL allow authorized admins to configure chat-capable AI models, entitlement requirements, and credit pricing.

#### Scenario: Admin configures chat model
- **WHEN** an authorized admin creates or updates a model with provider, model identifier, display name, task support, enabled state, entitlement requirements, and pricing rules
- **THEN** the model can be resolved by the server for supported task types
- **AND** the entitlement requirements are available for user model filtering and runtime authorization
- **AND** the pricing rules are available for credit estimation and final billing

#### Scenario: Admin marks default model
- **WHEN** an authorized admin marks one enabled chat model as default
- **THEN** the user-facing chat model list identifies that model as the default selection
- **AND** other enabled chat models remain selectable

### Requirement: User Model Availability
The system SHALL expose only enabled chat-capable models from enabled providers that the active user's entitlements allow, including enterprise gateway model listing for bearer-token users.

#### Scenario: Active user loads chat models
- **WHEN** an authenticated active user opens the chat page
- **THEN** the system returns enabled chat-capable models allowed by the user's membership, benefits, explicit grants, or other active entitlements
- **AND** each returned model includes display metadata, default marker, entitlement label, and estimated pricing summary
- **AND** the response excludes disabled models, entitlement-ineligible models, and secret provider configuration

#### Scenario: User loses model entitlement
- **WHEN** a user's membership or model entitlement expires
- **THEN** models requiring that entitlement are removed from the user's model list
- **AND** new chat requests for those models are rejected by the server

#### Scenario: No enabled model exists
- **WHEN** an active user opens chat and no enabled entitled chat model is available
- **THEN** the system presents an unavailable state instead of allowing a fake successful conversation

#### Scenario: Enterprise bearer-token user lists models
- **WHEN** an enterprise bearer-token user calls the OpenAI-compatible model listing endpoint
- **THEN** the system resolves enabled chat-capable models from the same model configuration and user entitlement rules used by WebUI chat
- **AND** does not expose secret provider configuration

### Requirement: Runtime Model Entitlement Enforcement
The system SHALL enforce model entitlement rules during chat run creation and enterprise gateway requests, independent of client-side model lists.

#### Scenario: User calls entitled model
- **WHEN** an active user submits a chat request with a `modelId` allowed by their current entitlements
- **THEN** the runtime may proceed to credit checks and provider execution
- **AND** the run snapshots the entitlement basis used for authorization

#### Scenario: User calls premium model without entitlement
- **WHEN** an active user submits a chat request with a `modelId` that requires an entitlement the user does not have
- **THEN** the runtime rejects the request with a model-entitlement error
- **AND** no provider call is made
- **AND** no credits are charged

#### Scenario: Enterprise gateway user calls unauthorized model
- **WHEN** an enterprise bearer-token user requests a model that is unknown, disabled, or not allowed by current server-side entitlements
- **THEN** the gateway rejects the request
- **AND** no provider call is made
- **AND** no credits are charged

### Requirement: Real Chat Execution
The system SHALL execute user chat requests through the selected configured model when real provider credentials are available.

#### Scenario: User sends chat with selected model
- **WHEN** an active user submits a chat request with a valid enabled `modelId`
- **THEN** the server resolves the model and provider configuration
- **AND** calls the provider adapter with the user's conversation messages
- **AND** returns the assistant message produced by that provider

#### Scenario: Provider credentials unavailable in development
- **WHEN** the app runs outside production without configured provider credentials
- **THEN** the system may use the deterministic development adapter
- **AND** the run metadata marks the response as development fallback

#### Scenario: Provider credentials unavailable in production
- **WHEN** the app runs in production and selected provider credentials are unavailable
- **THEN** the chat request fails with a provider-configuration error
- **AND** no successful assistant response is presented as real AI output

### Requirement: Usage-Based Credit Billing
The system SHALL convert provider usage into credit debits for completed chat runs.

#### Scenario: Chat completes with usage
- **WHEN** a provider returns an assistant response and token usage
- **THEN** the system calculates credit cost from the selected model pricing snapshot
- **AND** records a credit ledger debit tied to the run
- **AND** persists usage, cost, and billing status with the run

#### Scenario: User lacks sufficient credits
- **WHEN** an active user submits a chat request but available credits are below the model's required minimum or estimated charge
- **THEN** the system rejects the request before calling the provider
- **AND** returns an insufficient-credit state that the client can render

#### Scenario: Billing fails after provider completion
- **WHEN** provider execution succeeds but the final credit debit cannot be committed
- **THEN** the run is marked as billing failed
- **AND** no additional duplicate debit is created for retries of the same run

### Requirement: Billing Auditability
The system SHALL keep an auditable trail of AI credit charges.

#### Scenario: Admin reviews charged run
- **WHEN** an authorized admin reviews an AI chat run
- **THEN** the run shows provider, model, usage, credit cost, billing status, and linked ledger entry

#### Scenario: User reviews chat history
- **WHEN** a user opens persisted chat history
- **THEN** each billed chat run can show the selected model and credit cost without exposing provider secrets
