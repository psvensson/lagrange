/**
 * Harness for the REPLACE source-removal owner evidence against a REAL
 * rs-raft group (quest replace-source-removal-owner, verification protocol
 * v2 phases 4-7; record quest-records/replace-source-removal-owner/
 * evidence-replace-owner-completion.md).
 *
 * The owner is a real RebalanceCoordinator on the REPLACE target's node. Its
 * witness is not a double: every READ_REPLICA_MEMBERSHIP and
 * RETIRE_REPLICA_PEER the owner sends is answered by the production seam
 * (readPartitionReplicaMembership / retirePartitionRaftPeer) over the named
 * replica's own rs-raft operation port in a PartitionNodeCluster (real
 * ports, one database file each, a transport this harness drives). The
 * target t is created from an oracle-built COMMITTED stamp (the fold of the
 * leader's durable log over the TEST'S founders) and admitted by a real
 * AddNode, so its committed configuration holds the source until a real
 * RemoveNode commits (D1/O1). The membership event reaches the owner through
 * the production relay (relayPartitionConsensusObservations ->
 * TrackedServiceRegistry -> attachReplicaConsensusEvents).
 *
 * The oracle (never the implementation's answer): the committed
 * configuration = the fold of a member's durable log, decoded with the
 * binding's own decoder on an independent connection, at that member's
 * durable commit index; and, once a founding member has caught up to the
 * leader's commit, its durable applied ConfState (O-a, O-b). The source's
 * raft peer id is the one the backend registered for it.
 *
 * Two things stay under the harness's control, never the owner's decision:
 *  - the fallback clock: every owner timer is held and fires only when a
 *    test fires it (frozen = zero fallback advance); the owner's clock is a
 *    controllable offset;
 *  - the source node's REMOVE_REPLICA effect: the source's lifecycle retires
 *    (its row reads REMOVING, its port stops answering); whether the leader's
 *    row-driven reconcile then proposes the RemoveNode is a world action a
 *    test takes or withholds (AN6: lost at the leader).
 */

import {EventEmitter} from 'node:events';

import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  durableAppliedState,
  durableHardState,
  durableLog,
  foldAt,
  logFold,
  reservedIdentities,
} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, NODE_STATE, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';
import {TrackedServiceRegistry} from
  '../../src/node/replica-handler-membership-relay.js';
import {
  relayPartitionConsensusObservations,
} from '../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {
  readPartitionReplicaMembership,
  retirePartitionRaftPeer,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../src/raft/raft-provider-contract-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';
