// IPC controls for one nodes-p1 transfer. The runtime owns all publications,
// SQL execution, replica membership and timers. Observations never renew a lease.
import {AsyncLocalStorage} from 'node:async_hooks';
import {CDCIntegrationService} from '../../../src/cdc/cdc-integration-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from '../../../src/control-plane/control-plane-system-table-gateway.js';
import {NodeLifecyclePublication} from '../../../src/control-plane/node-lifecycle-publication.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {readPartitionReplicaMembership} from '../../../src/partition/partition-service-raft-membership-administration.js';
import {deriveParticipantEntryId} from '../../../src/query/distributed/distributed-write-coordinator.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from '../../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from '../../../src/transport/transport-error-codes.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from '../../../src/transport/transport-semantic-outcome.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

const NODES = 'nodes-p1';
const PARTITIONS = 'partitions-p1';
const hosted = new Map();
const publication = new AsyncLocalStorage();
const activeWrite = new AsyncLocalStorage();
const modes = new Map();
const trace = {lost: null, lastRenewal: null, lastRenewalByNode: {}, committedByNode: {}, withheldCount: 0,
  withheldByNode: {}, lastWithheld: null, gatedCount: 0, lastGated: null, lastReplay: null};
let gateEnabled = false;

const initialize = PartitionService.prototype.initialize;
PartitionService.prototype.initialize = async function(...args) {
  const result = await initialize.apply(this, args);
  if (this.partitionId === NODES || this.partitionId === PARTITIONS) hosted.set(this.replicaId, this);
  return result;
};

const applyPublication = NodeLifecyclePublication.prototype.applyPublication;
NodeLifecyclePublication.prototype.applyPublication = function(plan) {
  return publication.run(plan, () => applyPublication.call(this, plan));
};

function gateLeaderUpdate(table, where, data) {
  if (!gateEnabled || table !== TABLES.PARTITIONS || where?.partition_id !== NODES ||
      !Object.hasOwn(data ?? {}, 'leader_node_id')) return;
  trace.gatedCount++;
  trace.lastGated = {partitionId: where.partition_id, leaderNodeId: data.leader_node_id,
    leaderTerm: data.leader_term ?? null};
  throw Object.assign(new Error('nodes-p1 leader publication withheld'), {
    code: ROUTER_CONNECTION_CLOSED_ERROR_CODE, deferRetry: true, recoverableBeforeSend: true,
  });
}

const submitMutation = ControlPlaneSystemTableGateway.prototype.submitMutation;
ControlPlaneSystemTableGateway.prototype.submitMutation = async function(mutation, options) {
  if (mutation?.operation === 'update') gateLeaderUpdate(mutation.tableName, mutation.whereClause, mutation.data);
  return submitMutation.call(this, mutation, options);
};

// Bind the gateway's idempotency key to the concrete target row. This also
// covers a reporter publishing for another node and a locally addressed SQL hop.
const update = CDCIntegrationService.prototype.updateSystemTableRow;
CDCIntegrationService.prototype.updateSystemTableRow = async function(table, where, data, options) {
  gateLeaderUpdate(table, where, data);
  const key = options?.idempotencyKey;
  if (table !== TABLES.NODES || typeof where?.node_id !== 'string' ||
      !Number.isFinite(data?.ready_lease_expires_at) || !Number.isFinite(data.last_heartbeat) ||
      data.ready_lease_expires_at <= data.last_heartbeat) {
    return update.call(this, table, where, data, options);
  }
  // All ordinary renewals enter here, including a CDC write satisfied by a
  // colocated leader without issuing a router delivery.
  if (modeFor(where.node_id) === 'withhold') {
    recordWithheld({nodeId: where.node_id, originNodeId: this.nodeId, stage: 'cdc_admission'});
    throw Object.assign(new Error('READY lease write unavailable before submission'), {
      code: ROUTER_CONNECTION_CLOSED_ERROR_CODE, deferRetry: true, recoverableBeforeSend: true,
    });
  }
  if (typeof key !== 'string' || !key) return update.call(this, table, where, data, options);
  const plan = publication.getStore();
  const normalPublisher = plan?.nodeId === where.node_id &&
    plan.update.ready_lease_expires_at === data.ready_lease_expires_at &&
    plan.update.last_heartbeat === data.last_heartbeat;
  const renewal = {nodeId: where.node_id, originNodeId: this.nodeId, idempotencyKey: key,
    entryId: deriveParticipantEntryId(key, NODES), lastHeartbeat: data.last_heartbeat,
    readyLeaseExpiresAt: data.ready_lease_expires_at, bootIncarnation: where.boot_incarnation,
    priorHeartbeat: where.last_heartbeat, normalPublisher};
  const invocation = {renewal, returnedRemoteReceipt: null};
  const result = await activeWrite.run(invocation, () => update.call(this, table, where, data, options));
  if (result?.committed === true && result.success === true) {
    const receipt = publicationReceipt(invocation, result.partitionResult);
    const previous = trace.committedByNode[renewal.nodeId];
    if (receipt && (!previous || receipt.commitWitness.logIndex >= previous.commitWitness.logIndex)) {
      trace.committedByNode[renewal.nodeId] = receipt;
    }
  }
  return result;
};

