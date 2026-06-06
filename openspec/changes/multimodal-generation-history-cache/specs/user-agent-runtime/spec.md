## MODIFIED Requirements

### Requirement: User Run History
The system SHALL allow users to view their own persisted run history and recover recent chat, image, and video interactions from shared runtime storage, including selected model, billing metadata, task status, and recoverable output references when available.

#### Scenario: User opens multimodal generation history
- **WHEN** an authenticated active user opens an image or video generation surface
- **THEN** the system returns recent `image` or `video` runs owned by that user
- **AND** the client can display prompt summary, run status, selected model label, credit charge state, and created/updated time
- **AND** no run owned by another user is returned

#### Scenario: User refreshes after a completed multimodal request
- **WHEN** a user refreshes after a generated image or video run has completed
- **THEN** the run detail remains loadable from server-owned history
- **AND** completed media artifacts expose recoverable cached or saved media references when they are still available
- **AND** the page does not rely on transient browser state or a still-open SSE connection to show the completed result

#### Scenario: User adjusts from previous multimodal output
- **WHEN** a user selects a prior image or video run from history
- **THEN** the page can show the original prompt, model summary, input parameters, status, and result preview when available
- **AND** the user can use that context to submit a follow-up or retry without mutating the original run record

### Requirement: Temporary Generated Media Cache
The system SHALL temporarily cache generated image and video outputs after successful provider completion so completed run results can be previewed and saved later without depending only on provider URLs.

#### Scenario: Image provider returns output
- **WHEN** an image provider returns one or more generated images for a user run
- **THEN** the server stores each accepted output in temporary generated-media cache storage
- **AND** the persisted run artifact stores safe cache metadata and typed media metadata
- **AND** the artifact does not persist large raw media payloads directly in the database

#### Scenario: Video provider returns output
- **WHEN** a video provider reports a generated video output for a user run
- **THEN** the server stores the output in temporary generated-media cache storage before presenting the run as recoverably completed
- **AND** the persisted run artifact stores safe cache metadata and typed video metadata
- **AND** the run can later be loaded without requiring the original provider output URL to remain valid

#### Scenario: Cache write fails after provider success
- **WHEN** provider generation succeeds but the server cannot cache the media output
- **THEN** the run does not silently present a durable success
- **AND** the run records a visible failure or cache-failed state explaining that the result could not be retained
- **AND** credits and billing state remain auditable according to the provider execution and billing outcome

#### Scenario: Cached media expires before formal save
- **WHEN** a user opens a completed unsaved run after its temporary cache has expired
- **THEN** the system clearly indicates that the temporary result is no longer previewable or saveable
- **AND** any formal saved asset linked to the artifact remains accessible through formal media access rules

### Requirement: Explicit Generated Media Save
The system SHALL promote cached generated media into the user's formal media library only after an explicit user save action.

#### Scenario: User saves cached generated media
- **WHEN** an authenticated active user saves an eligible generated artifact from a run they own
- **THEN** the system creates or returns the corresponding formal `generated_media_assets` record
- **AND** writes the media to formal cloud storage or registers the promoted cached object as formal storage
- **AND** updates the run artifact save metadata with saved state and saved asset id

#### Scenario: User saves the same artifact twice
- **WHEN** the same user repeats save for the same `(runId, artifactId)`
- **THEN** the system returns the existing saved asset instead of creating a duplicate asset
- **AND** the artifact remains marked as saved

#### Scenario: Cached artifact remains unsaved
- **WHEN** a generated run completes and the user has not clicked save
- **THEN** the cached output is not listed as a formal user media asset
- **AND** the system does not count it as a saved media-library item
- **AND** the artifact remains eligible for explicit save while the temporary cache is available

#### Scenario: User tries to save another user's artifact
- **WHEN** a user attempts to save a generated artifact from a run they do not own
- **THEN** the system rejects the request
- **AND** no formal media asset is created

### Requirement: Asynchronous Multimodal Run Submission
The system SHALL treat image and video generation submission as asynchronous background work that can be recovered through run history.

#### Scenario: User submits image generation
- **WHEN** an active user submits a valid image generation request
- **THEN** the system creates a running agent run and returns the run identity promptly after validation and scheduling
- **AND** the client can show that the task is running in the background and may be checked later

#### Scenario: User submits video generation
- **WHEN** an active user submits a valid video generation request
- **THEN** the system creates a running agent run and returns the run identity promptly after validation and provider task creation
- **AND** the client can show that the task is running in the background and may be checked later

#### Scenario: User returns while run is still running
- **WHEN** a user opens generation history for a run that has not completed
- **THEN** the system returns the current running status
- **AND** the client can refresh or sync the run without requiring the original page session
