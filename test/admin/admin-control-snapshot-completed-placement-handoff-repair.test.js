import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from
  '../../src/admin/admin-control-snapshot.js';
import {AdminServiceDiscovery} from
  '../../src/admin/admin-service-discovery.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
  deriveAuthoritativeRepairTables,
} from '../../src/admin/admin-authoritative-repair-policy.js';
import {
  ControlPlaneSnapshotOwner,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  buildCompletedPriorityPlacementHandoffObservation,
} from '../../src/control-plane/completed-priority-placement-handoff-observation.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {TABLES} from '../../src/constants/index.js';
import {
  createAuthoritativeRepairCache,
} from './admin-websocket-api-test-support.js';

const TEST_NOW_MS = 1784500000000;
const TEST_PARTITION_ID = 'control_plane_publications-p1';
const TEST_REPLICA_ID = `${TEST_PARTITION_ID}-r4`;
const TEST_OPERATION_ID = 'op-completed-priority-add';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_SOURCE_REPLICA_ID = `${TEST_PARTITION_ID}-r2`;

function buildTargetServiceRow(overrides = {}) {
  return {
    service_id: TEST_REPLICA_ID,
    service_type: 'partition',
    node_id: TEST_TARGET_NODE_ID,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    raft_role: 'follower',
    status: 'syncing',
    address: `${TEST_TARGET_NODE_ID}/partition/${TEST_REPLICA_ID}`,
    ...overrides,
  };
}

function buildTerminalOperationRow(overrides = {}) {
  const operationType = overrides.type || 'ADD';
  const terminalStatus = operationType === 'ADD' ? 'active' : 'removed';
  const terminalWorkflowStep =
    operationType === 'ADD' ? 'ACTIVE' : 'REMOVED';
  return {
    operation_id: TEST_OPERATION_ID,
    partition_id: TEST_PARTITION_ID,
    entity_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_replica_id: TEST_SOURCE_REPLICA_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    type: operationType,
    status: terminalStatus,
    workflow_step: terminalWorkflowStep,
    created_at: TEST_NOW_MS - 2000,
    updated_at: TEST_NOW_MS - 1000,
    completed_at: TEST_NOW_MS - 1000,
    ...overrides,
  };
}

function buildCurrentPriorityPlacementObservation(options = {}) {
  const partitionId = options.partitionId || TEST_PARTITION_ID;
  return {
    state: 'available',
    satisfied: options.blocked === false,
    priorityPartitionSummary: {
      satisfied: options.blocked === false,
      blockedPartitions: options.blocked === false ? [] : [{
        partitionId,
        spreadGap: 1,
        exclusionReasonCounts: {
          status_syncing: 1,
        },
      }],
    },
    leaderCoverage: {
      satisfied: true,
      missingLeaderPartitionIds: [],
    },
  };
}

function createCompletedPlacementHandoffGap(options = {}) {
  const targetStatus = options.targetStatus ?? 'syncing';
  const cache = createAuthoritativeRepairCache('node-local');
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    id: 'node-local',
    node_id: 'node-local',
    address: 'localhost:8080',
    status: 'active',
    last_heartbeat: TEST_NOW_MS,
    ready_lease_expires_at: TEST_NOW_MS + 60000,
  });
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: TEST_TARGET_NODE_ID,
    node_id: TEST_TARGET_NODE_ID,
    address: 'localhost:8081',
    status: 'active',
    last_heartbeat: TEST_NOW_MS,
    ready_lease_expires_at: TEST_NOW_MS + 60000,
  });
  if (options.includeTarget !== false) {
    cache.applySystemTableChange(
      TABLES.SERVICES,
      'INSERT',
      buildTargetServiceRow({
        status: targetStatus,
        ...options.targetOverrides,
      }),
    );
  }
  cache.applySystemTableChange(
    TABLES.REPLICA_OPERATIONS,
    'INSERT',
    buildTerminalOperationRow({
      type: options.operationType || 'ADD',
      ...options.operationOverrides,
    }),
  );
  const controlSnapshot = new AdminControlSnapshot({
    systemTableCache: cache,
    cacheMutationTarget: cache,
    nodeId: 'node-local',
    nowFn: () => TEST_NOW_MS,
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
  });
  const localSnapshot = {
    capturedAt: TEST_NOW_MS,
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation:
        buildCurrentPriorityPlacementObservation(),
    },
  };
  return {cache, controlSnapshot, localSnapshot};
}

