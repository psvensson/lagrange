// A partition on real PartitionService replicas (rs-raft backend, one
// database file each) whose new replicas are created through the production
// committed-membership chain: the creation owner's bootstrap read routed to
// the node hosting the leader (ReplicaHandler READ_COMMITTED_MEMBERSHIP), the
// COMMITTED stamp it persists, the target handler's stamp validation, and the
// port that opens the group from it.
//
// The harness owns only plumbing: a loopback network that can drop one
// replica's traffic, one ReplicaHandler per node, a router that delivers to
// those handlers, and the services rows each party is handed. Every
// membership fact is read from raft-rs or from the durable bytes; the rows
// are planted to disagree with the committed configuration where a witness
// needs them to.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CDCOperation,
  PartitionService,
} from '../../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../../src/node/replica-handler.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {
  applyRebalanceCoordinatorOperationCreationMethods,
} from '../../../src/rebalancer/rebalance-coordinator-operation-creation.js';
import {
  applyRebalanceCoordinatorOperationReadMethods,
} from '../../../src/rebalancer/rebalance-coordinator-operation-read-methods.js';
import {OperationType} from
  '../../../src/rebalancer/replica-operation-progress.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';

const TABLE_NAME = 'committed_membership_table';
const WAIT_BUDGET_MS = 8000;
const POLL_MS = 10;
const TABLE_SCHEMA = Object.freeze({
  columns: [{name: 'seq', type: 'INTEGER', primaryKey: true}],
});
const LEADER_ROLE = 'leader';
const STAMP_CAPTURED = new Error('bootstrap stamp captured');
const SILENT = Object.freeze({
  info() {}, warn() {}, error() {}, debug() {}, trace() {},
});
const REPLICA_HANDLER_SUFFIX = '/service/replica-handler';

class CreationOwner {}
applyRebalanceCoordinatorOperationCreationMethods(CreationOwner);
applyRebalanceCoordinatorOperationReadMethods(CreationOwner);

function addressOf([replicaId, nodeId]) {
  return `${nodeId}/partition/${replicaId}`;
}

function serviceRow(partitionId, [replicaId, nodeId]) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    address: addressOf([replicaId, nodeId]),
    status: SERVICE_STATUS.ACTIVE,
  };
}

function metadataCache(partitionId, members, {leaderNodeId = null} = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, CDCOperation.INSERT, {
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
    schema_definition: JSON.stringify(TABLE_SCHEMA),
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    partition_id: partitionId,
    table_id: TABLE_NAME,
    replica_count: members.length,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: leaderNodeId,
  });
  for (const member of members) {
    cache.applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(partitionId, member));
  }
  return cache;
}

function waitFor(predicate, boundMs = WAIT_BUDGET_MS) {
  const deadline = Date.now() + boundMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
  });
}

function configure() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'committed-membership-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function statusOf(service) {
  return service.raft.readStatus();
}

// A configuration as the core reports it, sorted.
function membershipOf(confState) {
  const sorted = (ids) => [...(ids || [])].map(String).sort();
  return {
    voters: sorted(confState.voters),
    votersOutgoing: sorted(confState.votersOutgoing),
    learners: sorted(confState.learners),
  };
}

/**
 * A loopback network whose deliveries to or from a cut replica are dropped,
 * and whose deliveries to a rewritten address pass through a function of
 * the raft message (null drops the packet). Senders are known by the raft
 * peer id the packet names.
 * @return {Object} The transport, with cut(replicaId, peerId), heal() and
 *   rewriteTo(address, fn|null).
 */
function createCuttableTransport() {
  const handlers = new Map();
  const cutAddresses = new Set();
  const cutPeerIds = new Set();
  const rewrites = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    async deliver(address, payload) {
      if (cutAddresses.has(address) ||
          cutPeerIds.has(String(payload?.from))) {
        return {acknowledged: false, error: 'cut'};
      }
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      const rewrite = rewrites.get(address);
      if (rewrite === undefined) {
        return handler({payload});
      }
      const message = rewrite(payload.message);
      return message === null ? {acknowledged: false, error: 'rewritten'} :
        handler({payload: {...payload, message}});
    },
    rewriteTo(address, rewrite) {
      if (rewrite === null) {
        rewrites.delete(address);
      } else {
        rewrites.set(address, rewrite);
      }
    },
    cut(address, peerId) {
      cutAddresses.add(address);
      cutPeerIds.add(String(peerId));
    },
    heal() {
      cutAddresses.clear();
      cutPeerIds.clear();
      this.deliver = this.deliver.bind(this);
    },
  };
}

