## MODIFIED Requirements

### Requirement: Public AI Tools Use Agent Runtime
Protected public AI tools SHALL submit real agent runs through the server runtime and render recoverable run states instead of relying only on local mock responses or transient browser state.

#### Scenario: User starts image generation
- **WHEN** an active user starts image generation, HD repair, or style transfer with a selected enabled model
- **THEN** the page creates an image agent run for the selected mode
- **AND** immediately shows that the task is running in the background and can be checked later
- **AND** adds or updates the run in the user's visible image-generation history

#### Scenario: User starts video generation
- **WHEN** an active user starts video generation with a selected enabled model and valid parameters
- **THEN** the page creates a video agent run
- **AND** immediately shows that the task is running in the background and can be checked later
- **AND** adds or updates the run in the user's visible video-generation history

#### Scenario: Completed media run appears in history
- **WHEN** an image or video run completes and its generated output is cached or saved
- **THEN** the relevant generation page can render the result from server-owned run detail
- **AND** the page offers download or preview access according to the artifact's current cache/save state
- **AND** the page offers "存储媒体" only while the artifact is eligible for formal save

### Requirement: Multimodal Generation History UI
The public image and video generation pages SHALL provide a user-owned task history list that helps users inspect, retry, and adjust multimodal generation work.

#### Scenario: User opens image generation page
- **WHEN** an authenticated active user opens `/image-gen`
- **THEN** the page shows recent image generation runs owned by the user
- **AND** each record shows prompt summary, status, model summary when available, save/cache state, and result thumbnail when available

#### Scenario: User opens video generation page
- **WHEN** an authenticated active user opens `/video-gen`
- **THEN** the page shows recent video generation runs owned by the user
- **AND** each record shows prompt summary, status, model summary when available, save/cache state, and result preview when available

#### Scenario: User selects prior run
- **WHEN** the user selects a prior generation run
- **THEN** the page displays the run detail and result state
- **AND** the user can reuse prompt and supported input parameters for a new submission
- **AND** selecting the prior run does not mutate the original run

#### Scenario: Run is failed or expired
- **WHEN** a selected prior run failed or its temporary cached result expired
- **THEN** the page shows a clear failure or expiration message
- **AND** the page does not present the result as saved or recoverable

### Requirement: Explicit Media Save UX
The public generation pages SHALL distinguish temporary cached outputs from formally saved media.

#### Scenario: Generated media is cached but unsaved
- **WHEN** a generated image or video result is available from temporary cache but not saved
- **THEN** the page labels it as not yet stored in "我的媒体"
- **AND** shows a "存储媒体" action

#### Scenario: Generated media is saved
- **WHEN** the user saves a generated artifact successfully
- **THEN** the page marks the artifact as saved
- **AND** repeated save attempts do not show duplicate success records
- **AND** the user can find the result in the formal media library surfaces

#### Scenario: Generated media is no longer saveable
- **WHEN** the temporary cache is expired or unavailable and no formal saved asset exists
- **THEN** the page disables or hides "存储媒体"
- **AND** explains why the result cannot be saved anymore
