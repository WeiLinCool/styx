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

#### Scenario: User refreshes after a completed workflow storyboard request
- **WHEN** a user refreshes the workflow page after generating the Step 1 `12宫格分镜图`
- **THEN** the completed storyboard result is restored from the persisted run/artifact data when available
- **AND** the run retains the workflow step context, prompt snapshot, and safe artifact summary metadata needed to re-render the completed storyboard state

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

#### Scenario: Runtime executes workflow storyboard generation
- **WHEN** an active user submits the Step 1 `12宫格分镜图` workflow request
- **THEN** the runtime uses the server-owned storyboard prompt template
- **AND** validates the current workflow upload context before execution
- **AND** returns the completed storyboard result through the existing run artifact path once the run reaches a terminal state

#### Scenario: Runtime executes workflow video MVP
- **WHEN** an active user submits the final workflow video request
- **THEN** the runtime resolves the `workflow-video-mvp` Agent Capability configuration
- **AND** validates the source image, storyboard artifact, scene background, and storyboard prompt/map snapshot
- **AND** renders the final video prompt on the server
- **AND** creates a video task polling run bound to `doubao-seedance-2-0`
- **AND** returns the completed video artifact through the existing run artifact path once the run reaches a terminal state

## ADDED Requirements

### Requirement: Workflow Storyboard Prompt Ownership
The user agent runtime SHALL own the storyboard prompt template for the Step 1 `12宫格分镜图` generation flow.

#### Scenario: Runtime builds storyboard prompt
- **WHEN** the workflow storyboard request is created
- **THEN** the runtime composes the storyboard prompt from server-owned template text and the current upload context
- **AND** the client does not need to send or maintain the full storyboard prompt text

#### Scenario: Runtime polls until terminal state
- **WHEN** the workflow storyboard generation is still running on the server
- **THEN** the client-side request handling keeps polling the run detail endpoint until the run becomes succeeded or failed
- **AND** does not report a timeout while the server run is still actively progressing

### Requirement: Workflow Video Skill-Like Capability
The user agent runtime SHALL treat `workflow-video-mvp` as a skill-like capability config while keeping execution inside the server runtime.

#### Scenario: Runtime resolves workflow video capability
- **WHEN** a final workflow video request is created
- **THEN** the runtime reads the enabled Agent Capability with code `workflow-video-mvp`
- **AND** validates its description, input schema, prompt template, model binding, defaults, and execution protocol
- **AND** snapshots the effective config into the created run

#### Scenario: Runtime rejects incomplete workflow video capability
- **WHEN** the `workflow-video-mvp` capability is missing, disabled, lacks a prompt template, or has an invalid model binding
- **THEN** the runtime rejects final workflow video generation before creating a provider task
- **AND** returns an explicit admin-remediation error

#### Scenario: Runtime validates workflow video materials
- **WHEN** final workflow video generation is requested
- **THEN** the runtime requires Step 0 source image, Step 1 storyboard image artifact, Step 2 scene background, and storyboard prompt/map snapshot
- **AND** signs or resolves material URLs server-side
- **AND** does not trust raw material URLs supplied by the client

#### Scenario: Runtime calls Doubao Seedance
- **WHEN** workflow video materials and capability config are valid
- **THEN** the runtime sends the rendered prompt and ordered material URLs to the configured video adapter
- **AND** the provider/model snapshot identifies `doubao` and `doubao-seedance-2-0`
- **AND** existing single-prompt video generation behavior remains compatible
