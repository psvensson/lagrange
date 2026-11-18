/**
 * The dispatch service's reconcile of a replica_operations echo is a wake-up,
 * never an authority (R10). In local three-node formations, the cache/CDC
 * echo of the owner's own PENDING -> SENDING write was reconciled after the
 * owner had already written SENDING -> STOPPING, and the stale SENDING
 * snapshot was dispatched again: 45 of 46 dispatch-service REMOVE_REPLICA
 * sends in three runs went out after STOPPING was durable (up to 8 handler
 * entries per REMOVE). A durable row already past the wake-up row is the one
 * reconciled; a wake-up row that is still current is dispatched once.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {SERVICE_STATUS, STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

function removeRow(step, updatedAt) {
  return {
    operation_id: 'remove-op-stale-echo-1',
    partition_id: 'sql_transactions-p1',
    entity_type: 'partition',
    entity_id: 'sql_transactions-p1',
    replica_id: 'sql_transactions-p1-r3',
    source_node_id: 'node-1',
    target_node_id: 'node-1',
    workflow_step: step,
    type: OperationType.REMOVE,
    steps_history: '[]',
    created_at: updatedAt - 1000,
    updated_at: updatedAt,
  };
}

async function dispatchesFor(contextRow, durableRow) {
  const now = Date.now();
  const dispatched = [];
  const service = createService({
    cacheNodes: [{node_id: 'node-1', node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE, connection_state: STATE.READY,
      capabilities: '[]', last_heartbeat: now,
      ready_lease_expires_at: now + 30000, created_at: now - 5000}],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      }}),
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatched.push(operation.workflowStep ?? operation.workflow_step ?? null);
        return {success: true};
      },
      isOperationLocallyOwned: () => true,
    },
  });
  service.getReplicaOperationRow = async () => durableRow;
  try {
    await service.reconcileOperationDispatch(contextRow.operation_id,
      {row: contextRow});
  } finally {
    service.stop();
  }
  return dispatched.length;
}

test('a SENDING echo reconciled after the owner wrote STOPPING is not ' +
  'dispatched again; a current SENDING wake-up is dispatched once', async (t) => {
  initEnv();
  const at = Date.now() - 500;
  const sending = removeRow(WORKFLOW_STEP.SENDING, at);
  t.equal(await dispatchesFor(sending, removeRow(WORKFLOW_STEP.STOPPING, at + 70)), 0,
    'the durable STOPPING row is the authority over the stale SENDING echo');
  t.equal(await dispatchesFor(sending, {...sending}), 1,
    'a SENDING row still current (restart, ready-node, first delivery) is dispatched');
  t.equal(await dispatchesFor(sending, null), 1,
    'an unavailable durable read keeps the wake-up row (its owner decides)');
});
