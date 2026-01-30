# Implementation Plan: Node Joining Rebalancing Simplification

## Overview

This plan implements explicit node readiness and controlled rebalancing by
moving registration to WebSocket IDENTIFY, using CDC as the trigger, and
batching replica creation.

## Tasks

- [x] 1. Add `ws_connection_state` to the nodes system table
  - Update schema migration and nodes table definition
  - Ensure CDC publishes the new column to the system cache
  - _Requirements: 2.1, 2.6_

- [x] 2. Emit `nodeConnected` on WebSocket IDENTIFY
  - Update MessageRouter `handleIdentification` to emit `nodeConnected`
  - Include nodeId, nodeAddress, and connectionId in the payload
  - _Requirements: 1.1, 1.4_

- [x] 3. Expose MessageRouter connection state helpers
  - Add `getConnectionState(nodeId)` and optional `pingNode(nodeId)`
  - _Requirements: 6.2, 6.3_

- [x] 4. Register nodes from `nodeConnected` in BootstrapService
  - Upsert nodes table entry with `ws_connection_state=connected`
  - Replace any previous connection for the nodeId
  - _Requirements: 1.2, 1.4, 2.3_

- [x] 5. Add NODE_READY handler on the seed node
  - Register `${seedNodeId}/bootstrap/ready` handler
  - Update nodes table to `ws_connection_state=ready` and store capabilities
  - Ensure handler is idempotent
  - _Requirements: 2.4, 3.2, 3.3, 3.4_

- [x] 6. Send NODE_READY from the joining node
  - After lifecycle manager init and leadership, send NODE_READY
  - Include capabilities in the payload
  - _Requirements: 3.1, 8.1_

- [x] 7. Remove HTTP registration and rebalancing triggers
  - Keep HTTP bootstrap for configuration only
  - Remove any direct calls to trigger rebalancing
  - _Requirements: 1.3, 4.3, 8.2_

- [x] 8. Trigger rebalancing only from CDC ready transitions
  - Watch nodes table updates for `ws_connection_state=ready`
  - Trigger rebalancing once per transition
  - _Requirements: 4.1, 4.2_

- [x] 9. Add stabilization period scheduling to the Rebalancer
  - Add `stabilization_period_ms` config (default 1000ms)
  - Reset timer when additional triggers arrive
  - Re-evaluate state before executing moves
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. Gate move execution on readiness
  - Implement `isNodeReady` using nodes cache, MessageRouter state, and ping
  - Skip moves to nodes that are not ready
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. Add batched move execution with backpressure
  - Group moves by target node and execute in batches
  - Add configurable batch size (default 2) and inter-batch delay
  - Skip remaining moves on disconnect
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 12. Update join flow to include IDENTIFY bootstrap data
  - Ensure IDENTIFY contains nodeId, nodeAddress, and bootstrap info
  - _Requirements: 8.1, 8.2_

- [x] 13. Unit tests for readiness and registration flow
  - MessageRouter emits `nodeConnected`
  - BootstrapService updates nodes table states
  - `isNodeReady` behavior with disconnects and ping failures
  - _Requirements: 1.1, 2.3, 2.4, 6.1, 6.2, 6.3_

- [x] 14. Property tests for stabilization and batching
  - Use fast-check with `{numRuns: 10}`
  - Verify stabilization delay and batch concurrency bounds
  - _Requirements: 5.1, 5.3, 7.2, 7.3_

- [x] 15. Integration tests for join and rebalancing
  - Rebalancing starts only after NODE_READY and stabilization
  - HTTP bootstrap does not trigger registration or rebalancing
  - _Requirements: 3.1, 4.1, 8.3_

- [x] 16. Checkpoint - run targeted tests
  - Run only affected unit and integration tests
  - _Requirements: All_
