## MODIFIED Requirements

### Requirement: User Run History
The system SHALL allow users to view their own persisted run history and recover recent chat interactions from shared runtime storage, including selected model and billing metadata for real chat runs.

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

### Requirement: Selected Model Runtime Routing
The user agent runtime SHALL route chat runs through the model selected by the user and validated by the server against provider, model, and entitlement rules.

#### Scenario: Runtime creates selected-model chat run
- **WHEN** an active user submits a chat run with `modelId`
- **THEN** the runtime validates that the model is enabled, supports chat, and is allowed by the user's current entitlements
- **AND** snapshots provider, model, pricing, entitlement basis, and display metadata into the run before execution

#### Scenario: Runtime rejects disabled model
- **WHEN** a user submits a chat run with a disabled or unknown `modelId`
- **THEN** the runtime rejects the request
- **AND** does not create a successful provider call or charge credits

#### Scenario: Runtime rejects unauthorized model
- **WHEN** a user submits a chat run with a known model that is not allowed by their current entitlements
- **THEN** the runtime rejects the request
- **AND** records no successful provider call
- **AND** charges no credits
