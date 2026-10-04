/**
 * A world for the group-retirement witnesses (owner decision 2026-10-04,
 * amending ruling F2: a group retired by a durable cutover exits as a unit).
 *
 * One partition group of real rs-raft operation ports (PartitionNodeCluster);
 * each member hosted by a PRODUCTION ReplicaHandler
 * (replica-removal-consensus-exit-fixture.js); a router that delivers each
 * REMOVE_REPLICA to the handler of the node the services row names; the
 * PRODUCTION row-driven reconcile (retireRaftPeerFromAuthoritativeServiceChange)
 * run on every member for every live services-row change, exactly where
 * PartitionService.handleSystemTableCacheChange runs it; and the PRODUCTION
 * workflow dissolution/teardown methods (ManagedSplitWorkflowDissolutionMethods,
 * ManagedMergeWorkflowDissolutionMethods) driving the removals. The durable
 * workflow record (the table's `tables` row) is this world's: the handlers'
 * authoritative control-plane read answers it.
 *
 * Counters, never wall time: conf-change proposals made at the reconcile
 * seam (every member's port), consensus-exit waits armed, consensus-exit
 * backstop alarms logged at ERROR, and each handler's reported exits.
 */

import {CDC_OPERATION} from '../../src/constants/index.js';
import {isLivePartitionServiceRow} from '../../src/constants/service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {retireRaftPeerFromAuthoritativeServiceChange} from
  '../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {ManagedSplitWorkflowDissolutionMethods} from
  '../../src/partition/managed-split-workflow-dissolution-methods.js';
import {ManagedMergeWorkflowDissolutionMethods} from
  '../../src/partition/managed-merge-workflow-dissolution-methods.js';
import {ManagedMergeWorkflowStateMethods} from
  '../../src/partition/managed-merge-workflow-state-methods.js';
import {ManagedSplitWorkflowExecutionGateMethods} from
  '../../src/partition/managed-split-workflow-execution-gate-methods.js';
import {isSplitSourceAckTransitionAllowed} from
  '../../src/partition/split-ack-constants.js';
import {
  buildMergeSourceParticipantKey,
  isMergeSourceAckTransitionAllowed,
} from '../../src/partition/merge-ack-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {durableAppliedState} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
  nextTurns,
  partitionServiceRow as serviceRow,
} from './replica-removal-consensus-exit-fixture.js';

const SERVICES = 'services';
const TABLES = 'tables';
const TABLE_ID = 'tbl-retire';
const ELECTION_ROUNDS = 400;
const RETIRED = 'retired';
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {},
  error() {}});

// A port whose conf-change proposals are counted (the reconcile's only
// effect on consensus). The port is frozen, so this is a delegating copy.
function countingPort(port, replicaId, proposals) {
  const counted = {};
  for (const key of Object.keys(port)) {
    counted[key] = typeof port[key] === 'function' ?
      port[key].bind(port) : port[key];
  }
  counted.proposeConfChange = (change) => {
    proposals.push({by: replicaId, change});
    return port.proposeConfChange(change);
  };
  return counted;
}

/**
 * Open one group world.
 * @param {Object} t - The tap test.
 * @param {Object} options
 * @param {string} options.partitionId - The group.
 * @param {number} options.voters - Its founding voters.
 * @param {boolean} [options.reconcile=true] - Run the row-driven reconcile.
 * @return {Object} The world.
 */
