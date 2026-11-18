/**
 * The observed-progress wake and the reconcile it schedules read ONE
 * lifecycle vocabulary: the repository's normalizeObservedReplicaLifecycle.
 * A cleanup receipt row (service_type partition_cleanup) carries the raw
 * statuses cleanup_owned / cleanup_complete; the reconcile decides on their
 * normalised REMOVING / REMOVED, so the wake must select on the same values.
 * Testing the raw status left a STOPPING REMOVE waiting for the next timeout
 * tick although its removal receipt had already arrived.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationWorkflowRecoveryObservation,
} from '../../src/rebalancer/operation-workflow-recovery-observation.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {REPLICA_CLEANUP_AUTHORITY_KIND} from
  '../../src/node/replica-cleanup-constants.js';

const TEST_OPERATION_ID = 'op-remove-stopping';
const TEST_PARTITION_ID = 'orders-p3';
const TEST_REPLICA_ID = 'orders-p3-r2';
const TEST_NODE_ID = 'node-2';
const TEST_OTHER_NODE_ID = 'node-9';
const TEST_OTHER_REPLICA_ID = 'orders-p3-r7';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_CACHE_OPERATION_UPSERT = 'UPSERT';
const TEST_CLEANUP_TOKEN = 'cleanup-token-1';

function buildStoppingRemoveRow() {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REMOVE,
    partition_id: TEST_PARTITION_ID,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: null,
    target_node_id: TEST_NODE_ID,
    status: ReplicaStatus.REMOVING,
    workflow_step: WORKFLOW_STEP.STOPPING,
    created_at: 1,
    updated_at: 2,
    completed_at: null,
    steps_history: '[]',
  };
}

function buildCleanupReceiptRow(status, overrides = {}) {
  return {
    service_id: TEST_REPLICA_ID,
    service_type: SERVICE_TYPE.PARTITION_CLEANUP,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_NODE_ID,
    status,
    cleanup_token: TEST_CLEANUP_TOKEN,
    ...overrides,
  };
}

function buildWakeProbe() {
  const operationRows = [buildStoppingRemoveRow()];
  const repository = new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    systemTableCache: {
      filter(tableName, predicate) {
        return tableName === TEST_REPLICA_OPERATIONS_TABLE ?
          operationRows.filter(predicate) :
          [];
      },
    },
    cdcIntegrationService: {},
    logger: console,
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {success: true, rows: []};
      },
    },
  });
  const probe = Object.create(OperationWorkflowRecoveryObservation.prototype);
  probe.repository = repository;
  return probe;
}

test('a cleanup_complete receipt wakes the STOPPING REMOVE it retires',
  (t) => {
    const probe = buildWakeProbe();
    t.same(
      probe.findObservedProgressOperationIds(
        buildCleanupReceiptRow(REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE),
        TEST_CACHE_OPERATION_UPSERT,
      ),
      [TEST_OPERATION_ID],
      'the wake selects on the normalised REMOVED lifecycle, not the raw ' +
        'cleanup_complete status',
    );
    t.end();
  });

test('a cleanup_owned receipt wakes the STOPPING REMOVE as REMOVING', (t) => {
  const probe = buildWakeProbe();
  t.same(
    probe.findObservedProgressOperationIds(
      buildCleanupReceiptRow(REPLICA_CLEANUP_AUTHORITY_KIND.OWNED),
      TEST_CACHE_OPERATION_UPSERT,
    ),
    [TEST_OPERATION_ID],
    'cleanup_owned normalises to REMOVING, a relevant lifecycle',
  );
  t.end();
});

test('a receipt whose lifecycle is not a workflow lifecycle wakes nothing',
  (t) => {
    const probe = buildWakeProbe();
    t.same(
      probe.findObservedProgressOperationIds(
        buildCleanupReceiptRow('cleanup_unknown_kind'),
        TEST_CACHE_OPERATION_UPSERT,
      ),
      [],
      'an unrecognised receipt status is not relevant progress',
    );
    t.end();
  });

test('a receipt for another replica or node wakes no operation', (t) => {
  const probe = buildWakeProbe();
  t.same(
    probe.findObservedProgressOperationIds(
      buildCleanupReceiptRow(REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE, {
        node_id: TEST_OTHER_NODE_ID,
      }),
      TEST_CACHE_OPERATION_UPSERT,
    ),
    [],
    'the receipt of the same replica id on another node is not this ' +
      'operation\'s removal',
  );
  t.same(
    probe.findObservedProgressOperationIds(
      buildCleanupReceiptRow(REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE, {
        service_id: TEST_OTHER_REPLICA_ID,
        partition_id: 'orders-p4',
      }),
      TEST_CACHE_OPERATION_UPSERT,
    ),
    [],
    'the receipt of another replica in another partition is not this ' +
      'operation\'s removal',
  );
  t.end();
});
