import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  JOIN_PROMOTION_REASON,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  evaluateJoinPromotionState,
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {
  BootstrapSystemTableWriter,
  RoutedSqlSystemTableWriter,
} from '../../src/bootstrap/system-table-writer.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {REPLICA_REGISTERED_ACTIVATION_ERROR_CODE} from
  '../../src/node/replica-state-machine-registered-activation.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {createIdentityTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';

const NODE_ID = 'durable-rejoin-node-2';
const PEER_NODE_1 = 'peer-node-1';
const PEER_NODE_3 = 'peer-node-3';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function makePartitionServiceRow({
  partitionId,
  replicaId,
  nodeId = NODE_ID,
  status = SERVICE_STATUS.STOPPED,
  createdAt = 100,
  updatedAt = 200,
}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    group_id: null,
    status,
    address: `${nodeId}/partition/${replicaId}`,
    cleanup_token: null,
    create_attempt_token: null,
    created_at: createdAt,
    state_entered_at: updatedAt,
    updated_at: updatedAt,
  };
}

function createRejoinSystemTableCache(entries) {
  const tablesRows = [];
  const partitionsRows = [];
  const servicesRows = [];
  for (const entry of entries) {
    tablesRows.push({
      table_id: entry.tableName,
      table_name: entry.tableName,
      schema_definition: JSON.stringify({
        tableName: entry.tableName,
        columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
      }),
    });
    partitionsRows.push({
      partition_id: entry.partitionId,
      table_id: entry.tableName,
      table_name: entry.tableName,
      partition_key_start: null,
      partition_key_end: null,
      leader_node_id: PEER_NODE_1,
      replica_count: 3,
    });
    servicesRows.push(
      makePartitionServiceRow({
        partitionId: entry.partitionId,
        replicaId: entry.replicaId,
        nodeId: NODE_ID,
        status: SERVICE_STATUS.ACTIVE,
        createdAt: entry.createdAt ?? 100,
        updatedAt: entry.updatedAt ?? 200,
      }),
      makePartitionServiceRow({
        partitionId: entry.partitionId,
        replicaId: `${entry.partitionId}-peer-1`,
        nodeId: PEER_NODE_1,
        status: SERVICE_STATUS.ACTIVE,
      }),
      makePartitionServiceRow({
        partitionId: entry.partitionId,
        replicaId: `${entry.partitionId}-peer-3`,
        nodeId: PEER_NODE_3,
        status: SERVICE_STATUS.ACTIVE,
      }),
    );
  }
  const byTable = new Map([
    [TABLES.TABLES, tablesRows],
    [TABLES.PARTITIONS, partitionsRows],
    [TABLES.SERVICES, servicesRows],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);
  return {
    getAll(tableName) {
      return byTable.get(tableName) || [];
    },
    get(tableName, key) {
      const rows = byTable.get(tableName) || [];
      return rows.find((row) =>
        row.partition_id === key ||
        row.table_id === key ||
        row.service_id === key,
      ) || null;
    },
  };
}

function createAuthoritativeServicesStore(initialRows, options = {}) {
  const rowsById = new Map(initialRows.map((row) => [row.service_id, {...row}]));
  let authorityAvailable = options.initiallyAvailable !== false;
  const authoritativeReadCalls = [];
  const updateCalls = [];
  const committedData = new Map([['durability-key', 200]]);

  const gateway = {
    async readAuthoritativeRows(tableName, sql, params = [], readOpts = {}) {
      authoritativeReadCalls.push({tableName, sql, params, readOpts});
      if (typeof options.isAuthorityAvailable === 'function' ?
        !options.isAuthorityAvailable() :
        !authorityAvailable) {
        return {
          success: false,
          rows: [],
          error: 'services_leader_temporarily_unavailable',
        };
      }
      const replicaId = params?.[0];
      const row = rowsById.get(replicaId) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
      };
    },
    async updateSystemTableRow(tableName, whereClause, updateData) {
      updateCalls.push({tableName, whereClause, updateData});
      if (tableName !== TABLES.SERVICES) {
        return {success: true, partitionResult: {affectedRows: 1}};
      }
      if (typeof options.isAuthorityAvailable === 'function' ?
        !options.isAuthorityAvailable() :
        !authorityAvailable) {
        return {success: false, error: 'services_leader_temporarily_unavailable'};
      }
      const row = rowsById.get(whereClause.service_id);
      if (!row) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      const matches = Object.entries(whereClause).every(
        ([column, expected]) => (row[column] ?? null) === expected,
      );
      if (!matches) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      rowsById.set(whereClause.service_id, {...row, ...updateData});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async insertSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async upsertSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };

  return {
    gateway,
    rowsById,
    authoritativeReadCalls,
    updateCalls,
    committedData,
    setAuthorityAvailable(value) {
      authorityAvailable = value;
    },
    getRow(replicaId) {
      return rowsById.get(replicaId) || null;
    },
    replaceRow(replicaId, nextRow) {
      if (nextRow === null) {
        rowsById.delete(replicaId);
      } else {
        rowsById.set(replicaId, {...nextRow});
      }
    },
  };
}

function createDurableRejoinHarness({
  bootIncarnation = 2,
  entries,
  store,
  activationTimeoutMs = 500,
  retryDelayMs = 15,
  onElectionStarted = () => {},
}) {
  const service = new NodeJoiningService({
    bootIncarnation,
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeId: NODE_ID,
    nodeAddress: 'ws://10.0.0.2:8082',
    seedNodeAddress: 'http://10.0.0.1:8081',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    dataDir: '/tmp/durable-rejoin-recovery-test',
    config: {
      durableRejoinPartitionActivationTimeoutMs: activationTimeoutMs,
    },
  });
  service.deferredPartitionActivationRetryDelayMs = retryDelayMs;
  const router = createIdentityTransport();
  service.messageRouter = router;
  service.controlPlaneSystemTableGateway = store.gateway;
  service.replicaStateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    controlPlaneSystemTableGateway: store.gateway,
    now: () => 500,
  });

  const events = [];
  const runtimesById = new Map();
  let membershipWithdrawals = 0;

  service.initializeJoiningLifecycleOwners = async () => {
    events.push('init');
  };
  service.applySystemCacheToPartitions = () => {
    events.push('applyCache');
  };
  service.querySystemStatePhase = {
    nodeRegistrationOwner: {
      async withdrawFailedJoinAdmission() {
        membershipWithdrawals += 1;
        return {success: true, accepted: true};
      },
    },
  };

  service.triggerJoinReconciler = async () => {
    events.push('reconcile');
    for (const entry of entries) {
      const address = `${NODE_ID}/partition/${entry.replicaId}`;
      const transportHandler = () => entry.replicaId;
      let running = true;
      let electionStarts = 0;
      let shutdownCalls = 0;
      const runtime = {
        partitionId: entry.partitionId,
        replicaId: entry.replicaId,
        unifiedAddress: address,
        initialized: true,
        transportHandler,
        get running() {
          return running;
        },
        get electionStarts() {
          return electionStarts;
        },
        get shutdownCalls() {
          return shutdownCalls;
        },
        startElection() {
          electionStarts += 1;
          events.push(`startElection:${entry.replicaId}`);
          onElectionStarted(entry.replicaId, runtime);
        },
        async shutdown() {
          shutdownCalls += 1;
          running = false;
          events.push(`shutdown:${entry.replicaId}`);
          await service.replicaStateMachine.retireReplicaHandler(
            entry.replicaId,
            () => router.unregisterExact(address, transportHandler),
          );
        },
      };
      router.register(address, transportHandler);
      service.partitionServices.set(entry.replicaId, runtime);
      runtimesById.set(entry.replicaId, runtime);
    }
  };

  return {
    service,
    router,
    events,
    runtimesById,
    get membershipWithdrawals() {
      return membershipWithdrawals;
    },
  };
}

