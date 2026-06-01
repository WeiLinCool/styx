## MODIFIED Requirements

### Requirement: AI Model Configuration
The system SHALL allow authorized admins to configure chat-capable and image-capable AI models, entitlement requirements, and credit pricing.

#### Scenario: Admin configures task-capable model
- **WHEN** an authorized admin creates or updates a model with provider, model identifier, display name, task support, enabled state, entitlement requirements, and pricing rules
- **THEN** the model can be resolved by the server for supported task types
- **AND** the entitlement requirements are available for user model filtering and runtime authorization
- **AND** the pricing rules are available for credit estimation and final billing

#### Scenario: Admin marks default model
- **WHEN** an authorized admin marks one enabled chat model as default
- **THEN** the user-facing chat model list identifies that model as the default selection
- **AND** other enabled chat models remain selectable

#### Scenario: Admin marks default image model
- **WHEN** an authorized admin marks one enabled image-capable model as default for image generation
- **THEN** the user-facing image model list identifies that model as the default selection for compatible image modes
- **AND** other enabled entitled image models remain selectable

### Requirement: User Model Availability
The system SHALL expose only enabled task-capable models from enabled providers that the active user's entitlements allow.

#### Scenario: Active user loads chat models
- **WHEN** an authenticated active user opens the chat page
- **THEN** the system returns enabled chat-capable models allowed by the user's membership, benefits, explicit grants, or other active entitlements
- **AND** each returned model includes display metadata, default marker, entitlement label, and estimated pricing summary
- **AND** the response excludes disabled models, entitlement-ineligible models, and secret provider configuration

#### Scenario: Active user loads image models
- **WHEN** an authenticated active user opens an image generation mode
- **THEN** the system returns enabled image-capable models that support the requested image mode and are allowed by the user's membership, benefits, explicit grants, or other active entitlements
- **AND** each returned model includes display metadata, default marker, entitlement label, estimated pricing summary, and supported image mode metadata
- **AND** the response excludes disabled models, entitlement-ineligible models, unsupported-mode models, and secret provider configuration

#### Scenario: User loses model entitlement
- **WHEN** a user's membership or model entitlement expires
- **THEN** models requiring that entitlement are removed from the user's model list
- **AND** new chat or image requests for those models are rejected by the server

#### Scenario: No enabled model exists
- **WHEN** an active user opens chat or image generation and no enabled entitled compatible model is available
- **THEN** the system presents an unavailable state instead of allowing a fake successful run

### Requirement: Runtime Model Entitlement Enforcement
The system SHALL enforce model entitlement rules during chat and image run creation, independent of client-side model lists.

#### Scenario: User calls entitled model
- **WHEN** an active user submits a chat or image request with a `modelId` allowed by their current entitlements
- **THEN** the runtime may proceed to credit checks and provider execution
- **AND** the run snapshots the entitlement basis used for authorization

#### Scenario: User calls premium model without entitlement
- **WHEN** an active user submits a chat or image request with a `modelId` that requires an entitlement the user does not have
- **THEN** the runtime rejects the request with a model-entitlement error
- **AND** no provider call is made
- **AND** no credits are charged

#### Scenario: User calls model unsupported for image mode
- **WHEN** an active user submits an image request with a model that is enabled but does not support the requested image mode
- **THEN** the runtime rejects the request with a model-availability error
- **AND** no provider call is made
- **AND** no credits are charged

### Requirement: Usage-Based Credit Billing
The system SHALL convert provider usage or successful image completion into credit debits for completed AI runs.

#### Scenario: Chat completes with usage
- **WHEN** a provider returns an assistant response and token usage
- **THEN** the system calculates credit cost from the selected model pricing snapshot
- **AND** records a credit ledger debit tied to the run
- **AND** persists usage, cost, and billing status with the run

#### Scenario: Image run completes with generated image
- **WHEN** a provider returns at least one generated image for a valid image run
- **THEN** the system calculates the image credit cost from the selected model pricing minimum
- **AND** records one idempotent credit ledger debit tied to the run
- **AND** persists cost, billing status, image mode, selected model, and safe provider metadata with the run

#### Scenario: User lacks sufficient credits
- **WHEN** an active user submits a chat or image request but available credits are below the model's required minimum or estimated charge
- **THEN** the system rejects the request before calling the provider
- **AND** returns an insufficient-credit state that the client can render

#### Scenario: Billing fails after provider completion
- **WHEN** provider execution succeeds but the final credit debit cannot be committed
- **THEN** the run is marked as billing failed
- **AND** no additional duplicate debit is created for retries of the same run

### Requirement: Billing Auditability
The system SHALL keep an auditable trail of AI credit charges.

#### Scenario: Admin reviews charged run
- **WHEN** an authorized admin reviews an AI run
- **THEN** the run shows provider, model, task type, mode when applicable, usage or image-result summary, credit cost, billing status, and linked ledger entry

#### Scenario: User reviews chat history
- **WHEN** a user opens persisted chat history
- **THEN** each billed chat run can show the selected model and credit cost without exposing provider secrets

#### Scenario: User reviews image history
- **WHEN** a user opens persisted image run history after a previous generated image has become unavailable
- **THEN** the run can show selected model, image mode, billing status, credit cost, and transient artifact summary without exposing provider secrets or generated media payloads

## ADDED Requirements

### Requirement: Doubao Image Provider Execution
The system SHALL execute image generation, image editing, and image repair requests through a configured Doubao-compatible image provider when credentials are available.

#### Scenario: Text-to-image request succeeds
- **WHEN** an active user submits a text-to-image request with an entitled Doubao image model
- **THEN** the server calls the Doubao-compatible image generation endpoint with the selected provider endpoint, credential reference, model identifier, prompt, size, and response format
- **AND** the server returns generated image media as a transient artifact in the immediate API response

#### Scenario: Image edit request succeeds
- **WHEN** an active user submits a style-transfer request with a valid source image and entitled image-edit model
- **THEN** the server calls the Doubao-compatible image endpoint with the selected model, prompt, source image input, and response format
- **AND** the returned edited image is available only as a transient artifact in the immediate API response

#### Scenario: Image repair request succeeds
- **WHEN** an active user submits an HD repair request with a valid source image and entitled image-upscale model
- **THEN** the server calls the Doubao-compatible image endpoint with the selected model, repair prompt, source image input, requested scale metadata, and response format
- **AND** the returned repaired image is available only as a transient artifact in the immediate API response

#### Scenario: Provider credentials unavailable in production
- **WHEN** the app runs in production and selected Doubao provider credentials are unavailable
- **THEN** the image request fails with a provider-configuration error
- **AND** no generated image is presented as real AI output
- **AND** no credits are charged