const modeFor = (subject) => modes.get(subject) ?? modes.get('*') ?? 'open';
function recordWithheld(hop) {
  trace.withheldCount++;
  trace.withheldByNode[hop.nodeId] = (trace.withheldByNode[hop.nodeId] ?? 0) + 1;
  trace.lastWithheld = hop;
}

function confirmedReceipt(renewal, answer) {
  const witness = answer?.durableCommitWitness;
  if (!renewal.normalPublisher || answer?.success !== true || (answer.affectedRows ?? answer.changes) !== 1 ||
      witness?.partitionId !== NODES || witness.entryId !== renewal.entryId ||
      witness.idempotencyKey !== renewal.idempotencyKey || !Number.isSafeInteger(witness.term) ||
      witness.term <= 0 || !Number.isSafeInteger(witness.logIndex) || witness.logIndex <= 0) return null;
  return {...renewal, changes: 1, commitWitness: witness, at: Date.now()};
}

function publicationReceipt({renewal, returnedRemoteReceipt}, result) {
  if (!Array.isArray(result?.participantResults)) return confirmedReceipt(renewal, result);
  if (result.success !== true || result.affectedRows !== 1 || result.idempotencyKey !== renewal.idempotencyKey ||
      result.partitions?.length !== 1 || result.partitions[0] !== NODES || result.mirrorPartitions?.length !== 0 ||
      result.participantResults.length !== 1 || !returnedRemoteReceipt) return null;
  const participant = result.participantResults[0];
  if (participant?.role !== 'primary' || participant.partitionId !== NODES) return null;
  const receipt = confirmedReceipt(renewal, participant);
  const witness = receipt?.commitWitness;
  const returned = returnedRemoteReceipt.commitWitness;
  if (!witness || witness.term !== returned.term || witness.logIndex !== returned.logIndex ||
      witness.leaderReplicaId !== returned.leaderReplicaId || witness.leaderNodeId !== returned.leaderNodeId) return null;
  return {...receipt, address: returnedRemoteReceipt.address, targetNodeId: returnedRemoteReceipt.targetNodeId};
}

function closedReply(beforeSend) {
  return buildDeliveryEnvelope({errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    error: 'READY lease delivery connection closed', deferRetry: true, recoverableBeforeSend: beforeSend});
}