test('CDCIntegrationService.readAuthoritativeRows and SystemTableWriter ' +
  'supply a frozen readAuthority token instead of failing with ' +
  'READ_AUTHORITY_REQUIRED', async (t) => {
  initializeTestEnvironment();
  const observedReadOptions = [];
  const cdc = new CDCIntegrationService({
    nodeId: NODE_ID,
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition(partitionId, sql, params, isRead, preferLeader,
          allowFallback, execOptions) {
          observedReadOptions.push({partitionId, sql, params, execOptions});
          return {
            success: true,
            rows: [makePartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replace-replica-real-cdc',
              status: SERVICE_STATUS.ACTIVE,
            })],
            rowSetComplete: true,
            readAuthorityWitness: {
              state: 'observed',
              partitionId,
              role: 'leader',
              term: 2,
              appliedIndex: 10,
              commitIndex: 10,
              servingNodeId: PEER_NODE_3,
              servingReplicaId: 'services-p1-leader',
              observedAtMs: 500,
              leaderRead: {kind: 'leader_required'},
            },
          };
        },
      },
    },
    messageRouter: {
      getQueryDataPlaneTransportReadiness: () => ({ready: true}),
      getConnectedNodes: () => [PEER_NODE_1, PEER_NODE_3],
    },
  });
  cdc.initialize();

  const directResult = await cdc.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['replace-replica-real-cdc'],
    {
      authoritativeReadMode: 'owner_rpc_required',
      leaderMode: 'required',
      deliveryPriority: 'critical',
      workClass: 'critical',
    },
  );
  t.equal(directResult.success, true,
    'CDCIntegrationService.readAuthoritativeRows must build frozen readAuthority');
  t.equal(directResult.rows.length, 1);
  t.equal(Object.isFrozen(observedReadOptions[0]?.execOptions?.readAuthority), true,
    'downstream owner RPC must receive a frozen structural readAuthority token');

  const bootstrapWriter = new BootstrapSystemTableWriter(cdc, new Map());
  const routedWriter = new RoutedSqlSystemTableWriter(cdc);
  const bwRes = await bootstrapWriter.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['replace-replica-real-cdc'],
    {authoritativeReadMode: 'owner_rpc_required', leaderMode: 'required'},
  );
  const rwRes = await routedWriter.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['replace-replica-real-cdc'],
    {authoritativeReadMode: 'owner_rpc_required', leaderMode: 'required'},
  );
  t.equal(bwRes.success, true,
    'BootstrapSystemTableWriter.readAuthoritativeRows must succeed');
  t.equal(rwRes.success, true,
    'RoutedSqlSystemTableWriter.readAuthoritativeRows must succeed');

  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: NODE_ID,
    cdcIntegrationService: cdc,
    sqlQueryEngine: cdc.sqlQueryEngine,
    systemTableCache: cdc.systemTableCache,
    messageRouter: cdc.messageRouter,
  });
  const gwRes = await gateway.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['replace-replica-real-cdc'],
    {authoritativeReadMode: 'owner_rpc_required', leaderMode: 'required'},
  );
  t.equal(gwRes.success, true,
    'ControlPlaneSystemTableGateway.readAuthoritativeRows succeeds end-to-end');
});

