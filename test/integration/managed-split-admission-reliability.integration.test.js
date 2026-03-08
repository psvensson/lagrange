import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {StorageAdmissionService} from '../../src/rebalancer/storage-admission-service.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PUBLICATION_MODE,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const POLL_INTERVAL_MS = 50;
const ROUTING_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 45000;
const FIXTURE_NODE_ID = '550e8400-e29b-41d4-a716-446655449902';
const SYNTHETIC_NODE_ID = '550e8400-e29b-41d4-a716-4466554499aa';
const STORAGE_BUDGET_BYTES = 128 * 1024 * 1024 * 1024;
const LEASE_EXTENSION_MS = 60000;

function buildCreateTableSql(tableName) {
  return `
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    )
  `;
}

function getTableRow(systemTableCache, tableName) {
  const rows = systemTableCache.filter(
    TABLES.TABLES,
    (row) => row.table_name === tableName,
  );
  return rows[0] || null;
}

function getPartitionRow(systemTableCache, tableName) {
  const rows = systemTableCache.filter(
    TABLES.PARTITIONS,
    (row) => row.table_name === tableName,
  );
  return rows[0] || null;
}

function getPartitionServiceRows(systemTableCache, partitionId) {
  return systemTableCache.filter(
    TABLES.SERVICES,
    (row) =>
      row.partition_id === partitionId &&
      row.service_type === SERVICE_TYPE.PARTITION,
  );
}

function parseTransitionMetadata(tableRow) {
  const rawMetadata = tableRow?.partition_transition_metadata;
  if (typeof rawMetadata !== 'string' || rawMetadata.length === 0) {
    return null;
  }
  return JSON.parse(rawMetadata);
}

function installCanonicalAdmissionOwner(fixture) {
  const storageAccountingService = new StorageCapacityAccountingService({
    systemTableCache: fixture.systemTableCache,
  });
  storageAccountingService.initialize({
    systemTableCache: fixture.systemTableCache,
  });

  const controlPlaneReadinessService = new ControlPlaneReadinessService({
    nodeId: FIXTURE_NODE_ID,
    systemTableCache: fixture.systemTableCache,
    cacheMutationTarget: fixture.systemTableCache,
    messageRouter: fixture.bootstrapResult.messageRouter,
    storageAccountingService,
    cdcIntegrationService: fixture.bootstrapService.cdcIntegrationService,
    cdcGroupPropagationService:
      fixture.bootstrapService.latencyTopology?.cdcGroupPropagationService || null,
  });
  const storageAdmissionService = new StorageAdmissionService({
    nodeId: FIXTURE_NODE_ID,
    accountingService: storageAccountingService,
    cdcIntegrationService: fixture.bootstrapService.cdcIntegrationService,
    cacheMutationTarget: fixture.systemTableCache,
    messageRouter: fixture.bootstrapResult.messageRouter,
    controlPlaneReadinessService,
  });

  fixture.sqlQueryEngine.rebalanceCoordinator.storageAccountingService =
    storageAccountingService;
  fixture.sqlQueryEngine.rebalanceCoordinator.storageAdmissionService =
    storageAdmissionService;
  fixture.sqlQueryEngine.managedSplitWorkflow.storageAdmissionService =
    storageAdmissionService;

  return {
    storageAccountingService,
    controlPlaneReadinessService,
    storageAdmissionService,
  };
}

