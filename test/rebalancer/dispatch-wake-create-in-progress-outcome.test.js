/**
 * A dispatch wake that finds its operation at CREATING reconciles observed
 * progress; when there is nothing to apply it must name what it found:
 *
 *  - the target's AUTHORITATIVE services row reports the create in progress:
 *    a typed `create_in_progress` skip. Never a success (nothing happened)
 *    and never another CREATE_REPLICA (the duplicate-dispatch storm);
 *  - no authoritative in-progress evidence (the row is absent or unreadable,
 *    whatever the local cache still shows): the create may be lost, so the
 *    wake continues on the dispatch path and CREATE_REPLICA is re-sent to the
 *    node-side admission owner, which answers authoritatively.
 *
 * The owner's own retries (dispatch retry, transition-retry resume) enter
 * dispatch with a non-wake input: they are not preempted and stay the
 * re-drive of a lost create.
 */
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  DISPATCH_WAKE_PROGRESS_OUTCOME,
  reconcileDispatchWakeOperationProgress,
} from '../../src/rebalancer/operation-workflow-dispatch-wake-preemption.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {withNodeReadinessService} from
  '../helpers/readiness-service-fixture.js';

import {
  buildRowsOfCoordinatorStorage,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';

const {OPERATION_WORKFLOW_OWNER_REASON, REBALANCER_SKIP_REASON} =
  OPERATION_WORKFLOW_OWNER_SHARED;

const TEST_OPERATION_ID = 'op-dispatch-wake-create-in-progress';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_SOURCE_REPLICA_ID = 'sql_write_operations-p1-r1';
const TEST_SOURCE_NODE_ID = 'node-1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_UPDATE_OPERATION_SQL_PREFIX = 'UPDATE replica_operations SET';
const TEST_READ_SOURCE = 'local_partition_replica';
const TEST_INITIATED_STATUS = 'initiated';
const TEST_CREATE_REPLICA_TYPE = 'CREATE_REPLICA';
const TEST_STEP_AGE_MS = 1000;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_AUTHORITY = Object.freeze({
  CREATING: 'creating',
  ABSENT: 'absent',
  UNREADABLE: 'unreadable',
});

function buildCreatingOperationRow(nowMs) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: nowMs - TEST_STEP_AGE_MS,
    updated_at: nowMs - TEST_STEP_AGE_MS,
    completed_at: null,
    error_message: null,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: nowMs - TEST_STEP_AGE_MS,
      sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    }, {
      step: WORKFLOW_STEP.SENDING,
      timestamp: nowMs - TEST_STEP_AGE_MS,
    }, {
      step: WORKFLOW_STEP.CREATING,
      timestamp: nowMs - TEST_STEP_AGE_MS,
    }]),
  };
}

function buildCreatingServiceRow() {
  return {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_TARGET_NODE_ID,
    service_type: TEST_ENTITY_TYPE_PARTITION,
    status: ReplicaStatus.CREATING,
    raft_role: 'follower',
    address: `${TEST_TARGET_NODE_ID}/partition/${TEST_REPLICA_ID}`,
  };
}

// The local cache always shows the target CREATING; `authority` chooses what
// the authoritative services read answers.
function createCoordinator({operationRow, authority, deliveries}) {
  const cachedServiceRow = buildCreatingServiceRow();
  const readAuthoritative = async (tableName) => {
    if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
      return {success: true, source: TEST_READ_SOURCE, rows: [{...operationRow}]};
    }
    if (tableName !== TEST_SERVICES_TABLE) {
      return {success: true, source: TEST_READ_SOURCE, rows: []};
    }
    if (authority === TEST_AUTHORITY.UNREADABLE) {
      return {success: false, error: 'services authority unreadable'};
    }
    return {
      success: true,
      source: TEST_READ_SOURCE,
      rows: authority === TEST_AUTHORITY.CREATING ?
        [buildCreatingServiceRow()] :
        [],
    };
  };
  const rowsOf = (tableName) => {
    if (tableName === TEST_REPLICA_OPERATIONS_TABLE) return [operationRow];
    if (tableName === TEST_SERVICES_TABLE) return [cachedServiceRow];
    return [];
  };
  return new RebalanceCoordinator(withNodeReadinessService(
    'RebalanceCoordinator',
    {
      nodeId: TEST_TARGET_NODE_ID,
      ...buildRowsOfCoordinatorStorage(rowsOf),
      cdcIntegrationService: {
        executeAuthoritativeSystemTableRead: readAuthoritative,
      },
      controlPlaneSystemTableGateway: {
        readRows: readAuthoritative,
        readAuthoritativeRows: readAuthoritative,
        async executeQuery(sql) {
          return String(sql).startsWith(TEST_UPDATE_OPERATION_SQL_PREFIX) ?
            {success: true, affectedRows: 1} :
            {success: true, rows: [], affectedRows: 0};
        },
      },
      messageRouter: {
        async deliver(target, request) {
          deliveries.push({target, request});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: TEST_INITIATED_STATUS,
          });
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {
            targetReplicaCount: TEST_MIN_REPLICA_COUNT,
            minReplicaCount: TEST_MIN_REPLICA_COUNT,
          };
        },
      },
      enableTimeouts: false,
      setTimeoutFn: (callback, delayMs) => ({callback, delayMs}),
      clearTimeoutFn() {},
    },
  ));
}