test('Scenario 1: temporary authority loss + Raft election dependency cycle ' +
  'recovers cleanly without destructive join teardown or duplicate activation',
async (t) => {
  initializeTestEnvironment();
  const entries = [
    {
      tableName: 'services',
      partitionId: 'services-p1',
      replicaId: 'replace-replica-services-n2',
    },
    {
      tableName: 'replica_operations',
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-ops-n2',
    },
  ];
  const cache = createRejoinSystemTableCache(entries);
  let servicesElectionStarted = false;
  let authorityRecovered = false;
  const store = createAuthoritativeServicesStore(
    entries.map((entry) => makePartitionServiceRow({
      partitionId: entry.partitionId,
      replicaId: entry.replicaId,
      status: SERVICE_STATUS.STOPPED,
    })),
    {
      // Authority requires restored services-p1 replica to start Raft
      // consensus participation AND subsequent leader availability.
      isAuthorityAvailable: () =>
        servicesElectionStarted && authorityRecovered,
    },
  );

  const harness = createDurableRejoinHarness({
    entries,
    store,
    retryDelayMs: 15,
    activationTimeoutMs: 1000,
    onElectionStarted(replicaId) {
      if (replicaId === 'replace-replica-services-n2') {
        servicesElectionStarted = true;
      }
    },
  });

  try {
    const restored =
        await harness.service.restoreDurableRejoinLocalPartitionServices(cache);

    t.same(
      restored.map((plan) => plan.replicaId),
      ['replace-replica-services-n2', 'replace-replica-ops-n2'],
      'durable rejoin restores local runtimes without throwing on temporary authority loss',
    );
    t.equal(servicesElectionStarted, true,
      'restored partition Raft participation must start before authoritative SERVICES activation');
    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
      'node must remain in RESTORING state while partition activation is pending',
    );
    t.equal(harness.membershipWithdrawals, 0,
      'temporary authority loss must never trigger destructive membership withdrawal');
    t.equal(store.getRow('replace-replica-services-n2').status, SERVICE_STATUS.STOPPED,
      'unavailable authority must never produce false ACTIVE');
    t.equal(store.getRow('replace-replica-ops-n2').status, SERVICE_STATUS.STOPPED,
      'unavailable authority must never produce false ACTIVE');

    const blockedPromotion = evaluateJoinPromotionState({
      systemCacheHydrated: true,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      restoreState: harness.service.durableRejoinRestoreState,
      routingReady: true,
      topologyReady: true,
      requiredSchemaVersion: '1.0.0',
      appliedSchemaVersion: '1.0.0',
      inFlightReplicaOperations: 0,
    });
    t.equal(blockedPromotion.readyToPromote, false,
      'readiness promotion must stay gated while deferred partition activation is pending');
    t.ok(
      blockedPromotion.reasons.includes(
        JOIN_PROMOTION_REASON.DURABLE_REJOIN_RESTORE_ACTIVE,
      ),
      'promotion gate reports DURABLE_REJOIN_RESTORE_ACTIVE',
    );

    // Simulate services-p1 leader becoming available after quorum forms.
    setTimeout(() => {
      authorityRecovered = true;
    }, 25);

    await harness.service.awaitDeferredPartitionServiceActivationsForReadySignal();

    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED,
      'node transitions to RESTORED once deferred partition activations settle',
    );
    t.equal(store.getRow('replace-replica-services-n2').status, SERVICE_STATUS.ACTIVE);
    t.equal(store.getRow('replace-replica-ops-n2').status, SERVICE_STATUS.ACTIVE);
    t.equal(store.updateCalls.length, 2,
      'each replica must be activated exactly once (no duplicate activation)');
    t.equal(harness.runtimesById.get('replace-replica-services-n2').electionStarts, 1,
      'election starts once per restored replica');
    t.equal(harness.membershipWithdrawals, 0,
      'no destructive membership cleanup occurred during recovery');
    t.equal(store.committedData.get('durability-key'), 200,
      'acknowledged data remains intact');
  } finally {
    await harness.service.cleanup();
  }
});

