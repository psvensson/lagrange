/**
 * Quest failed-replica-removal-transition-tolerance: a replica stranded in
 * SYNCING (a failed ADD whose voter-ready wait timed out without a FAILED
 * flip) must accept the removal transition, or its cleanup REMOVE is rejected
 * forever, the replica becomes un-removable, and the operation-ledger spread
 * it blocks never completes (archived repro: fanout-postfix-seamC.log.txt in
 * solve/report/ledger-surplus-drain-stale-actuals-2026-08-22/).
 *
 * The matrix already admits CREATING -> REMOVING; refusing SYNCING ->
 * REMOVING was an omission, not a design decision.  Removal intent has one
 * durable shape for every prior lifecycle state, including FAILED: the
 * executor must publish REMOVING before consensus exit or cleanup.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ReplicaStateMachine,
  ReplicaState,
  VALID_TRANSITIONS,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function createMockCDCService() {
  return {
    updateSystemTableRow: async () => ({success: true}),
    insertSystemTableRow: async () => ({success: true}),
    deleteSystemTableRow: async () => ({success: true}),
    upsertSystemTableRow: async () => ({success: true}),
  };
}

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function driveReplicaTo(stateMachine, replicaId, states) {
  for (const state of states) {
    await stateMachine.transition(replicaId, state, {
      partitionId: 'replica_operations-p1',
      reason: 'setup',
    });
  }
}

test('a SYNCING replica accepts the removal transition so a failed ADD ' +
  'cleanup REMOVE cannot strand it', async (t) => {
  initializeTestEnvironment();
  const stateMachine = new ReplicaStateMachine({
    nodeId: 'test-node',
    cdcIntegrationService: createMockCDCService(),
  });
  const replicaId = 'replica_operations-p1-r4';
  await driveReplicaTo(stateMachine, replicaId, [
    ReplicaState.PENDING,
    ReplicaState.CREATING,
    ReplicaState.SYNCING,
  ]);

  const admitted = await stateMachine.transition(
    replicaId,
    ReplicaState.REMOVING,
    {
      partitionId: 'replica_operations-p1',
      reason: 'failed-add-cleanup-remove',
    },
  );
  t.equal(admitted !== false, true,
    'SYNCING -> REMOVING must be admitted; rejecting it leaves a failed ' +
    'ADD replica un-removable and blocks ledger spread forever');
  t.equal(stateMachine.getState(replicaId)?.state, ReplicaState.REMOVING,
    'the replica should be tracked as REMOVING after admission');

  const removed = await stateMachine.transition(
    replicaId,
    ReplicaState.REMOVED,
    {
      partitionId: 'replica_operations-p1',
      reason: 'failed-add-cleanup-complete',
    },
  );
  t.equal(removed !== false, true,
    'the admitted removal must be able to reach REMOVED');
});

test('FAILED enters the same durable REMOVING protocol as every removal',
  async (t) => {
    initializeTestEnvironment();
    const stateMachine = new ReplicaStateMachine({
      nodeId: 'test-node',
      cdcIntegrationService: createMockCDCService(),
    });
    const replicaId = 'replica_operations-p1-r5';
    await driveReplicaTo(stateMachine, replicaId, [
      ReplicaState.PENDING,
      ReplicaState.FAILED,
    ]);

    const admitted = await stateMachine.transition(
      replicaId,
      ReplicaState.REMOVING,
      {partitionId: 'replica_operations-p1', reason: 'durable-remove-intent'},
    );
    t.equal(admitted !== false, true,
      'FAILED -> REMOVING publishes the same durable removal intent');
    t.same(VALID_TRANSITIONS[ReplicaState.FAILED], [ReplicaState.REMOVING],
      'FAILED has no direct durable-cleanup bypass');
    t.equal(stateMachine.getState(replicaId)?.state, ReplicaState.REMOVING);
  });

test('FAILED stays authoritative when its REMOVING write did not durably apply',
  async (t) => {
    initializeTestEnvironment();
    let writes = 0;
    const stateMachine = new ReplicaStateMachine({
      nodeId: 'test-node',
      systemTableCache: {get: () => ({status: ReplicaState.FAILED})},
      controlPlaneSystemTableGateway: {
        submitMutation: async () => {
          writes += 1;
          return {
            success: true,
            outcome: 'observed_state_changed',
            partitionResult: {affectedRows: 0},
          };
        },
      },
    });
    const replicaId = 'replica_operations-p1-r6';
    stateMachine._applyTransition(replicaId, ReplicaState.PENDING, {
      partitionId: 'replica_operations-p1',
    }, {persist: false});
    stateMachine._applyTransition(replicaId, ReplicaState.FAILED, {
      partitionId: 'replica_operations-p1',
    }, {persist: false});

    let refusal = null;
    try {
      await stateMachine.transition(replicaId, ReplicaState.REMOVING, {
        partitionId: 'replica_operations-p1',
        reason: 'durable-remove-intent',
      });
    } catch (error) {
      refusal = error;
    }
    t.equal(refusal?.deferRetry, true,
      'a retryable non-apply remains a retryable persistence failure');
    t.equal(writes, 1, 'one durable attempt was made');
    t.equal(stateMachine.getState(replicaId)?.state, ReplicaState.FAILED,
      'the non-applied write cannot manufacture local removal authority');
  });
