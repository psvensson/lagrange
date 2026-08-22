/**
 * Quest failed-replica-removal-transition-tolerance: a replica stranded in
 * SYNCING (a failed ADD whose voter-ready wait timed out without a FAILED
 * flip) must accept the removal transition, or its cleanup REMOVE is rejected
 * forever, the replica becomes un-removable, and the operation-ledger spread
 * it blocks never completes (archived repro: fanout-postfix-seamC.log.txt in
 * solve/report/ledger-surplus-drain-stale-actuals-2026-08-22/).
 *
 * The matrix already admits CREATING -> REMOVING; refusing SYNCING ->
 * REMOVING was an omission, not a design decision. FAILED stays terminal for
 * lifecycle transitions by design: the removal executor's FAILED tolerance
 * skips the REMOVING write and proceeds to durable cleanup, so FAILED ->
 * REMOVING must remain invalid.
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

test('FAILED stays terminal for lifecycle transitions: the executor skip ' +
  'tolerance, not a matrix edge, owns failed-replica removal', async (t) => {
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
    {partitionId: 'replica_operations-p1', reason: 'must-stay-invalid'},
  );
  t.equal(admitted, false,
    'FAILED -> REMOVING must remain invalid; failed replicas take the ' +
    'durable-cleanup skip path that deletes the row directly');
  t.same(VALID_TRANSITIONS[ReplicaState.FAILED], [ReplicaState.REMOVED],
    'the FAILED row of the matrix must keep exactly its terminal edge');
});