async function runDispatch(authority, buildInput) {
  const deliveries = [];
  const operationRow = buildCreatingOperationRow(Date.now());
  const coordinator = createCoordinator({operationRow, authority, deliveries});
  coordinator.initialize();
  try {
    const result = await coordinator.dispatchOperation(
      buildInput(coordinator, operationRow),
    );
    return {result, deliveries, operationRow};
  } finally {
    await coordinator.shutdown();
  }
}

const asWakeRow = (_coordinator, operationRow) => operationRow;
const asOwnerRetryOperation = (coordinator, operationRow) =>
  coordinator.workflowOwner.repository.rowToOperation(operationRow);

test('a CREATING dispatch wake is a typed create_in_progress skip while the ' +
  'target is authoritatively CREATING', async (t) => {
  const {result, deliveries, operationRow} = await runDispatch(
    TEST_AUTHORITY.CREATING,
    asWakeRow,
  );
  t.equal(result.success, false,
    'a wake that applied nothing is never reported as success');
  t.equal(result.skipped, true, 'the wake is a skip');
  t.equal(result.reason, OPERATION_WORKFLOW_OWNER_REASON.CREATE_IN_PROGRESS,
    'the skip names the create in progress');
  t.same(deliveries, [],
    'no duplicate CREATE_REPLICA is sent while the create is in progress');
  t.equal(operationRow.workflow_step, WORKFLOW_STEP.CREATING,
    'the operation stays at CREATING');
});

for (const authority of [TEST_AUTHORITY.ABSENT, TEST_AUTHORITY.UNREADABLE]) {
  test('a CREATING dispatch wake re-sends CREATE_REPLICA when the cache ' +
    `shows CREATING but the authoritative target row is ${authority}`,
  async (t) => {
    const {result, deliveries} = await runDispatch(authority, asWakeRow);
    t.equal(deliveries.length, 1,
      'a cached row is not evidence of an in-progress create: the possibly ' +
        'lost create is re-driven through the node-side admission owner');
    t.equal(deliveries[0]?.request?.type, TEST_CREATE_REPLICA_TYPE,
      'the re-drive is the CREATE_REPLICA dispatch');
    t.equal(result.success, true,
      'the re-sent create was answered by the target');
  });
}

test('the owner\'s own retry re-sends CREATE_REPLICA at CREATING even while ' +
  'the target is authoritatively CREATING', async (t) => {
  const {deliveries} = await runDispatch(
    TEST_AUTHORITY.CREATING,
    asOwnerRetryOperation,
  );
  t.equal(deliveries.length, 1,
    'a non-wake dispatch (dispatch retry, transition-retry resume) is not ' +
      'preempted: it stays the re-drive of a lost create');
});

test('reconcileDispatchWakeOperationProgress names every outcome', async (t) => {
  const creatingOperation = {
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.CREATING,
  };
  const buildContext = ({reconciled, observation}) => ({
    isRemoveInitialDispatchPhase: () => false,
    reconcileDispatchWakePendingTargetProgress: async () => false,
    reconcileOperationLifecycle: async () => reconciled,
    buildObservedTargetReplicaObservationOptions: () => ({}),
    repository: {getActualReplicaObservation: async () => observation},
  });
  const creatingObservation = {
    state: 'observed',
    lifecycleStatus: ReplicaStatus.CREATING,
  };
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildContext({reconciled: true, observation: creatingObservation}),
      creatingOperation,
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.PROGRESS_RECONCILED,
    'applied progress is the only success outcome',
  );
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildContext({reconciled: false, observation: creatingObservation}),
      creatingOperation,
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.CREATE_IN_PROGRESS,
    'no progress with an authoritative CREATING target is create_in_progress',
  );
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildContext({
        reconciled: false,
        observation: {state: 'unavailable'},
      }),
      creatingOperation,
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.NO_PROGRESS,
    'no progress without authoritative evidence is no_progress',
  );
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildContext({reconciled: false, observation: creatingObservation}),
      {...creatingOperation, workflowStep: WORKFLOW_STEP.SENDING},
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.NO_PROGRESS,
    'create_in_progress is an outcome of the CREATING step only',
  );
});

test('a PENDING REMOVE wake that is safety-blocked answers the execute\'s ' +
  'typed skip, never the wake\'s success', async (t) => {
  const world = createDurableStepWorld({type: OperationType.REMOVE});
  world.setTargetService(ReplicaStatus.ACTIVE);
  try {
    const result = await world.coordinator.dispatchOperation(
      {...world.durable});
    t.equal(result.success, false,
      'a wake that sent nothing is not a success');
    t.equal(result.skipped, true, 'it is a skip');
    t.equal(result.reason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
      'typed with the remove-safety deferral');
    t.same(world.deliveries, [], 'no REMOVE_REPLICA was sent');
  } finally {
    await world.coordinator.shutdown();
  }
});
