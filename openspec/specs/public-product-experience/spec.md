## MODIFIED Requirements

### Requirement: Public AI Tools Use Agent Runtime
Protected public AI tools SHALL submit real agent runs through the server runtime instead of relying only on local mock responses.

#### Scenario: User sends chat prompt
- **WHEN** an active user sends a chat prompt with a selected enabled model
- **THEN** the page submits the prompt and selected model to the agent runtime API
- **AND** renders the returned run state, assistant message, selected model, and billing status

#### Scenario: User starts workflow generation
- **WHEN** an active user starts image, video, or workflow generation
- **THEN** the page creates an agent run for the selected task type and shows progress, completion, failure, and artifact states from the server

#### Scenario: User cannot afford selected chat model
- **WHEN** an active user tries to send a chat prompt without enough credits for the selected model
- **THEN** the page shows an insufficient-credit state
- **AND** does not append a fake assistant response

### Requirement: Chat Model Selection
The public chat experience SHALL let active users select from admin-enabled chat models allowed by their current entitlements.

#### Scenario: User opens chat model selector
- **WHEN** an active user opens the chat page
- **THEN** the page loads the user's entitled enabled chat models from the server
- **AND** selects the configured default model when the user has no previous selection

#### Scenario: User sees entitlement-gated models
- **WHEN** an active user has membership, benefit, or explicit model entitlements
- **THEN** the model selector shows only models available to that user
- **AND** each model can show the entitlement tier or benefit label that grants access

#### Scenario: Selected model becomes unavailable
- **WHEN** a previously selected model is no longer enabled or no longer allowed by the user's entitlements
- **THEN** the page falls back to the current default enabled model when one exists
- **AND** otherwise shows that chat is unavailable
