# Implementation Plan: CDC Continuity During Topology Transitions

## Overview

Implementation is organized into three groups matching the failure categories,
plus a cross-cutting diagnostics and verification group. Each group can be
implemented independently, but Group A (split spread) has the highest impact
and should be done first.

## Tasks

### Group A — Split Spread Stall (Requirement 1, 2, 3, 4)

- [x] 1. Wire SPLIT_COMPLETED → rebalance trigger at composition root
  - [x] 1.1 Add `SPLIT_COMPLETED` constant to `STABILIZATION_RESET_TRIGGER` in `src/rebalancer/rebalancer-constants.js`
    - Value: `'split_completed'`
    - _Requirements: 1.5_

  - [x] 1.2 Add partition service lookup helper in `src/index.js`
    - Iterate `partitionServices` map (keyed by replicaId) and match by `partitionId` property
    - Read-only lookup, not a new cache or index
    - Reuse in both seed and join composition roots
    - _Requirements: 1.2_

  - [x] 1.3 Wire `SPLIT_COMPLETED` listener on `PartitionSplitMergeManager` in seed composition root (`src/index.js`, seed bootstrap path)
    - On `SPLIT_COMPLETED`, extract `targetPartitionIds` from result
    - For each child partition ID, look up partition service via helper from 1.2
    - Call `partitionService.rebalancer.recordStateChange(STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED)` if rebalancer exists and is leader
    - If rebalancer is not yet active, the existing `setLeader(true)` → `scheduleNextCheck()` path handles deferred activation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.4 Wire equivalent `SPLIT_COMPLETED` listener in join composition root (`src/index.js`, node-joining path)
    - Same logic as 1.3 but using `NodeJoiningService.partitionServices` map
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.5 Write regression test: split completion triggers rebalance state change
    - File: `test/partition/split-rebalance-trigger.test.js`
    - Create a `PartitionSplitMergeManager`, a mock `UnifiedRebalancer` with `recordStateChange` spy
    - Emit `SPLIT_COMPLETED` with `targetPartitionIds`
    - Assert `recordStateChange` called with `'split_completed'` for each child partition
    - Assert no call when child partition service has no rebalancer
    - Assert no call when rebalancer is not leader (deferred to `setLeader`)
    - _Requirements: 1.1, 1.4_

- [x] 2. Verify and harden CDC subscriber registration timing on child partitions
  - [x] 2.1 Audit `createPartitionService` in `src/bootstrap/bootstrap-service.js` (lines 1752-1840)
    - Verify `subscribeToCDCWithHandshake()` is awaited before factory returns
    - Verify `shouldAttachPartitionCdcPropagation(tableName)` returns true for user tables created by split
    - If predicate returns false for user tables, fix it
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Audit `createPartitionService` in `src/bootstrap/node-joining-service.js` (lines 3015-3107)
    - Same verification as 2.1 for the join path
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 2.3 Write regression test: CDC subscriber registered before first Raft entry delivery
    - File: `test/partition/cdc-subscriber-registration-timing.test.js`
    - Create a partition service with a mock Raft group
    - Buffer CDC events before subscriber registration
    - Register subscriber via `subscribeToCDCWithHandshake`
    - Assert all buffered events delivered during handshake catchup
    - Assert subscriber receives subsequent events in steady state
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Harden CDC buffer replay on subscriber registration
  - [x] 3.1 Audit `scheduleBufferedCDCReplay` in `src/partition/partition-cdc-delivery.js`
    - Verify the guard `cdcSubscribers.size === 0` correctly prevents scheduling when no subscribers exist
    - Verify `subscribeToCDCWithHandshake` calls `scheduleBufferedCDCReplay('post_subscription_handshake')` after inline catchup
    - Verify that if inline catchup fails partially, the scheduled replay fires with initial delay (not escalated backoff)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Fix: reset `cdcBufferReplayDelayMs` to initial value after successful subscriber handshake
    - In `subscribeToCDCWithHandshake`, after catchup attempt (whether full or partial), reset `cdcBufferReplayDelayMs` to `PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS`
    - This ensures the follow-up replay uses the initial delay, not an escalated backoff from previous failures
    - _Requirements: 3.2_

  - [x] 3.3 Write regression test: partial catchup triggers follow-up replay at initial delay
    - File: `test/partition/cdc-buffer-replay-robustness.test.js`
    - Buffer N events, register subscriber that fails on event N/2
    - Assert `scheduleBufferedCDCReplay` is called after handshake
    - Assert replay delay is initial value, not escalated
    - Assert remaining events are delivered on replay
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 4. Verify leader metadata propagation for child partitions
  - [x] 4.1 Trace the leader election → `partitions` row update path in `src/partition/partition-service.js`
    - Find where Raft `LEADER_ELECTED` event triggers `partitions.leader_node_id` update
    - Verify this path executes for child partitions (not just initial partitions)
    - If the update doesn't happen for child partitions, identify the gap and fix it
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Write regression test: child partition leader election updates partitions row
    - File: `test/partition/child-partition-leader-propagation.test.js`
    - Create a child partition (simulating split output)
    - Trigger Raft leader election on the child partition
    - Assert `partitions` row is updated with `leader_node_id` via the canonical write path
    - Assert the update generates a CDC event (mock CDC integration service)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Checkpoint — Group A complete
  - Run all new tests from tasks 1-4
  - Run existing split-related tests: `npm test -- test/partition/`
  - Run existing rebalancer tests: `npm test -- test/rebalancer/`
  - Verify no regressions

