# Requirements Document: Admin Test Run Landing

## Introduction

This feature extends the node-local admin ingress service so operators can use a browser landing page to manage distributed test runs, inspect saved runs, and stream live logs from active runs.

## Requirements

### Requirement 1: Admin Landing Page

**User Story:** As an operator, I want a browser landing page on the standard admin service so I can view and control test workflows without opening files manually.

#### Acceptance Criteria

1. WHEN admin ingress is running, THE system SHALL serve an HTML landing page at `/` and `/ui/tests`
2. THE landing page SHALL show available test scenarios and configuration files
3. THE landing page SHALL show saved runs including status, timestamp, and git hash when known

### Requirement 2: Test Administration API

**User Story:** As an operator, I want an HTTP API behind admin ingress so I can automate test execution and run control.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/admin/tests` to list available scenarios and configs
2. THE system SHALL expose `GET /api/admin/test-runs` to list active and saved runs
3. THE system SHALL expose `POST /api/admin/test-runs` to start a scenario run
4. THE system SHALL expose `GET /api/admin/test-runs/:runId` to return run details
5. THE system SHALL expose `POST /api/admin/test-runs/:runId/stop` to stop an active run

### Requirement 3: Saved Run Tagging

**User Story:** As an operator, I want saved runs tagged with time and git hash so I can correlate behavior to source state.

#### Acceptance Criteria

1. WHEN a run is started through admin ingress, THE system SHALL persist run metadata including `startedAt` and `gitHash`
2. WHEN saved runs are listed, THE system SHALL include tags from metadata and report artifacts when available
3. IF git hash cannot be resolved, THEN THE system SHALL still list the run with an explicit unknown hash value

### Requirement 4: Playback and Artifact Serving

**User Story:** As an operator, I want report and playback artifacts served through admin ingress so I can inspect runs from one landing page.

#### Acceptance Criteria

1. THE system SHALL expose `GET /ui/playback-viewer` for shared playback viewer HTML
2. THE system SHALL expose `GET /ui/test-output/*` for report and playback artifact files
3. THE landing page SHALL provide links to report files and playback viewer when manifest metadata exists

### Requirement 5: Live Log Streaming

**User Story:** As an operator, I want continuous run logs over HTTP so I can react quickly to failures.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/admin/test-runs/:runId/stream` as an SSE endpoint
2. WHEN subscribed to an active run stream, THE endpoint SHALL emit backlog log lines followed by live log events
3. THE stream SHALL emit status updates for run lifecycle transitions
