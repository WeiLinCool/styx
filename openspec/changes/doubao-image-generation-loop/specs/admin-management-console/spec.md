## MODIFIED Requirements

### Requirement: AI Provider And Model Management
The system SHALL provide admin console workflows for configuring AI providers, models, task support, and pricing used by user chat and image generation.

#### Scenario: Admin opens AI model settings
- **WHEN** an authorized admin opens the AI settings or AI jobs management area
- **THEN** the console provides access to provider and model configuration
- **AND** shows enabled state, provider type, supported task types, default model status, and pricing summary

#### Scenario: Admin updates model availability
- **WHEN** an authorized admin enables, disables, reprices, or changes the default chat or image model
- **THEN** subsequent user model lists and runtime requests use the updated configuration
- **AND** existing run history keeps the pricing and model snapshot used at execution time

#### Scenario: Admin updates image model capabilities
- **WHEN** an authorized admin marks a model as supporting text-to-image generation, image editing, or image repair
- **THEN** the user-facing image model APIs use those capability flags to include or exclude the model per image mode
- **AND** runtime execution rejects image requests for modes that the selected model does not support

#### Scenario: Admin validates provider configuration
- **WHEN** an authorized admin reviews a provider configuration
- **THEN** the console indicates whether required credential references and endpoint fields are present
- **AND** does not reveal stored secret values

#### Scenario: Admin creates or edits a provider
- **WHEN** an authorized admin submits a provider form with code, name, provider type, endpoint, credential env key reference, and status
- **THEN** the provider record is created or updated through repository-owned persistence rules
- **AND** incomplete provider state is rejected with validation feedback before it can be enabled

#### Scenario: Admin tests provider connectivity
- **WHEN** an authorized admin runs a provider-level test using a selected model
- **THEN** the server performs local configuration validation first
- **AND** issues a minimal upstream test request through the provider adapter
- **AND** returns only a safe summary of pass/fail state, latency, and normalized error information

#### Scenario: Admin tests a model directly
- **WHEN** an authorized admin runs a model-level test
- **THEN** the server verifies the provider is enabled and the model is configured for the requested task
- **AND** executes a minimal upstream test request for that exact model
- **AND** returns a safe summary without exposing credentials

## ADDED Requirements

### Requirement: Image Model Admin Visibility
The system SHALL make image model capability and default state visible in the admin AI model console.

#### Scenario: Admin reviews image-capable model row
- **WHEN** an authorized admin views the AI model table
- **THEN** each model row shows whether the model supports chat, text-to-image generation, image editing, and image repair
- **AND** each model row shows whether it is the default chat model or default image model

#### Scenario: Admin filters image-capable models
- **WHEN** an authorized admin filters or searches AI models
- **THEN** image capability labels and default image state participate in filtering and search
