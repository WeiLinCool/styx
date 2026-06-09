## MODIFIED Requirements

### Requirement: Admin Agent Capability Operations
The admin console SHALL let authorized admins manage backend Agent capability configuration used by public AI workflows.

#### Scenario: Admin views workflow video MVP capability
- **WHEN** an authorized admin opens the Agent Capability console
- **THEN** the console shows the `workflow-video-mvp` capability with its enabled state
- **AND** summarizes whether prompt template, fixed input schema, `doubao-seedance-2-0` binding, and defaults are configured

#### Scenario: Admin edits workflow video MVP configuration
- **WHEN** an authorized admin opens the `workflow-video-mvp` editor
- **THEN** the editor allows updating the operator description, final video prompt template, duration default, and resolution default
- **AND** displays the fixed MVP required material schema as read-only configuration
- **AND** validates that the model binding resolves to an enabled `doubao-seedance-2-0` video task polling model

#### Scenario: Admin saves invalid workflow video config
- **WHEN** an authorized admin saves an empty prompt template or invalid video defaults
- **THEN** the save is rejected
- **AND** the previous valid runtime configuration remains active

#### Scenario: Unauthorized user accesses workflow video config
- **WHEN** a non-admin user requests workflow video capability configuration endpoints
- **THEN** the system denies access using the existing admin authorization behavior