function openGroupWorld(t, {partitionId, voters, reconcile = true}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const members = Array.from({length: voters},
    (_, index) => `${partitionId}-r${index + 1}`);
  const cluster = new PartitionNodeCluster({partitionId, replicaIds: members});
  cluster.tickers = [members[0]];
  const elected = cluster.settle(() =>
    cluster.leaderReplicaId() === members[0] &&
    members.every((replicaId) => durableAppliedState(
      cluster.replica(replicaId).dbFile, partitionId)?.appliedIndex > 0),
  {rounds: ELECTION_ROUNDS});
  const cache = createMockCache({services: members.map((replicaId) =>
    serviceRow(partitionId, replicaId, ReplicaStatus.ACTIVE))});
  const world = {
    partitionId, members, cluster, cache, elected,
    proposals: [],
    consensusWaits: [],
    alarms: [],
    tablesRows: new Map(),
    authoritativeTablesReadAvailable: true,
    dropDeliveryTo: new Set(),
    loseOnce: new Set(),
    sources: new Map(),
    retired: new Set(),
    scheduler: createFakeScheduler(),
    systemRowListeners: new Set(),
    partitionRows: new Set([partitionId]),
    partitionRowDeletes: [],
    terminals: [],
    deliveries: [],
  };
  world.emitSystemRow = (tableName, operation, row) => {
    for (const listener of [...world.systemRowListeners]) {
      listener(tableName, operation, row);
    }
  };
  world.emitNodeRow = (row) => world.emitSystemRow('nodes', 'UPDATE', row);
  // The row-driven reconcile on every member, as PartitionService runs it.
  const memberServices = new Map(members.map((replicaId) => [replicaId, {
    raft: countingPort(cluster.node(replicaId), replicaId, world.proposals),
    replicaId, partitionId, replicaIds: [...members], peerAddresses: [],
    logger: QUIET_LOGGER,
  }]));
  const react = (operation, row) => {
    if (!reconcile || !row || row.partition_id !== partitionId ||
        !isLivePartitionServiceRow(row)) {
      return;
    }
    for (const [replicaId, service] of memberServices) {
      if (!world.retired.has(replicaId)) {
        retireRaftPeerFromAuthoritativeServiceChange(service, operation, row);
      }
    }
  };
  const upsert = cache.upsert;
  const remove = cache.delete;
  cache.upsert = (tableName, row) => {
    const stored = upsert(tableName, row);
    if (tableName === SERVICES) react(CDC_OPERATION.UPDATE, stored);
    return stored;
  };
  cache.delete = (tableName, key) => {
    const previous = tableName === SERVICES ? cache.get(tableName, key) : null;
    const deleted = remove(tableName, key);
    if (deleted && previous) react(CDC_OPERATION.DELETE, previous);
    return deleted;
  };
  for (const replicaId of members) {
    const source = createRemovalSourceHandler({cluster, replicaId,
      partitionId, nodeId: `${replicaId}-node`, cache,
      rowOf: (status) => serviceRow(partitionId, replicaId, status)});
    const {handler} = source;
    const proto = Object.getPrototypeOf(handler);
    handler.awaitReplicaRemovalConsensusExit = function(...args) {
      world.consensusWaits.push(replicaId);
      return proto.awaitReplicaRemovalConsensusExit.apply(this, args);
    };
    const logger = handler.logger;
    handler.logger = Object.assign(Object.create(logger), {
      error(message, fields) {
        if (message ===
            REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT_BACKSTOP_ALARM) {
          world.alarms.push(fields);
        }
        return logger.error(message, fields);
      },
    });
    // The durable workflow record, answered by the authoritative read.
    const gateway = handler.controlPlaneSystemTableGateway;
    const readRows = gateway.readAuthoritativeRows;
    gateway.readAuthoritativeRows = async (tableName, sql, params, opts) => {
      if (tableName !== TABLES) {
        return readRows(tableName, sql, params, opts);
      }
      if (!world.authoritativeTablesReadAvailable) {
        return {success: false, error: 'tables owner unavailable'};
      }
      const row = world.tablesRows.get(params[0]);
      return {success: true, rows: row ? [{...row}] : []};
    };
    source.service.tableId = TABLE_ID;
    world.sources.set(replicaId, source);
  }
  world.lifecycleAtSetup = new Map(members.map((replicaId) => [replicaId,
    durableLifecycleState(cluster.replica(replicaId).dbFile, partitionId)]));
  world.lifecycleOf = (replicaId) => durableLifecycleState(
    cluster.replica(replicaId).dbFile, partitionId);
  world.exitsOf = (replicaId) =>
    world.sources.get(replicaId).exits.map((exit) => exit.reason);
  // The router: each REMOVE to the handler of the node its row names.
  world.deliverReplicaRemoval = async ({nodeId, message}) => {
    const replicaId = nodeId.replace(/-node$/u, '');
    world.deliveries.push({replicaId,
      fenceToken: message.groupRetirement?.fenceToken ?? null});
    if (world.dropDeliveryTo.has(replicaId) ||
        world.loseOnce.delete(replicaId)) {
      world.deliveries.at(-1).lost = true;
      return null;
    }
    return world.sources.get(replicaId).handler.handleRemoveReplica(message);
  };
  world.setTablesRow = (row) => {
    world.tablesRows.set(row.table_id, row);
    queueMicrotask(() => world.emitSystemRow('tables', 'UPDATE', row));
  };
  t.teardown(async () => {
    for (const source of world.sources.values()) {
      await source.dispose();
    }
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return world;
}

// The owner-side clock: the re-drive's fallback backoff is scheduled here
// and fires only when the test says so (never by wall time).
function createFakeScheduler() {
  const scheduler = {
    armed: [],
    fired: 0,
    setTimeout(fn, ms) {
      const timer = {fn, ms, cleared: false};
      scheduler.armed.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    pending() {
      return scheduler.armed.filter((timer) => !timer.cleared);
    },
    fireAll() {
      for (const timer of scheduler.pending()) {
        timer.cleared = true;
        scheduler.fired += 1;
        timer.fn();
      }
    },
  };
  return scheduler;
}

// The production re-drive. The module is imported by path so a witness of
// it still loads (and goes red on its assertions) on a tree without it,
// where the owner methods never consult a re-drive.
async function createOwnerRedrive(owner, scheduler) {
  const module = await import('../../src/partition/group-retirement-redrive.js')
    .catch(() => null);
  if (!module) {
    return {exclusive: (_key, step) => step(), report() {}, settle() {},
      unacknowledged: () => [], isDriving: () => false};
  }
  return module.createGroupRetirementRedrive(owner,
    {groupRetirementScheduler: scheduler});
}

// The PRODUCTION durable resume (attached as the workflow constructors
// attach it), by path for the same reason.
async function attachOwnerResume(owner, family, scheduler) {
  const module = await import('../../src/partition/group-retirement-resume.js')
    .catch(() => null);
  if (!module) {
    return;
  }
  module.attachGroupRetirementResume(owner, {
    family,
    claim: (workflowId) => claimWorkflowOwnershipCore(owner, workflowId),
    finalize: (workflowId) => family === 'split' ?
      owner.finalizeSplitDissolutionIfReady(workflowId) :
      owner.finalizeMergeDissolutionIfReady(workflowId),
    teardown: (workflowId, workflow) => family === 'split' ?
      owner.teardownAbortedSplitChildren(workflowId, workflow) :
      owner.teardownAbortedMergeTarget(workflowId, workflow),
    scheduler,
  });
}

// The record's ownership claim, compare-and-swapped on its fence as
// persistSplitWorkflowClaim does on the tables row.
function persistClaimToRecord(world, candidate, {expectedFenceToken}) {
  const record = world.tablesRows.get(TABLE_ID);
  const metadata = JSON.parse(record.partition_transition_metadata);
  if (metadata.workflowFenceToken !== expectedFenceToken) {
    return {accepted: false};
  }
  metadata.workflowFenceToken = candidate.fenceToken;
  metadata.workflowOwnerId = candidate.workflowOwnerId;
  metadata.workflowLeaseExpiresAt = candidate.leaseExpiresAt;
  world.setTablesRow({...record,
    partition_transition_metadata: JSON.stringify(metadata)});
  return {accepted: true, workflow: candidate};
}

/**
 * A ready heartbeat row for one node, as the nodes table carries it (the
 * workflow owner's node-ready event).
 * @param {string} nodeId
 * @return {Object}
 */
function readyNodeRow(nodeId) {
  return {node_id: nodeId, status: 'active', last_heartbeat: 1000,
    ready_lease_expires_at: 2000};
}

// The durable record's participants follow the coordinator's persisted
// participant state, as persistWorkflowTransition writes them.
function persistParticipantToRecord(world, participant) {
  const record = world.tablesRows.get(TABLE_ID);
  if (!record) return;
  const metadata = JSON.parse(record.partition_transition_metadata);
  metadata.participants = {...(metadata.participants || {}),
    [participant.participantKey]: JSON.parse(JSON.stringify(participant))};
  world.setTablesRow({...record,
    partition_transition_metadata: JSON.stringify(metadata)});
}

/**
 * One workflow owner: the PRODUCTION dissolution/teardown methods and the
 * PRODUCTION source-acknowledgement entry, over a real
 * DurableWorkflowCoordinator (fence, duplicate and graph checks) whose
 * participant persistence writes the world's durable record, and the
 * PRODUCTION group-retirement re-drive (createGroupRetirementRedrive) on
 * the world's node rows and owner clock.
 * @param {Object} world
 * @param {Object} options
 * @param {string} options.family - 'split' | 'merge'.
 * @param {Object} options.workflow - {workflowId, fenceToken, tableId,
 *   partitionId, status, metadata, participants: [{participantKey,
 *   status}]}.
 * @return {Promise<Object>} The owner.
 */
async function createWorkflowOwner(world, {family, workflow,
  resume = false}) {
  const split = family === 'split';
  world.ownerCount = (world.ownerCount ?? 0) + 1;
  const owner = Object.create(split ?
    ManagedSplitWorkflowDissolutionMethods.prototype :
    ManagedMergeWorkflowDissolutionMethods.prototype);
  const coordinator = new DurableWorkflowCoordinator({
    persistParticipant: async (participant) =>
      persistParticipantToRecord(world, participant),
    persistWorkflowClaim: async (candidate, context) =>
      persistClaimToRecord(world, candidate, context),
    isParticipantTransitionAllowed: (_key, from, to) => (split ?
      isSplitSourceAckTransitionAllowed :
      isMergeSourceAckTransitionAllowed)(from, to),
    now: () => (typeof owner.now === 'function' ? owner.now() : 1),
  });
  await coordinator.registerWorkflow({...workflow, ownerKey: workflow.tableId,
    participants: undefined});
  for (const participant of workflow.participants || []) {
    await coordinator.upsertParticipant(workflow.workflowId, {
      ...participant, participantId: participant.participantKey,
      fenceToken: workflow.fenceToken, acknowledgedAt: 1});
  }
  const ownerLog = [];
  const logger = {
    debug() {}, info() {},
    warn: (message, fields) => ownerLog.push({level: 'warn', message, fields}),
    error: (message, fields) =>
      ownerLog.push({level: 'error', message, fields}),
  };
  // The owner process: its listeners and its clock's timers end with it.
  const listeners = new Set();
  const scheduler = {
    setTimeout: (fn, ms) => world.scheduler.setTimeout(() => {
      if (!owner.dead) fn();
    }, ms),
    clearTimeout: (timer) => world.scheduler.clearTimeout(timer),
  };
  Object.assign(owner, {
    logger,
    ownerLog,
    dead: false,
    kill() {
      owner.dead = true;
      for (const listener of listeners) {
        world.systemRowListeners.delete(listener);
      }
    },
    workflowOwnerId: `owner-${world.ownerCount}`,
    workflowLeaseMs: 60000,
    now: () => 1,
    getPartitionInfo: (partitionId) => world.partitionRows.has(partitionId) ?
      {partition_id: partitionId} : null,
    listTableInfos: () => [...world.tablesRows.values()],
    workflowCoordinator: coordinator,
    resolveWorkflowState: (workflowId) =>
      coordinator.getWorkflowById(workflowId),
    isSplitWorkflowStateUnavailable: (state) => !state?.workflowId,
    isMergeWorkflowStateUnavailable: (state) => !state?.workflowId,
    ensureCanonicalSplitParticipants() {},
    ensureCanonicalMergeParticipants() {},
    listPartitionServiceRows: (partitionId) => world.cache.filter(SERVICES,
      (row) => row.partition_id === partitionId &&
        row.service_type === 'partition'),
    deliverReplicaRemoval: world.deliverReplicaRemoval,
    deletePartitionMetadata: async (partitionId) => {
      world.partitionRowDeletes.push(partitionId);
      world.partitionRows.delete(partitionId);
      return {success: true, affectedRows: 1};
    },
    deleteSourcePartitionMetadata: async (partitionId) => {
      world.partitionRowDeletes.push(partitionId);
      world.partitionRows.delete(partitionId);
      return {success: true, affectedRows: 1};
    },
    // The terminal advance and clear are the workflow's own lane steps,
    // outside this owner: the world records that they were reached.
    advanceSplitPhase: async (workflowId, status) => {
      coordinator.getWorkflowById(workflowId).status = status;
    },
    persistTerminalTransitionClear: async (state) => {
      world.terminals.push(state.workflowId);
      const record = world.tablesRows.get(TABLE_ID);
      world.setTablesRow({...record, partition_transition_state: null,
        partition_transition_metadata: null});
    },
    areAllMergeSourcesAtStatus: (state, statuses) =>
      owner.resolveMergeSourcePartitionIds(state.metadata || {}).every((id) =>
        statuses.has(String(state.participants.get(
          buildMergeSourceParticipantKey(id))?.status || ''))),
    resolveMergeSourcePartitionIds: ManagedMergeWorkflowStateMethods
      .prototype.resolveMergeSourcePartitionIds,
    resolveMergeTargetPartitionId: ManagedMergeWorkflowStateMethods
      .prototype.resolveMergeTargetPartitionId,
    acknowledgeSourceParticipant: ManagedSplitWorkflowExecutionGateMethods
      .prototype.acknowledgeSourceParticipant,
    buildRejectedSplitAckOutcome: ManagedSplitWorkflowExecutionGateMethods
      .prototype.buildRejectedSplitAckOutcome,
    // The node-rows-only observation the re-drive used before system rows
    // (kept so these witnesses load and measure on that tree too).
    observeNodeRows: (listener) => owner.observeSystemRows(
      (tableName, _operation, row) => {
        if (tableName === 'nodes') listener(row);
      }),
    observeSystemRows: (listener) => {
      if (owner.dead) return null;
      listeners.add(listener);
      world.systemRowListeners.add(listener);
      return () => {
        listeners.delete(listener);
        world.systemRowListeners.delete(listener);
      };
    },
  });
  owner.groupRetirementRedrive = await createOwnerRedrive(owner, scheduler);
  if (resume) {
    await attachOwnerResume(owner, family, scheduler);
  }
  return owner;
}

/**
 * Drive the world until every named member completed its removal (or the
 * round bound is spent): live members tick, envelopes move, the handlers'
 * turns run.
 * @param {Object} world
 * @param {string[]} replicaIds - The members whose removal is awaited.
 * @param {number} [rounds=60]
 * @return {Promise<boolean>} True when all completed.
 */
async function driveUntilRemoved(world, replicaIds, rounds = 60) {
  const completed = (replicaId) => world.sources.get(replicaId).outcomes
    .some(([type]) => type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED);
  for (let round = 0; round < rounds; round += 1) {
    for (const replicaId of world.members) {
      if (world.lifecycleOf(replicaId) === RETIRED) {
        world.retired.add(replicaId);
      }
    }
    world.cluster.tickers = world.members.filter((replicaId) =>
      !world.retired.has(replicaId));
    world.cluster.settle(() => false, {rounds: 10});
    await nextTurns();
    if (replicaIds.every(completed)) {
      return true;
    }
  }
  return false;
}

export {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  nextTurns,
  openGroupWorld,
  readyNodeRow,
};
