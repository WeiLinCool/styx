## ADDED Requirements

### Requirement: Agent Capability Management
The system SHALL allow authorized admins to maintain model routing, skills, MCP servers, plugins, and capability bundles from the admin console.

#### Scenario: Admin reviews agent capabilities
- **WHEN** an authorized admin opens the agent capability management surface
- **THEN** the console shows enabled models, skills, MCP servers, plugins, default bundles, status, scope, and last update metadata

#### Scenario: Admin updates capability bundle
- **WHEN** an authorized admin changes a capability bundle
- **THEN** the system persists the change, records audit metadata, and uses the new bundle only for future agent runs

### Requirement: Agent Run Operations
The system SHALL allow authorized admins to inspect user agent runs and their resolved capability snapshots.

#### Scenario: Admin reviews agent run
- **WHEN** an authorized admin opens the AI operations view for a user run
- **THEN** the console shows user, task type, status, provider/model, prompt summary, resolved skills/MCP/plugins, output references, error summary, and timestamps