/**
 * One partition, its replicas, one replica handler per node and a router.
 * @param {string} partitionId - The partition.
 * @return {Object} The harness.
 */
function createCommittedMembershipHarness(partitionId) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-membership-'));
  const network = createCuttableTransport();
  const services = new Map();
  const caches = new Map();
  const members = new Map();
  const handlers = new Map();
  const unreachable = () => {
    throw new Error('the harness handler reached a write collaborator');
  };
  const handlerOf = (nodeId) => {
    if (!handlers.has(nodeId)) {
      handlers.set(nodeId, new ReplicaHandler({
        nodeId,
        dataDir: directory,
        systemTableCache: metadataCache(partitionId, []),
        cdcIntegrationService: {insertSystemTableRow: unreachable},
        createPartitionService: unreachable,
      }));
    }
    return handlers.get(nodeId);
  };
  const router = {
    delivered: [],
    async deliver(target, request, options) {
      const nodeId = target.slice(0, target.length -
        REPLICA_HANDLER_SUFFIX.length);
      this.delivered.push({nodeId, request, options});
      if (!handlers.has(nodeId)) {
        throw new Error(`no node ${nodeId}`);
      }
      return handlers.get(nodeId).handleMessage({payload: request,
        correlationId: `read-${this.delivered.length}`});
    },
  };
  const dbPathOf = ([replicaId]) => path.join(directory, 'partitions',
    partitionId, `${replicaId}.db`);
  const build = (member, {replicaIds, peerAddresses, cache,
    deferElection = true, bootstrapMembership = undefined,
    isJoiningExistingGroup = false}) => {
    fs.mkdirSync(path.dirname(dbPathOf(member)), {recursive: true});
    // A founder is built with its founding list's GENESIS stamp (V1a: the
    // port opens nothing without a stamp or the durable-record bootstrap).
    const service = new PartitionService(withFoundingStamp({
      partitionId,
      tableId: TABLE_NAME,
      tableName: TABLE_NAME,
      replicaId: member[0],
      replicaIds,
      peerAddresses,
      nodeId: member[1],
      transport: network,
      systemTableCache: cache,
      schema: TABLE_SCHEMA,
      dbPath: dbPathOf(member),
      deferElection,
      isJoiningExistingGroup,
      ...(bootstrapMembership === undefined ? {} : {bootstrapMembership}),
    }));
    services.set(member[0], service);
    caches.set(member[0], cache);
    members.set(member[0], member);
    handlerOf(member[1]).localServices.set(member[0], service);
    return service;
  };
  const leader = () => [...services.values()].find((service) =>
    service.raft?.readStatus?.()?.role === LEADER_ROLE);
  const leaderMember = () => {
    const leading = leader();
    return leading ? members.get(leading.replicaId) : null;
  };
  const dispose = async () => {
    network.deliver = async () => undefined;
    await Promise.all([...services.values()].map((service) =>
      service.shutdown().catch(() => undefined)));
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {partitionId, directory, network, services, caches, members,
    handlers, handlerOf, router, build, leader, leaderMember, dbPathOf,
    dispose};
}

// Founders share one genesis list; every founder's cache names every
// founder.
async function formGroup(harness, founders) {
  for (const founder of founders) {
    harness.build(founder, {
      replicaIds: founders.map(([replicaId]) => replicaId),
      peerAddresses: founders.map(addressOf),
      cache: metadataCache(harness.partitionId, founders),
      deferElection: founders.length > 1,
    });
  }
  for (const founder of founders) {
    await harness.services.get(founder[0]).initialize();
  }
  for (const founder of founders) {
    harness.services.get(founder[0]).startElection();
  }
  assert.equal(await waitFor(() =>
    harness.leader()?.raft.readStatus().appliedIndex > 0), true,
  'setup: the founding group elects a leader that applied its first entry');
}