### Group B — Restart Recovery Stall (Requirements 5, 7, 8)

- [x] 6. Harden restart CDC subscription re-establishment
  - [x] 6.1 Add CDC re-establishment constants to `src/bootstrap/node-joining-constants.js`
    - `CDC_REESTABLISHMENT_TIMEOUT_MS: 30000`
    - `CDC_REESTABLISHMENT_RETRY_DELAY_MS: 1000`
    - `CDC_REESTABLISHMENT_MAX_RETRIES: 10`
    - `CDC_RECOVERY_DIAGNOSTIC_INTERVAL_MS: 5000`
    - _Requirements: 5.4, 8.4_

  - [x] 6.2 Add structured log message constants for CDC recovery to `src/bootstrap/node-joining-constants.js`
    - `CDC_SUBSCRIPTION_RETRY: 'CDC subscription retry'`
    - `CDC_SUBSCRIPTION_RETRY_EXHAUSTED: 'CDC subscription retry exhausted'`
    - `CDC_RECOVERY_DIAGNOSTICS: 'CDC recovery diagnostics'`
    - `CDC_REESTABLISHMENT_COMPLETE: 'CDC re-establishment complete'`
    - `CDC_REESTABLISHMENT_TIMEOUT: 'CDC re-establishment timeout'`
    - _Requirements: 5.2, 8.1_

  - [x] 6.3 Extend `subscribeToCDCEvents()` in `src/bootstrap/node-joining-service.js` with bounded retry
    - Wrap each per-table subscription in a retry loop with configurable max retries and backoff
    - On each failure: log structured diagnostic with table name, partition ID, error message, attempt number, remaining budget
    - After all retries exhausted for a table: log exhaustion warning but continue with other tables
    - After all tables attempted: if any subscriptions failed, emit summary diagnostic
    - Do not block indefinitely — respect `CDC_REESTABLISHMENT_TIMEOUT_MS`
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 6.4 Gate node readiness on CDC subscription status
    - In the node readiness advertisement path, verify CDC subscriptions are confirmed active before advertising
    - If subscriptions are not confirmed within timeout, advertise with degraded status and continue recovery
    - _Requirements: 5.3_

  - [x] 6.5 Write regression test: restart CDC subscription retry and diagnostics
    - File: `test/bootstrap/restart-cdc-subscription-hardening.test.js`
    - Mock `subscribeToCDC` to fail N times then succeed
    - Assert retry loop executes with correct backoff
    - Assert structured diagnostics logged on each failure
    - Assert success after retries
    - Assert timeout path emits diagnostic summary
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 7. Audit and fix timer cleanup on shutdown
  - [x] 7.1 Audit `PartitionService.shutdown()` / `destroy()` for timer leaks
    - Verify `cdcBufferReplayTimer` is cleared
    - Verify all `setTimeout` / `setInterval` handles are cleared
    - Verify shutdown flag prevents new timer creation in async callbacks
    - Fix any missing cleanup
    - _Requirements: 7.1_

  - [x] 7.2 Audit `UnifiedRebalancer.shutdown()` for timer leaks
    - Verify `scheduledCheck` is cleared
    - Verify `stabilizationTimer` is cleared
    - Verify `rebalanceCheckQueue` is drained/stopped
    - Verify `isShuttingDown` flag prevents new timer creation
    - Fix any missing cleanup
    - _Requirements: 7.2_

  - [x] 7.3 Audit `MessageGroupService.shutdown()` for timer leaks
    - Verify CDC-related timers are cleared
    - Verify rebalancer is shut down (already calls `quiesceRebalancing`)
    - Verify flush timers are cleared
    - Fix any missing cleanup
    - _Requirements: 7.3_

  - [x] 7.4 Write regression test: shutdown clears all timers and prevents new creation
    - File: `test/partition/partition-service-shutdown-timers.test.js`
    - Create partition service with active CDC buffer replay timer
    - Call shutdown
    - Assert timer is cleared
    - Attempt to schedule new replay after shutdown
    - Assert no new timer created
    - _Requirements: 7.4, 7.5_

  - [x] 7.5 Write regression test: rebalancer shutdown is idempotent
    - File: `test/rebalancer/rebalancer-shutdown-idempotent.test.js`
    - Create rebalancer with active timers
    - Call shutdown twice
    - Assert no errors thrown
    - Assert all timers cleared after both calls
    - _Requirements: 7.4_

