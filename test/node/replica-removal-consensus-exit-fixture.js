import {captureReplicaRuntimeProducer} from
  '../../src/node/replica-runtime-producer.js';
import {createReplicaHandlerFixture} from
  '../test-helpers/replica-handler-construction-fixture.js';
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

import {redriveAdmissionsOnMembershipChange} from
  '../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {retirePartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {subscribeRemovalSubjectHandoff} from
  '../../src/partition/partition-service-removal-subject-handoff.js';
import {REMOVAL_SERVING_STATE} from
  '../../src/partition/partition-service-removal-serving-methods.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../src/raft/raft-operation-port-request.js';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  durableAppliedState,
  durableHardState,
  foldAt,
  logFold,
} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {captureReplicaAdmission} from
  '../../src/node/replica-state-machine-serialization.js';
import {createReplicaRuntimePublication, publishReplicaRuntime} from
  '../../src/node/replica-runtime-publication.js';
import {attachPartitionRuntimePublication} from
  '../../src/partition/partition-runtime-publication.js';
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
 * Let `turns` macrotask turns run (the handlers' setImmediate hops).
 * @param {number} [turns=20]
 * @return {Promise<void>}
 */
function nextTurns(turns = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < turns; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

/**
 * One replica's services row, hosted on the node `<replicaId>-node`.
 * @param {string} partitionId
 * @param {string} replicaId
 * @param {string} status
 * @return {Object}
 */
function partitionServiceRow(partitionId, replicaId, status) {
  const nodeId = `${replicaId}-node`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status,
    raft_role: 'follower',
    address: `${nodeId}/partition/${replicaId}`,
  };
}

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
 * @param {Object|null} [options.stateStore] - Shared metadata transport fixture.
 * @return {Object} {handler, service, outcomes, exits, removeRequest,
 *   dispose}.
 */
function refuseRemovalFixtureConstruction() {
  throw new Error('this world creates no partition service');
}

function createRemovalSourceHandler({cluster, replicaId, partitionId, nodeId,
  cache, rowOf, stateStore = null, createPartitionService = refuseRemovalFixtureConstruction}) {
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
  const lifecycleStore = stateStore || createLifecycleStateStore({
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
    cleanupToken: initialRow.cleanup_token,
    createAttemptToken: initialRow.create_attempt_token,
    createdAt: initialRow.created_at,
    durableVersionColumn: 'state_entered_at',
    durableVersion: initialRow.state_entered_at,
    durableUpdatedAt: initialRow.updated_at,
    authoritativeSnapshot: true,
  });
  const service = new EventEmitter();
  // The runtime's transport identity as production binds it: its exact
  // handler registered at its address while its port is open, retired
  // through this lifecycle owner (a durable ACTIVE - a cancelled removal's
  // row - is written only while it is bound).
  const transportHandler = () => undefined;
  let portClosed = false;
  Object.assign(service, {
    partitionId,
    replicaId,
    nodeId,
    isShutdown: false,
    raft: cluster.node(replicaId),
    admissionFenced: false,
    unifiedAddress: initialRow.address,
    transportHandler,
    transport: {getRegisteredHandler: (address) =>
      !portClosed && address === initialRow.address ? transportHandler : null},
    resolveHandlerRetirementLane: () => replicaStateMachine,
    timeSource: {now: () => Date.now()},
    fenceServingAdmissionForRemoval() {
      service.admissionFenced = true;
    },
    liftServingAdmissionFenceForCancelledRemoval() {
      const fenced = service.admissionFenced;
      service.admissionFenced = false;
      return fenced;
    },
    // Nothing serves in this world: the drain answers the serving
    // contract's named DRAINED state.
    async waitForRemovalServingDrain() {
      return {state: REMOVAL_SERVING_STATE.DRAINED};
    },
    async shutdown() {
      service.isShutdown = true;
      portClosed = true;
      service.raft?.close();
    },
  });
  const handler = createReplicaHandlerFixture(ReplicaHandler, {
    nodeId,
    dataDir,
    systemTableCache: cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: lifecycleStore.gateway,
    createPartitionService,
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
  const producer = captureReplicaRuntimeProducer(handler, replicaStateMachine, replicaId);
  const publication = createReplicaRuntimePublication(producer, initialRow,
    captureReplicaAdmission(replicaStateMachine, replicaId));
  attachPartitionRuntimePublication(service, publication);
  const registration = Object.freeze({replicaId, partitionId, service,
    sourceEvidence: Object.freeze({...initialRow}), lifecycleOwner: replicaStateMachine});
  publishReplicaRuntime(handler, registration);
  return {
    handler,
    service,
    registration,
    lifecycleStore,
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

const TWO_VOTER_ELECTION_ROUNDS = 400;

/**
 * A two-voter group {source, leader} whose other voter leads, with the
 * source hosted by the production replica handler (createRemovalSourceHandler)
 * and the durable oracles of the source and the leader. Torn down with t.
 * @param {Object} t - The tap test.
 * @param {Object} shape - {partitionId, source, leader, nodeOf}.
 * @return {Object} {cluster, cache, source, peerIds, elected, sourceDb,
 *   leaderDb, lifecycleAtSetup, committedVoters(), sourceAppliedVoters(),
 *   sourceLifecycle()}.
 */
function openTwoVoterRemovalWorld(t, {partitionId, source: sourceId,
  leader: leaderId, nodeOf}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const rowOf = (replicaId, status) => ({
    service_id: replicaId, replica_id: replicaId, partition_id: partitionId,
    node_id: nodeOf[replicaId], service_type: 'partition', status,
    raft_role: 'follower',
    address: `${nodeOf[replicaId]}/partition/${replicaId}`,
  });
  const cluster = new PartitionNodeCluster({partitionId,
    replicaIds: [sourceId, leaderId]});
  cluster.tickers = [leaderId];
  const elected = cluster.settle(() => cluster.leaderReplicaId() === leaderId,
    {rounds: TWO_VOTER_ELECTION_ROUNDS});
  const peerIds = Object.freeze({
    [sourceId]: String(cluster.raftPeerIdOf(sourceId)),
    [leaderId]: String(cluster.raftPeerIdOf(leaderId)),
  });
  const cache = createMockCache({services: [
    rowOf(sourceId, ReplicaStatus.ACTIVE), rowOf(leaderId, ReplicaStatus.ACTIVE)]});
  const source = createRemovalSourceHandler({cluster, replicaId: sourceId,
    partitionId, nodeId: nodeOf[sourceId], cache,
    rowOf: (status) => rowOf(sourceId, status)});
  const world = {cluster, cache, source, peerIds, elected,
    sourceDb: cluster.replica(sourceId).dbFile,
    leaderDb: cluster.replica(leaderId).dbFile};
  world.lifecycleAtSetup = durableLifecycleState(world.sourceDb, partitionId);
  // The committed configuration: the fold of the leader's durable log over
  // the founders, at the leader's durable commit index.
  world.committedVoters = () => foldAt(logFold(world.leaderDb, partitionId,
    [peerIds[sourceId], peerIds[leaderId]]),
  Number(durableHardState(world.leaderDb, partitionId).commit)).voters;
  world.sourceAppliedVoters = () =>
    durableAppliedState(world.sourceDb, partitionId).voters;
  world.sourceLifecycle = () =>
    durableLifecycleState(world.sourceDb, partitionId);
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return world;
}

/**
 * A replica's partition as its row-driven retirement sees it, wired to its
 * port's events as production wires it: the deferred-retirement re-drive
 * and the removal subject's hand-off (B2: a replica never proposes its own
 * RemoveNode; leading, it hands leadership to a survivor, which removes it).
 * Every REMOVE_PEER this replica's port is asked naming the replica itself
 * is recorded in `selfRemovals`.
 * @param {Object} cluster - The PartitionNodeCluster.
 * @param {string} replicaId - The replica.
 * @param {Object} options - {partitionId, members, logger}.
 * @return {Object} The partition (with selfRemovals).
 */
function wireRowDrivenPartition(cluster, replicaId, {partitionId, members,
  logger}) {
  const port = cluster.node(replicaId);
  const selfRemovals = [];
  const partition = {
    raft: new Proxy({}, {get: (_target, key) => {
      if (key === 'proposeConfChange') {
        return (change) => {
          if (change?.replicaIdentity === replicaId) selfRemovals.push(change);
          return port.proposeConfChange(change);
        };
      }
      const value = port[key];
      return typeof value === 'function' ? value.bind(port) : value;
    }}),
    replicaId, partitionId, replicaIds: [...members], peerAddresses: [],
    logger, selfRemovals,
    raftTimingConfig: cluster.replica(replicaId)
      .request[RAFT_OPERATION_PORT_REQUEST.TIMING],
    requestLeadershipTransfer: (request) => port.transferLeadership(request),
  };
  redriveAdmissionsOnMembershipChange(partition);
  subscribeRemovalSubjectHandoff(partition);
  return partition;
}

/**
 * The survivors' removal of a source in this fixture: the cluster addresses
 * peers as raft-rs://replica-<id>, which no services row can name, so the
 * row-driven discovery never matches a peer here; the survivor that leads
 * removes the source the coordinator's way (RETIRE_REPLICA_PEER's seam,
 * retirePartitionRaftPeer) - never the source itself.
 * @param {Array<Object>} partitions - wireRowDrivenPartition results.
 * @param {string} sourceId - The source replica.
 * @return {Promise<Object|null>} The survivor leader's answer, or null.
 */
async function retireThroughSurvivorLeader(partitions, sourceId) {
  const leader = partitions.find((partition) =>
    partition.replicaId !== sourceId &&
    partition.raft.readStatus().role === 'leader');
  return leader ? retirePartitionRaftPeer(leader, sourceId) : null;
}

export {
  retireThroughSurvivorLeader,
  wireRowDrivenPartition,
  createRemovalSourceHandler,
  openTwoVoterRemovalWorld,
  durableLifecycleState,
  nextTurns,
  partitionServiceRow,
};