function observeCompletedPlacementHandoff(options = {}) {
  const partitionId =
    options.operationOverrides?.partition_id || TEST_PARTITION_ID;
  const operationRows = options.operationRows || [
    buildTerminalOperationRow(options.operationOverrides),
  ];
  const serviceRows = options.serviceRows === undefined ?
    [buildTargetServiceRow()] :
    options.serviceRows;
  return buildCompletedPriorityPlacementHandoffObservation({
    replicaOperationRows: operationRows,
    serviceRows,
    currentPriorityPlacementObservation:
      buildCurrentPriorityPlacementObservation({
        blocked: options.blocked,
        partitionId,
      }),
    nowMs: TEST_NOW_MS,
  });
}

test(
  'ControlPlaneSnapshotOwner rejects a completed priority placement whose ' +
  'captured target service is still syncing',
  async (t) => {
    const {controlSnapshot, localSnapshot} =
      createCompletedPlacementHandoffGap();
    const evaluation =
      controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
        localSnapshot,
      );

    t.equal(
      evaluation.shouldRepair,
      true,
      'terminal operation and transitional target rows require reconciliation',
    );
    t.equal(
      evaluation.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER
          .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
      ),
      true,
      'evaluation should name the completed-placement handoff boundary',
    );
    t.same(
      evaluation.completedPriorityPlacementHandoff,
      {
        hasGap: true,
        operationIds: [TEST_OPERATION_ID],
        partitionIds: [TEST_PARTITION_ID],
        targetReplicaIds: [TEST_REPLICA_ID],
      },
      'evaluation should preserve the exact operation/topology contradiction',
    );

    const owner = new ControlPlaneSnapshotOwner({controlSnapshot});
    const observed = await owner.resolveControlSnapshot(localSnapshot);

    t.equal(
      observed.snapshotObservation.state,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
      'the existing snapshot owner must not certify the mixed witness fresh',
    );
    t.same(
      observed.snapshotObservation.reasonCodes,
      [
        AUTHORITATIVE_REPAIR_TRIGGER
          .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
      ],
      'the owner should carry the handoff gap into its freshness contract',
    );
  },
);

test(
  'completed priority placement repair uses the existing owner handoff and ' +
  're-evaluates after canonical scope reconciliation',
  async (t) => {
    const {cache, controlSnapshot, localSnapshot} =
      createCompletedPlacementHandoffGap({
        operationType: 'REPLACE',
        targetStatus: 'creating',
      });
    const repairedSnapshot = {
      ...localSnapshot,
      controlPlaneDiagnostics: {
        currentPriorityPlacementObservation:
          buildCurrentPriorityPlacementObservation({blocked: false}),
      },
    };
    controlSnapshot.buildLocalControlSnapshot = async () => repairedSnapshot;
    const authoritativeReads = [];
    const reconciliations = [];
    let repairRequest = null;
    const serviceDiscovery = new AdminServiceDiscovery({
      nodeId: 'node-local',
      systemTableCache: cache,
      cacheMutationTarget: cache,
      nowFn: () => TEST_NOW_MS,
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = readIntent.tableName;
          authoritativeReads.push(tableName);
          const rows = cache.getAll(tableName).map((row) =>
            tableName === TABLES.SERVICES &&
            row.replica_id === TEST_REPLICA_ID ?
              {...row, status: 'active'} :
              {...row},
          );
          return {
            success: true,
            tableName,
            rows,
            rowSetComplete: true,
            authoritativeObservation: {
              scope:
                CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
              tableName,
              observedAtMs: TEST_NOW_MS,
              causeId: `completed-placement:${tableName}`,
              rowSetComplete: true,
            },
          };
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconciliations.push({tableName, rows, options});
          if (tableName === TABLES.SERVICES) {
            cache.applySystemTableChange(
              TABLES.SERVICES,
              'UPDATE',
              buildTargetServiceRow({status: 'active'}),
            );
          }
          return {
            success: true,
            mutationCount: 1,
            authoritativeObservedAtMs:
              options.authoritativeObservation.observedAtMs,
          };
        },
      },
    });
    const ensureCanonicalRepair =
      serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair
        .bind(serviceDiscovery);
    serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair =
      async (options) => {
        repairRequest = options;
        return ensureCanonicalRepair(options);
      };
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery,
    });
    const observed = await owner.resolveControlSnapshot(
      localSnapshot,
      {forceAuthoritativeRepair: true},
    );
    const repairTables = deriveAuthoritativeRepairTables(repairRequest);

    t.same(
      authoritativeReads,
      [
        TABLES.PARTITIONS,
        TABLES.SERVICES,
        TABLES.TABLES,
        TABLES.REPLICA_OPERATIONS,
      ],
      'repair should use complete-table receipts for topology and its ledger',
    );
    t.same(
      reconciliations.map(({tableName}) => tableName),
      repairTables,
      'canonical gateway should reconcile every requested authority table',
    );
    t.equal(
      reconciliations.every(({options}) =>
        options.authoritativeObservation.scope ===
          CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      ),
      true,
      'every reconciliation should carry its own complete-table receipt',
    );
    t.same(
      repairRequest.triggerCodes,
      [
        AUTHORITATIVE_REPAIR_TRIGGER
          .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
      ],
      'snapshot owner should hand the exact contradiction to canonical repair',
    );
    t.equal(
      observed.snapshotObservation.state,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
      'owner should certify freshness only after post-repair re-evaluation',
    );
    t.same(
      observed.snapshotObservation.reasonCodes,
      [
        AUTHORITATIVE_REPAIR_TRIGGER
          .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
      ],
      'fresh result should retain the repaired boundary as audit history',
    );
    t.equal(
      controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
        repairedSnapshot,
      ).completedPriorityPlacementHandoff.hasGap,
      false,
      'authoritative ACTIVE topology should clear rather than mask the gap',
    );
  },
);

