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

#### Scenario: User starts image generation
- **WHEN** an active user starts text-to-image generation, HD repair, or style transfer from `/image-gen`
- **THEN** the page submits the selected image mode, selected entitled model, prompt, size or scale options, and source image when required to the agent runtime API
- **AND** renders progress, completion, failure, selected model, billing status, and transient returned image state from the server response

#### Scenario: User cannot afford selected model
- **WHEN** an active user tries to send a chat or image request without enough credits for the selected model
- **THEN** the page shows an insufficient-credit state
- **AND** does not append a fake assistant response or fake generated image

## ADDED Requirements

### Requirement: Image Model Selection
The public image generation experience SHALL let active users select from admin-enabled image models allowed by their current entitlements and compatible with the selected image mode.

#### Scenario: User opens text-to-image tab
- **WHEN** an active user opens the `AI生图` tab
- **THEN** the page loads entitled enabled models that support text-to-image generation from the server
- **AND** selects the configured default image model when the user has no previous compatible selection

#### Scenario: User opens HD repair tab
- **WHEN** an active user opens the `高清修复` tab
- **THEN** the page loads entitled enabled models that support image repair or upscale from the server
- **AND** disables the submit action until a valid source image and compatible model are available

#### Scenario: User opens style-transfer tab
- **WHEN** an active user opens the `图片换风格` tab
- **THEN** the page loads entitled enabled models that support image editing from the server
- **AND** disables the submit action until a valid source image and compatible model are available

#### Scenario: Selected image model becomes unavailable
- **WHEN** a previously selected image model is no longer enabled, no longer supports the selected mode, or no longer allowed by the user's entitlements
- **THEN** the page falls back to the current default compatible model when one exists
- **AND** otherwise shows that the selected image mode is unavailable

### Requirement: Source Image Upload For Image Modes
The public image generation experience SHALL accept source image uploads for HD repair and style transfer without treating uploaded images as durable server-owned media.

#### Scenario: User uploads valid source image
- **WHEN** an active user uploads a supported image file for HD repair or style transfer
- **THEN** the page previews the source image locally
- **AND** includes the source image only in the current protected generation request

#### Scenario: User uploads invalid source image
- **WHEN** a user uploads an unsupported file type or oversized image file
- **THEN** the page rejects the upload with a stable error state
- **AND** does not submit the invalid file to the agent runtime API

#### Scenario: User changes image mode
- **WHEN** a user switches between image modes
- **THEN** the page keeps only mode-compatible prompt, model, and source-image state
- **AND** does not show stale generated results as if they belonged to the new mode

### Requirement: Transient Image Result Experience
The public image generation experience SHALL render generated images from the immediate API response and make local download the primary recovery path.

#### Scenario: Image generation succeeds
- **WHEN** an image run succeeds and the API response includes a transient image artifact
- **THEN** the page renders the generated image preview
- **AND** shows a primary download action
- **AND** warns that the generated image is not saved on the server and cannot be recovered after refresh, navigation, or generating another image

#### Scenario: Image run succeeds without media payload
- **WHEN** an image run succeeds but no transient image artifact is returned
- **THEN** the page shows an incomplete-output state
- **AND** does not fabricate a preview or imply that a server-saved image exists

#### Scenario: Page refresh after generated image
- **WHEN** a user refreshes the page after a successful image generation
- **THEN** the previous generated media is not restored from server history
- **AND** any durable history or run summary clearly lacks recoverable image media
