import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  READ_MODEL_SOURCE,
  CONTROL_PLANE_DECISION_READ_MODEL,
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  buildDivergenceEvent,
  isValidReadModelSource,
} from '../../src/control-plane/read-model-contract.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {REBALANCE_COORDINATOR_EVENT} from
  '../../src/rebalancer/rebalancer-constants.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from '../../src/partition/managed-split-retry-policy.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from
  '../../src/rebalancer/storage-admission-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_REPLICA_ID = 'partition-1-r1';
const FIXTURE_NODE_ID = 'node-local';
const FIXTURE_TABLE_NAME = 'services';
const FIXTURE_OWNER_COMPONENT = 'TestOwner';
const FIXTURE_ROW_KEY = 'row-key-1';
const FIXTURE_ENTITY_TYPE = 'partition';
const FIXTURE_ENTITY_ID = 'partition-1';

// ═══════════════════════════════════════════════════════════════════
// 1. Read-model contract registry tests
// ═══════════════════════════════════════════════════════════════════

test('CONTROL_PLANE_DECISION_READ_MODEL entries map to valid sources',
  async (t) => {
    const entries = Object.entries(CONTROL_PLANE_DECISION_READ_MODEL);
    t.ok(entries.length > 0, 'registry must not be empty');

    const validSources = new Set(Object.values(READ_MODEL_SOURCE));
    for (const [decision, source] of entries) {
      t.ok(
        validSources.has(source),
        `${decision} maps to valid source '${source}'`,
      );
    }
  });

test('isValidReadModelSource accepts all canonical sources', async (t) => {
  for (const source of Object.values(READ_MODEL_SOURCE)) {
    t.equal(
      isValidReadModelSource(source),
      true,
      `${source} is valid`,
    );
  }
});

test('isValidReadModelSource rejects unknown sources', async (t) => {
  t.equal(isValidReadModelSource('unknown_source'), false);
  t.equal(isValidReadModelSource(''), false);
  t.equal(isValidReadModelSource(null), false);
  t.equal(isValidReadModelSource(undefined), false);
});

test('buildDivergenceEvent produces correct CACHE_MISSING payload',
  async (t) => {
    const event = buildDivergenceEvent({
      divergenceType: READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING,
      tableName: FIXTURE_TABLE_NAME,
      ownerComponent: FIXTURE_OWNER_COMPONENT,
      reconciliationReason:
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      rowKey: FIXTURE_ROW_KEY,
      cacheValue: null,
      authoritativeValue: {status: 'active'},
      divergentFields: ['status'],
    });

    t.equal(
      event.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING,
    );
    t.equal(event.tableName, FIXTURE_TABLE_NAME);
    t.equal(event.ownerComponent, FIXTURE_OWNER_COMPONENT);
    t.equal(
      event.reconciliationReason,
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );
    t.equal(event.rowKey, FIXTURE_ROW_KEY);
    t.equal(event.cacheValue, null);
    t.same(event.authoritativeValue, {status: 'active'});
    t.same(event.divergentFields, ['status']);
    t.ok(typeof event.detectedAt === 'number');
    t.ok(Object.isFrozen(event), 'event must be frozen');
  });

test('buildDivergenceEvent produces correct FIELD_MISMATCH payload',
  async (t) => {
    const event = buildDivergenceEvent({
      divergenceType: READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH,
      tableName: FIXTURE_TABLE_NAME,
      ownerComponent: FIXTURE_OWNER_COMPONENT,
      reconciliationReason:
        SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE,
      rowKey: FIXTURE_ROW_KEY,
      cacheValue: {status: 'creating'},
      authoritativeValue: {status: 'active'},
      divergentFields: ['status'],
    });

    t.equal(
      event.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH,
    );
    t.same(event.cacheValue, {status: 'creating'});
    t.same(event.authoritativeValue, {status: 'active'});
  });

