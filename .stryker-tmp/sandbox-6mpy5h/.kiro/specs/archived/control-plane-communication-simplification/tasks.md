# Implementation Plan: Control Plane Communication Simplification

## Overview

This plan centralizes control plane processing on the leader of the existing
message group, adds readiness leases and heartbeats, introduces per-node
outbound backpressure, and models replica operations as durable system-table
jobs with a single execution path.

## Tasks

- [x] 1. Define control plane message schema and constants
  - Add message types for CONTROL_REGISTER, NODE_READY, NODE_HEARTBEAT, and
    REPLICA_OPERATION_DISPATCH
  - Use a single schema for message fields and collect scalars into constants
  - _Requirements: 1.1, 6.2_

- [x] 2. Add readiness lease field to the nodes table
  - Add `ready_lease_expires_at` to schema and migration
  - Use existing `last_heartbeat` for heartbeat timestamps
  - Ensure CDC propagates the new field to the system cache
  - _Requirements: 2.1, 2.5_

- [x] 3. Implement ControlPlaneService on the existing message group leader
  - Handle CONTROL_REGISTER, NODE_READY, and NODE_HEARTBEAT
  - Write node state updates only through this service
  - Do not create a new message group for the control plane
  - _Requirements: 1.1, 2.3, 3.1_

- [x] 4. Move join flow control actions into the control plane
  - Send CONTROL_REGISTER after WebSocket IDENTIFY
  - Send NODE_READY after lifecycle manager init
  - Start periodic NODE_HEARTBEAT once ready
  - Remove any remaining direct node-table writes outside the control plane
  - _Requirements: 1.2, 3.1, 7.1_

- [x] 5. Add readiness lease expiry handling
  - Add a periodic sweep on the Control_Leader to expire leases
  - Update readiness checks to require valid leases
  - _Requirements: 2.4, 3.3_

- [x] 6. Add Outbound_Node_Queue to MessageRouter
  - Implement per-node concurrency limits and disconnect handling
  - Route all remote deliveries through the queue
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Model replica operations as system table jobs
  - Create or extend replica_operations records on scheduling
  - Dispatch operations only from ControlPlaneService
  - Update status to accepted on ACK and terminal on completion
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Consolidate replica operation execution path
  - Keep a single handler for CREATE and REMOVE with operation_id idempotency
  - Remove legacy/fallback paths to enforce one code path
  - _Requirements: 6.1, 6.3_

- [x] 9. Update rebalancer readiness and scheduling
  - Require readiness leases and queue availability before dispatch
  - Remove direct delivery from rebalancer
  - _Requirements: 2.2, 4.3, 5.2_

- [x] 10. Tests for control plane, leases, and queues
  - Unit tests for ControlPlaneService message handling and lease expiry
  - Unit tests for Outbound_Node_Queue concurrency and disconnect behavior
  - Integration tests for join + rebalancing through control plane
  - _Requirements: All_

- [x] 11. Checkpoint - run targeted tests
  - Run the affected unit and integration tests only
  - _Requirements: All_

- [x] 12. Collapse control-plane messages into NODE_STATE_UPDATE
  - Replace CONTROL_REGISTER, NODE_READY, and NODE_HEARTBEAT with a single
    NODE_STATE_UPDATE message carrying state and lease data
  - Update handlers and constants to remove legacy message types
  - _Requirements: 1.1, 3.1_

- [x] 13. Enforce services.raft_role as the single leader source for writes
  - Remove write routing based on partitions.leader_node_id
  - Keep partitions.leader_node_id informational only (no routing)
  - _Requirements: 8.1, 8.2_

- [x] 14. Remove direct system table upserts outside SQL/CDC
  - Replace direct partition upserts with CDCIntegrationService SQL writes
  - Remove any cache writes not driven by CDC
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 15. Persist raft role changes to services table only
  - Ensure partition and message group role changes update services.raft_role
  - Remove any alternative leader-tracking fields from routing logic
  - _Requirements: 8.1, 8.2_

- [x] 16. Update tests for unified control plane and leader routing
  - Adapt control-plane tests to NODE_STATE_UPDATE
  - Validate write routing uses services.raft_role only
  - _Requirements: All_

- [ ] 17. Fix partition leader forwarding and write routing fallback
  - Resolve leader addresses to unified format before forwarding writes
  - Fall back to active partition services when no leader is present in cache
  - _Requirements: 8.1, 8.2_

- [ ] 18. Add integration regression for write routing without leaders
  - Mask services leaders in cache and verify UPDATE succeeds
  - Ensure routing prefers a follower to exercise forwarding
  - _Requirements: 8.1, 8.2_

- [ ] 19. Run integration test suite
  - Execute all integration tests with Node/tap
  - _Requirements: All_
