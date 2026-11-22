import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  buildMockPolicyAuthorityWitness,
  createTestCoordinator,
} from './test-helpers.js';
import {readOwnerFact} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {REBALANCE_COORDINATOR_SHARED} from
  '../../src/rebalancer/rebalance-coordinator-shared.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from
  '../../src/rebalancer/storage-admission-constants.js';

const {TOPOLOGY_GUARD_REASON} = REBALANCE_COORDINATOR_SHARED;

// Verdict matrix for the failed-authoritative-read-admission-verdict
// invariant (architecture/contracts/invariants.json; GP-8 of the
// golden-capability-gold-plating epic). Each case drives one admission
// predicate with a FAILED authoritative read and asserts the documented
// verdict: safety gates fail CLOSED (typed throw), and the two named
// fail-open holds admit with their deadlock witness. The fail-open rows
// double as the red-on-revert witness: they go red if the hold ever
// silently flips polarity or changes its read-gap semantics.
// The SERVICES rows the over-target hold and the topology guard read are the
// services-p1 owner fact (readOwnerFact); a failed read is its UNAVAILABLE
// answer, never rows.

const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_NODE_ID = 'node-verdict-a';
const TEST_REPLICA_ID = `${TEST_PARTITION_ID}-r1`;
const READ_GAP_ERROR = 'authoritative owner unavailable (verdict matrix)';
const TARGET_REPLICA_COUNT = 3;
const OVER_TARGET_ROW_COUNT = 4;
const AT_TARGET_ROW_COUNT = 3;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createServiceRow(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: TEST_PARTITION_ID,
    node_id: nodeId,
    address: `local/partition/${replicaId}`,
    raft_role: raftRole,
    status: ReplicaStatus.ACTIVE,
  };
}

function overTargetServiceRows() {
  return [
    createServiceRow(TEST_REPLICA_ID, TEST_NODE_ID, 'leader'),
    createServiceRow(`${TEST_PARTITION_ID}-r2`, TEST_NODE_ID, 'follower'),
    createServiceRow(`${TEST_PARTITION_ID}-r3`, TEST_NODE_ID, 'follower'),
    createServiceRow(`${TEST_PARTITION_ID}-r4`, 'node-verdict-b', 'follower'),
  ];
}

async function createVerdictCoordinator(t, overrides) {
  const coordinator = createTestCoordinator({
    nodeId: TEST_NODE_ID,
    cacheData: {nodes: [TEST_NODE_ID, 'node-verdict-b'].map((nodeId) => ({
      node_id: nodeId, status: 'active',
    }))},
    enableTimeouts: false,
  });
  coordinator.initialize();
  t.teardown(async () => coordinator.shutdown());
  for (const [method, replacement] of Object.entries(overrides)) {
    coordinator[method] = replacement;
  }
  return coordinator;
}

