## Purpose
Define the server-side OAuth2 PKCE, enterprise bearer token, userinfo, entitlement, and OpenAI-compatible model gateway APIs required by OpenPawz enterprise desktop builds.

## Requirements

### Requirement: OAuth Authorization Code With PKCE
The system SHALL provide an OAuth2 authorization endpoint for the OpenPawz desktop public client using Authorization Code with PKCE.

#### Scenario: User authorizes with valid credentials
- **WHEN** OpenPawz opens `/oauth/authorize` with `response_type=code`, valid `client_id`, loopback `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, and supported scopes
- **THEN** the system authenticates the browser flow with the existing user account/password system
- **AND** redirects to the provided loopback callback with an authorization `code` and unchanged `state` after a successful active-user login

#### Scenario: Authorization request is invalid
- **WHEN** `/oauth/authorize` is called with an unsupported response type, missing PKCE challenge, unsupported challenge method, unsupported client, missing state, or unsafe redirect URI
- **THEN** the system rejects the request or redirects with a standard OAuth error
- **AND** does not issue an authorization code

#### Scenario: Authenticated account is not active
- **WHEN** a user with a non-active account attempts to complete the OAuth authorization flow
- **THEN** the system rejects authorization
- **AND** does not issue an authorization code

### Requirement: OAuth Token Exchange
The system SHALL exchange valid authorization codes for enterprise bearer access tokens without requiring a desktop client secret.

#### Scenario: Desktop exchanges code with valid verifier
- **WHEN** OpenPawz posts `/oauth/token` with `grant_type=authorization_code`, the issued code, matching `redirect_uri`, matching `client_id`, and a `code_verifier` that satisfies the stored S256 challenge
- **THEN** the system marks the authorization code as consumed
- **AND** returns an OAuth JSON response containing an `access_token`, `token_type=Bearer`, and expiry metadata

#### Scenario: Authorization code is replayed
- **WHEN** `/oauth/token` is called with an authorization code that was already consumed
- **THEN** the system returns an OAuth `invalid_grant` error with a 4xx status
- **AND** does not issue another access token

#### Scenario: PKCE verifier does not match
- **WHEN** `/oauth/token` is called with a `code_verifier` that does not satisfy the code's stored challenge
- **THEN** the system returns an OAuth `invalid_grant` error with a 4xx status
- **AND** does not issue an access token

### Requirement: Enterprise Bearer Token Validation
The system SHALL protect enterprise APIs with bearer access tokens that are separate from WebUI cookie sessions.

#### Scenario: Protected enterprise API receives valid bearer token
- **WHEN** `/oauth/userinfo`, `/api/entitlements`, or `/api/llm/v1/*` receives `Authorization: Bearer {access_token}` for an unexpired token bound to an active user
- **THEN** the system resolves the existing user identity
- **AND** processes the request under that user

#### Scenario: Protected enterprise API receives invalid bearer token
- **WHEN** a protected enterprise API receives a missing, malformed, unknown, expired, or inactive-user bearer token
- **THEN** the system rejects the request with an authorization error
- **AND** does not process entitlement or model gateway behavior

### Requirement: Enterprise UserInfo
The system SHALL expose OpenPawz-compatible userinfo from existing user account data.

#### Scenario: Desktop requests userinfo
- **WHEN** OpenPawz calls `/oauth/userinfo` with a valid enterprise bearer token
- **THEN** the system returns JSON containing a stable `sub`
- **AND** includes available user identity fields such as `email`, `name`, or `preferred_username`

### Requirement: Enterprise Entitlements
The system SHALL expose OpenPawz-compatible entitlements by mapping existing user entitlement configuration.

#### Scenario: User has cloud model access
- **WHEN** OpenPawz calls `/api/entitlements` with a valid bearer token for a user whose existing entitlements allow enterprise cloud model access
- **THEN** the system returns a plan value and entitlements containing `models:proxy` or `all`

#### Scenario: User lacks cloud model access
- **WHEN** OpenPawz calls `/api/entitlements` with a valid bearer token for a user whose existing entitlements do not allow enterprise cloud model access
- **THEN** the system omits `models:proxy` and `all`
- **AND** subsequent enterprise cloud model requests are rejected server-side

### Requirement: Enterprise Model Listing
The system SHALL expose an OpenAI-compatible model listing for enterprise bearer-token users.

#### Scenario: Entitled user lists models
- **WHEN** OpenPawz calls `GET /api/llm/v1/models` with a valid bearer token for a user with `models:proxy` or `all`
- **THEN** the system returns OpenAI-compatible model objects for enabled chat-capable models allowed by that user's existing model entitlements

#### Scenario: Unentitled user lists models
- **WHEN** OpenPawz calls `GET /api/llm/v1/models` with a valid bearer token for a user without `models:proxy` or `all`
- **THEN** the system rejects the request with a forbidden response

### Requirement: Enterprise Chat Completions Gateway
The system SHALL expose an OpenAI-compatible chat completions endpoint for enterprise bearer-token users.

#### Scenario: Entitled user sends chat completion request
- **WHEN** OpenPawz calls `POST /api/llm/v1/chat/completions` with a valid bearer token, `models:proxy` or `all`, an allowed model, and a valid OpenAI-compatible chat payload
- **THEN** the system routes the request through existing server-side model/provider configuration
- **AND** returns an OpenAI-compatible chat completion response

#### Scenario: Entitled user sends streaming chat request
- **WHEN** OpenPawz calls `POST /api/llm/v1/chat/completions` with `stream=true` and an otherwise valid request
- **THEN** the system returns OpenAI-compatible Server-Sent Events
- **AND** terminates the stream with `data: [DONE]`

#### Scenario: User requests unauthorized model
- **WHEN** OpenPawz requests a model that is disabled, unknown, or not allowed by the bearer-token user's existing entitlements
- **THEN** the system rejects the request
- **AND** does not call an upstream provider
