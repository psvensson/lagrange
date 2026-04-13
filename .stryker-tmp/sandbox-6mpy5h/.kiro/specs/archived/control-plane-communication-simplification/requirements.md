# Requirements Document

## Introduction

This document defines a simpler and more robust communication architecture
while retaining message groups and WebSockets. The design centralizes control
plane actions on the leader of the existing message group (no new group is
created), makes readiness lease-based in system tables, adds per-node outbound
backpressure, and uses system tables for replica operation job tracking. All
system table writes follow a single SQL -> partition -> CDC -> cache path, and
leader routing for writes relies solely on services.raft_role. Reads may be
served by any replica because replicas converge to the same state. There is
only one code path for each control operation and no additional caches outside
the CDC-fed system cache.

## Glossary

- **Control_Plane_Message_Group**: The existing message group used to process
  control plane commands in a single ordered stream (no new message group is
  created).
- **Control_Leader**: The leader replica for the control plane message group.
- **Node_State_Update**: A control plane message carrying node state and lease
  updates (used for registration, readiness, and heartbeat refresh).
- **Node_Registration**: A Node_State_Update that creates or updates the node
  row in the nodes system table (state=connected).
- **Node_Readiness_Lease**: A time-bounded readiness signal stored in the nodes
  table and refreshed by Node_State_Update messages.
- **Replica_Operation_Record**: A row in the replica_operations system table
  that represents a CREATE or REMOVE operation and its status.
- **Outbound_Node_Queue**: A per-node delivery queue with bounded concurrency
  that provides backpressure for remote messages.
- **System_Cache**: The local cache updated only by CDC events from system
  tables.

## Requirements

### Requirement 1: Single Control Plane Entry Point

**User Story:** As an operator, I want a single ordered control plane so that
registration, readiness, and replica operations are processed consistently.

#### Acceptance Criteria

1. WHEN a node joins THEN all control plane commands (node state updates and
   operation dispatch) SHALL be handled by the Control_Leader.
2. WHEN WebSocket IDENTIFY is processed THEN it SHALL only establish the
   connection map and SHALL NOT directly write to system tables.
3. WHEN the HTTP bootstrap endpoint is called THEN it SHALL return configuration
   only and SHALL NOT mutate system tables.
4. ALL control plane messages (including Node_State_Update) SHALL be ordered
   through the existing message group (Control_Plane_Message_Group role).
5. THE system SHALL NOT create a new message group solely for control plane
   processing.

### Requirement 2: Readiness Lease in Nodes Table

**User Story:** As an operator, I want readiness to be a lease so that stale
nodes are excluded from scheduling without guesswork.

#### Acceptance Criteria

1. THE nodes table SHALL include `ready_lease_expires_at` and use the existing
   `last_heartbeat` column for heartbeat timestamps.
2. A node SHALL be considered ready only when `ws_connection_state=ready` AND
   `ready_lease_expires_at > now`.
3. THE Control_Leader SHALL refresh the readiness lease on valid heartbeats.
4. IF a lease expires THEN the Control_Leader SHALL mark the node as not ready
   via the nodes table.
5. CDC SHALL propagate readiness lease updates to the System_Cache.

### Requirement 3: Heartbeat Protocol

**User Story:** As a developer, I want explicit heartbeats so readiness reflects
actual availability.

#### Acceptance Criteria

1. AFTER sending readiness, each node SHALL send periodic Node_State_Update
   messages to the Control_Leader to refresh readiness leases.
2. HEARTBEAT cadence and lease duration SHALL be configurable and defined by
   constants.
3. IF heartbeats stop THEN the readiness lease SHALL expire without additional
   side channels.

### Requirement 4: Outbound Backpressure

**User Story:** As an operator, I want bounded outbound concurrency so that
joining nodes are not overwhelmed by control or replica traffic.

#### Acceptance Criteria

1. THE system SHALL maintain an Outbound_Node_Queue per target node.
2. THE queue SHALL limit concurrent in-flight messages per node.
3. ALL remote control-plane and replica operation deliveries SHALL use the
   queue (one delivery path).
4. IF a node disconnects THEN pending queued messages for that node SHALL be
   failed with a clear error.

### Requirement 5: Replica Operations as System Table Jobs

**User Story:** As an operator, I want replica operations to be durable and
observable through system tables.

#### Acceptance Criteria

1. CREATE and REMOVE operations SHALL be represented as
   Replica_Operation_Records in the replica_operations table.
2. THE Control_Leader SHALL dispatch an operation to a target node only after
   the record exists and the node is ready.
3. ACK from the target node SHALL only indicate acceptance, not completion.
4. COMPLETION SHALL be reflected by status updates in the
   replica_operations table via CDC.
5. RETRIES SHALL be driven by the operation status, not by ad hoc retries.

### Requirement 6: Single Replica Operation Execution Path

**User Story:** As a developer, I want exactly one code path for replica
creation and removal to prevent divergence.

#### Acceptance Criteria

1. THE system SHALL use a single replica operation handler for CREATE and
   REMOVE, with no legacy or fallback code paths.
2. ALL replica operation messages SHALL use a single schema with constants
   for field names and types.
3. IDENTITY and idempotency SHALL be enforced via the operation_id field.

### Requirement 7: No Additional Caches

**User Story:** As an operator, I want system state to remain consistent across
nodes without hidden caches.

#### Acceptance Criteria

1. ALL control plane state (registration, readiness, operation status) SHALL
   be stored in system tables.
2. THE System_Cache fed by CDC SHALL be the only cache of system information.

### Requirement 8: Write Leader Source of Truth

**User Story:** As a developer, I want one authoritative source of leadership
for write routing to avoid split-brain decisions.

#### Acceptance Criteria

1. WRITE routing SHALL use services.raft_role as the single leader source.
2. partitions.leader_node_id SHALL NOT be used for routing decisions.
3. READ queries MAY use any active replica because replicas converge to the
   same state.

### Requirement 9: Single System Table Write Path

**User Story:** As a developer, I want a single write path to avoid divergence
between SQL/CDC and direct partition updates.

#### Acceptance Criteria

1. ALL system table writes SHALL flow through SQL -> partition -> CDC -> cache.
2. DIRECT partition upserts outside the SQL path SHALL be removed.
3. DIRECT system cache writes outside CDC SHALL be removed.