async function bootstrapManagedSplitFixture(tableName) {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: 100,
      stabilizationPeriodMs: 10000,
    },
  });
  const config = ConfigurationManager.getInstance();
  config.setByPath('rebalancer.storageAdmissionMode', 'enforce');
  config.setByPath('latency.propagationMode', 'grouped');

  const wsPort = getUniquePort();
  const bootstrapService = new BootstrapService({
    nodeId: FIXTURE_NODE_ID,
    nodeAddress: `ws://127.0.0.1:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 3000,
      leadershipWaitInitialDelayMs: 10,
      leadershipWaitMaxDelayMs: 100,
      replicaStaggerDelayMs: 20,
    },
  });

  try {
    const bootstrapResult = await bootstrapService.bootstrap();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      cdcIntegrationService: bootstrapService.cdcIntegrationService,
      nodeId: FIXTURE_NODE_ID,
      rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
    });

    const createResult = await sqlQueryEngine.executeQuery(
      buildCreateTableSql(tableName),
    );
    if (createResult?.success !== true) {
      throw new Error(`Failed to create integration table ${tableName}`);
    }

    const partitionReady = await waitFor(() => {
      const partition = getPartitionRow(systemTableCache, tableName);
      if (!partition?.partition_id) {
        return false;
      }
      return getPartitionServiceRows(
        systemTableCache,
        partition.partition_id,
      ).some((service) =>
        service.status === SERVICE_STATUS.ACTIVE &&
        typeof service.address === 'string' &&
        service.address.length > 0,
      );
    }, ROUTING_TIMEOUT_MS, POLL_INTERVAL_MS);
    if (!partitionReady) {
      throw new Error(
        `Timed out waiting for routable partition services for ${tableName}`,
      );
    }

    return {
      bootstrapService,
      bootstrapResult,
      systemTableCache,
      sqlQueryEngine,
    };
  } catch (error) {
    await bootstrapService.shutdown().catch(() => {});
    await cleanupTestEnvironment();
    throw error;
  }
}

async function shutdownManagedSplitFixture(fixture) {
  await fixture?.bootstrapService?.shutdown().catch(() => {});
  await cleanupTestEnvironment();
}

async function seedProvisioningAdmissionFixture(fixture, tableName) {
  const {bootstrapService, systemTableCache} = fixture;
  const cdcIntegrationService = bootstrapService.cdcIntegrationService;
  const partitionRow = getPartitionRow(systemTableCache, tableName);
  const localNodeRow = systemTableCache.get(TABLES.NODES, FIXTURE_NODE_ID);
  const sourceServiceRow = getPartitionServiceRows(
    systemTableCache,
    partitionRow?.partition_id,
  ).find((row) => row.node_id === FIXTURE_NODE_ID);

  if (!partitionRow || !localNodeRow || !sourceServiceRow) {
    throw new Error('Managed split admission fixture is missing bootstrap state');
  }

  const now = Date.now();
  await cdcIntegrationService.updateSystemTableRow(
    TABLES.NODES,
    {node_id: FIXTURE_NODE_ID},
    {
      last_heartbeat: now,
      ready_lease_expires_at: now + LEASE_EXTENSION_MS,
      storage_budget_bytes: STORAGE_BUDGET_BYTES,
      storage_budget_source: 'integration_test',
      storage_budget_updated_at: now,
    },
  );

  await cdcIntegrationService.upsertSystemTableRow(TABLES.NODES, {
    node_id: SYNTHETIC_NODE_ID,
    node_address: `ws://127.0.0.1:${getUniquePort()}`,
    cpu_cores: localNodeRow.cpu_cores || 4,
    memory_mb: localNodeRow.memory_mb || 4096,
    disk_gb: localNodeRow.disk_gb || 128,
    cpu_usage_percent: 0,
    memory_usage_percent: 0,
    disk_usage_percent: 0,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: 'disconnected',
    capabilities: '[]',
    last_heartbeat: now - LEASE_EXTENSION_MS,
    ready_lease_expires_at: now - 1000,
    storage_budget_bytes: STORAGE_BUDGET_BYTES,
    storage_budget_source: 'integration_test',
    storage_budget_updated_at: now,
    created_at: now,
  });

  await cdcIntegrationService.upsertSystemTableRow(TABLES.SERVICES, {
    service_id: `${partitionRow.partition_id}-synthetic-follower`,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: SYNTHETIC_NODE_ID,
    partition_id: partitionRow.partition_id,
    group_id: sourceServiceRow.group_id || null,
    replica_id: `${partitionRow.partition_id}-r-synthetic`,
    raft_role: 'follower',
    status: SERVICE_STATUS.ACTIVE,
    state_entered_at: now,
    previous_state: null,
    trigger_reason: 'integration_split_admission_fixture',
    error_message: null,
    address: `ws://127.0.0.1:${getUniquePort()}`,
    created_at: now,
    updated_at: now,
  });

  const quorumVisible = await waitFor(() => {
    const sourceServices = getPartitionServiceRows(
      systemTableCache,
      partitionRow.partition_id,
    );
    return sourceServices.some((row) => row.node_id === SYNTHETIC_NODE_ID);
  }, ROUTING_TIMEOUT_MS, POLL_INTERVAL_MS);
  if (!quorumVisible) {
    throw new Error('Synthetic split-admission quorum fixture did not reach cache');
  }

  return partitionRow;
}