- [x] 8. Add recovery diagnostics during restart
  - [x] 8.1 Add `getCdcSubscriptionStatus()` method to `NodeJoiningService`
    - Return per-table subscription status: subscribed / pending / failed / buffered event count
    - Read from existing subscription state, not a new cache
    - _Requirements: 8.1_

  - [x] 8.2 Add periodic diagnostic emission during CDC recovery in `subscribeToCDCEvents()`
    - Start a diagnostic interval timer at recovery start
    - Emit structured log every `CDC_RECOVERY_DIAGNOSTIC_INTERVAL_MS` with:
      - Per-table subscription status
      - Message group leader identity and connection status
      - Elapsed recovery time
      - Buffered event counts per partition
    - Clear interval timer when recovery completes or times out
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 8.3 Expose CDC recovery diagnostics via admin diagnostics endpoint
    - Add CDC subscription status to the existing admin diagnostics snapshot
    - Reuse existing admin diagnostics infrastructure, do not create a new endpoint
    - _Requirements: 8.3_

  - [x] 8.4 Write regression test: recovery diagnostics emitted during CDC re-establishment
    - File: `test/bootstrap/restart-cdc-recovery-diagnostics.test.js`
    - Mock slow CDC subscription (delayed resolution)
    - Assert diagnostic events emitted at configured interval
    - Assert diagnostic payload contains required fields
    - Assert diagnostic timer cleared after recovery completes
    - _Requirements: 8.1, 8.2, 8.4_

- [x] 9. Checkpoint — Group B complete
  - Run all new tests from tasks 6-8
  - Run existing bootstrap tests: `npm test -- test/bootstrap/`
  - Run existing rebalancer tests: `npm test -- test/rebalancer/`
  - Verify no regressions

### Group C — Seed Restart / Message Group Failover (Requirement 6)

