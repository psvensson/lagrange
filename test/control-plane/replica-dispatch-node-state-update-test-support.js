/**
 * Shared test support for the ReplicaDispatchService NODE_STATE_UPDATE suites.
 *
 * Consolidates the previously-duplicated `initEnv` / `createService` helpers
 * and the READY capability constants that the parent suite and its split
 * orphans each carried verbatim. Helper bodies are the union of the
 * pre-existing copies (superset options: `nodeId`, `replicaOperationDispatchTimeoutMs`).
 */

import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeLifecyclePublication} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {
  NODE_CAPABILITY,
} from '../../src/constants/index.js';

export const READY_NODE_CAPABILITIES = Object.freeze([
  NODE_CAPABILITY.PARTITION_REPLICA,
  NODE_CAPABILITY.MESSAGE_GROUP_REPLICA,
]);
export const READY_NODE_CAPABILITIES_JSON =
  JSON.stringify(READY_NODE_CAPABILITIES);
const REGISTERED_NODE_FIXTURE_BOOT_INCARNATION = 1;
const REGISTERED_NODE_FIXTURE_TIMESTAMP = 1;

export function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createAuthoritativeNodeStateGateway(
  gateway,
  initialRows,
  fixtureOptions = {},
) {
  if (!gateway) return null;
  const durableRows = new Map(initialRows.map((row) => {
    const registeredRow = {
      ...row,
      boot_incarnation:
        row.boot_incarnation ?? REGISTERED_NODE_FIXTURE_BOOT_INCARNATION,
      created_at:
        row.created_at ?? REGISTERED_NODE_FIXTURE_TIMESTAMP,
      last_heartbeat:
        row.last_heartbeat ??
        row.created_at ??
        REGISTERED_NODE_FIXTURE_TIMESTAMP,
    };
    return [row.node_id, structuredClone(registeredRow)];
  }));
  return {
    ...gateway,
    async readAuthoritativeRows(tableName, sql, params, options) {
      if (typeof gateway.readAuthoritativeRows === 'function') {
        return gateway.readAuthoritativeRows(tableName, sql, params, options);
      }
      const row = tableName === 'nodes' ?
        durableRows.get(params?.[0]) || null : null;
      return {success: true, rows: row ? [structuredClone(row)] : []};
    },
    async updateSystemTableRow(tableName, whereClause, data, writeOptions) {
      if (tableName === 'nodes') {
        await fixtureOptions.beforeNodeUpdate?.({
          durableRows,
          whereClause,
          data,
        });
        const current = durableRows.get(whereClause.node_id) || null;
        const predicateMatches = current && Object.entries(whereClause)
          .every(([field, value]) => current[field] === value);
        if (!predicateMatches) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
      }
      const result = await gateway.updateSystemTableRow(
        tableName,
        whereClause,
        data,
        writeOptions,
      );
      if (tableName === 'nodes' && result?.success !== false &&
          Number(result?.partitionResult?.affectedRows) !== 0) {
        const nodeId = whereClause.node_id;
        const durableRow = {
          ...(durableRows.get(nodeId) || whereClause),
          ...data,
        };
        durableRows.set(nodeId, durableRow);
        result.partitionResult = {
          ...result.partitionResult,
          originHlc:
            `${Number(data.last_heartbeat) || Date.now()}-0-fixture-owner`,
        };
      }
      return result;
    },
  };
}

export function createService(options = {}) {
  const cacheNode = options.cacheNode || null;
  const cacheNodes = Array.isArray(options.cacheNodes) ?
    options.cacheNodes :
    (cacheNode ? [cacheNode] : []);
  const cacheServices = Array.isArray(options.cacheServices) ?
    options.cacheServices :
    [];
  const cacheReplicaOperations = Array.isArray(options.cacheReplicaOperations) ?
    options.cacheReplicaOperations :
    [];
  const cacheByNodeId = new Map();
  for (const node of cacheNodes) {
    if (!node || !node.node_id) {
      continue;
    }
    cacheByNodeId.set(node.node_id, node);
  }
  const cdcIntegrationService = options.cdcIntegrationService;
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService;
  const rawControlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    (cdcIntegrationService ? {
      updateSystemTableRow: (...args) =>
        cdcIntegrationService.updateSystemTableRow(...args),
      insertSystemTableRow: (...args) =>
        cdcIntegrationService.insertSystemTableRow?.(...args),
      upsertSystemTableRow: (...args) =>
        cdcIntegrationService.upsertSystemTableRow?.(...args),
      deleteSystemTableRow: (...args) =>
        cdcIntegrationService.deleteSystemTableRow?.(...args),
    } : null);
  const controlPlaneSystemTableGateway = createAuthoritativeNodeStateGateway(
    rawControlPlaneSystemTableGateway,
    cacheNodes,
    {beforeNodeUpdate: options.beforeNodeUpdate},
  );
  const rebalanceCoordinator = options.rebalanceCoordinator || {
    executeOperation: async () => ({success: true}),
  };

  const service = new ReplicaDispatchService({
    nodeId: options.nodeId || 'node-1',
    messageRouter: options.messageRouter || {},
    cdcIntegrationService,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService,
    // The receiving replica's node lifecycle owner over the durable fixture.
    nodeLifecyclePublication: controlPlaneSystemTableGateway ?
      new NodeLifecyclePublication({
        gateway: controlPlaneSystemTableGateway,
        leaseAuthority: NodeReadyLeaseAuthority.fromConfiguration(),
        now: options.now,
      }) :
      null,
    operationDispatchQueueShardCount:
      options.operationDispatchQueueShardCount,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    nodeStateUpdateRetryAfterMs: options.nodeStateUpdateRetryAfterMs,
    operationDispatchRetryAfterMs: options.operationDispatchRetryAfterMs,
    replicaOperationDispatchTimeoutMs:
      options.replicaOperationDispatchTimeoutMs,
    dispatchReadinessRefreshTimeoutMs:
      options.dispatchReadinessRefreshTimeoutMs,
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes') {
          return null;
        }
        return cacheByNodeId.get(nodeId) || null;
      },
      getAll: (tableName) => {
        if (tableName === 'replica_operations') {
          return cacheReplicaOperations;
        }
        if (tableName === 'services') {
          return cacheServices;
        }
        if (tableName === 'nodes') {
          return cacheNodes;
        }
        return [];
      },
    },
    rebalanceCoordinator,
  });
  service.initialize();
  return service;
}
