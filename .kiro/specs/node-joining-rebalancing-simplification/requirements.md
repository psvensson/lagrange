# Requirements Document

## Introduction

This document defines requirements to eliminate node-join race conditions,
reduce rebalancing spikes, and make readiness explicit. WebSocket IDENTIFY is
the authoritative registration signal, CDC is the single rebalancing trigger,
and node readiness is stored in system tables so all nodes observe the same
state.

## Glossary

- **Seed_Node**: The first node that bootstraps system tables and acts as the
  initial coordinator for new joins.
- **Joining_Node**: A node that is joining an existing cluster.
- **IDENTIFY_Message**: WebSocket message that provides nodeId and nodeAddress.
- **NODE_READY**: Message sent by the joining node after lifecycle manager
  initialization.
- **Node_Connection_State**: The connection readiness status stored in the
  nodes system table.
- **Stabilization_Period**: A delay window that coalesces join events before
  rebalancing starts.
- **Rebalance_Trigger**: The event that schedules a rebalancing run.
- **Move_Batch**: A small group of replica moves executed together with
  backpressure.
- **System_Cache**: Local cache updated by CDC from system tables.

## Requirements

### Requirement 1: WebSocket Identification as Registration

**User Story:** As a cluster operator, I want WebSocket IDENTIFY to be the
authoritative registration signal, so that rebalancing only happens after a
live connection exists.

#### Acceptance Criteria

1. WHEN MessageRouter handles an IDENTIFY_Message THEN it SHALL re-key the
   connection and emit a `nodeConnected` event with nodeId, nodeAddress, and
   connectionId.
2. WHEN the Seed_Node receives `nodeConnected` THEN it SHALL create or update
   the node row in the nodes system table.
3. WHEN the HTTP bootstrap endpoint is called THEN it SHALL NOT register the
   node and SHALL NOT trigger rebalancing.
4. WHEN nodeConnected is processed THEN any prior connection for the nodeId
   SHALL be replaced by the identified connection.

### Requirement 2: Connection State in the Nodes System Table

**User Story:** As an operator, I want connection readiness stored in a system
table, so that CDC provides a single source of truth for rebalancing decisions.

#### Acceptance Criteria

1. THE nodes table SHALL include `ws_connection_state` with default
   `disconnected`.
2. THE allowed values for `ws_connection_state` SHALL be: `disconnected`,
   `connecting`, `connected`, `ready`.
3. WHEN the Seed_Node processes IDENTIFY THEN `ws_connection_state` SHALL be
   set to `connected`.
4. WHEN the Seed_Node processes NODE_READY THEN `ws_connection_state` SHALL be
   set to `ready`.
5. WHEN the WebSocket disconnects THEN `ws_connection_state` SHALL be set to
   `disconnected`.
6. CDC SHALL update the System_Cache so all nodes eventually observe the latest
   connection state.

### Requirement 3: Explicit Node Readiness Signal

**User Story:** As a developer, I want the joining node to explicitly signal
readiness, so that the seed does not guess when it is safe to rebalance.

#### Acceptance Criteria

1. WHEN the Joining_Node finishes message-group leadership and lifecycle
   manager initialization THEN it SHALL send a NODE_READY message to the
   Seed_Node.
2. THE NODE_READY handler SHALL live at the address
   `${seedNodeId}/bootstrap/ready`.
3. WHEN NODE_READY is received THEN the Seed_Node SHALL update the nodes table
   for that nodeId and store any reported capabilities.
4. NODE_READY handling SHALL be idempotent if the message is received more than
   once.

### Requirement 4: Single Rebalancing Trigger from CDC

**User Story:** As a cluster operator, I want rebalancing to trigger from a
single source of truth, so that duplicate work does not occur.

#### Acceptance Criteria

1. THE Rebalancer SHALL trigger only from CDC events on the nodes table.
2. THE Rebalancer SHALL trigger only when `ws_connection_state` transitions to
   `ready`.
3. HTTP handlers and direct nodeConnected events SHALL NOT trigger rebalancing.

### Requirement 5: Stabilization Period Before Rebalancing

**User Story:** As a cluster operator, I want rebalancing to wait briefly after
a node becomes ready, so that multiple joins can settle before moves begin.

#### Acceptance Criteria

1. THE Rebalancer SHALL wait a stabilization_period_ms before executing moves.
2. THE stabilization period default SHALL be 1000ms and SHALL be configurable.
3. IF a new trigger occurs during the stabilization period THEN the timer
   SHALL reset.
4. WHEN the stabilization period expires THEN the Rebalancer SHALL re-evaluate
   state before executing moves.

### Requirement 6: Readiness Checks Before Sending Moves

**User Story:** As a developer, I want the rebalancer to verify readiness before
sending replica messages, so that we do not overload unready nodes.

#### Acceptance Criteria

1. THE Rebalancer SHALL use an `isNodeReady` check before assigning or sending
   moves to a node.
2. `isNodeReady` SHALL return true only when the nodes table state is `ready`
   AND the MessageRouter reports a connected WebSocket.
3. IF a readiness ping is configured, `isNodeReady` SHALL return false on ping
   failure or timeout.
4. WHEN `isNodeReady` is false THEN the Rebalancer SHALL skip moves for that
   node and log the reason.

### Requirement 7: Batched Replica Creation with Backpressure

**User Story:** As an operator, I want replica creation to be throttled, so that
new nodes are not overwhelmed by dozens of parallel CREATE_REPLICA messages.

#### Acceptance Criteria

1. THE Rebalancer SHALL group moves by target node and process them in batches.
2. THE default batch size SHALL be 2 concurrent moves per target node and SHALL
   be configurable.
3. THE Rebalancer SHALL wait for a batch to complete before starting the next
   batch for the same node.
4. IF a node disconnects mid-process THEN remaining moves for that node SHALL
   be skipped and logged.

### Requirement 8: Simplified Join Sequence

**User Story:** As an operator, I want the join sequence to have fewer phases,
so that behavior is predictable and easier to debug.

#### Acceptance Criteria

1. THE join sequence SHALL have four phases: (1) WebSocket connect + IDENTIFY,
   (2) message-group creation and leadership, (3) lifecycle manager init +
   NODE_READY, (4) rebalancing after readiness.
2. THE HTTP bootstrap call SHALL return bootstrap info only and SHALL NOT
   register the node.
3. REBALANCING SHALL NOT begin until NODE_READY has been recorded as `ready` in
   the nodes table.
