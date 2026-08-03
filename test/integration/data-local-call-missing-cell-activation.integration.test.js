/**
 * Missing-cell activation evidence over two production-composed nodes:
 * a CALL shard resolves to a partition hosted on a node with NO ready
 * Binding Cell. The invoker publishes a bounded activation lease (the
 * CDC-propagated call_activation_leases system table, written through
 * the real engine) and retries; the REAL placement planner consumes the
 * live lease as a deterministic pin and targets the host node; the
 * executor seam creates the replica there; the invoker's retry then runs
 * the shard LOCALLY on the activated replica. Raw shard rows never cross
 * the router, the caller never names a node, and the lease is bounded —
 * when it lapses the pin disappears and the normal surplus cure reclaims
 * the replica (asserted at the planner level).
 */

import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import Database from 'better-sqlite3';

import {attachCallCellInvoker} from
  '../../src/bootstrap/shared/call-cell-invocation-setup.js';
import {RuntimeServiceHandlerSetup} from
  '../../src/bootstrap/shared/runtime-service-handler-setup.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  CALL_ACTIVATION_LEASES_SCHEMA,
  CALL_CELL_REDUCE_RESULTS_SCHEMA,
  CALL_CELL_REDUCE_SLOTS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {invokeCallCell} from
  '../../src/runtime/call-cell-driver-invoke.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {liveActivationPinNodeIds} from
  '../../src/service/call-activation-lease-owner.js';