test('buildDivergenceEvent produces correct AUTHORITATIVE_MISSING payload',
  async (t) => {
    const event = buildDivergenceEvent({
      divergenceType: READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING,
      tableName: FIXTURE_TABLE_NAME,
      ownerComponent: FIXTURE_OWNER_COMPONENT,
      reconciliationReason:
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      rowKey: FIXTURE_ROW_KEY,
      cacheValue: {status: 'active'},
      authoritativeValue: null,
    });

    t.equal(
      event.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING,
    );
    t.same(event.cacheValue, {status: 'active'});
    t.equal(event.authoritativeValue, null);
    t.equal(event.divergentFields, null);
  });

test('buildDivergenceEvent defaults optional fields to null',
  async (t) => {
    const event = buildDivergenceEvent({
      divergenceType: READ_MODEL_DIVERGENCE_TYPE.COUNT_MISMATCH,
      tableName: FIXTURE_TABLE_NAME,
      ownerComponent: FIXTURE_OWNER_COMPONENT,
      reconciliationReason:
        SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE,
    });

    t.equal(event.rowKey, null);
    t.equal(event.cacheValue, null);
    t.equal(event.authoritativeValue, null);
    t.equal(event.divergentFields, null);
  });

// ═══════════════════════════════════════════════════════════════════
// 2. Owner-path regression tests — single read-model source
// ═══════════════════════════════════════════════════════════════════

test('RebalanceCoordinator.getEntityInFlightReplicaIds fails closed when its ' +
  'authoritative owner is unavailable', async (t) => {
  let sqlQueryCalled = false;

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        sqlQueryCalled = true;
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  try {
    // Reset tracking flags after constructor/initialize
    sqlQueryCalled = false;

    await t.rejects(
      coordinator.getEntityInFlightReplicaIds({
        entityType: FIXTURE_ENTITY_TYPE,
        entityId: FIXTURE_ENTITY_ID,
      }),
      /authoritative_read_owner_unavailable/,
      'cache visibility cannot substitute for unavailable allocation authority',
    );

    t.equal(
      sqlQueryCalled,
      false,
      'allocation does not bypass the owner through raw SQL',
    );
  } finally {
    await coordinator.shutdown();
  }
});


// ═══════════════════════════════════════════════════════════════════
// 3. Divergence event diagnostics tests
// ═══════════════════════════════════════════════════════════════════