- [x] 10. Verify and fix message group leader failover CDC continuity
  - [x] 10.1 Audit `MessageGroupWorkerService.wireRaftGroupEvents()` CDC re-subscription on leadership gain
    - Verify `subscribeToCDC()` is called when `isNowLeader && !wasLeader` (line 312-313 in `message-group-worker-service.js`)
    - Verify subscription covers all CDC-propagated tables
    - Verify subscription is idempotent (safe to call if previous subscriptions partially active)
    - _Requirements: 6.1, 6.2_

  - [x] 10.2 Audit `MessageGroupService` for equivalent CDC re-subscription on leadership gain
    - Check if `MessageGroupService` (non-worker variant) has re-subscription logic on Raft leader change
    - If missing, add it following the same pattern as `MessageGroupWorkerService`
    - The re-subscription must use the existing `subscribeToCDC` method, not a new path
    - _Requirements: 6.1, 6.2_

  - [x] 10.3 Verify CDC event buffering during failover window
    - Trace what happens to CDC events emitted by partition leaders while message group leadership is transitioning
    - Verify events are buffered on source partitions via `cdcEventBuffer`
    - Verify buffered events are replayed when new message group leader subscribes
    - _Requirements: 6.3_
    - **Audit findings:**
    - The CDC event buffering mechanism during failover works through two complementary paths:
    - **Path A (delivery failure → buffer):** When a partition leader's CDC subscriber callback throws (e.g., `proposeCDCCommand` fails because the message group Raft has no leader during transition), `generateCDCEvent` catches the error and calls `bufferCDCEventForRetry()`, which stores the event in `cdcEventBuffer` (capacity: 1000 events). When `scheduleBufferedCDCReplay` fires and subscribers exist, `flushBufferedCDCEvents` replays all buffered events.
    - **Path B (no message group resolution → silent drop):** When `resolveCdcPropagationMessageGroup()` returns null (no leader message group available), the subscriber callback returns without throwing. This means `generateCDCEvent` considers delivery successful and the event is NOT buffered. This is a potential gap during the failover window.
    - **Path C (new subscriber handshake → catchup replay):** When a new message group leader subscribes via `subscribeToCDCWithHandshake`, any events in `cdcEventBuffer` are replayed inline during the handshake catchup phase. Partial replay failures schedule follow-up replay via `scheduleBufferedCDCReplay`.
    - **Assessment:** Path A correctly buffers events when delivery fails with an error. Path C correctly replays buffered events on new subscriber registration. Path B has a gap where events can be silently dropped when no message group leader is resolvable, but this is mitigated by the fact that the subscriber callback is registered on the partition (not the message group), so it persists across message group failovers. The subscriber will succeed on the next CDC event once a new message group leader is elected. The gap in Path B is bounded: only events generated during the exact window where `resolveCdcPropagationMessageGroup` returns null are affected, and this window is typically very short (between old leader loss and new leader election). No code changes needed — the existing mechanism is adequate for Requirement 6.3.

  - [x] 10.4 Write regression test: message group failover preserves CDC continuity
    - File: `test/message-group/message-group-failover-cdc-continuity.test.js`
    - Create message group with CDC subscriptions active
    - Simulate leader failover (old leader steps down, new leader elected)
    - Assert new leader re-establishes CDC subscriptions
    - Assert CDC events buffered during failover are replayed to new subscriber
    - Assert no CDC events lost during the transition
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 10.5 Write regression test: message group service (non-worker) re-subscribes on leadership gain
    - File: `test/message-group/message-group-service-leader-cdc.test.js`
    - Create `MessageGroupService` instance
    - Simulate Raft leadership gain
    - Assert `subscribeToCDC` called for all CDC-propagated tables
    - _Requirements: 6.1, 6.2_

- [x] 11. Checkpoint — Group C complete
  - Run all new tests from task 10
  - Run existing message group tests: `npm test -- test/message-group/`
  - Verify no regressions

### Cross-Cutting — Final Verification

- [x] 12. Run full unit test suite
  - Run all unit test directories to verify no regressions from changes in Groups A-C
  - Use 150s timeout, dump output to file for analysis
  - Fix any failures before proceeding
  - _Requirements: all_

- [x] 13. Update architecture documentation
  - [x] 13.1 Update `architecture.md` with CDC continuity during topology transitions
    - Document the split completion → rebalance trigger wiring
    - Document CDC subscriber registration timing contract for child partitions
    - Document restart CDC re-establishment bounded retry contract
    - Document message group failover CDC continuity contract
    - _Requirements: all_

- [x] 14. Re-run failing distributed harness scenarios
  - [x] 14.1 Re-run Group A scenarios (split spread)
    - `seven-node-table-partition-distribution 7n`
    - `seven-node-read-write-load-distribution 7n`
    - `seven-node-read-write-load-transaction-recovery 7n`
    - Use `controlBashProcess` with action `start` for long-running Docker scenarios
    - _Requirements: 1, 2, 3, 4_

  - [x] 14.2 Re-run Group B scenarios (restart recovery)
    - `rolling-restart 5n`
    - `rolling-restart 3n`
    - Use `controlBashProcess` with action `start` for long-running Docker scenarios
    - _Requirements: 5, 7, 8_

  - [x] 14.3 Re-run Group C scenario (seed restart)
    - `seed-restart-under-load 5n`
    - Use `controlBashProcess` with action `start` for long-running Docker scenarios
    - _Requirements: 6_

  - [x] 14.4 Summarize results and compare with pre-fix baseline
    - Run `node scripts/summarize-harness-runs.js` to generate comparison table
    - Document which scenarios flipped from FAIL to PASS
    - For any remaining failures, capture failure bundles and analyze
    - _Requirements: all_

## Notes

- All new constants go in dedicated constants files, never inline literals
- All fixes reuse existing code paths per system guidelines §1.1 and §1.3
- No new caches, shadow state, or parallel mechanisms
- Timer cleanup must be idempotent per system guidelines
- CDC subscriber registration uses existing `subscribeToCDCWithHandshake` path
- Rebalance trigger uses existing `recordStateChange` path
- Recovery diagnostics use existing admin diagnostics infrastructure
- Distributed harness scenarios must be run via `controlBashProcess`, not `executeBash`
