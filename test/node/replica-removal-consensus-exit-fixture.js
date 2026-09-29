/**
 * The source side of a replica removal, run by the PRODUCTION replica
 * handler (handleRemoveReplica -> removeReplicaAsync) against a real rs-raft
 * operation port of a PartitionNodeCluster. The handler is a real
 * ReplicaHandler; only its persistence boundary is this world's:
 *  - the replica lifecycle state machine writes the services row into the
 *    world's system-table cache (the state machine owns that persistence in
 *    production);
 *  - the partition service row owner deletes the row from the same cache;
 *  - the tracked partition service is the cluster's port with the service
 *    surface the removal path reads (admission fence, serving drain,
 *    shutdown closes the port).
 * When the handler retires the replica's lifecycle, and whether its port
 * still steps, is production's decision, never this fixture's.
 *
 * Oracles (never the handler's answer): the replica's durable lifecycle row
 * (`_raft_rs_replica_lifecycle`, read on an independent read-only
 * connection) and the committed configuration folded from a member's durable
 * log (committed-membership-oracles).
 */

import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';

const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
const SERVICES = 'services';

/**
 * The durable lifecycle state of one replica of a group, read on an
 * independent read-only connection (null while no row exists).
 * @param {string} dbFile - The replica's database file.
 * @param {string} groupId - The group.
 * @return {string|null} 'active', 'retired' or null.
 */
function durableLifecycleState(dbFile, groupId) {
  const db = new Database(dbFile, {readonly: true, fileMustExist: true});
  try {
    const table = db.prepare(
      'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?')
      .get(LIFECYCLE_TABLE);
    if (table === undefined) {
      return null;
    }
    const row = db.prepare(
      `SELECT state FROM ${LIFECYCLE_TABLE} WHERE group_id = ?`).get(groupId);
    return row?.state ?? null;
  } finally {
    db.close();
  }
}

/**
 * A real ReplicaHandler hosting one replica of the cluster.
 * @param {Object} options
 * @param {Object} options.cluster - The PartitionNodeCluster.
 * @param {string} options.replicaId - The hosted replica.
 * @param {string} options.partitionId - Its partition.
 * @param {string} options.nodeId - The hosting node.
 * @param {Object} options.cache - The world's system-table cache (get,
 *   upsert, delete, filter).
 * @param {Function} options.rowOf - (status) => the replica's services row.
 * @return {Object} {handler, service, outcomes, exits, removeRequest,
 *   dispose}.
 */
function createRemovalSourceHandler({cluster, replicaId, partitionId, nodeId,
  cache, rowOf}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),
    'replica-removal-exit-'));
  const outcomes = [];
  const initialRow = createLifecycleServiceRow({
    replicaId,
    partitionId,
    nodeId,
    status: ReplicaStatus.ACTIVE,
    createdAt: 1,
    stateEnteredAt: 1,
    ...rowOf(ReplicaStatus.ACTIVE),
  });
  const lifecycleStore = createLifecycleStateStore({
    services: [initialRow],
    partitions: [createPartitionRow({
      partitionId,
      leaderNodeId: null,
    })],
  });
  const submitMutation = lifecycleStore.gateway.submitMutation.bind(
    lifecycleStore.gateway,
  );
  lifecycleStore.gateway.submitMutation = async (...args) => {
    const result = await submitMutation(...args);
    const durableRow = lifecycleStore.durable.services.get(replicaId) || null;
    if (durableRow) cache.upsert(SERVICES, durableRow);
    else cache.delete(SERVICES, replicaId);
    return result;
  };
  const replicaStateMachine = new ReplicaStateMachine({
    nodeId,
    systemTableCache: lifecycleStore.cache,
    controlPlaneSystemTableGateway: lifecycleStore.gateway,
  });
  replicaStateMachine.registerReplicaSnapshot(replicaId, {
    partitionId,
    nodeId,
    state: ReplicaStatus.ACTIVE,
    serviceId: replicaId,
    serviceType: initialRow.service_type,
    serviceAddress: initialRow.address,
    // The durable row's full identity makes the snapshot lifecycle
    // authority; without it the owner refuses every lifecycle CAS.
    replicaIdentity: initialRow.replica_id,
    groupId: initialRow.group_id,
    createdAt: initialRow.created_at,
    durableVersionColumn: 'state_entered_at',
    durableVersion: initialRow.state_entered_at,
    durableUpdatedAt: initialRow.updated_at,
    authoritativeSnapshot: true,
  });
  const service = new EventEmitter();
  Object.assign(service, {
    partitionId,
    replicaId,
    raft: cluster.node(replicaId),
    admissionFenced: false,
    fenceServingAdmissionForRemoval() {
      service.admissionFenced = true;
    },
    async waitForRemovalServingDrain() {},
    async shutdown() {
      service.raft.close();
    },
  });
  const handler = new ReplicaHandler({
    nodeId,
    dataDir,
    systemTableCache: cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: lifecycleStore.gateway,
    createPartitionService: () => {
      throw new Error('this world creates no partition service');
    },
    replicaStateMachine,
    executorOutcomeEmitter: {
      emitOutcome: (...args) => outcomes.push(args),
    },
  });
  // The exits the handler reported (its REMOVE_CONSENSUS_EXIT record).
  const exits = [];
  const logger = handler.logger;
  handler.logger = Object.assign(Object.create(logger), {
    info(message, fields) {
      if (message === REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT) {
        exits.push(fields);
      }
      return logger.info(message, fields);
    },
  });
  handler.localServices.set(replicaId, service);
  handler.localReplicas.set(replicaId, {replicaId, partitionId,
    status: ReplicaStatus.ACTIVE, service});
  return {
    handler,
    service,
    outcomes,
    exits,
    removeRequest(operationId, reason = 'rebalancing') {
      return handler.handleRemoveReplica({
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.REMOVE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]: operationId,
        [ReplicaOperationField.PARTITION_ID]: partitionId,
        [ReplicaOperationField.REPLICA_ID]: replicaId,
        [ReplicaOperationField.REASON]: reason,
      });
    },
    async dispose() {
      handler.shuttingDown = true;
      // The production shutdown boundary: close lifecycle admission and
      // advance every generation, so a removal still in flight cannot reach
      // the process-wide raft lifecycle registry (keyed by replica identity)
      // after this world is gone and retire a later world's same-named peer.
      await replicaStateMachine.clear();
      handler.localServices.clear();
      fs.rmSync(dataDir, {recursive: true, force: true});
    },
  };
}

export {createRemovalSourceHandler, durableLifecycleState};