const NODE_A = 'activation-node-a';
const NODE_B = 'activation-node-b';
const TENANT_ID = 'tenant-a';
const CALL_SERVICE_NAME = 'call-cell-activation';
const WORLD_NAME = 'call-cell';
const CALL_EXPORT = 'run';
const CALL_STATEMENT = 'SELECT id, score, label FROM shard_ratings';
const DECLARED_TABLE = 'shard_ratings';
const PARTITION_ONE = 'shard_ratings-p1';
const PARTITION_TWO = 'shard_ratings-p2';
const QUERY_MESSAGE_TYPE = 'QUERY';
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const TOP_N = 3;
const TUNABLES = Object.freeze({
  activationLeaseMs: 60000,
  activationRetryIntervalMs: 100,
  activationWaitMs: 15000,
  batchRowBound: 64,
  emitBudget: 8,
  nestedCallBudget: 1,
  partialLimit: 8,
  reduceLeaseMs: 60000,
  slotCount: 4,
});
const EXECUTOR_POLL_MS = 100;
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random', 'stdio', 'clocks', 'http', 'fetch-event',
]);
const CELL_BUDGETS = Object.freeze({
  context_bytes: 4096,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const SECURITY_CONTEXT = Object.freeze({
  principal: 'alice',
  roles: Object.freeze(['application']),
  tenantId: TENANT_ID,
});
const SEEDED_ROWS = Object.freeze({
  [PARTITION_ONE]: Object.freeze([
    Object.freeze({id: 1, score: 4.5, label: null}),
    Object.freeze({id: 3, score: 4.9, label: null}),
  ]),
  [PARTITION_TWO]: Object.freeze([
    Object.freeze({id: 5, score: 4.7, label: null}),
    Object.freeze({id: 6, score: 2.9, label: null}),
  ]),
});
const EXPECTED_RESULT_JSON = JSON.stringify([
  {key: '3', score: 4.9},
  {key: '5', score: 4.7},
  {key: '1', score: 4.5},
]);

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function digestSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createDeploymentRows() {
  const manifest = {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/acme/call-cell-activation:1.0.0',
      type: 'oci',
    },
    capabilities: [],
    exports: [{interface: 'call_v1', name: CALL_EXPORT}],
    name: CALL_SERVICE_NAME,
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  };
  const artifact = {
    artifactDigest: ARTIFACT_DIGEST,
    bytes: Buffer.from('call-cell-activation-bytes'),
    manifest,
    manifestDigest: `sha256:${digestSha256(canonicalJson(manifest))}`,
    packageId: `service-package-${'d'.repeat(64)}`,
    payloadDigest: `sha256:${digestSha256('call-cell-activation-bytes')}`,
  };
  const declaration = bindDeploymentArtifact(
    normalizeDeploymentBinding({
      budgets: {
        context_bytes: 4096,
        cpu_time_ms: 1000,
        input_bytes: 65536,
        memory_bytes: 64 * 1024 * 1024,
        output_bytes: 65536,
        wall_time_ms: 10000,
      },
      name: CALL_SERVICE_NAME,
      schema_version: 2,
      source: {
        kind: 'call',
        name: CALL_SERVICE_NAME,
        statement: CALL_STATEMENT,
      },
      target: {
        export_name: CALL_EXPORT,
        manifest_digest: artifact.manifestDigest,
        package_id: artifact.packageId,
      },
    }),
    artifact,
  );
  const bindingRow = buildBindingRow(declaration, SECURITY_CONTEXT, 1);
  const binding = projectBinding(bindingRow);
  const definition = buildActivatedRequestBindingServiceDefinition(
    buildRequestBindingServiceDefinition(bindingRow, artifact),
    binding,
  );
  return {
    bindingRow,
    definition,
    serviceId: deriveRequestServiceDefinitionId(binding.bindingVersionId),
  };
}

function createPartitionStores() {
  const databases = new Map();
  for (const [partitionId, rows] of Object.entries(SEEDED_ROWS)) {
    const database = new Database(':memory:');
    database.exec(
      'CREATE TABLE shard_ratings (id INTEGER PRIMARY KEY, score REAL, ' +
      'label TEXT)');
    const insert = database.prepare(
      'INSERT INTO shard_ratings (id, score, label) VALUES (?, ?, ?)');
    for (const row of rows) insert.run(row.id, row.score, row.label);
    databases.set(partitionId, database);
  }
  for (const schema of [
    CALL_CELL_REDUCE_SLOTS_SCHEMA,
    CALL_CELL_REDUCE_RESULTS_SCHEMA,
    CALL_ACTIVATION_LEASES_SCHEMA,
  ]) {
    const database = new Database(':memory:');
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
    databases.set(`${schema.tableName}-p1`, database);
  }
  return {
    databases,
    close() {
      for (const database of databases.values()) database.close();
    },
  };
}

function executePartitionSql(partitionStores, partitionId, message) {
  const database = partitionStores.databases.get(partitionId);
  if (!database) {
    return {acknowledged: true, success: false,
      error: `unknown partition: ${partitionId}`};
  }
  const sql = message.sql || message.payload?.sql;
  const params = message.params || message.payload?.params || [];
  if (/^\s*SELECT/iu.test(sql)) {
    const rows = database.prepare(sql).all(...params);
    return {acknowledged: true, success: true, rows,
      count: rows.length, partitionId};
  }
  const outcome = database.prepare(sql).run(...params);
  return {acknowledged: true, success: true, rows: [],
    affectedRows: outcome.changes, changes: outcome.changes, partitionId};
}

// Shared router: registered handlers win; partition SQL executes against
// the real SQLite stores. Lease-table writes are mirrored into the system
// table cache — the CDC propagation seam, exactly what production CDC
// does for a CONTROL_INTERNAL_PROPAGATION table.
function createSharedMessageRouter(partitionStores, systemTableCache) {
  const handlers = new Map();
  const partitionQueryDeliveries = [];
  const leasePartition = `${TABLES.CALL_ACTIVATION_LEASES}-p1`;

  function mirrorLeaseRows(database) {
    const rows = database
      .prepare(`SELECT * FROM ${TABLES.CALL_ACTIVATION_LEASES}`)
      .all();
    for (const row of rows) {
      systemTableCache.applySystemTableChange(
        TABLES.CALL_ACTIVATION_LEASES,
        CDC_OPERATION.UPSERT,
        {...row},
      );
    }
  }

  return {
    partitionQueryDeliveries,
    register(address, handler) {
      handlers.set(address, handler);
    },
    async deliver(address, message) {
      const handler = handlers.get(address);
      if (handler) return handler(message);
      if (message?.type === QUERY_MESSAGE_TYPE ||
          message?.payload?.type === QUERY_MESSAGE_TYPE) {
        const partitionId = address.split('/')[2];
        partitionQueryDeliveries.push(partitionId);
        const outcome =
          executePartitionSql(partitionStores, partitionId, message);
        if (partitionId === leasePartition && outcome.changes >= 0) {
          mirrorLeaseRows(partitionStores.databases.get(partitionId));
        }
        return outcome;
      }
      return {acknowledged: true, success: true};
    },
    send: async () => ({success: true}),
  };
}

function seedTableRouting(cache, tableName, entries, options = {}) {
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATION.UPSERT, {
    primary_key: options.primaryKey || 'id',
    table_id: tableName,
    table_name: tableName,
  });
  for (const {hostNodeId, partitionId, range} of entries) {
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, {
      leader_node_id: hostNodeId,
      partition_id: partitionId,
      partition_key_end: range?.end ?? null,
      partition_key_start: range?.start ?? null,
      table_name: tableName,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      address: `${hostNodeId}/partition/${partitionId}`,
      node_id: hostNodeId,
      partition_id: partitionId,
      raft_role: 'leader',
      service_id: partitionId,
      service_type: 'partition',
      status: 'active',
    });
  }
}