test('Scenario 2: concurrent replace-replica-* retirement cleanly retires ' +
  'stale incarnation without zombie leader or disrupting valid replicas',
async (t) => {
  initializeTestEnvironment();
  const entries = [
    {
      tableName: 'services',
      partitionId: 'services-p1',
      replicaId: 'replace-replica-valid-r1',
      createdAt: 100,
      updatedAt: 200,
    },
    {
      tableName: 'replica_operations',
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-superseded-r2',
      createdAt: 100,
      updatedAt: 200,
    },
    {
      tableName: 'nodes',
      partitionId: 'nodes-p1',
      replicaId: 'replace-replica-deleted-r3',
      createdAt: 100,
      updatedAt: 200,
    },
    {
      tableName: 'tables',
      partitionId: 'tables-p1',
      replicaId: 'replace-replica-reborn-r4',
      createdAt: 100,
      updatedAt: 200,
    },
  ];
  const cache = createRejoinSystemTableCache(entries);
  const store = createAuthoritativeServicesStore(
    entries.map((entry) => makePartitionServiceRow({
      partitionId: entry.partitionId,
      replicaId: entry.replicaId,
      status: SERVICE_STATUS.STOPPED,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    {initiallyAvailable: false},
  );
  const harness = createDurableRejoinHarness({
    entries,
    store,
    retryDelayMs: 15,
    activationTimeoutMs: 1000,
  });

  try {
    await harness.service.restoreDurableRejoinLocalPartitionServices(cache);
    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
    );

    // While authority was unavailable, concurrent replace-replica-* operations:
    // - moved r2 to REMOVING,
    // - deleted r3 from services completely,
    // - replaced r4 with a newer created_at incarnation (999 !== 100).
    store.replaceRow('replace-replica-superseded-r2', makePartitionServiceRow({
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-superseded-r2',
      status: ReplicaStatus.REMOVING,
      createdAt: 100,
      updatedAt: 350,
    }));
    store.replaceRow('replace-replica-deleted-r3', null);
    store.replaceRow('replace-replica-reborn-r4', makePartitionServiceRow({
      partitionId: 'tables-p1',
      replicaId: 'replace-replica-reborn-r4',
      status: SERVICE_STATUS.STOPPED,
      createdAt: 999,
      updatedAt: 999,
    }));
    store.setAuthorityAvailable(true);

    await harness.service.awaitDeferredPartitionServiceActivationsForReadySignal();

    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED,
      'settling valid replica + retiring all 3 superseded replicas completes restore',
    );
    t.equal(store.getRow('replace-replica-valid-r1').status, SERVICE_STATUS.ACTIVE,
      'valid replica becomes ACTIVE');
    t.equal(store.getRow('replace-replica-superseded-r2').status, ReplicaStatus.REMOVING,
      'stale generation must NEVER overwrite REMOVING to ACTIVE');
    t.equal(store.getRow('replace-replica-deleted-r3'), null,
      'deleted replica row stays absent');
    t.equal(store.getRow('replace-replica-reborn-r4').status, SERVICE_STATUS.STOPPED,
      'older incarnation (created_at=100) must NEVER activate a newer incarnation (created_at=999)');
    for (const retiredId of [
      'replace-replica-superseded-r2',
      'replace-replica-deleted-r3',
      'replace-replica-reborn-r4',
    ]) {
      t.equal(
        harness.runtimesById.get(retiredId).shutdownCalls,
        1,
        `superseded local replica ${retiredId} must shut down so it cannot become a zombie leader`,
      );
      t.equal(
        harness.service.partitionServices.has(retiredId),
        false,
        `superseded replica ${retiredId} must be removed from partitionServices`,
      );
      t.equal(
        harness.router.getRegisteredHandler(`${NODE_ID}/partition/${retiredId}`),
        null,
        `superseded replica ${retiredId} transport handler must be unregistered`,
      );
    }
    t.equal(
      harness.service.partitionServices.has('replace-replica-valid-r1'),
      true,
      'valid replica remains registered and undisturbed',
    );
    t.equal(harness.membershipWithdrawals, 0,
      'legitimate retirement of one replica must not withdraw node membership');
  } finally {
    await harness.service.cleanup();
  }
});

test('Scenario 3: permanently unavailable authority remains safely unready ' +
  'with bounded failure and never claims false ACTIVE', async (t) => {
  initializeTestEnvironment();
  const entries = [
    {
      tableName: 'replica_operations',
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-stuck-r1',
    },
  ];
  const cache = createRejoinSystemTableCache(entries);
  const store = createAuthoritativeServicesStore(
    [makePartitionServiceRow({
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-stuck-r1',
      status: SERVICE_STATUS.STOPPED,
    })],
    {initiallyAvailable: false},
  );
  const harness = createDurableRejoinHarness({
    entries,
    store,
    retryDelayMs: 10,
    activationTimeoutMs: 60,
  });

  try {
    await harness.service.restoreDurableRejoinLocalPartitionServices(cache);
    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
    );

    const err = await t.rejects(
      harness.service.awaitDeferredPartitionServiceActivationsForReadySignal(),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
      'permanently unavailable authority must fail boundedly instead of advertising READY',
    );
    t.ok(Array.isArray(err.pendingReplicaIds) &&
      err.pendingReplicaIds.includes('replace-replica-stuck-r1'),
    'bounded error identifies pending unactivated replicas');
    t.equal(
      harness.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
      'restore state must remain RESTORING on permanent authority loss',
    );
    t.equal(store.getRow('replace-replica-stuck-r1').status, SERVICE_STATUS.STOPPED,
      'permanently unavailable authority must never claim false ACTIVE');
    t.equal(store.updateCalls.length, 0,
      'no ACTIVE mutation may be attempted without authoritative observation');
    t.equal(harness.membershipWithdrawals, 0,
      'no destructive membership withdrawal during restore');

    // Verify signalReadyForReplicas() itself enforces the gate and never
    // publishes a READY heartbeat while authority remains unavailable.
    let heartbeatCalls = 0;
    harness.service.awaitCdcSubscriptionsForReadiness = async () => {};
    harness.service.runBackgroundCdcCatchupAfterSubscription = () => {};
    harness.service.awaitLocalQueryTransportReadinessForReadySignal = async () => {};
    harness.service.awaitMetadataPublicationReadinessForReadySignal = async () => {};
    harness.service.heartbeatService = {
      async sendHeartbeat() {
        heartbeatCalls += 1;
      },
      stop() {},
    };
    await t.rejects(
      harness.service.signalReadyForReplicas(),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE},
      'signalReadyForReplicas must refuse to publish READY while partition activations remain pending',
    );
    t.equal(heartbeatCalls, 0,
      'no READY heartbeat may be published while durable-rejoin activation is unresolved');
  } finally {
    await harness.service.cleanup();
  }
});

