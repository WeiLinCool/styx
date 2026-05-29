## ADDED Requirements

### Requirement: Public AI Tools Use Agent Runtime
Protected public AI tools SHALL submit real agent runs through the server runtime instead of relying only on local mock responses.

#### Scenario: User sends chat prompt
- **WHEN** an active user sends a chat prompt
- **THEN** the page submits the prompt to the agent runtime API and renders the returned run state or assistant message

#### Scenario: User starts workflow generation
- **WHEN** an active user starts image, video, or workflow generation
- **THEN** the page creates an agent run for the selected task type and shows progress, completion, failure, and artifact states from the server