async function componentizeFixtureGuest() {
  const guestSource = await readFile(
    new URL('../wasm-service/fixtures/call-cell-world/guest.js',
      import.meta.url),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: WORLD_NAME,
  });
  return component;
}

function cancelNoop() {}

function createRuntimeInvocationOwner(cellRuntime) {
  const invocations = {reduce: [], run: []};
  return {
    invocations,
    owner: {
      async health() {
        return {status: HEALTH_STATUS.HEALTHY};
      },
      async invoke(replicaHandle, invocation) {
        invocations[invocation.exportName]?.push({
          invocationId: invocation.invocationId,
        });
        return invokeCallCell(
          {
            failLifecycle: (cause) => {
              throw cause;
            },
            invokeComponent: (serviceId, args, read, write, options) =>
              cellRuntime.invoke(
                serviceId, args, read, write, cancelNoop, options),
            stopComponent: (serviceId) => cellRuntime.stop(serviceId),
          },
          invocation,
          replicaHandle.serviceId,
        );
      },
    },
  };
}

async function createNode({
  nodeId,
  componentBytes,
  serviceId,
  messageRouter,
  systemTableCache,
  localPartitionServices,
  sqlQueryEngine,
}) {
  const cellRuntime = new WasiComponentCellRuntime();
  await cellRuntime.start(Object.freeze({
    budgets: CELL_BUDGETS,
    bytes: new Uint8Array(componentBytes),
    capabilities: [],
    exportName: CALL_EXPORT,
    serviceId,
    world: WORLD_NAME,
  }));
  const runtimeInvocationOwner = createRuntimeInvocationOwner(cellRuntime);
  const {runtimeServiceHandler} = RuntimeServiceHandlerSetup.create({
    cdcIntegrationService: {sqlQueryEngine},
    messageRouter,
    nodeId,
    partitionServicesProvider: () => localPartitionServices,
    serviceLifecycleManager: {},
    serviceRuntimeLifecycle: runtimeInvocationOwner.owner,
    systemTableCache,
  });
  return {cellRuntime, runtimeInvocationOwner, runtimeServiceHandler};
}

function localPartitionServicesFor(partitionStores, partitionId) {
  const database = partitionStores.databases.get(partitionId);
  return new Map([[partitionId, {
    executeQuery: async (sql, params = []) => {
      const rows = database.prepare(sql).all(...params);
      return {count: rows.length, partitionId, rows, success: true};
    },
    initialized: true,
    partitionId,
  }]]);
}