test(
  'completed priority placement handoff does not trigger once the exact ' +
  'target service is ACTIVE',
  async (t) => {
    const {controlSnapshot, localSnapshot} =
      createCompletedPlacementHandoffGap({targetStatus: 'active'});
    const evaluation =
      controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
        localSnapshot,
      );

    t.equal(
      evaluation.completedPriorityPlacementHandoff.hasGap,
      false,
      'operation evidence should not become a second topology authority',
    );
    t.equal(
      evaluation.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER
          .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
      ),
      false,
      'an observed ACTIVE target should not request a redundant repair',
    );
  },
);

test(
  'completed placement handoff detects terminal transitional targets and ' +
  'fails closed on ambiguous or contradictory rows',
  async (t) => {
    const cases = [
      {
        name: 'ADD pending',
        operationOverrides: {type: 'ADD'},
        serviceRows: [buildTargetServiceRow({status: 'pending'})],
        expected: true,
      },
      {
        name: 'ADD creating',
        operationOverrides: {type: 'ADD'},
        serviceRows: [buildTargetServiceRow({status: 'creating'})],
        expected: true,
      },
      {
        name: 'REPLACE syncing',
        operationOverrides: {type: 'REPLACE'},
        expected: true,
      },
      {
        name: 'ACTIVE target',
        serviceRows: [buildTargetServiceRow({status: 'active'})],
        expected: false,
      },
      {
        name: 'removed target',
        serviceRows: [buildTargetServiceRow({status: 'removed'})],
        expected: false,
      },
      {
        name: 'absent target',
        serviceRows: [],
        expected: false,
      },
      {
        name: 'wrong target node',
        serviceRows: [buildTargetServiceRow({node_id: 'node-other'})],
        expected: false,
      },
      {
        name: 'wrong target replica',
        serviceRows: [buildTargetServiceRow({
          service_id: `${TEST_PARTITION_ID}-r9`,
          replica_id: `${TEST_PARTITION_ID}-r9`,
        })],
        expected: false,
      },
      {
        name: 'nonterminal operation',
        operationOverrides: {
          status: 'pending',
          workflow_step: 'PENDING',
          completed_at: null,
        },
        expected: false,
      },
      {
        name: 'nonpriority partition',
        operationOverrides: {
          partition_id: 'user_movies-p1',
          entity_id: 'user_movies-p1',
        },
        serviceRows: [buildTargetServiceRow({
          partition_id: 'user_movies-p1',
        })],
        expected: false,
      },
      {
        name: 'unblocked priority partition',
        blocked: false,
        expected: false,
      },
      {
        name: 'duplicate ACTIVE and SYNCING target',
        serviceRows: [
          buildTargetServiceRow({status: 'syncing'}),
          buildTargetServiceRow({status: 'active'}),
        ],
        expected: false,
      },
    ];

    for (const testCase of cases) {
      const observation = observeCompletedPlacementHandoff(testCase);
      t.equal(
        observation.hasGap,
        testCase.expected,
        testCase.name,
      );
    }

    const duplicateOperation = buildTerminalOperationRow();
    const replayObservation = observeCompletedPlacementHandoff({
      operationRows: [duplicateOperation, {...duplicateOperation}],
    });
    t.same(
      replayObservation.operationIds,
      [TEST_OPERATION_ID],
      'duplicate/replayed ledger rows should retain one repair witness',
    );
  },
);