// The services-p1 owner fact the hold reads, issued by the production read
// over a reader that answers as the leader (or fails).
function servicesOwnerFact(answer) {
  return () => readOwnerFact(async () => answer, {
    tableName: 'services',
    sql: 'SELECT * FROM services WHERE service_type = ? AND partition_id = ?',
    params: ['partition', TEST_PARTITION_ID],
    floor: {partitionId: 'services-p1', index: 0, term: 0},
    deadline: {timeoutMs: 5000},
    routingReadinessDimension:
      REBALANCE_COORDINATOR_SHARED.CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
}

function servicesOwnerRows(rows) {
  return servicesOwnerFact({success: true, rowSetComplete: true, rows,
    readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1')});
}

function addLikeContext() {
  return {
    move: {enforceConcurrentOperationBudget: true},
    normalizedMoveType: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: 'partition',
    entityId: TEST_PARTITION_ID,
  };
}

test(
  'fail-open hold with deadlock witness: the over-target count-keyed ' +
    'create-lane hold admits on a failed authoritative read (blocking on ' +
    'the gap would strand the surplus drain it exists to release)',
  async (t) => {
    initializeTestEnvironment();
    const coordinator = await createVerdictCoordinator(t, {
      // Read gap: the services-p1 leader's read fails, so the owner fact the
      // hold reads (and the only SERVICES rows it may count) is UNAVAILABLE.
      // This IS the failed read.
      readEntityServiceOwnerFact: servicesOwnerFact({success: false,
        error: READ_GAP_ERROR}),
      // The op-observation lane reports no conflict so the call reaches the
      // over-target hold itself.
      getEntityAuthoritativeOperationObservation: async () => ({
        state: 'empty',
        operationCount: 0,
        operations: [],
        deferredOutcome: null,
        retryAfterMs: null,
      }),
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    await coordinator.ensureCriticalPartitionCreateLaneAvailable(
      addLikeContext(),
    );
    t.pass(
      'the over-target hold returned without throwing on the read gap ' +
        '(documented fail-open: never blocks on a read gap)',
    );
  },
);

test(
  'red witness: the same hold DOES engage when the authoritative read ' +
    'succeeds and shows the partition strictly over target',
  async (t) => {
    initializeTestEnvironment();
    const rows = overTargetServiceRows();
    t.equal(rows.length, OVER_TARGET_ROW_COUNT, 'fixture is over target');
    const coordinator = await createVerdictCoordinator(t, {
      readEntityServiceOwnerFact: servicesOwnerRows(rows),
      getEntityAuthoritativeOperationObservation: async () => ({
        state: 'empty',
        operationCount: 0,
        operations: [],
        deferredOutcome: null,
        retryAfterMs: null,
      }),
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    await t.rejects(
      coordinator.ensureCriticalPartitionCreateLaneAvailable(
        addLikeContext(),
      ),
      /over|target|hold|budget|lane/iu,
      'a readable over-target inventory must engage the hold (proves the ' +
        'fail-open case above is the read-gap path, not a dead hold)',
    );
  },
);

test(
  'fail-open boundary: the same hold stays open at exactly target even ' +
    'with a readable inventory (no over-target, no hold)',
  async (t) => {
    initializeTestEnvironment();
    const coordinator = await createVerdictCoordinator(t, {
      readEntityServiceOwnerFact: servicesOwnerRows(
        overTargetServiceRows().slice(0, AT_TARGET_ROW_COUNT)),
      getEntityAuthoritativeOperationObservation: async () => ({
        state: 'empty',
        operationCount: 0,
        operations: [],
        deferredOutcome: null,
        retryAfterMs: null,
      }),
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    await coordinator.ensureCriticalPartitionCreateLaneAvailable(
      addLikeContext(),
    );
    t.pass('an at-target inventory never engages the over-target hold');
  },
);

test(
  'fail-closed gate: the conflict lane fails CLOSED on a deferred ' +
    'authoritative operation observation (typed deferred-visibility throw)',
  async (t) => {
    initializeTestEnvironment();
    const coordinator = await createVerdictCoordinator(t, {
      getEntityAuthoritativeOperationObservation: async () => ({
        state: 'deferred',
        operationCount: null,
        operations: [],
        deferredOutcome: {
          reason: 'authoritative_observation_deferred',
          detail: READ_GAP_ERROR,
        },
        retryAfterMs: 50,
      }),
      shouldAllowPriorityRecoveryDeferredObservation: () => false,
      getCacheVisibleEntityOperations: () => [],
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    await t.rejects(
      coordinator.ensureCriticalPartitionCreateLaneAvailable(
        addLikeContext(),
      ),
      /deferred|visibility|authoritative/iu,
      'a deferred authoritative observation must throw the typed ' +
        'deferred-visibility error, never admit',
    );
  },
);

// The topology guard (the invariant's "replica_inventory_unusable denial"):
// an ADD the planner proposes, on a node that hosts no replica.
function topologyGuardContext() {
  return {
    move: {type: OperationType.ADD, nodeId: 'node-verdict-b',
      enforceConcurrentOperationBudget: true},
    normalizedMoveType: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: 'partition',
    entityId: TEST_PARTITION_ID,
  };
}

async function topologyGuardRejection(coordinator) {
  try {
    await coordinator.ensureCreateTopologyGuardAllowed(topologyGuardContext());
  } catch (error) {
    return error;
  }
  return null;
}

test(
  'fail-closed gate: the topology guard decides nothing on an unavailable ' +
    'SERVICES owner fact (typed deferral, never an admission)',
  async (t) => {
    initializeTestEnvironment();
    const coordinator = await createVerdictCoordinator(t, {
      readEntityServiceOwnerFact: servicesOwnerFact({success: false,
        error: READ_GAP_ERROR}),
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    const admission = (await topologyGuardRejection(coordinator))?.admissionResult;
    t.equal(admission?.allowed, false, 'the guard does not admit on the read gap');
    t.equal(admission?.decisionType, STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      'a typed defer: no decision is taken from an unavailable read');
    t.same(admission?.blockingReasons,
      [TOPOLOGY_GUARD_REASON.REPLICA_INVENTORY_UNAVAILABLE]);
    t.ok(admission?.topologySnapshot?.authoritativeReasonCode,
      'the deferral names why the owner fact is unavailable');
  },
);

test(
  'fail-closed gate: the topology guard denies replica_inventory_unusable ' +
    'when its authoritative operation read fails under a readable SERVICES ' +
    'owner fact',
  async (t) => {
    initializeTestEnvironment();
    const coordinator = await createVerdictCoordinator(t, {
      readEntityServiceOwnerFact: servicesOwnerRows(
        overTargetServiceRows().slice(0, 1)),
      getEntityRecoveryOperationObservation: async () => ({
        state: 'deferred',
        operationCount: null,
        operations: [],
        deferredOutcome: {
          reason: 'authoritative_observation_deferred',
          detail: READ_GAP_ERROR,
        },
        retryAfterMs: 50,
      }),
      resolveTopologyGuardTargetReplicaCount: async () =>
        TARGET_REPLICA_COUNT,
    });

    const admission = (await topologyGuardRejection(coordinator))?.admissionResult;
    t.equal(admission?.allowed, false, 'the guard does not admit on the read gap');
    t.equal(admission?.decisionType, STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
      'a typed deny');
    t.same(admission?.blockingReasons,
      [TOPOLOGY_GUARD_REASON.REPLICA_INVENTORY_UNUSABLE]);
  },
);
