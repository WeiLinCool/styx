## ADDED Requirements

### Requirement: AI Provider And Model Management
The system SHALL provide admin console workflows for configuring AI providers, models, and pricing used by user chat.

#### Scenario: Admin opens AI model settings
- **WHEN** an authorized admin opens the AI settings or AI jobs management area
- **THEN** the console provides access to provider and model configuration
- **AND** shows enabled state, provider type, supported task types, default model status, and pricing summary

#### Scenario: Admin updates model availability
- **WHEN** an authorized admin enables, disables, or reprices a chat model
- **THEN** subsequent user chat model lists and chat requests use the updated configuration
- **AND** existing run history keeps the pricing and model snapshot used at execution time

#### Scenario: Admin validates provider configuration
- **WHEN** an authorized admin reviews a provider configuration
- **THEN** the console indicates whether required credential references and endpoint fields are present
- **AND** does not reveal stored secret values