test('managed split persists blocked split admission instead of generic failure',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const tableName = 'managed_split_blocked_events';
    const fixture = await bootstrapManagedSplitFixture(tableName);

    try {
      const partitionRow = await seedProvisioningAdmissionFixture(
        fixture,
        tableName,
      );
      installCanonicalAdmissionOwner(fixture);

      const result = await fixture.sqlQueryEngine.executeManagedSplit(
        partitionRow.partition_id,
      );

      t.equal(result.success, false, 'split admission should deny the workflow');
      t.equal(
        result.state,
        PARTITION_TRANSITION_STATE.BLOCKED,
        'blocked admission should surface a blocked workflow state',
      );
      t.equal(
        result.admission?.decisionType,
        STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
        'blocked admission should preserve the canonical decision type',
      );
      t.equal(
        result.admission?.blockingReasons?.includes(
          STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
        ),
        true,
        'blocked admission should explain insufficient eligible placement nodes',
      );
      t.equal(
        result.admission?.blockingReasons?.includes(
          STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
        ),
        false,
        'healthy publication mode should not defer the workflow',
      );

      const blockedVisible = await waitFor(() => {
        const tableRow = getTableRow(fixture.systemTableCache, tableName);
        return tableRow?.partition_transition_state ===
          PARTITION_TRANSITION_STATE.BLOCKED;
      }, ROUTING_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(blockedVisible, true, 'blocked workflow state should persist');

      const tableRow = getTableRow(fixture.systemTableCache, tableName);
      const metadata = parseTransitionMetadata(tableRow);
      t.equal(
        tableRow?.partition_transition_state,
        PARTITION_TRANSITION_STATE.BLOCKED,
        'persisted workflow state should be blocked',
      );
      t.equal(
        metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]
          ?.decisionType,
        STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
        'persisted workflow metadata should store blocked admission',
      );
      t.equal(
        metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]
          ?.blockingReasons?.includes(
            STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
          ),
        true,
        'persisted workflow metadata should retain the blocking reason',
      );
      t.notOk(
        metadata?.[PARTITION_TRANSITION_METADATA_FIELD.FAILURE],
        'blocked admission should not be recorded as execution failure metadata',
      );
      t.not(
        tableRow?.partition_transition_state,
        PARTITION_TRANSITION_STATE.FAILED,
        'blocked admission should not degrade into generic failure state',
      );
    } finally {
      await shutdownManagedSplitFixture(fixture);
    }
  });

test('managed split defers on degraded publication mode and admin diagnostics ' +
  'expose the canonical mode',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const tableName = 'managed_split_deferred_events';
  const fixture = await bootstrapManagedSplitFixture(tableName);

  try {
    const partitionRow = await seedProvisioningAdmissionFixture(
      fixture,
      tableName,
    );
    const {controlPlaneReadinessService: readinessService} =
        installCanonicalAdmissionOwner(fixture);
    const publicationService =
        readinessService?.cdcGroupPropagationService || null;
    const degradedPublicationMode = Object.freeze({
      currentMode: CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
      reasonCode: CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
      enteredAt: new Date().toISOString(),
      recentTransitions: Object.freeze([{
        from: CDC_GROUP_PUBLICATION_MODE.GROUPED,
        to: CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        reasonCode: CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
        changedAt: new Date().toISOString(),
      }]),
    });
    const originalGetPublicationModeDiagnostics =
        typeof publicationService?.getPublicationModeDiagnostics === 'function' ?
          publicationService.getPublicationModeDiagnostics.bind(publicationService) :
          null;

    if (publicationService && originalGetPublicationModeDiagnostics) {
      publicationService.getPublicationModeDiagnostics = () =>
        degradedPublicationMode;
    }

    try {
      const result = await fixture.sqlQueryEngine.executeManagedSplit(
        partitionRow.partition_id,
      );

      t.equal(
        result.success,
        false,
        'publication degradation should deny the split',
      );
      t.equal(
        result.state,
        PARTITION_TRANSITION_STATE.DEFERRED,
        'publication degradation should defer the workflow',
      );
      t.equal(
        result.admission?.decisionType,
        STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
        'publication degradation should preserve the deferred decision type',
      );
      t.equal(
        result.admission?.blockingReasons?.includes(
          STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
        ),
        true,
        'deferred admission should explain the degraded publication mode',
      );

      const deferredVisible = await waitFor(() => {
        const tableRow = getTableRow(fixture.systemTableCache, tableName);
        return tableRow?.partition_transition_state ===
            PARTITION_TRANSITION_STATE.DEFERRED;
      }, ROUTING_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(deferredVisible, true, 'deferred workflow state should persist');

      const adminApi = new AdminWebSocketAPI({
        systemTableCache: fixture.systemTableCache,
        sqlQueryEngine: fixture.sqlQueryEngine,
        messageRouter: fixture.bootstrapResult.messageRouter,
        cdcIntegrationService: fixture.bootstrapService.cdcIntegrationService,
        nodeId: FIXTURE_NODE_ID,
      });
      const diagnostics =
          await adminApi.controlSnapshot.buildControlPlaneDiagnosticsSnapshot();
      const tableRow = getTableRow(fixture.systemTableCache, tableName);
      const metadata = parseTransitionMetadata(tableRow);

      t.equal(
        adminApi.controlPlaneReadinessService,
        readinessService,
        'admin diagnostics should consume the same readiness owner used by admission',
      );
      t.equal(
        diagnostics.publicationMode?.currentMode,
        CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        'diagnostics should expose the canonical degraded publication mode',
      );
      t.equal(
        diagnostics.publicationMode?.reasonCode,
        CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
        'diagnostics should preserve the publication degradation reason',
      );
      t.equal(
        diagnostics.readinessByNodeId?.[FIXTURE_NODE_ID]?.publication?.currentMode,
        CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        'per-node readiness should reflect the same canonical publication mode',
      );
      t.equal(
        tableRow?.partition_transition_state,
        PARTITION_TRANSITION_STATE.DEFERRED,
        'persisted workflow state should be deferred',
      );
      t.equal(
        metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]
          ?.blockingReasons?.includes(
            STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
          ),
        true,
        'persisted workflow metadata should retain the degraded publication reason',
      );
      t.equal(
        diagnostics.workflowAdmissionsByWorkflowId?.[result.workflowId]
          ?.transitionState,
        PARTITION_TRANSITION_STATE.DEFERRED,
        'workflow diagnostics should surface the deferred split admission outcome',
      );
    } finally {
      if (publicationService && originalGetPublicationModeDiagnostics) {
        publicationService.getPublicationModeDiagnostics =
            originalGetPublicationModeDiagnostics;
      }
    }
  } finally {
    await shutdownManagedSplitFixture(fixture);
  }
});

