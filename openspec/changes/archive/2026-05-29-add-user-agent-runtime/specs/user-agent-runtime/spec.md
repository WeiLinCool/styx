## ADDED Requirements

### Requirement: User Agent Run Submission
The system SHALL allow active users to submit chat, image, video, and workflow AI requests through a user-facing agent runtime API.

#### Scenario: Active user submits chat request
- **WHEN** an active user submits a prompt from the chat page
- **THEN** the system creates an agent run with the user id, task type, prompt, resolved model configuration, queued or running status, and creation timestamp

#### Scenario: Inactive user submits protected request
- **WHEN** a pending, suspended, archived, or anonymous user submits a protected agent request
- **THEN** the system rejects the request without creating a run

### Requirement: Admin-Managed Capability Resolution
The system SHALL resolve model, skill, MCP server, and plugin configuration from admin-maintained capability bundles before executing a user run.

#### Scenario: User submits request without runtime controls
- **WHEN** a user submits an AI request without specifying skills, MCP servers, or plugins
- **THEN** the server resolves the enabled default capability bundle for the task type and stores the resolved capability snapshot on the run

#### Scenario: Admin changes capability configuration
- **WHEN** an admin changes a model, skill, MCP server, plugin, or bundle after a run was created
- **THEN** existing runs keep their original resolved capability snapshot

### Requirement: Pi Runtime Adapter
The system SHALL execute agent runs through a server-side Pi runtime adapter port.

#### Scenario: Runtime executes run
- **WHEN** an agent run starts execution
- **THEN** the server passes prompt, task type, user context, resolved model, skills, MCP servers, and plugins to the Pi runtime adapter

#### Scenario: Runtime is unavailable
- **WHEN** the Pi runtime adapter cannot execute a run
- **THEN** the system marks the run failed, records an error event, and returns a typed failure state to the caller

### Requirement: Run Events And Artifacts
The system SHALL persist structured events and artifacts for each agent run.

#### Scenario: Run completes with text output
- **WHEN** the runtime produces a final assistant message
- **THEN** the system records a completed run state, a completion event, and a text artifact or message payload associated with the run

#### Scenario: Run produces media output
- **WHEN** the runtime produces image, video, document, or workflow output
- **THEN** the system records an artifact with type, title, status, metadata, and output reference without relying on transient client state

### Requirement: User Run History
The system SHALL allow users to view their own run status and history.

#### Scenario: User polls current run
- **WHEN** a user requests the status of one of their own runs
- **THEN** the system returns the run status, final message if present, artifacts, and non-secret capability summary

#### Scenario: User requests another user's run
- **WHEN** a user requests a run owned by another user
- **THEN** the system denies access

### Requirement: Admin Capability Maintenance
The system SHALL allow authorized admins to maintain models, skills, MCP servers, plugins, and capability bundles.

#### Scenario: Admin enables a skill for a bundle
- **WHEN** an authorized admin adds or enables a skill in a capability bundle
- **THEN** future matching user runs can resolve that skill while existing runs remain unchanged

#### Scenario: Admin disables unsafe capability
- **WHEN** an authorized admin disables a skill, MCP server, plugin, model, or bundle
- **THEN** new user runs do not resolve the disabled capability
