## MODIFIED Requirements

### Requirement: User Run History
The system SHALL allow users to view their own persisted run history and recover recent chat interactions from shared runtime storage, including selected model and billing metadata for real AI runs.

#### Scenario: User opens chat history
- **WHEN** an authenticated active user opens the chat page
- **THEN** the system returns recent `chat` runs owned by that user
- **AND** the client can reconstruct recent user prompts, assistant replies, selected model labels, and credit charges from persisted run fields

#### Scenario: User refreshes after a completed chat request
- **WHEN** a user refreshes the chat page after submitting a chat prompt
- **THEN** the recent persisted chat runs are loaded again from the server
- **AND** the last completed assistant reply remains visible without relying on transient browser state
- **AND** the run retains the provider/model snapshot and billing status used for that response

#### Scenario: Future multimodal history shares one storage base
- **WHEN** chat, image, video, or workflow requests complete
- **THEN** the system stores the request in `agent_runs`
- **AND** stores rich output references in `agent_artifacts`
- **SO THAT** web and app clients can recover user history from the same persisted model

#### Scenario: User refreshes after a completed image request
- **WHEN** a user refreshes the image generation page after generating an image
- **THEN** the generated media payload is not recovered from persisted run history
- **AND** the run retains selected model, image mode, prompt, billing status, and safe transient artifact summary metadata

### Requirement: Selected Model Runtime Routing
The user agent runtime SHALL route chat and image runs through the model selected by the user and validated by the server against provider, model, task support, mode support, and entitlement rules.

#### Scenario: Runtime creates selected-model chat run
- **WHEN** an active user submits a chat run with `modelId`
- **THEN** the runtime validates that the model is enabled, supports chat, and is allowed by the user's current entitlements
- **AND** snapshots provider, model, pricing, entitlement basis, and display metadata into the run before execution

#### Scenario: Runtime creates selected-model image run
- **WHEN** an active user submits an image run with `modelId` and a supported image mode
- **THEN** the runtime validates that the model is enabled, supports that image mode, and is allowed by the user's current entitlements
- **AND** snapshots provider, model, pricing, entitlement basis, image mode, and display metadata into the run before execution

#### Scenario: Runtime rejects disabled model
- **WHEN** a user submits a chat or image run with a disabled or unknown `modelId`
- **THEN** the runtime rejects the request
- **AND** does not create a successful provider call or charge credits

#### Scenario: Runtime rejects unauthorized model
- **WHEN** a user submits a chat or image run with a known model that is not allowed by their current entitlements
- **THEN** the runtime rejects the request
- **AND** records no successful provider call
- **AND** charges no credits

#### Scenario: Runtime rejects image mode without source image
- **WHEN** a user submits an HD repair or style-transfer image run without a valid source image payload
- **THEN** the runtime rejects the request before provider execution
- **AND** records no successful provider call
- **AND** charges no credits

## ADDED Requirements

### Requirement: Transient Image Runtime Outputs
The user agent runtime SHALL return generated image media only through transient response artifacts while keeping durable storage free of generated media payloads.

#### Scenario: Image provider returns base64 image
- **WHEN** an image provider returns a base64 image payload
- **THEN** the runtime returns a transient image artifact with a browser-renderable data URL
- **AND** persists only a safe artifact summary with null media body and null media URL

#### Scenario: Image provider returns temporary image URL
- **WHEN** an image provider returns a temporary generated image URL
- **THEN** the runtime converts the image to a transient response artifact when allowed by size and type limits
- **AND** persists no generated media URL in durable run or artifact storage

#### Scenario: Image provider returns invalid media
- **WHEN** an image provider returns an unsupported, oversized, or unreadable image result
- **THEN** the runtime marks the run failed or incomplete with a stable error
- **AND** charges no credits unless a valid generated image artifact was accepted

### Requirement: Image Source Payload Validation
The user agent runtime SHALL validate source images for edit and repair modes before calling an image provider.

#### Scenario: Valid source image payload
- **WHEN** an image edit or repair run includes a data URL with an allowed image MIME type and acceptable size
- **THEN** the runtime may pass that source image to the selected provider adapter
- **AND** the source image is not persisted in durable run input or artifact storage

#### Scenario: Invalid source image payload
- **WHEN** an image edit or repair run includes a non-image, malformed, or oversized source payload
- **THEN** the runtime rejects the request with an invalid-request error
- **AND** does not call the provider
- **AND** does not charge credits
