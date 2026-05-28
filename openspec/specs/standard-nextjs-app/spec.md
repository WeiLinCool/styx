## ADDED Requirements

### Requirement: Root Application Runtime
The system SHALL run as a standard Next.js application from the repository root.

#### Scenario: Developer starts the app
- **WHEN** a developer runs `pnpm dev` from the repository root
- **THEN** the Next.js development server starts without requiring `cd projects` or Coze CLI commands

#### Scenario: Production build runs from root
- **WHEN** a developer runs `pnpm build` from the repository root
- **THEN** the application compiles using the root Next.js configuration

### Requirement: Root Verification Commands
The system SHALL expose root-level verification commands for linting and TypeScript checking.

#### Scenario: Developer validates the app
- **WHEN** a developer runs the root validation command
- **THEN** lint and TypeScript checks run against the landed application source

### Requirement: Prototype Folder Removal
The system SHALL remove `projects/` as an application source after equivalent root functionality is available.

#### Scenario: Root application reaches parity
- **WHEN** migrated public pages, assets, configuration, and verification commands are available from root
- **THEN** `projects/` is no longer required to run or build the application

### Requirement: Standard Asset Resolution
The system SHALL serve migrated static assets through the root Next.js public asset pipeline.

#### Scenario: Public page renders migrated media
- **WHEN** a public page references a migrated image or icon
- **THEN** the asset loads from the root project without referencing `projects/`