test('Scenario 4: second process restart while deferred activation is pending ' +
  'cleans up prior timers and activates cleanly in the new boot incarnation',
async (t) => {
  initializeTestEnvironment();
  const entries = [
    {
      tableName: 'replica_operations',
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-restart2-r1',
    },
  ];
  const cache = createRejoinSystemTableCache(entries);
  const store = createAuthoritativeServicesStore(
    [makePartitionServiceRow({
      partitionId: 'replica_operations-p1',
      replicaId: 'replace-replica-restart2-r1',
      status: SERVICE_STATUS.STOPPED,
    })],
    {initiallyAvailable: false},
  );

  // Boot incarnation 2 starts durable rejoin while authority is down.
  const boot2 = createDurableRejoinHarness({
    bootIncarnation: 2,
    entries,
    store,
    retryDelayMs: 25,
    activationTimeoutMs: 500,
  });
  await boot2.service.restoreDurableRejoinLocalPartitionServices(cache);
  t.equal(
    boot2.service.durableRejoinRestoreState,
    JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
    'boot 2 holds pending deferred partition activation',
  );
  // Process restarts before authority returns: boot 2 cleans up.
  await boot2.service.cleanup();
  t.equal(boot2.membershipWithdrawals, 0,
    'clean restart while activation is pending does not withdraw valid membership');

  // Authority comes back right as boot incarnation 3 starts durable rejoin.
  store.setAuthorityAvailable(true);
  const boot3 = createDurableRejoinHarness({
    bootIncarnation: 3,
    entries,
    store,
    retryDelayMs: 15,
    activationTimeoutMs: 500,
  });

  try {
    await boot3.service.restoreDurableRejoinLocalPartitionServices(cache);
    await boot3.service.awaitDeferredPartitionServiceActivationsForReadySignal();
    // Give any leaked boot-2 timer a chance to fire (must NOT happen).
    await new Promise((resolve) => setTimeout(resolve, 60));

    t.equal(
      boot3.service.durableRejoinRestoreState,
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED,
      'boot 3 completes durable rejoin restore cleanly',
    );
    t.equal(
      store.getRow('replace-replica-restart2-r1').status,
      SERVICE_STATUS.ACTIVE,
      'replica activates cleanly in boot 3',
    );
    t.equal(store.updateCalls.length, 1,
      'exactly one ACTIVE transition across boot 2 restart + boot 3 recovery (no duplicate activation)');
    t.equal(store.committedData.get('durability-key'), 200,
      'acknowledged data survives double restart during pending recovery');
  } finally {
    await boot3.service.cleanup();
  }
});