const deliver = MessageRouter.prototype.deliver;
MessageRouter.prototype.deliver = async function(address, request, options) {
  const invocation = activeWrite.getStore();
  const renewal = invocation?.renewal;
  if (!renewal || renewal.idempotencyKey !== request?.idempotencyKey || renewal.entryId !== request.entryId ||
      !/^\s*UPDATE\s+["`]?nodes["`]?\s+SET\s/i.test(request.sql)) {
    return deliver.call(this, address, request, options);
  }
  const targetNodeId = options?.targetNodeId ?? this.parseAddress(address).nodeId;
  const hop = {...renewal, address, targetNodeId};
  if (modeFor(renewal.nodeId) === 'withhold') {
    recordWithheld({...hop, stage: 'router_delivery'});
    return closedReply(true);
  }

  const armed = modeFor(renewal.nodeId) === 'lose_next';
  const delivery = await deliver.call(this, address, request, options);
  const answer = deliveryAnswerOf(delivery);
  const receipt = confirmedReceipt(hop, answer);
  // Arm only on a proven remote route from the actual publisher. The local
  // fast path can supply recovery receipts but never the transport loss.
  if (receipt && targetNodeId !== this.nodeId && targetNodeId === receipt.commitWitness.leaderNodeId) {
    trace.lastRenewal = trace.lastRenewalByNode[renewal.nodeId] = receipt;
    if (armed && modeFor(renewal.nodeId) === 'lose_next') {
      modes.set(renewal.nodeId, 'withhold');
      trace.lost = receipt;
      return closedReply(false);
    }
    invocation.returnedRemoteReceipt = receipt;
  }
  if (trace.lost?.entryId === request.entryId) {
    trace.lastReplay = {...hop, success: answer?.success === true, commitWitness: answer?.durableCommitWitness};
  }
  return delivery;
};

function replicas(partitionId) {
  return [...hosted.values()].filter((s) => s.partitionId === partitionId && s.initialized && !s.isShutdown);
}

async function localRows(replica, sql, params = []) {
  let answer;
  try {
    answer = await replica.executeLocalQuery(sql, params);
  } catch (error) {
    if (!replica.initialized || replica.isShutdown || error.message === 'no such table: ' + replica.tableName) {
      return {state: 'unavailable', reason: error.message, rows: null};
    }
    throw error;
  }
  if (answer?.success === false) {
    return {state: 'refused', reason: answer.failureCode ?? answer.errorCode ?? answer.error, rows: null};
  }
  if (answer?.success !== true || answer.partitionId !== replica.partitionId ||
      answer.rowSetComplete !== true || !Array.isArray(answer.rows)) {
    throw new Error('Invalid local applied row answer from ' + replica.replicaId);
  }
  return {state: 'applied', rows: answer.rows};
}

async function nodesLeaseView({nodeId}) {
  const result = [];
  const nodes = replicas(NODES);
  for (const replica of nodes) {
    const membership = await readPartitionReplicaMembership(replica, replica.replicaId);
    const sql = 'SELECT node_id, boot_incarnation, last_heartbeat, ready_lease_expires_at, connection_state, status FROM nodes';
    const read = await localRows(replica, sql + (nodeId ? ' WHERE node_id = ?' : ' ORDER BY node_id'),
      nodeId ? [nodeId] : []);
    const status = replica.initialized && !replica.isShutdown ? replica.getStatus() : null;
    result.push({...membership, nodeId: replica.nodeId, replicaId: replica.replicaId, partitionId: NODES,
      isLeader: status?.isLeader === true && status.term === membership.term,
      rowReadState: read.state, rowReadReason: read.reason, rows: read.rows});
  }
  let partitionOwner = null;
  let partitionOwnerRead = {state: 'no_local_leader'};
  const leader = replicas(PARTITIONS).find((service) => service.isLeader);
  if (leader) {
    const tenure = leader.leadershipTenure;
    const read = await localRows(leader,
      'SELECT partition_id, leader_node_id, leader_term FROM partitions WHERE partition_id = ?', [NODES]);
    const row = read.rows?.[0];
    partitionOwnerRead = {state: read.state, reason: read.reason};
    if (row && tenure && leader.leadershipTenure === tenure && leader.isLeader) {
      partitionOwner = {...row, nodeId: leader.nodeId, replicaId: leader.replicaId, term: tenure.term};
    }
  }
  const cache = (nodes[0] ?? leader)?.systemTableCache;
  const projectedLeaderNodeId = cache?.get(TABLES.PARTITIONS, NODES)?.leader_node_id ?? null;
  return {replicas: result, partitionOwner, partitionOwnerRead, projectedLeaderNodeId, trace};
}

registerEmbeddedWorkerOperations({
  nodesLeaseView,
  nodesLeaseTransfer: async ({successorReplicaId}) => {
    const leader = replicas(NODES).find((service) => service.isLeader);
    if (!leader || !successorReplicaId || successorReplicaId === leader.replicaId) {
      throw new Error('Transfer requires the current nodes-p1 leader and a named peer');
    }
    const membership = await readPartitionReplicaMembership(leader, leader.replicaId);
    if (!membership.gateOpen || !membership.voterReplicaIds?.includes(successorReplicaId) ||
        membership.votersOutgoingReplicaIds?.length !== 0 || leader.getCurrentTerm() !== membership.term ||
        !leader.isLeader) throw new Error('Named transfer peer is outside the current stable voter set');
    return turnChainValue(leader.requestLeadershipTransfer({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: successorReplicaId,
    }));
  },
  nodesLeaseGate: ({enabled}) => {
    gateEnabled = enabled === true;
    return {enabled: gateEnabled};
  },
  nodesLeaseFault: ({nodeId, mode}) => {
    if (typeof nodeId !== 'string' || !nodeId || !['lose_next', 'withhold', 'open'].includes(mode) ||
        (nodeId === '*' && mode === 'lose_next')) throw new Error('Invalid lease fault selector');
    if (nodeId === '*') modes.clear();
    modes.set(nodeId, mode);
    return {nodeId, mode};
  },
});