function activateReadyReplica({node, systemTableCache, serviceId, replicaId,
  nodeId}) {
  node.runtimeServiceHandler.localReplicas.set(replicaId, {
    entityId: serviceId,
    replicaHandle: {serviceId},
    status: ReplicaStatus.ACTIVE,
  });
  systemTableCache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    {
      created_at: Date.now(),
      node_id: nodeId,
      service_id: replicaId,
      service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      status: ReplicaStatus.ACTIVE,
      updated_at: Date.now(),
    },
  );
}

describe('data-local call missing-cell activation', () => {
  it('activates a Cell on the shard host through the planner pin and runs ' +
    'the shard locally there', async (testContext) => {
    const systemTableCache = new SystemTableCache();
    const partitionStores = createPartitionStores();
    const messageRouter =
      createSharedMessageRouter(partitionStores, systemTableCache);
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      messageRouter,
      nodeId: NODE_A,
      systemCache: systemTableCache,
    });

    seedTableRouting(systemTableCache, DECLARED_TABLE, [
      {hostNodeId: NODE_A, partitionId: PARTITION_ONE,
        range: {end: '5', start: null}},
      {hostNodeId: NODE_B, partitionId: PARTITION_TWO,
        range: {end: null, start: '5'}},
    ]);
    for (const tableName of [
      TABLES.CALL_CELL_REDUCE_SLOTS,
      TABLES.CALL_CELL_REDUCE_RESULTS,
      TABLES.CALL_ACTIVATION_LEASES,
    ]) {
      seedTableRouting(systemTableCache, tableName,
        [{hostNodeId: NODE_A, partitionId: `${tableName}-p1`}],
        {primaryKey: tableName === TABLES.CALL_ACTIVATION_LEASES ?
          'lease_id' :
          (tableName === TABLES.CALL_CELL_REDUCE_RESULTS ?
            'result_id' : 'invocation_id')});
    }

    const rows = createDeploymentRows();
    systemTableCache.applySystemTableChange(
      TABLES.SERVICE_BINDINGS, CDC_OPERATION.UPSERT, rows.bindingRow);
    systemTableCache.applySystemTableChange(
      TABLES.SERVICE_DEFINITIONS, CDC_OPERATION.UPSERT, rows.definition);

    const componentBytes = await componentizeFixtureGuest();
    const nodes = {
      [NODE_A]: await createNode({
        componentBytes,
        localPartitionServices:
          localPartitionServicesFor(partitionStores, PARTITION_ONE),
        messageRouter,
        nodeId: NODE_A,
        serviceId: rows.serviceId,
        sqlQueryEngine: engine,
        systemTableCache,
      }),
      [NODE_B]: await createNode({
        componentBytes,
        localPartitionServices:
          localPartitionServicesFor(partitionStores, PARTITION_TWO),
        messageRouter,
        nodeId: NODE_B,
        serviceId: rows.serviceId,
        sqlQueryEngine: engine,
        systemTableCache,
      }),
    };
    testContext.after(async () => {
      for (const node of Object.values(nodes)) {
        await node.cellRuntime.stop(rows.serviceId);
      }
      partitionStores.close();
      await engine.shutdown();
    });

    // The MISSING-cell setup: only node A starts with a ready Cell
    // actual. Node B hosts partition two but has no Cell there.
    activateReadyReplica({
      node: nodes[NODE_A],
      nodeId: NODE_A,
      replicaId: `${rows.serviceId}-r1`,
      serviceId: rows.serviceId,
      systemTableCache,
    });

    const serviceLifecycleCommandOwner = {};
    const invoker = attachCallCellInvoker({
      messageRouterProvider: () => messageRouter,
      serviceLifecycleCommandOwner,
      sqlQueryEngine: engine,
      systemTableCacheProvider: () => systemTableCache,
      tunables: TUNABLES,
    });

    // The activation executor seam: the REAL planner consumes the REAL
    // live-lease pins from the cache; when it targets a node without a
    // replica, the executor (the same seam every rebalancer workflow
    // executes through) makes the replica ready there. The test never
    // names the node — the pin does.
    const activationEvents = [];
    const planner = new MovePlanner({
      entityId: rows.serviceId,
      entityType: 'runtime_service',
      moveStateProvider: {
        getAvailableNodes: () => [NODE_A, NODE_B].map((nodeId) => ({
          cpu_usage_percent: 0,
          disk_usage_percent: 0,
          memory_usage_percent: 0,
          node_id: nodeId,
          status: 'active',
        })),
        getCurrentReplicas: () => [],
        getGlobalTopologyBlockingInFlightOperations: () => [],
        getHealthyReplicas: (replicas) => replicas,
        getInFlightOperations: () => [],
        getPartitionDescriptorEpochEvidence: () => null,
        getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
        hasPendingAddForNode: () => false,
        hasPendingMove: () => false,
      },
    });
    let executorStopped = false;
    const executor = (async () => {
      while (!executorStopped) {
        const pins = liveActivationPinNodeIds({
          nowMs: Date.now(),
          serviceId: rows.serviceId,
          systemTableCache,
        });
        if (pins.length > 0) {
          const target = await planner.calculateTargetState([], {
            activationPinNodeIds: pins,
            spreadAcrossNodes: true,
            targetReplicaCount: 1,
          });
          for (const nodeId of target.targetNodes) {
            if (pins.includes(nodeId) &&
                !nodes[nodeId].runtimeServiceHandler.localReplicas.size) {
              activationEvents.push({nodeId, pins: [...pins]});
              activateReadyReplica({
                node: nodes[nodeId],
                nodeId,
                replicaId: `${rows.serviceId}-r2`,
                serviceId: rows.serviceId,
                systemTableCache,
              });
            }
          }
        }
        if (activationEvents.length > 0) break;
        await new Promise((resolve) => {
          setTimeout(resolve, EXECUTOR_POLL_MS);
        });
      }
    })();

    const resultJson = await invoker.invoke({
      name: CALL_SERVICE_NAME,
      argumentsJson: JSON.stringify({topN: TOP_N}),
      securityContext: SECURITY_CONTEXT,
    });
    executorStopped = true;
    await executor;

    assert.equal(resultJson, EXPECTED_RESULT_JSON,
      'the reduced result is exact despite the missing-cell start');
    assert.equal(activationEvents.length, 1,
      'exactly one lease-driven activation occurred');
    assert.equal(activationEvents[0].nodeId, NODE_B,
      'the pin — not any caller input — selected the shard host node');

    const leaseDb = partitionStores.databases.get(
      `${TABLES.CALL_ACTIVATION_LEASES}-p1`);
    const leaseRows = leaseDb
      .prepare(`SELECT * FROM ${TABLES.CALL_ACTIVATION_LEASES}`).all();
    assert.equal(leaseRows.length, 1, 'one bounded lease row exists');
    assert.equal(leaseRows[0].service_id, rows.serviceId);
    assert.equal(leaseRows[0].node_id, NODE_B);
    assert.ok(leaseRows[0].lease_expires_at > Date.now() - 1000,
      'the lease is bounded by an expiry, not open-ended');

    // Locality held even through activation: one run per node, and no
    // shard-table rows ever crossed the router.
    const runCounts = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) =>
        [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
    assert.deepEqual(runCounts, {[NODE_A]: 1, [NODE_B]: 1},
      'the activated replica ran its shard on its own node');
    const shardQueryDeliveries = messageRouter.partitionQueryDeliveries
      .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE));
    assert.deepEqual(shardQueryDeliveries, [],
      'raw shard rows never left their host node, even during activation');

    // Reclaim story at the planner level: once the lease lapses the pin
    // disappears, so the node leaves the placement target and the normal
    // surplus cure applies.
    const lapsedPins = liveActivationPinNodeIds({
      nowMs: Date.now() + TUNABLES.activationLeaseMs + 1000,
      serviceId: rows.serviceId,
      systemTableCache,
    });
    assert.deepEqual(lapsedPins, [],
      'a lapsed lease stops pinning — bounded and reclaimable');
  });
});