test('managed split admission repairs stale connected node readiness from ' +
  'authoritative local rows before denying provisioning',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const tableName = 'managed_split_repairable_admission';
  const fixture = await bootstrapManagedSplitFixture(tableName);

  try {
    await seedProvisioningAdmissionFixture(fixture, tableName);
    const {storageAdmissionService, controlPlaneReadinessService} =
      installCanonicalAdmissionOwner(fixture);
    const originalGetConnectionState =
      fixture.bootstrapResult.messageRouter.getConnectionState.bind(
        fixture.bootstrapResult.messageRouter,
      );
    const originalAuthoritativeRead =
      fixture.bootstrapService.cdcIntegrationService
        .executeAuthoritativeSystemTableRead
        .bind(fixture.bootstrapService.cdcIntegrationService);
    const now = Date.now();
    const freshSyntheticNodeRow = {
      node_id: SYNTHETIC_NODE_ID,
      node_address: `ws://127.0.0.1:${getUniquePort()}`,
      cpu_cores: 4,
      memory_mb: 4096,
      disk_gb: 128,
      cpu_usage_percent: 0,
      memory_usage_percent: 0,
      disk_usage_percent: 0,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + LEASE_EXTENSION_MS,
      storage_budget_bytes: STORAGE_BUDGET_BYTES,
      storage_budget_source: 'integration_test_authoritative_refresh',
      storage_budget_updated_at: now,
      created_at: now,
      updated_at: now,
    };
    const authoritativeReads = [];

    fixture.bootstrapResult.messageRouter.getConnectionState = (nodeId) => {
      if (nodeId === SYNTHETIC_NODE_ID) {
        return STATE.CONNECTED;
      }
      return originalGetConnectionState(nodeId);
    };
    fixture.bootstrapService.cdcIntegrationService.executeAuthoritativeSystemTableRead =
      async (tableNameArg, sql, params, options) => {
        authoritativeReads.push({
          tableName: tableNameArg,
          sql,
          params,
          options,
        });
        if (tableNameArg === TABLES.NODES &&
            params?.[0] === SYNTHETIC_NODE_ID) {
          return {
            success: true,
            rows: [freshSyntheticNodeRow],
            count: 1,
            source: 'local_partition_replica',
          };
        }
        return originalAuthoritativeRead(tableNameArg, sql, params, options);
      };

    try {
      const result = await storageAdmissionService.checkSplit({
        targetNodeIds: [SYNTHETIC_NODE_ID],
        estimatedBytes: NUM.TEN,
        requiredReplicaCount: 1,
      });

      t.equal(result.allowed, true,
        'authoritative readiness repair should recover the stale target node');
      t.equal(
        result.readinessSnapshots?.[SYNTHETIC_NODE_ID]?.dimensions
          ?.repairEligible,
        true,
        'admission should persist the repaired readiness snapshot',
      );
      t.ok(
        authoritativeReads.some((call) =>
          call.tableName === TABLES.NODES &&
            call.params?.[0] === SYNTHETIC_NODE_ID,
        ),
        'admission should issue an authoritative nodes-table repair read',
      );
      t.equal(
        controlPlaneReadinessService.getNodeRow(SYNTHETIC_NODE_ID)
          ?.ready_lease_expires_at,
        freshSyntheticNodeRow.ready_lease_expires_at,
        'authoritative repair should update the cached node lease',
      );
    } finally {
      fixture.bootstrapResult.messageRouter.getConnectionState =
        originalGetConnectionState;
      fixture.bootstrapService.cdcIntegrationService.executeAuthoritativeSystemTableRead =
        originalAuthoritativeRead;
    }
  } finally {
    await shutdownManagedSplitFixture(fixture);
  }
});