/**
 * The operation the production creation owner persists for a join, captured
 * at the persistence boundary. `rows` are the services rows it is handed
 * (both the cache view and the authoritative read) - planted to disagree
 * with the committed configuration where a witness needs it; `leaderHint`
 * is the partitions row's leader_node_id the read is routed by.
 * @param {Object} harness - The harness.
 * @param {Object} request - {type, target, rows, leaderHint, sourceReplicaId,
 *   sourceNodeId}.
 * @return {Promise<Object>} {operation} or {error}.
 */
async function createJoinOperation(harness, {type = OperationType.ADD,
  target, rows, leaderHint, sourceReplicaId = null, sourceNodeId = null}) {
  let stamped = null;
  const owner = Object.assign(new CreationOwner(), {
    logger: SILENT,
    nodeId: 'coordinator-node',
    now: () => Date.now(),
    stats: {operationsCreated: 0},
    systemTableCache: metadataCache(harness.partitionId, [],
      {leaderNodeId: leaderHint}),
    messageRouter: harness.router,
    repository: {getEntityServiceRows: () => rows.map((row) => ({...row}))},
    getAuthoritativeEntityServiceRowsObservation: async () => ({
      available: true, rows: rows.map((row) => ({...row}))}),
    controlPlaneReadinessService: {getNodeReadinessSync: () => null},
    resolveEntitySizeBytes: () => 0,
    ensureProvisioningAdmissionAllowed: async () => undefined,
    resolveOperationReadinessDecisionDimension: () => null,
    persistNewOperation: async (operation) => {
      stamped = operation;
      throw STAMP_CAPTURED;
    },
  });
  const [targetReplicaId, targetNodeId] = target;
  const move = {
    type,
    nodeId: targetNodeId,
    replicaId: type === OperationType.REPLACE ?
      sourceReplicaId : targetReplicaId,
    replicaIntentId: targetReplicaId,
  };
  try {
    await owner.createOperationRecordInternal({
      move,
      normalizedMove: move,
      normalizedMoveType: type,
      shouldEmitOperationCreated: false,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: harness.partitionId,
      partitionId: harness.partitionId,
      dedupeKey: `${type}:${targetReplicaId}`,
      criticalAddLikeIntentKey: null,
      sourceNodeId,
    });
  } catch (error) {
    if (error !== STAMP_CAPTURED) {
      return {error};
    }
  }
  return {operation: stamped};
}

/**
 * Build the target through its node's handler: the dispatched stamp and
 * address book resolve the replica context, and PartitionService opens the
 * group from them.
 * @param {Object} harness - The harness.
 * @param {Object} request - {target, operation, cache}.
 * @return {Promise<Object>} {service, context}.
 */
async function buildTargetFromOperation(harness, {target, operation, cache}) {
  const [targetReplicaId, targetNodeId] = target;
  const handler = harness.handlerOf(targetNodeId);
  handler.systemTableCache = cache;
  const context = handler.resolveReplicaContext(harness.partitionId,
    targetReplicaId, {
      explicitOperationType: operation.type,
      bootstrapReplicaIds: operation[ReplicaOperationField.REPLICA_IDS],
      bootstrapPeerAddresses: operation[ReplicaOperationField.PEER_ADDRESSES],
      bootstrapMembership: operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
    });
  const service = harness.build(target, {
    replicaIds: context.replicaIds,
    peerAddresses: context.peerAddresses,
    cache,
    bootstrapMembership: context.bootstrapMembership,
    isJoiningExistingGroup: context.existingReplicaCount > 0,
  });
  await service.initialize();
  return {service, context};
}

// The group's own admission: the target's row reaches every member's cache
// and the leader proposes the ConfChange.
async function admitThroughRows(harness, target, admitters) {
  for (const [replicaId] of admitters) {
    harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
      CDCOperation.INSERT, serviceRow(harness.partitionId, target));
  }
  const joined = harness.services.get(target[0]);
  joined.startElection();
  const joinedPeerId = statusOf(joined).peerId;
  return waitFor(() => {
    const leading = harness.leader();
    if (!leading) {
      return false;
    }
    const status = statusOf(leading);
    return status.confState.voters.map(String).includes(
      String(joinedPeerId)) &&
      statusOf(joined).commitIndex === status.commitIndex;
  });
}

export {
  addressOf,
  admitThroughRows,
  buildTargetFromOperation,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  formGroup,
  membershipOf,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
};
