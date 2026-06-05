## MODIFIED Requirements

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
