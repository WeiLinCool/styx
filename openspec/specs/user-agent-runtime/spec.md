## MODIFIED Requirements

### Requirement: User Run History
The system SHALL allow users to view their own persisted run history and recover recent chat interactions from shared runtime storage.

#### Scenario: User opens chat history
- **WHEN** an authenticated active user opens the chat page
- **THEN** the system returns recent `chat` runs owned by that user
- **AND** the client can reconstruct recent user prompts and assistant replies from persisted run fields

#### Scenario: User refreshes after a completed chat request
- **WHEN** a user refreshes the chat page after submitting a chat prompt
- **THEN** the recent persisted chat runs are loaded again from the server
- **AND** the last completed assistant reply remains visible without relying on transient browser state

#### Scenario: Future multimodal history shares one storage base
- **WHEN** chat, image, video, or workflow requests complete
- **THEN** the system stores the request in `agent_runs`
- **AND** stores rich output references in `agent_artifacts`
- **SO THAT** web and app clients can recover user history from the same persisted model

### Requirement: Superuser Runtime Access
The system SHALL provide a deterministic superuser account for operator testing of user runtime features.

#### Scenario: Superuser seed exists
- **WHEN** the environment bootstrap or seed path runs
- **THEN** the system ensures an account for phone `18120810787` exists
- **AND** the account is active
- **AND** the account has owner-level admin access
