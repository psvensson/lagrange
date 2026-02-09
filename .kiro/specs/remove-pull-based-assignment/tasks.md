# Implementation Plan: Remove Pull-Based Replica Assignment

## Overview

Remove the pull-based replica assignment path from the node joining service, delete the PullBasedReplicaAssigner class, clean up all related constants/imports, and update the node lifecycle state machine to allow JOINING → READY. The rebalancer path is preserved as the single owner of replica placement.

## Tasks

- [x] 1. Update node lifecycle state machine to allow JOINING → READY
  - [x] 1.1 Add NodeState.READY to valid transitions from NodeState.JOINING in `src/node/node-lifecycle-state-machine.js`
    - Change `[NodeState.JOINING]: [NodeState.SYNCING, NodeState.STOPPED]` to `[NodeState.JOINING]: [NodeState.SYNCING, NodeState.READY, NodeState.STOPPED]`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 1.2 Add unit test for JOINING → READY transition in `test/node/node-lifecycle-state-machine.test.js`
    - Verify JOINING → READY succeeds
    - Verify JOINING → SYNCING → READY still works (seed node path)
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Remove pull-based assignment from NodeJoiningService join flow
  - [x] 2.1 Remove pull-based imports, instance variables, and join flow calls in `src/bootstrap/node-joining-service.js`
    - Remove imports: `PullBasedReplicaAssigner`, `AssignmentEpochManager`, `AssignmentEpoch`, `EPOCH_CONFIG_KEY`, `JOINING_SEED_PROPOSER`, `CONFIG_VALUE_TYPE`
    - Remove instance variables from constructor: `this.pullBasedAssigner`, `this.epochManager`, `this._replicasToPull` (and related comments)
    - Remove from `join()`: the `initializePullBasedAssignment()` call, the SYNCING transition, and the `syncPulledReplicas()` call
    - After `signalReadyForReplicas()`, transition directly to READY
    - Remove `pullBasedAssigner` and `epochManager` from the join result object
    - Remove the `EPOCH_CONFIG_DESCRIPTION` local constant
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.5_
  - [x] 2.2 Remove pull-based methods from NodeJoiningService in `src/bootstrap/node-joining-service.js`
    - Remove `initializePullBasedAssignment()` method
    - Remove `syncPulledReplicas()` method
    - Remove `getBootstrapCurrentEpoch()` method
    - Remove `readAuthoritativeEpochConfig()` method
    - Remove `persistProposedEpochWithCas()` method
    - Remove `executeEpochSql()` method
    - Remove `applyCurrentEpochFromCache()` method
    - Remove `getPullBasedAssigner()` accessor
    - Remove `getEpochManager()` accessor
    - _Requirements: 1.3, 6.2, 6.3, 6.4_
  - [x] 2.3 Remove `applyCurrentEpochFromCache()` calls from CDC event handlers in `src/bootstrap/node-joining-service.js`
    - Remove the `if (event.tableName === TABLES.CONFIG)` branch in `subscribeToCDCEvents` handler
    - Remove the `if (tableName === TABLES.CONFIG)` branch in the partition CDC handler in `initializeReplicaHandler`
    - _Requirements: 6.4_
  - [x] 2.4 Remove config fields only used by pull-based path from constructor
    - Remove `this.config.replicaSyncTimeoutMs` setup
    - Remove `this.config.replicaSyncRetryAttempts` setup
    - Remove `this.config.replicaSyncRetryDelayMs` setup
    - _Requirements: 6.6_

- [x] 3. Clean up node joining constants
  - [x] 3.1 Remove pull-based constants from `src/bootstrap/node-joining-constants.js`
    - Remove `replicaSyncTimeoutMs`, `replicaSyncRetryAttempts`, `replicaSyncRetryDelayMs` from `JOINING_DEFAULT`
    - Remove pull-based log messages from `JOINING_LOG_MSG`: `PULL_ASSIGN_INIT`, `READY_NODES_MISSING`, `PULL_ASSIGN_FAILED`, `REBALANCE_NOT_NEEDED`, `EPOCH_PROPOSAL_FAILED`, `EPOCH_PROPOSED`, `LOCAL_REPLICAS_CREATED`, `NO_REPLICAS_TO_SYNC`, `SYNCING_REPLICAS`, `REPLICA_SYNC_SUCCESS`, `REPLICA_SYNC_FAILED`, `REPLICA_SYNC_COMPLETE`
    - Remove pull-based error messages from `JOINING_ERROR_MSG`: `READY_NODES_REQUIRED`, `pullAssignFailed`, `epochProposalFailed`, `localReplicaCreateFailed`, `replicaSyncFailed`, `RPC_CLIENT_REQUIRED`
    - Remove `JOINING_SEED_PROPOSER` constant and its export
    - _Requirements: 6.6_

- [x] 4. Delete PullBasedReplicaAssigner and its tests
  - [x] 4.1 Delete `src/rebalancer/pull-based-replica-assigner.js`
    - _Requirements: 2.1_
  - [x] 4.2 Delete `test/rebalancer/pull-based-replica-assigner.test.js`
    - _Requirements: 2.3_
  - [x] 4.3 Delete `test/rebalancer/autonomous-placement-decisions.property.test.js`
    - _Requirements: 2.3_
  - [x] 4.4 Remove `PULL_ASSIGNER_ERROR_MSG` from `src/rebalancer/rebalancer-constants.js`
    - _Requirements: 2.4_

- [x] 5. Update existing tests for the modified join flow
  - [x] 5.1 Update `test/bootstrap/node-joining-service.test.js` to remove pull-based stubs
    - Remove stubs for `initializePullBasedAssignment` and `syncPulledReplicas`
    - Update lifecycle state expectations (JOINING → READY, no SYNCING)
    - _Requirements: 1.5_
  - [x] 5.2 Update `test/node/node-lifecycle-state-machine.test.js` for new JOINING transitions
    - Update the JOINING valid transitions assertion to include READY
    - _Requirements: 4.1_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