test('emitReplicaStatusDivergence emits FIELD_MISMATCH when cache ' +
  'and SQL differ', async (t) => {
  const emittedEvents = [];

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get(_table, _key) {
        return {status: 'creating'};
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
    (event) => emittedEvents.push(event),
  );

  try {
    coordinator.emitReplicaStatusDivergence(
      FIXTURE_REPLICA_ID,
      'active',
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    t.equal(emittedEvents.length, 1, 'one divergence event emitted');
    const event = emittedEvents[0];
    t.equal(
      event.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH,
    );
    t.same(event.cacheValue, {status: 'creating'});
    t.same(event.authoritativeValue, {status: 'active'});
    t.same(event.divergentFields, ['status']);
    t.equal(event.rowKey, FIXTURE_REPLICA_ID);
    t.equal(
      event.reconciliationReason,
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('emitReplicaStatusDivergence emits CACHE_MISSING when cache ' +
  'row is absent', async (t) => {
  const emittedEvents = [];

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
    (event) => emittedEvents.push(event),
  );

  try {
    coordinator.emitReplicaStatusDivergence(
      FIXTURE_REPLICA_ID,
      'active',
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    t.equal(emittedEvents.length, 1);
    t.equal(
      emittedEvents[0].divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING,
    );
    t.equal(emittedEvents[0].cacheValue, null);
    t.same(
      emittedEvents[0].authoritativeValue,
      {status: 'active'},
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('emitReplicaStatusDivergence emits AUTHORITATIVE_MISSING when ' +
  'SQL status is null', async (t) => {
  const emittedEvents = [];

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return {status: 'active'};
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
    (event) => emittedEvents.push(event),
  );

  try {
    coordinator.emitReplicaStatusDivergence(
      FIXTURE_REPLICA_ID,
      null,
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    t.equal(emittedEvents.length, 1);
    t.equal(
      emittedEvents[0].divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING,
    );
    t.same(
      emittedEvents[0].cacheValue,
      {status: 'active'},
    );
    t.equal(emittedEvents[0].authoritativeValue, null);
  } finally {
    await coordinator.shutdown();
  }
});

test('emitReplicaStatusDivergence does not emit when cache and ' +
  'SQL agree', async (t) => {
  const emittedEvents = [];

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return {status: 'active'};
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
    (event) => emittedEvents.push(event),
  );

  try {
    coordinator.emitReplicaStatusDivergence(
      FIXTURE_REPLICA_ID,
      'active',
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    t.equal(
      emittedEvents.length,
      0,
      'no divergence event when cache and SQL agree',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('emitReplicaStatusDivergence does not emit when replicaId ' +
  'is missing', async (t) => {
  const emittedEvents = [];

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return {status: 'creating'};
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
    (event) => emittedEvents.push(event),
  );

  try {
    coordinator.emitReplicaStatusDivergence(
      null,
      'active',
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    t.equal(
      emittedEvents.length,
      0,
      'no event when replicaId is null',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('getEntityInFlightReplicaIds and queryTerminalFailedCreateCleanupOperations ' +
  'allow owner-RPC fallback when the node does not host replica_operations-p1 locally',
async (t) => {
  const capturedReadOptions = [];
  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, _sql, _params, options = {}) {
        capturedReadOptions.push(options);
        if (
          options.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
        ) {
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        }
        return {
          success: true,
          rows: [
            {
              operation_id: 'op-non-local-1',
              type: 'ADD',
              partition_id: FIXTURE_ENTITY_ID,
              replica_id: `${FIXTURE_ENTITY_ID}-r1`,
              source_node_id: 'node-seed',
              target_node_id: FIXTURE_NODE_ID,
              status: 'creating',
              workflow_step: 'CREATING',
              created_at: 100,
              updated_at: 100,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
              entity_type: FIXTURE_ENTITY_TYPE,
              entity_id: FIXTURE_ENTITY_ID,
            },
          ],
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    enableTimeouts: false,
  }));
  coordinator.initialize();

  try {
    capturedReadOptions.length = 0;
    const inFlightIds = await coordinator.getEntityInFlightReplicaIds({
      entityType: FIXTURE_ENTITY_TYPE,
      entityId: FIXTURE_ENTITY_ID,
    });
    t.same(
      [...inFlightIds],
      [`${FIXTURE_ENTITY_ID}-r1`],
      'non-hosting node must read in-flight replica IDs via owner-RPC fallback',
    );
    t.not(
      capturedReadOptions[0]?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      'getEntityInFlightReplicaIds must not pin OWNER_LOCAL_ONLY on non-hosting nodes',
    );
    t.equal(
      capturedReadOptions[0]?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      'getEntityInFlightReplicaIds must prefer the replica_operations leader',
    );

    capturedReadOptions.length = 0;
    const cleanupOps =
      await coordinator.repository.queryTerminalFailedCreateCleanupOperations();
    t.same(cleanupOps, [], 'cleanup query succeeds on non-hosting node');
    t.not(
      capturedReadOptions[0]?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      'queryTerminalFailedCreateCleanupOperations must not pin OWNER_LOCAL_ONLY on non-hosting nodes',
    );

    const transientOwnerError = new Error('authoritative_row_source_unavailable');
    t.equal(
      isRetryableManagedSplitExecutionFailure(transientOwnerError),
      true,
      'managed split retry policy must treat authoritative_row_source_unavailable as retryable',
    );
    t.equal(
      resolveRetryableManagedSplitExecutionDecisionType(transientOwnerError),
      STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      'managed split retry policy must defer on authoritative_row_source_unavailable',
    );
  } finally {
    await coordinator.shutdown();
  }
});
