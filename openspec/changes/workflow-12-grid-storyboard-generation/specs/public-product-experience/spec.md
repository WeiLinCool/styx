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

#### Scenario: User starts workflow storyboard generation
- **WHEN** an active user starts the Step 1 `12宫格分镜图` generation in `/workflow`
- **THEN** the page submits the current Step 0 upload context to the agent runtime API as a workflow storyboard request
- **AND** renders the returned storyboard result directly in the Step 1 card
- **AND** keeps the Step 0 uploaded image as the source of truth for starting a fresh generation

#### Scenario: User cannot afford selected chat model
- **WHEN** an active user tries to send a chat prompt without enough credits for the selected model
- **THEN** the page shows an insufficient-credit state
- **AND** does not append a fake assistant response

### Requirement: Workflow Step 1 Storyboard Result
The public workflow experience SHALL present Step 1 as the completed storyboard result surface for the generated 12-grid storyboard.

#### Scenario: Storyboard generation succeeds
- **WHEN** the Step 1 storyboard generation run succeeds
- **THEN** the Step 1 card shows the completed `12宫格分镜图` result
- **AND** keeps the result visible as the current Step 1 output
- **AND** does not require the user to re-open a separate preview surface to see the generated storyboard

#### Scenario: User returns to Step 0 to retry
- **WHEN** a user selects `上一步` from Step 1
- **THEN** the page returns to Step 0
- **AND** preserves the current generated Step 1 result until a fresh generation is started
- **AND** lets the user re-upload a new image before starting the next storyboard run

#### Scenario: User starts a fresh storyboard generation
- **WHEN** a user re-uploads an image in Step 0 and starts a new storyboard generation
- **THEN** the page clears the previous storyboard result from the active Step 1 view
- **AND** starts a new workflow storyboard run from the new upload context

### Requirement: Workflow Video MVP Material Flow
The public workflow experience SHALL only start final video generation after the required MVP material groups are present.

#### Scenario: User prepares final workflow video
- **WHEN** a user has uploaded a Step 0 source image
- **AND** completed Step 1 storyboard generation
- **AND** selected or uploaded a Step 2 scene background
- **THEN** the workflow page enables final video generation
- **AND** submits material references and workflow intent rather than a fully assembled provider prompt

#### Scenario: Required material is missing
- **WHEN** the user has not provided the source image, storyboard result, or scene background
- **THEN** the workflow page keeps final video generation blocked
- **AND** identifies the missing workflow material group

#### Scenario: Final workflow video starts
- **WHEN** a user starts the final workflow video run
- **THEN** the page submits a workflow video-stage request to the server runtime
- **AND** shows running, succeeded, failed, and artifact states from the server run
- **AND** renders the completed video artifact when the `doubao-seedance-2-0` run succeeds