import {
  createPublishedPlanningReadinessService,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';

// A priority control-plane partition: the named-target handoff (BR11) is
// part of the owner's path there. An ordinary partition has no handoff.
const PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const ORDINARY_PARTITION_ID = 'users-p1';
const NODE = Object.freeze({
  SOURCE: 'node-a',
  PEER_B: 'node-b',
  PEER_C: 'node-c',
  TARGET: 'node-d',
});
const READY_LEASE_EXTENSION_MS = 3_600_000;
const PLANNING_EPOCH = 7;
const SETTLE_TURNS = 40;
const RAFT_ROUNDS = 60;
const ELECTION_ROUNDS = 400;
// The timing PartitionNodeCluster hands every port; the witness read derives
// the group's transfer window from it (a finite W_max).
const GROUP_TIMING = Object.freeze({
  heartbeatMs: 50,
  baseElectionMinMs: 150,
  baseElectionMaxMs: 300,
  electionMinMs: 150,
  electionMaxMs: 300,
  tickIntervalMs: 10,
});
const ACCEPTED_TRANSFER_BRANCH = Object.freeze({
  [RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
  [RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_FORWARDED,
  [RAFT_LEADERSHIP_TRANSFER_REASON.ALREADY_LEADER]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.ALREADY_LEADER,
});
const TERMINAL_STEPS = Object.freeze(new Set([
  WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.FAILED]));

function configureRuntime() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetRuntime() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function readyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_EXTENSION_MS,
  };
}

function serviceRow(partitionId, replicaId, nodeId, raftRole,
  status = ReplicaStatus.ACTIVE) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status,
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

async function waitUntil(condition, turns = SETTLE_TURNS) {
  for (let turn = 0; turn < turns && !condition(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return condition();
}

async function settleTurns(turns = SETTLE_TURNS) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The node's system-table cache with the production cache's change-listener
// contract, told only of rows another node wrote (as the reduced double
// always was); the owner's own writes stay silent.
function createObservedCache(data) {
  const cache = createMockCache(data);
  const listeners = new Set();
  cache.onCacheChange = (listener) => listeners.add(listener);
  cache.offCacheChange = (listener) => listeners.delete(listener);
  cache.observeRemoteRow = (tableName, row) => {
    cache.upsert(tableName, row);
    Promise.resolve().then(() => {
      for (const listener of [...listeners]) {
        listener(tableName, CDC_OPERATION.UPDATE, {...row}, null);
      }
    });
  };
  return cache;
}

// The readiness owner as remove safety reads it: published, every node
// active, with the publication subscription (a wake) and the epoch.
function createReadiness(world, nodeIds) {
  const listeners = new Set();
  const base = createPublishedPlanningReadinessService({
    publicationStatus: 'PUBLISHED',
    activeNodeIds: nodeIds,
    membershipTargetNodeId: world.targetNodeId,
  });
  return {
    ...base,
    getCurrentPublishedMembershipEpochSync() {
      return world.epoch;
    },
    subscribeReadinessPlanningSnapshots(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(nodeId) {
      for (const listener of [...listeners]) {
        listener({ownerKey: nodeId, snapshot: base.getNodeReadinessSync(nodeId)});
      }
    },
  };
}

/**
 * The real group: founders (the source first), then the target created from
 * the oracle stamp and admitted by a real AddNode.
 */
class RealGroup {
  constructor({partitionId, members, targetReplicaId, capDelivery = null}) {
    this.partitionId = partitionId;
    this.members = members;
    this.targetReplicaId = targetReplicaId;
    this.founders = members.filter(([replicaId]) => replicaId !== targetReplicaId)
      .map(([replicaId]) => replicaId);
    this.dead = new Set();
    this.cap = {value: Number.POSITIVE_INFINITY};
    const capDeliveryTo = capDelivery;
    let cluster = null;
    cluster = new PartitionNodeCluster({
      partitionId,
      replicaIds: this.founders,
      timingFor: () => GROUP_TIMING,
      sendFor: (fromReplicaId, address, packet) => {
        if (capDeliveryTo === null ||
            address !== cluster.addressOf(capDeliveryTo) ||
            cluster.isolated.has(fromReplicaId) ||
            cluster.isolated.has(capDeliveryTo)) {
          return undefined;
        }
        cluster.replica(capDeliveryTo).inbox.push({...packet,
          message: this.cappedMessage(packet.message)});
        return null;
      },
    });
    this.cluster = cluster;
    this.cluster.tickers = [this.founders[0]];
    this.genesisPeerIds = null;
    this.rowDrivenProposals = [];
  }

  // Envelopes to the capped replica carry at most cap.value of the log and
  // of the commit index (a replica that holds a prefix).
  cappedMessage(message) {
    const capped = {...message};
    if (Array.isArray(message.entries)) {
      capped.entries = message.entries.filter((entry) =>
        Number(entry.index) <= this.cap.value);
    }
    if (message.commit !== undefined) {
      capped.commit = String(Math.min(Number(message.commit), this.cap.value));
    }
    return capped;
  }

  live() {
    return [...this.cluster.replicas.keys()].filter((replicaId) =>
      !this.cluster.isolated.has(replicaId) && !this.dead.has(replicaId));
  }

  roleOf(replicaId) {
    return this.cluster.node(replicaId).readStatus().role;
  }

  leader() {
    return this.live().find((replicaId) =>
      this.roleOf(replicaId) === RAFT_ROLE.LEADER) ?? null;
  }

  peerIdOf(replicaId) {
    return String(this.cluster.raftPeerIdOf(replicaId));
  }

  settle(predicate, rounds = RAFT_ROUNDS) {
    this.cluster.tickers = this.live();
    return this.cluster.settle(predicate, {rounds});
  }

  /** Advance raft: ticks and deliveries, nothing else. */
  advance(rounds = RAFT_ROUNDS) {
    this.settle(() => false, rounds);
  }

  electLeader(preferred) {
    this.cluster.tickers = [preferred];
    const elected = this.cluster.settle(() => this.leader() === preferred,
      {rounds: ELECTION_ROUNDS});
    if (!elected) {
      throw new Error(`setup: ${preferred} did not become leader`);
    }
    this.genesisPeerIds = this.founders.map((replicaId) =>
      this.peerIdOf(replicaId));
  }

  // The COMMITTED stamp a correct leader answers, built from the oracles.
  oracleStamp() {
    const leader = this.leader();
    const dbFile = this.cluster.replica(leader).dbFile;
    const applied = durableAppliedState(dbFile, this.partitionId);
    const voters = foldAt(logFold(dbFile, this.partitionId,
      this.genesisPeerIds), applied.appliedIndex).voters;
    const reserved = reservedIdentities(dbFile);
    return {
      kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
      voters,
      votersOutgoing: [],
      learners: [],
      appliedIndex: applied.appliedIndex,
      commitIndex: applied.appliedIndex,
      term: 1,
      leaderId: leader,
      gateOpen: true,
      identities: Object.fromEntries(voters.map((peerId) =>
        [peerId, reserved.get(peerId)])),
    };
  }

  // A change through the canonical port on the current leader, settled until
  // the leader's applied configuration shows it (a dropped proposal is
  // proposed again).
  commitChange(type, replicaId) {
    const adds = type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER;
    const shows = () => {
      const now = this.leader();
      return now !== null && durableAppliedState(
        this.cluster.replica(now).dbFile, this.partitionId).voters
        .includes(this.peerIdOf(replicaId)) === adds;
    };
    for (let attempt = 0; attempt < 20 && !shows(); attempt += 1) {
      this.cluster.node(this.leader()).proposeConfChange({
        type, replicaIdentity: replicaId});
      this.settle(shows, 20);
    }
    if (!this.settle(shows, ELECTION_ROUNDS)) {
      throw new Error(`setup: ${type} ${replicaId} did not apply`);
    }
  }

  /**
   * Create the target from the oracle stamp; admit it unless told not to.
   * With capBeforeAdmission the target's deliveries are capped just below
   * its own AddNode, so the admission commits at the leader while the target
   * stays below its participation gate (B13).
   */
  addTarget({admit = true, capBeforeAdmission = false} = {}) {
    const stamp = this.oracleStamp();
    const hints = [...Object.values(stamp.identities), this.targetReplicaId];
    this.cluster.addReplica(this.targetReplicaId, hints,
      {[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
    if (capBeforeAdmission) {
      this.cap.value = durableLog(this.cluster.replica(this.leader()).dbFile,
        this.partitionId).at(-1).index;
    }
    if (admit) {
      this.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
        this.targetReplicaId);
      this.settle(() =>
        this.cluster.node(this.targetReplicaId).readStatus().gateOpen === true,
      ELECTION_ROUNDS);
    }
    return stamp;
  }

  serviceOf(replicaId) {
    return {
      raft: this.cluster.node(replicaId),
      replicaId,
      partitionId: this.partitionId,
      replicaIds: this.live(),
      raftTimingConfig: GROUP_TIMING,
    };
  }

  /**
   * The committed configuration: the fold of the durable log of the member
   * with the highest durable commit index, at that index (every member's
   * committed prefix agrees).
   * @return {Object} {voters, commitIndex, member}.
   */
  committedConfiguration() {
    let best = null;
    for (const replicaId of this.cluster.replicas.keys()) {
      const hard = durableHardState(this.cluster.replica(replicaId).dbFile,
        this.partitionId);
      if (hard && (best === null || Number(hard.commit) > best.commit)) {
        best = {member: replicaId, commit: Number(hard.commit)};
      }
    }
    const fold = logFold(this.cluster.replica(best.member).dbFile,
      this.partitionId, this.genesisPeerIds);
    return {member: best.member, commitIndex: best.commit,
      voters: foldAt(fold, best.commit).voters};
  }

  /** Whether the source's peer id is in the committed voters (the oracle). */
  sourceCommittedVoter(sourceReplicaId) {
    return this.committedConfiguration().voters
      .includes(this.peerIdOf(sourceReplicaId));
  }

  /**
   * O-b: a founding member other than the source and the target, caught up
   * to the highest commit: its durable applied ConfState.
   * @param {string} sourceReplicaId
   * @return {Object|null} {voters, appliedIndex, member} or null.
   */
  caughtUpFounderView(sourceReplicaId) {
    const committed = this.committedConfiguration();
    const founder = this.founders.find((replicaId) =>
      replicaId !== sourceReplicaId && !this.dead.has(replicaId));
    if (!founder) {
      return null;
    }
    this.settle(() => durableAppliedState(this.cluster.replica(founder).dbFile,
      this.partitionId).appliedIndex >= committed.commitIndex, ELECTION_ROUNDS);
    const applied = durableAppliedState(this.cluster.replica(founder).dbFile,
      this.partitionId);
    return {member: founder, voters: applied.voters,
      appliedIndex: applied.appliedIndex};
  }

  /** The leader's row-driven reconcile: propose RemoveNode of a retiring row. */
  rowDrivenRemoval(sourceReplicaId) {
    const leader = this.leader();
    if (leader === null) {
      return null;
    }
    const answer = this.cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: sourceReplicaId,
    });
    this.rowDrivenProposals.push({leader, answer});
    return answer;
  }

  /** The replica's process is gone: it neither answers nor talks raft. */
  kill(replicaId) {
    this.dead.add(replicaId);
    this.cluster.isolate(replicaId);
  }

  dispose() {
    this.cluster.dispose();
  }
}

/**
 * A REPLACE world: the real group, the owner (a real coordinator on the
 * target's node), the source node's effect, the relay, the held fallback
 * clock, and the oracle capture of every terminal write.
 * @param {Object} options
 * @param {string} [options.partitionId]
 * @param {boolean} [options.sourceLeads] - The source leads at creation.
 * @param {number} [options.replicaCount] - 3 (four members with t) or 1.
 * @param {string|null} [options.capDelivery] - A replica whose deliveries
 *   this world caps (AN11 / B13).
 * @return {Object} The world.
 */
function createReplaceWorld(options = {}) {
  configureRuntime();
  const partitionId = options.partitionId ?? PRIORITY_PARTITION_ID;
  const replicaCount = options.replicaCount ?? 3;
  const sourceReplicaId = `${partitionId}-r1`;
  const targetReplicaId = `${partitionId}-r4`;
  const members = replicaCount === 1 ?
    [[sourceReplicaId, NODE.SOURCE], [targetReplicaId, NODE.TARGET]] :
    [
      [sourceReplicaId, NODE.SOURCE],
      [`${partitionId}-r2`, NODE.PEER_B],
      [`${partitionId}-r3`, NODE.PEER_C],
      [targetReplicaId, NODE.TARGET],
    ];
  const nodeIds = members.map(([, nodeId]) => nodeId);
  const group = new RealGroup({partitionId, members, targetReplicaId,
    capDelivery: options.capDelivery ?? null});
  const initialLeader = options.sourceLeads === false && replicaCount !== 1 ?
    members[1][0] : sourceReplicaId;
  group.electLeader(initialLeader);
  group.addTarget({admit: options.admitTarget !== false,
    capBeforeAdmission: options.capBeforeAdmission === true});

  // The owner: the target's node for a priority partition, the source's node
  // for an ordinary one (A1; the witness is then read remotely).
  const ownerNodeId = options.ownerNodeId ??
    (partitionId === ORDINARY_PARTITION_ID ? NODE.SOURCE : NODE.TARGET);
  const world = {
    partitionId,
    sourceReplicaId,
    targetReplicaId,
    sourceNodeId: NODE.SOURCE,
    targetNodeId: NODE.TARGET,
    ownerNodeId,
    members,
    nodeIds,
    group,
    epoch: PLANNING_EPOCH,
    clockOffsetMs: 0,
    fallbackTimers: [],
    deliveries: [],
    stepDowns: [],
    removeEffects: [],
    retirements: [],
    witnessReads: [],
    terminalWrites: [],
    eventsSuppressed: false,
    // How the source node answers REMOVE_REPLICA: retire (its row reads
    // REMOVING and its port stops, the production order: retireReplica
    // before the REMOVING row, and the port refuses every step once
    // retiring), or a status the test names.
    removeEffectAnswer: null,
    // Control (not production): the source's port keeps stepping after the
    // effect, so its own removal can still be acked by it.
    sourceStopsAtEffect: options.sourceStopsAtEffect !== false,
    // Answers a test holds in flight (a decision taken meanwhile is
    // decide-first): the next STEP_DOWN answer, the next witness read.
    holdNextStepDown: false,
    heldStepDown: null,
    holdNextWitnessRead: false,
    heldWitnessRead: null,
    coordinator: null,
    cache: null,
    registry: new TrackedServiceRegistry(),
    relayCount: 0,
  };
  world.readiness = createReadiness(world, nodeIds);
  world.cache = createObservedCache({
    nodes: nodeIds.map(readyNode),
    services: members.map(([replicaId, nodeId]) => serviceRow(partitionId,
      replicaId, nodeId, replicaId === initialLeader ? 'leader' : 'follower')),
  });
  // The production relay from the target's port to the node's registry.
  const relayed = new EventEmitter();
  relayed.partitionId = partitionId;
  relayed.replicaId = targetReplicaId;
  relayed.raft = group.cluster.node(targetReplicaId);
  relayPartitionConsensusObservations(relayed);
  world.registry.set(targetReplicaId, relayed);
  world.relay = {
    subscribe(listener) {
      return world.registry.subscribeConsensusObservations((event) => {
        world.relayCount += 1;
        if (!world.eventsSuppressed) {
          listener(event);
        }
      });
    },
  };
  return world;
}

// The transfer each handoff reason asks for, from the tracked role (the
// handler's own rule); null when the role makes it a named no-op.
function transferRequestOf(reason, replicaId, trackedRole) {
  if (reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION) {
    return trackedRole === RAFT_ROLE.FOLLOWER ? {
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: replicaId,
    } : null;
  }
  return trackedRole === RAFT_ROLE.LEADER ?
    {successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP} : null;
}

function roleNoOpBranchOf(reason) {
  return reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION ?
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP :
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.SOURCE_DEMOTION_ROLE_NO_OP;
}

function answerStepDown(world, payload) {
  const replicaId = payload[ReplicaOperationField.REPLICA_ID];
  const reason = payload[ReplicaOperationField.REASON];
  const echo = {
    [ReplicaOperationField.ATTEMPT_SEQ]:
      payload[ReplicaOperationField.ATTEMPT_SEQ],
    operationId: payload[ReplicaOperationField.OPERATION_ID],
    replicaId,
  };
  if (world.group.dead.has(replicaId)) {
    throw new Error('delivery failed: replica dead');
  }
  if (!world.group.cluster.replicas.has(replicaId)) {
    return {status: ReplicaOperationResponseStatus.NOT_FOUND, ...echo};
  }
  const trackedRole = world.group.roleOf(replicaId);
  const request = transferRequestOf(reason, replicaId, trackedRole);
  if (request === null) {
    return {status: ReplicaOperationResponseStatus.COMPLETED, ...echo,
      handoffBranch: roleNoOpBranchOf(reason),
      handoffTrackedRole: trackedRole};
  }
  const answer = world.group.cluster.node(replicaId).transferLeadership(request);
  const accepted = answer?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    Object.hasOwn(ACCEPTED_TRANSFER_BRANCH, answer.reason);
  return accepted ? {
    status: ReplicaOperationResponseStatus.COMPLETED, ...echo,
    handoffBranch: ACCEPTED_TRANSFER_BRANCH[answer.reason],
    handoffTrackedRole: trackedRole, handoffTransfer: answer,
  } : {
    status: ReplicaOperationResponseStatus.ERROR, ...echo,
    error: `step-down transfer refused: ${answer?.reason}`,
    handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REFUSED,
    handoffTransfer: answer ?? null,
  };
}

function sourceRowStatus(world) {
  return world.cache.get('services', world.sourceReplicaId)?.status ?? null;
}

function setSourceRow(world, status) {
  if (status === null) {
    world.cache.delete('services', world.sourceReplicaId);
    return;
  }
  world.cache.upsert('services', serviceRow(world.partitionId,
    world.sourceReplicaId, world.sourceNodeId, 'follower', status));
}

function setTargetRow(world, status) {
  world.cache.upsert('services', serviceRow(world.partitionId,
    world.targetReplicaId, world.targetNodeId, 'follower', status));
}

// The source node's handler answering REMOVE_REPLICA: the source's
// lifecycle retires (its row reads REMOVING; its process stops).
function answerRemoveEffect(world, payload) {
  world.removeEffects.push(payload);
  if (world.removeEffectAnswer) {
    return world.removeEffectAnswer;
  }
  if (sourceRowStatus(world) === ReplicaStatus.ACTIVE) {
    setSourceRow(world, ReplicaStatus.REMOVING);
  }
  if (world.sourceStopsAtEffect) {
    world.group.kill(world.sourceReplicaId);
  }
  return {acknowledged: true, status: ReplicaOperationResponseStatus.INITIATED};
}

const UNREACHABLE_ANSWER = Object.freeze({
  status: ReplicaOperationResponseStatus.ERROR,
  error: 'replica unreachable',
});

// READ_REPLICA_MEMBERSHIP answered by the production seam over the named
// replica's own port.
async function answerWitnessRead(world, payload) {
  const replicaId = payload[ReplicaOperationField.REPLICA_ID];
  world.witnessReads.push(replicaId);
  if (world.holdNextWitnessRead) {
    world.holdNextWitnessRead = false;
    await new Promise((resolve) => {
      world.heldWitnessRead = {release: resolve};
    });
  }
  if (!world.group.cluster.replicas.has(replicaId)) {
    return {status: ReplicaOperationResponseStatus.NOT_FOUND};
  }
  if (world.group.dead.has(replicaId)) {
    return UNREACHABLE_ANSWER;
  }
  return {
    status: ReplicaOperationResponseStatus.COMPLETED,
    [ReplicaOperationField.MEMBERSHIP]: await readPartitionReplicaMembership(
      world.group.serviceOf(replicaId),
      payload[ReplicaOperationField.SOURCE_REPLICA_ID]),
  };
}

// RETIRE_REPLICA_PEER: the production seam proposes REMOVE_PEER through the
// named replica's own port.
async function answerRetirement(world, payload) {
  const replicaId = payload[ReplicaOperationField.REPLICA_ID];
  world.retirements.push(payload);
  if (world.group.dead.has(replicaId)) {
    return UNREACHABLE_ANSWER;
  }
  return {
    status: ReplicaOperationResponseStatus.INITIATED,
    [ReplicaOperationField.PROPOSAL]: await retirePartitionRaftPeer(
      world.group.serviceOf(replicaId),
      payload[ReplicaOperationField.SOURCE_REPLICA_ID]),
  };
}

async function answerHeldStepDown(world, payload) {
  world.stepDowns.push(payload);
  if (world.holdNextStepDown) {
    world.holdNextStepDown = false;
    const answer = await new Promise((resolve) => {
      world.heldStepDown = {release: resolve};
    });
    if (answer) {
      return answer;
    }
  }
  return answerStepDown(world, payload);
}

const MESSAGE_ANSWERS = Object.freeze({
  [ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP]: answerWitnessRead,
  [ReplicaOperationMessageType.RETIRE_REPLICA_PEER]: answerRetirement,
  [ReplicaOperationMessageType.STEP_DOWN_REPLICA]: answerHeldStepDown,
  [ReplicaOperationMessageType.REMOVE_REPLICA]: answerRemoveEffect,
});

async function deliver(world, target, payload) {
  world.deliveries.push({target, payload});
  const answer = MESSAGE_ANSWERS[payload?.[ReplicaOperationField.TYPE]];
  return answer ? answer(world, payload) :
    {acknowledged: true, status: ReplicaOperationResponseStatus.INITIATED};
}

// Every terminal write is captured with the oracle read at that instant.
function isCapturedTerminalWrite(operation, persistOptions, result) {
  return TERMINAL_STEPS.has(operation?.workflowStep) &&
    persistOptions?.terminalTransition === true &&
    result?.persisted !== false;
}

// One terminal write with the oracle read at that instant. The durable row
// after the write comes from the authority read: the test double's SQL
// fallback answers a terminal statement without its affected-row count, so
// the disposition alone is not the durable outcome.
async function captureTerminalWrite(world, repository, operation, result) {
  const durable = await repository
    .queryReplicaOperationPersistenceAuthorityOperation(operation);
  world.terminalWrites.push(Object.freeze({
    operationId: operation.operationId,
    step: operation.workflowStep,
    disposition: result?.disposition ?? null,
    durableStepAfter: durable?.workflowStep ?? null,
    errorMessage: operation.errorMessage ?? null,
    sourceCommittedVoter:
      world.group.sourceCommittedVoter(world.sourceReplicaId),
    committed: world.group.committedConfiguration(),
    targetRowStatus: world.cache.get('services', world.targetReplicaId)
      ?.status ?? null,
    sourceRowStatus: sourceRowStatus(world),
    edge: world.currentEdge ?? null,
  }));
}

function captureTerminalWrites(world, coordinator) {
  const repository = coordinator.repository;
  const base = repository.persistOperationUpdate.bind(repository);
  repository.persistOperationUpdate = async (operation, persistOptions) => {
    const result = await base(operation, persistOptions);
    if (isCapturedTerminalWrite(operation, persistOptions, result)) {
      await captureTerminalWrite(world, repository, operation, result);
    }
    return result;
  };
}

function startCoordinator(world) {
  const coordinator = createTestCoordinator({
    nodeId: world.ownerNodeId,
    enableTimeouts: false,
    replaceWitness: false,
    systemTableCache: world.cache,
    messageRouter: {
      deliver: (target, payload) => deliver(world, target, payload),
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    controlPlaneReadinessService: world.readiness,
    tablePolicyService: {getPolicyForPartition: () =>
      ({minReplicaCount: world.members.length - 1})},
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, cleared: false, fired: false, unref() {}};
      world.fallbackTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });
  coordinator.workflowOwner.timeSource = {
    now: () => Date.now() + world.clockOffsetMs,
  };
  coordinator.initialize();
  coordinator.attachReplicaConsensusEvents(world.relay);
  captureTerminalWrites(world, coordinator);
  world.coordinator = coordinator;
  return coordinator;
}

async function createReplace(world) {
  const coordinator = world.coordinator;
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: world.partitionId,
    nodeId: world.targetNodeId,
    sourceNodeId: world.sourceNodeId,
    replicaId: world.sourceReplicaId,
    membershipPublicationEpoch: PLANNING_EPOCH,
  });
  operation.replicaId = world.targetReplicaId;
  operation.workflowStep = WORKFLOW_STEP.ACTIVE;
  operation.status = ReplicaStatus.ACTIVE;
  await coordinator.repository.persistOperationUpdate(operation);
  const row = world.cache.get('replica_operations', operation.operationId);
  world.cache.upsert('replica_operations',
    {...row, membership_publication_epoch: PLANNING_EPOCH});
  operation.membershipPublicationEpoch = PLANNING_EPOCH;
  world.operation = operation;
  return operation;
}

async function readPersisted(world) {
  return world.coordinator.getOperation(world.operation.operationId);
}

async function fireFallbackTimers(world) {
  let fired = 0;
  for (const handle of world.fallbackTimers.splice(0)) {
    if (!handle.cleared) {
      handle.fired = true;
      fired += 1;
      await handle.fn();
    }
  }
  return fired;
}

function firedTimerCount(world) {
  return world.fallbackTimers.filter((handle) => handle.fired).length;
}

/**
 * Every owner entry route once, after the clock advanced (no raft advance).
 * @param {Object} world
 * @param {number} advanceMs
 */
async function enterOwnerAfter(world, advanceMs) {
  world.clockOffsetMs += advanceMs;
  await fireFallbackTimers(world);
  await settleTurns();
  await world.coordinator.checkTimeouts();
  await settleTurns();
  await world.coordinator.reconcileOrphanedOperations();
  await settleTurns();
  await world.coordinator.reconcileOperationProgress(await readPersisted(world));
  await settleTurns();
}

/**
 * Drive the REPLACE from ACTIVE to its durable removal intent: the named
 * handoff moves leadership to the target (priority partitions), remove
 * safety answers SAFE, the intent is persisted and REMOVE_REPLICA leaves.
 * @param {Object} world
 * @param {Object} [options] - {rounds}: owner entries to spend.
 * @return {Promise<Object>} The persisted operation.
 */
async function driveToIntent(world, {rounds = 8} = {}) {
  for (let round = 0; round < rounds; round += 1) {
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    const persisted = await readPersisted(world);
    if (persisted.workflowStep === WORKFLOW_STEP.STOPPING ||
        TERMINAL_STEPS.has(persisted.workflowStep)) {
      return persisted;
    }
    // The handoff takes effect in the group; the transfer window elapses.
    world.group.advance();
    world.clockOffsetMs += GROUP_TIMING.baseElectionMaxMs * 4;
  }
  return readPersisted(world);
}

/**
 * Run the group and the owner until the REPLACE is terminal or the round
 * bound is reached. Each round advances raft (deliveries, ticks), lets the
 * wakes run, then advances the fallback clock and fires the held timers.
 * @param {Object} world
 * @param {Object} [options] - {rounds, useFallback, advanceMs}.
 * @return {Promise<Object>} {workflowStep, rounds}.
 */
async function runToQuiescence(world, {rounds = 12, useFallback = true,
  advanceMs = 1_100} = {}) {
  for (let round = 0; round < rounds; round += 1) {
    world.group.advance();
    await settleTurns();
    const persisted = await readPersisted(world);
    if (TERMINAL_STEPS.has(persisted?.workflowStep)) {
      return {workflowStep: persisted.workflowStep, rounds: round};
    }
    if (useFallback) {
      world.clockOffsetMs += advanceMs;
      await fireFallbackTimers(world);
      await settleTurns();
    }
  }
  const persisted = await readPersisted(world);
  return {workflowStep: persisted?.workflowStep ?? null, rounds};
}

async function disposeWorld(world) {
  try {
    if (world.coordinator) {
      await world.coordinator.shutdown();
    }
  } finally {
    world.registry.clear();
    world.group.dispose();
    resetRuntime();
  }
}

/**
 * A world with its coordinator started and one REPLACE at ACTIVE.
 * @param {Object} [options] - createReplaceWorld options.
 * @return {Promise<Object>}
 */
async function openReplaceWorld(options = {}) {
  const world = createReplaceWorld(options);
  try {
    startCoordinator(world);
    await createReplace(world);
  } catch (error) {
    await disposeWorld(world);
    throw error;
  }
  return world;
}

export {
  ORDINARY_PARTITION_ID,
  PRIORITY_PARTITION_ID,
  NODE,
  disposeWorld,
  driveToIntent,
  enterOwnerAfter,
  fireFallbackTimers,
  firedTimerCount,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  serviceRow,
  setSourceRow,
  setTargetRow,
  settleTurns,
  startCoordinator,
  waitUntil,
};
