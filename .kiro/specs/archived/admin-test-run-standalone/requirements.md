# Requirements Document: Standalone Test Dashboard Server

## Introduction

A standalone userland web server is required for distributed test playback and run control workflows when cluster nodes are started and torn down per scenario.

## Requirements

### Requirement 1: Userland Server Startup

1. THE system SHALL provide a standalone launcher command that starts a regular HTTP server without starting node bootstrap logic
2. THE standalone server SHALL bind to configurable host/port with sane defaults
3. THE standalone server SHALL operate against local workspace files only

### Requirement 2: Shared Test Admin API Surface

1. THE standalone server SHALL expose the same HTTP landing and test administration routes as the admin ingress feature
2. THE standalone server SHALL support local scenario discovery, run start/stop, saved run listing, and artifact serving
3. THE standalone server SHALL support live log streaming through SSE

### Requirement 3: Decoupling from Legacy Admin Stream

1. THE standalone server SHALL disable the legacy `/api/admin/stream` WebSocket path
2. THE standalone server SHALL not require system table cache or SQL query engine initialization
3. THE standalone server SHALL shut down cleanly on process signals
