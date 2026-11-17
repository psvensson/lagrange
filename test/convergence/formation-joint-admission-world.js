// The formation world of the joint-admission release-liveness reproducer
// (quest formation-ready-lease-independent-of-spread): one seed and its
// joiners, each node the REAL control-plane owners of a production node
// (createSimulatedNodeHosts: readiness service, membership publication
// coordinator, gateway, CDC owner, heartbeat service, rebalance coordinator)
// over ONE durable row store, on ONE clock that never moves.
//
// What is a double here, and why none can hide the defect under test:
//   - the clock: a VirtualTimeSource that is never advanced past its start.
//     Only work already due at that instant runs; a timer with a positive
//     delay stays armed and is reported, never fired;
//   - the transport: every started node is connected to every other one at
//     boot incarnation 1 (the routers are real but never open a socket), and
//     the durable row store is shared, so replication has zero latency. The
//     measured deadlock had no partition and no replication lag;
//   - consensus: a partition's leader is the node its partition row names and
//     a node holds a replica where a services row says so;
//   - the node-local publication mode (CDC group propagation), which the
//     measured joiners had already passed.
// Every decision the claim is about (READY publication, startup authority,
// membership derivation, planning, admission, remove safety) is the
// production owner's, over the rows below.

import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_SCHEMAS,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  seedMessageGroupRow,
  seedPartitionRow,
  seedTableRow,
} from '../../src/bootstrap/seed-foundation-rows.js';
import {
  buildClusterIncarnationFence,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  NodeRegistrationOwner,
} from '../../src/bootstrap/shared/node-registration-owner.js';
import {
  STORAGE_INCARNATION_FIELD,
  STORAGE_INCARNATION_METADATA_KEY,
} from '../../src/bootstrap/shared/node-registration-owner-constants.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION, COLUMN, ENDPOINT_STATUS, SERVICE_STATUS, STATE, TABLES,
  TRANSPORT_TYPE, WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  NodeLifecyclePublication,
} from '../../src/control-plane/node-lifecycle-publication.js';
import {
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';
import {
  ReplicaDispatchService,
} from '../../src/control-plane/replica-dispatch-service.js';
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  NodeReadyLeaseAuthority,
} from '../../src/control-plane/node-ready-lease-authority.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildDeliveryEnvelope,
  deliveryAnswerOf,
} from '../../src/transport/transport-semantic-outcome.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  createNodeEntry,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {
  withFixtureCommittedMembership,
} from '../rebalancer/committed-membership-fixture.js';
import {withFixtureReplaceWitness} from '../rebalancer/test-helpers.js';
import {
  createPriorityPartitionRebalancer,
  createSimulatedNodeHosts,
} from '../simulation/formation-sim-node-hosts.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const SEED_NODE_ID = 'seed';
const WORLD_START_MS = Date.UTC(2026, 10, 14, 12, 31, 2);
const WORLD_CACHE_ID = 'formation-world/cache';
const NODE_ADDRESS_PREFIX = 'ws://';
const NODE_ADDRESS_SUFFIX = ':9000';
const READY_LEASE_MS = 30000;
const STORAGE_BUDGET_BYTES = 64 * 1024 * 1024 * 1024;
const STORAGE_BUDGET_SOURCE = 'configured';
const DUE_NOW_DELAY_MS = 0;
const SETTLE_TURNS = 12;
const SETTLE_ROUND_LIMIT = 400;
const QUIET_ROUNDS_TO_SETTLE = 2;
const STACK_LINE_SEPARATOR = '\n';
// A stack frame of production source: the repository's own src directory.
const SOURCE_FRAME_MARKER = new URL('../../src/', import.meta.url).pathname;
const SOURCE_FRAME_PREFIX = 'src/';
const UNKNOWN_ARMING_SOURCE = 'unknown';
const ARMING_FRAME_LIMIT = 6;
const RANDOM_SEED = 20261114;
const LEADER_TERM = 1;
const LEADER_COMMIT_INDEX = 1;
const SCHEMA_BY_TABLE_ID = Object.freeze(Object.fromEntries(
  SYSTEM_TABLE_SCHEMAS.map((schema) => [schema.tableName, schema])));
const PRIORITY_TABLE_IDS = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS].sort());
const PRIORITY_PARTITION_IDS = Object.freeze(
  PRIORITY_TABLE_IDS.map((tableId) => INITIAL_PARTITION_IDS[tableId]));
const FOLLOWER_SERVICE = Object.freeze({getRole: () => RAFT_ROLE.FOLLOWER});
// The two startup-branch fences the entrypoint resolves: the seed boots over
// a fresh data directory; a joiner persists its rejoin hints (identity and
// the seed's address) before it resolves its own.
const SEED_FENCE = buildClusterIncarnationFence({durableStateDetected: false});
const PUBLICATION_MODE_ENTERED_AT = new Date(WORLD_START_MS).toISOString();
const PUBLICATION_MODE_GROUPED = Object.freeze({
  currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
  reasonCode: null,
  enteredAt: PUBLICATION_MODE_ENTERED_AT,
  recentTransitions: Object.freeze([]),
});
// What a node's CDC group propagation reports while a joiner's message group
// is not active yet: the fan-out is conservative until the group is.
const PUBLICATION_MODE_JOINER_GROUP_PENDING = Object.freeze({
  currentMode: CONTROL_PLANE_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
  reasonCode: 'missing_active_groups',
  enteredAt: PUBLICATION_MODE_ENTERED_AT,
  recentTransitions: Object.freeze([]),
});
const LINK_KEY_SEPARATOR = '<->';
const ADDRESS_SEPARATOR = '/';
const REPLICA_HANDLER_SERVICE = 'replica-handler';
const REPLICA_DISPATCH_SERVICE = 'replica-dispatch';
const LEARNER_SERVICE = Object.freeze({getRole: () => RAFT_ROLE.LEARNER});
const HANDOFF_PUBLICATION_KIND = 'formation_release_handoff';
const PUBLICATION_KIND_COLUMN = 'publication_kind';
const PUBLICATION_ID_COLUMN = 'publication_id';

function nodeAddressOf(nodeId) {
  return `${NODE_ADDRESS_PREFIX}${nodeId}${NODE_ADDRESS_SUFFIX}`;
}

// World time. The clock moves only by the evaluation instants the driver
// takes (one millisecond each), so it never reaches a delay any owner armed:
// advance(0) runs only what is due at the current instant (deferred
// continuations), and a macrotask turn lets promise chains reach their next
// deferral. A timer armed with a positive delay stays armed, recorded with
// the source frames that armed it. The driver may STEP a named cadence: the
// timers one owner's retry or re-evaluation site armed are run once, as if
// their delay had elapsed, without moving the clock. Every other armed timer
// (a bound, a timeout, a deadline) never runs, and the report names it.
//
// Every owner's timers are the world's: a timer an owner arms on the
// platform globals is armed on the world clock too, for the lifetime of the
// world (restore() puts the platform back). The platform Date.now is NOT the
// world's: owners that stamp a durable write with it order two writes of one
// evaluation instant by it (the removed handoff publication did), and a
// clock that stands still inside an instant would refuse the second write.
// It therefore keeps running; no decision of the claim reads a duration
// from it against a world-clock stamp. A scenario whose claim does (an owner
// that reads the platform clock against a world-clock lease, as the
// background placement path's transport readiness does) pins the platform
// clock to the world clock instead: one clock, as in production.
function armingSourceFrames() {
  return String(new Error().stack).split(STACK_LINE_SEPARATOR)
    .filter((line) => line.includes(SOURCE_FRAME_MARKER))
    .slice(0, ARMING_FRAME_LIMIT)
    .map((line) => SOURCE_FRAME_PREFIX + line.slice(
      line.indexOf(SOURCE_FRAME_MARKER) + SOURCE_FRAME_MARKER.length)
      .replace(/\)$/u, ''));
}

function createWorldClock({platformClockIsWorldClock = false} = {}) {
  const clock = new VirtualTimeSource({startMs: WORLD_START_MS});
  const armed = new Map();
  const dueNow = new Set();
  const stepped = new Map();
  const baseSetTimeout = clock.setTimeout.bind(clock);
  const baseSetInterval = clock.setInterval.bind(clock);
  const baseClear = clock.clearTimeout.bind(clock);
  const runDueNow = (callback, args) => {
    const handle = baseSetTimeout((...fired) => {
      dueNow.delete(handle);
      return callback(...fired);
    }, DUE_NOW_DELAY_MS, ...args);
    dueNow.add(handle);
    return handle;
  };
  const arm = (schedule, repeating) => (callback, delayMs, ...args) => {
    const delay = Number.isFinite(Number(delayMs)) && Number(delayMs) > 0 ?
      Number(delayMs) : DUE_NOW_DELAY_MS;
    if (delay > DUE_NOW_DELAY_MS) {
      const handle = schedule(callback, delay, ...args);
      const frames = armingSourceFrames();
      armed.set(handle, {
        delayMs: delay,
        repeating,
        armedBy: frames[0] || UNKNOWN_ARMING_SOURCE,
        frames,
        armedAtMs: clock.now(),
        callback,
        args,
      });
      return handle;
    }
    return runDueNow(callback, args);
  };
  const clear = (handle) => {
    armed.delete(handle);
    dueNow.delete(handle);
    baseClear(handle);
  };
  clock.setTimeout = arm(baseSetTimeout, false);
  clock.setInterval = arm(baseSetInterval, true);
  clock.clearTimeout = clear;
  clock.clearInterval = clear;

  // The platform clock and timers, for owners that reach them directly.
  const platform = {
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout,
    clearInterval: globalThis.clearInterval,
    dateNow: Date.now,
  };
  if (platformClockIsWorldClock) {
    Date.now = () => clock.now();
  }
  const ownerHandles = new WeakSet();
  const armedByOwner = () =>
    String(new Error().stack).includes(SOURCE_FRAME_MARKER);
  const ownerTimer = (worldArm, platformArm) => (callback, delayMs, ...args) => {
    if (!armedByOwner()) return platformArm(callback, delayMs, ...args);
    const handle = {
      id: worldArm(callback, delayMs, ...args),
      ref: () => handle,
      unref: () => handle,
      hasRef: () => false,
    };
    ownerHandles.add(handle);
    return handle;
  };
  const ownerClear = (platformClear) => (handle) => {
    if (handle && typeof handle === 'object' && ownerHandles.has(handle)) {
      clear(handle.id);
      return;
    }
    platformClear(handle);
  };
  globalThis.setTimeout = ownerTimer(clock.setTimeout, platform.setTimeout);
  globalThis.setInterval = ownerTimer(clock.setInterval, platform.setInterval);
  globalThis.clearTimeout = ownerClear(platform.clearTimeout);
  globalThis.clearInterval = ownerClear(platform.clearInterval);

  return {
    clock,
    now: () => clock.now(),
    restore() {
      globalThis.setTimeout = platform.setTimeout;
      globalThis.setInterval = platform.setInterval;
      globalThis.clearTimeout = platform.clearTimeout;
      globalThis.clearInterval = platform.clearInterval;
      Date.now = platform.dateNow;
    },
    // The timers that are armed now: none of them has run unless a cadence
    // step ran it.
    armedTimers: () => [...armed.values()].map((timer) => ({
      delayMs: timer.delayMs,
      repeating: timer.repeating,
      armedBy: timer.armedBy,
      frames: timer.frames,
      armedAtMs: timer.armedAtMs,
    })),
    /**
     * Step one named cadence: run, once, every timer armed at one of the
     * cadence's sites. A one-shot timer is consumed; an interval stays armed.
     * @param {string} name the cadence
     * @param {Function} armedAtSite whether a timer belongs to the cadence
     * @return {number} the timers run
     */
    stepCadence(name, armedAtSite) {
      let ran = 0;
      for (const [handle, timer] of [...armed]) {
        if (!armedAtSite(timer)) continue;
        if (!timer.repeating) clear(handle);
        runDueNow(timer.callback, timer.args);
        ran += 1;
      }
      stepped.set(name, (stepped.get(name) || 0) + ran);
      return ran;
    },
    steppedCadences: () => Object.fromEntries(stepped),
    async settle() {
      let quietRounds = 0;
      for (let round = 0; round < SETTLE_ROUND_LIMIT; round += 1) {
        const hadDueWork = dueNow.size > 0;
        clock.advance(DUE_NOW_DELAY_MS);
        for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        quietRounds = hadDueWork || dueNow.size > 0 ? 0 : quietRounds + 1;
        if (quietRounds >= QUIET_ROUNDS_TO_SETTLE) return;
      }
      throw new Error('formation world did not quiesce at its instant');
    },
  };
}

// Consensus as the rows state it: the partition row names the leader, a
// services row is a replica.
function createRowPartitionAuthority(cache, hostsById, now) {
  return Object.freeze({
    resolvePartitionLeader(partitionId) {
      const leaderId =
        cache.get(TABLES.PARTITIONS, partitionId)?.[COLUMN.LEADER_NODE_ID];
      return leaderId ? Object.freeze({
        leaderId,
        term: LEADER_TERM,
        commitIndex: LEADER_COMMIT_INDEX,
        appliedIndex: LEADER_COMMIT_INDEX,
      }) : null;
    },
    // A node serves a partition locally where it holds a caught-up voter
    // replica of it; only the leader's answer carries the leader's read
    // authority (the node seam attaches the witness for the leader alone),
    // and a read that requires the leader is routed to the leader's node.
    hasLocalReplica(nodeId, partitionId) {
      return cache.filter(TABLES.SERVICES, (row) =>
        row[COLUMN.PARTITION_ID] === partitionId &&
        row[COLUMN.NODE_ID] === nodeId &&
        row[COLUMN.STATUS] === ReplicaStatus.ACTIVE &&
        row[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEARNER).length > 0;
    },
    resolveNodeSqlEngine: (nodeId) =>
      hostsById.get(nodeId)?.sqlQueryEngine || null,
    resolveNodeNow: now,
  });
}

// The transport double: a full mesh among the nodes that are up.
function linkKey(leftNodeId, rightNodeId) {
  return [leftNodeId, rightNodeId].sort().join(LINK_KEY_SEPARATOR);
}

function installMeshTransport(
  hosts,
  upNodeIds,
  downLinks,
  bootIncarnationByNodeId,
) {
  const router = hosts.messageRouter;
  const localNodeId = hosts.nodeId;
  const incarnationOf = (nodeId) =>
    bootIncarnationByNodeId.get(nodeId) ?? TEST_BOOT_INCARNATION;
  const isUp = (nodeId) => upNodeIds.has(nodeId) &&
    upNodeIds.has(localNodeId) &&
    !downLinks.has(linkKey(localNodeId, nodeId));
  router.getConnectionState = (nodeId) =>
    (isUp(nodeId) ? STATE.CONNECTED : null);
  router.getConnectedNodes = () =>
    [...upNodeIds].filter((nodeId) => nodeId !== localNodeId && isUp(nodeId));
  router.hasScheduledReconnect = () => false;
  router.pingNode = async (nodeId) => isUp(nodeId);
  router.isOutboundQueueAvailable = () => true;
  router.getQueryDataPlaneTransportReadiness = () =>
    ({ready: true, state: STATE.READY});
  router.getLocalBootIncarnationIdentity = () => {
    const bootIncarnation = incarnationOf(localNodeId);
    return Object.freeze({
      nodeId: localNodeId,
      bootIncarnation,
      connectionId: `local:${localNodeId}:${bootIncarnation}`,
    });
  };
  router.getCurrentPrimaryConnectionBootIncarnation = (nodeId) => {
    if (nodeId === localNodeId || !isUp(nodeId)) return null;
    const bootIncarnation = incarnationOf(nodeId);
    return Object.freeze({
      nodeId,
      bootIncarnation,
      connectionId: `primary:${nodeId}:${bootIncarnation}`,
    });
  };
}

// A durable row carries every column of its table (an unset one is SQL
// NULL): the row a registration producer builds is completed here the way
// the SQL store returns it.
function asStoredRow(tableName, row) {
  const stored = {};
  for (const column of SCHEMA_BY_TABLE_ID[tableName].columns) {
    stored[column.name] = row[column.name] ?? null;
  }
  return stored;
}

function insertStoredRow(cache, tableName, row) {
  cache.applySystemTableChange(
    tableName, CDC_OPERATION.INSERT, asStoredRow(tableName, row));
}

// The replica runtime of every node, at its two boundaries: the handler a
// node's `<node>/service/replica-handler` address reaches, and the executor
// outcomes that handler reports to the SAME node's coordinator
// (ExecutorOutcomeEmitter: replica-handler-create-methods.js reports
// REPLICA_CREATE_SYNCING when the replica's runtime is registered and
// REPLICA_CREATE_ACTIVE when it is voter-ready, before the SERVICES write;
// replica-handler-remove-execution-methods.js reports
// REPLICA_REMOVE_COMPLETED after the row is gone). It does to the durable
// replica rows what an admitted operation's handler does, and nothing else:
// a CREATE registers the replica as a SYNCING learner on the addressed node,
// a REMOVE marks its row REMOVING. One step of the runtime lets every
// learner catch up (voter-ready is reported, then its row turns ACTIVE
// voter, as the promoted replica's own lifecycle publishes it) and retires
// every REMOVING row (the row is deleted, then the removal is reported).
// The runtime never reads an operation row, a node row or a lease, and never
// completes, refuses, orders or retries anything: whether an operation is
// admitted, dispatched, complete, or safe to remove is decided by the
// coordinators and planners from the rows and reports it leaves behind. The
// operation id it reports under is the one the request carried.
function createReplicaRuntime(cache, now, reportExecutorOutcome) {
  const learners = new Map();
  const removals = new Map();
  const transfers = new Map();
  const retiredReplicaIds = new Set();
  const handled = [];
  // The replacement-target election (STEP_DOWN_REPLICA with
  // replace_target_leader_election, replica-handler-leader-handoff-methods.js):
  // a tracked follower's transfer is accepted (acceptance, never completion);
  // any other tracked role is the handler's named role no-op; an untracked
  // replica is NOT_FOUND. The accepted transfer completes at the next step.
  const answerStepDown = (nodeId, payload) => {
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    const row = cache.get(TABLES.SERVICES, replicaId);
    if (!row || row[COLUMN.NODE_ID] !== nodeId) {
      return {status: ReplicaOperationResponseStatus.NOT_FOUND};
    }
    const electable = payload[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
      row[COLUMN.RAFT_ROLE] === RAFT_ROLE.FOLLOWER &&
      row[COLUMN.STATUS] === ReplicaStatus.ACTIVE;
    if (!electable) {
      return {
        status: ReplicaOperationResponseStatus.COMPLETED,
        handoffBranch:
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP,
        handoffTrackedRole: row[COLUMN.RAFT_ROLE],
      };
    }
    transfers.set(row[COLUMN.PARTITION_ID], replicaId);
    return {
      status: ReplicaOperationResponseStatus.COMPLETED,
      handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
      handoffTrackedRole: row[COLUMN.RAFT_ROLE],
    };
  };
  // Leadership as the elected leader publishes it: the partition row names
  // the leader's node, the leader's replica row its role.
  const completeTransfer = (partitionId, replicaId) => {
    const next = cache.get(TABLES.SERVICES, replicaId);
    const partition = cache.get(TABLES.PARTITIONS, partitionId);
    if (!next || !partition || next[COLUMN.STATUS] !== ReplicaStatus.ACTIVE) {
      return;
    }
    for (const row of cache.filter(TABLES.SERVICES, (candidate) =>
      candidate[COLUMN.PARTITION_ID] === partitionId &&
      candidate[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER)) {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE,
        {...row, [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER});
    }
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE,
      {...next, [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER});
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPDATE,
      {...partition, [COLUMN.LEADER_NODE_ID]: next[COLUMN.NODE_ID]});
  };
  const answerCreate = (nodeId, payload) => {
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    const partitionId = payload[ReplicaOperationField.PARTITION_ID];
    const operationId = payload[ReplicaOperationField.OPERATION_ID] || null;
    if (cache.get(TABLES.SERVICES, replicaId)) {
      return {status: learners.has(replicaId) ?
        ReplicaOperationResponseStatus.IN_PROGRESS :
        ReplicaOperationResponseStatus.ALREADY_EXISTS};
    }
    learners.set(replicaId, {nodeId, partitionId, operationId});
    reportExecutorOutcome(nodeId, EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
      operationId, WORKFLOW_STEP.SYNCING, {replicaId, partitionId});
    insertStoredRow(cache, TABLES.SERVICES, {
      ...PartitionServiceRowOwner.buildServiceRow({
        partitionId,
        replicaId,
        nodeId,
        service: LEARNER_SERVICE,
        timestamp: now(),
        status: ReplicaStatus.SYNCING,
      }),
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    });
    return {status: ReplicaOperationResponseStatus.INITIATED};
  };
  const answerRemove = (nodeId, payload) => {
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    const row = cache.get(TABLES.SERVICES, replicaId);
    if (!row) {
      return {status: ReplicaOperationResponseStatus.NOT_FOUND};
    }
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...row,
      [COLUMN.STATUS]: ReplicaStatus.REMOVING,
    });
    removals.set(replicaId, {
      nodeId,
      operationId: payload[ReplicaOperationField.OPERATION_ID] || null,
    });
    return {status: ReplicaOperationResponseStatus.INITIATED};
  };
  return {
    handled,
    // The replicas whose removal committed: they left their group.
    retiredReplicaIds,
    wipeNode(nodeId) {
      for (const [replicaId, learner] of [...learners]) {
        if (learner.nodeId === nodeId) learners.delete(replicaId);
      }
      for (const [replicaId, removal] of [...removals]) {
        if (removal.nodeId === nodeId) removals.delete(replicaId);
      }
      for (const [partitionId, replicaId] of [...transfers]) {
        const row = cache.get(TABLES.SERVICES, replicaId);
        if (!row || row[COLUMN.NODE_ID] === nodeId) {
          transfers.delete(partitionId);
        }
      }
    },
    answer(nodeId, payload) {
      const type = payload?.[ReplicaOperationField.TYPE];
      if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
        handled.push({nodeId, type,
          replicaId: payload[ReplicaOperationField.REPLICA_ID]});
        return answerCreate(nodeId, payload);
      }
      if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        handled.push({nodeId, type,
          replicaId: payload[ReplicaOperationField.REPLICA_ID]});
        return answerRemove(nodeId, payload);
      }
      if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
        handled.push({nodeId, type,
          replicaId: payload[ReplicaOperationField.REPLICA_ID]});
        return answerStepDown(nodeId, payload);
      }
      return undefined;
    },
    step() {
      for (const [partitionId, replicaId] of [...transfers]) {
        transfers.delete(partitionId);
        completeTransfer(partitionId, replicaId);
      }
      for (const [replicaId, learner] of [...learners]) {
        learners.delete(replicaId);
        const row = cache.get(TABLES.SERVICES, replicaId);
        if (row && row[COLUMN.STATUS] === ReplicaStatus.SYNCING) {
          reportExecutorOutcome(learner.nodeId,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE, learner.operationId,
            WORKFLOW_STEP.ACTIVE,
            {replicaId, partitionId: learner.partitionId});
          cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
            ...row,
            [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
          });
        }
      }
      for (const [replicaId, removal] of [...removals]) {
        removals.delete(replicaId);
        const row = cache.get(TABLES.SERVICES, replicaId);
        if (row) {
          cache.applySystemTableChange(
            TABLES.SERVICES, CDC_OPERATION.DELETE, row);
          retiredReplicaIds.add(replicaId);
          reportExecutorOutcome(removal.nodeId,
            EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
            removal.operationId, WORKFLOW_STEP.REMOVED, {replicaId});
        }
      }
    },
  };
}

// Delivery between nodes: a replica-handler message reaches the addressed
// node's replica runtime; the REPLACE witness reads and the committed-
// membership read are answered from the replica rows by the repository's
// fixture world; a replica-dispatch message (a coordinator-to-coordinator
// wake) reaches the handler the addressed node's real ReplicaDispatchService
// registered for that address.
function installDelivery(hosts, cache, replicaRuntime, deliveries,
  dispatchServiceByNodeId) {
  const router = hosts.messageRouter;
  router.deliver = async (target, payload) => {
    const [targetNodeId, , service] = String(target).split(ADDRESS_SEPARATOR);
    deliveries.push({
      from: hosts.nodeId,
      target,
      type: payload?.[ReplicaOperationField.TYPE] || null,
      operationId: payload?.[ReplicaOperationField.OPERATION_ID] || null,
    });
    if (service === REPLICA_DISPATCH_SERVICE) {
      await dispatchServiceByNodeId.get(targetNodeId)
        .directDispatchServiceHandler({payload});
      return buildDeliveryEnvelope({acknowledged: true},
        {status: ReplicaOperationResponseStatus.COMPLETED});
    }
    const answered = service === REPLICA_HANDLER_SERVICE ?
      replicaRuntime.answer(targetNodeId, payload) : undefined;
    return buildDeliveryEnvelope({acknowledged: true}, answered ||
      {status: ReplicaOperationResponseStatus.COMPLETED});
  };
  withFixtureReplaceWitness(router, cache);
  // The witness's committed configuration: the repository's fixture world
  // answers it from the replica rows, and a source whose removal the replica
  // runtime retired has left the committed voters.
  const answerWitness = router.deliver.bind(router);
  router.deliver = async (target, payload, options) => {
    const envelope = await answerWitness(target, payload, options);
    if (payload?.[ReplicaOperationField.TYPE] !==
          ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP ||
        !replicaRuntime.retiredReplicaIds.has(
          payload[ReplicaOperationField.SOURCE_REPLICA_ID])) {
      return envelope;
    }
    const answer = deliveryAnswerOf(envelope);
    return buildDeliveryEnvelope({acknowledged: true}, {
      ...answer,
      [ReplicaOperationField.MEMBERSHIP]: {
        ...answer[ReplicaOperationField.MEMBERSHIP],
        state: PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
      },
    });
  };
  withFixtureCommittedMembership(router, cache);
}

// A node's bootstrap transport endpoint, as its registration publishes it
// (node-registration-owner-publication-methods.js registerNodeEndpoint),
// stamped with the incarnation that published it.
function insertNodeEndpointRow(
  cache,
  nodeId,
  nowMs,
  bootIncarnation = TEST_BOOT_INCARNATION,
  storageIncarnation = bootIncarnation,
) {
  insertStoredRow(cache, TABLES.NODE_ENDPOINTS, {
    [COLUMN.ENDPOINT_ID]: `ep-${nodeId}-ws`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: nodeAddressOf(nodeId),
    [COLUMN.PRIORITY]: 0,
    [COLUMN.METADATA]: JSON.stringify({
      [STORAGE_INCARNATION_METADATA_KEY]: storageIncarnation,
    }),
    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: nowMs,
    [COLUMN.UPDATED_AT]: nowMs,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  });
}

function seedSystemRows(cache, nowMs) {
  const insert = (table, row) => insertStoredRow(cache, table, row);
  insert(TABLES.NODES, {
    ...createNodeEntry(SEED_NODE_ID, {
      [COLUMN.NODE_ADDRESS]: nodeAddressOf(SEED_NODE_ID),
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + READY_LEASE_MS,
      [COLUMN.CREATED_AT]: nowMs,
      [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
      [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
      [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: nowMs,
    }, nowMs),
    [STORAGE_INCARNATION_FIELD]: TEST_BOOT_INCARNATION,
  });
  insertNodeEndpointRow(
    cache,
    SEED_NODE_ID,
    nowMs,
    TEST_BOOT_INCARNATION,
    TEST_BOOT_INCARNATION,
  );
  insert(TABLES.MESSAGE_GROUPS, seedMessageGroupRow(SEED_NODE_ID, nowMs));
  INITIAL_MESSAGE_GROUP_REPLICA_IDS.forEach((replicaId) => {
    insert(TABLES.SERVICES, MessageGroupServiceRowOwner.buildServiceRow({
      groupId: INITIAL_MESSAGE_GROUP_ID,
      replicaId,
      nodeId: SEED_NODE_ID,
      service: FOLLOWER_SERVICE,
      timestamp: nowMs,
      status: SERVICE_STATUS.ACTIVE,
    }));
  });
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const replicaIds = getInitialReplicaIds(schema.tableName);
    const partitionId = INITIAL_PARTITION_IDS[schema.tableName];
    if (!partitionId || !replicaIds) continue;
    insert(TABLES.TABLES, seedTableRow(schema, nowMs));
    insert(TABLES.PARTITIONS, seedPartitionRow(schema, SEED_NODE_ID, nowMs));
    replicaIds.forEach((replicaId, index) => {
      // Registration publishes every replica as a follower; the elected
      // leader's role reaches its row with the leadership publication.
      insert(TABLES.SERVICES, {
        ...PartitionServiceRowOwner.buildServiceRow({
          partitionId,
          replicaId,
          nodeId: SEED_NODE_ID,
          service: FOLLOWER_SERVICE,
          timestamp: nowMs,
          status: SERVICE_STATUS.ACTIVE,
        }),
        [COLUMN.RAFT_ROLE]: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
      });
    });
  }
}

function stopNodeHosts(existingHosts) {
  if (!existingHosts) return;
  existingHosts.heartbeatService.stop();
  existingHosts.membershipPublicationService.stopOwnerMembershipDriver();
  existingHosts.rebalanceCoordinator.isShuttingDown = true;
  existingHosts.controlPlaneReadinessService.shutdown();
  existingHosts.stopIntervals();
}

function wipeStoppedNodeData(
  nodeId,
  {replicaRuntime, bootIncarnationByNodeId, cache, externalServicesCleanup},
) {
  replicaRuntime.wipeNode(nodeId);
  bootIncarnationByNodeId.delete(nodeId);
  if (!externalServicesCleanup) return;
  for (const row of cache.filter(TABLES.SERVICES, (candidate) =>
    candidate[COLUMN.NODE_ID] === nodeId)) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE, row);
  }
}

function expireStoppedNodeLease(nodeId, {cache, time, clock}) {
  const existingNode = cache.get(TABLES.NODES, nodeId);
  if (!existingNode) return;
  const baseHb = Number(existingNode[COLUMN.LAST_HEARTBEAT] || time.now());
  while (time.now() < baseHb + 3) {
    clock.advance(1);
  }
  insertStoredRow(cache, TABLES.NODES, {
    ...existingNode,
    [COLUMN.UPDATED_AT_HLC]: null,
    [COLUMN.LAST_HEARTBEAT]: baseHb + 1,
    [COLUMN.READY_LEASE_EXPIRES_AT]: baseHb + 2,
  });
}

// The placement deciders this world mounts on a starting seed: the planner of
// every priority partition, each polled by the round driver. A scenario that
// measures placement as production composes it hands in its own mount.
function mountPriorityPartitionPlanners({seedHosts}) {
  return new Map(PRIORITY_TABLE_IDS.map((tableId) =>
    [INITIAL_PARTITION_IDS[tableId],
      createPriorityPartitionRebalancer(seedHosts, tableId)]));
}

/**
 * Build the world: the seed formed alone (its rows as the registration
 * producers write them), no joiner yet.
 * @param {object} [options]
 * @param {Function} [options.mountPlacementDeciders] builds the placement
 *   deciders of a starting seed ({seedHosts, clock, cache}) as a Map keyed
 *   by entity id
 * @param {boolean} [options.platformClockIsWorldClock] pin Date.now to the
 *   world clock for the world's lifetime
 * @return {object} the world
 */
function createFormationWorld({
  mountPlacementDeciders = mountPriorityPartitionPlanners,
  platformClockIsWorldClock = false,
} = {}) {
  initializeTestEnvironment();
  const time = createWorldClock({platformClockIsWorldClock});
  const {clock} = time;
  const cache = new SystemTableCache({
    timeSource: clock,
    cacheId: WORLD_CACHE_ID,
    scheduleCacheChangeNotification: (callback) =>
      clock.setTimeout(callback, DUE_NOW_DELAY_MS),
  });
  const hostsById = new Map();
  const upNodeIds = new Set();
  const downLinks = new Set();
  const bootIncarnationByNodeId = new Map([
    [SEED_NODE_ID, TEST_BOOT_INCARNATION],
  ]);
  const nextBootIncarnation = (nodeId) => {
    const next =
      (bootIncarnationByNodeId.get(nodeId) ?? (TEST_BOOT_INCARNATION - 1)) + 1;
    bootIncarnationByNodeId.set(nodeId, next);
    return next;
  };
  const publicationModeByNodeId = new Map();
  const lifecyclePublicationByNodeId = new Map();
  const dispatchServiceByNodeId = new Map();
  // The SQL store's answer for a formation-release publication, on a tree
  // that writes one (the tree this harness measures main with; a tree
  // without the handoff never writes the kind). The engine seam answers
  // reads from the cache, whose publication merge keeps a row's first
  // created_at; the store replaces the row (INSERT OR REPLACE), and the
  // handoff reader requires the row exactly as its authority last wrote it.
  const storedHandoffRows = new Map();
  function installStoredHandoffRows(hosts) {
    const owner = hosts.membershipPublicationService.controlPlanePublicationsOwner;
    const upsertPublication = owner.upsertPublication.bind(owner);
    const getPublication = owner.getPublication.bind(owner);
    owner.upsertPublication = async (row, options) => {
      const result = await upsertPublication(row, options);
      if (row?.[PUBLICATION_KIND_COLUMN] === HANDOFF_PUBLICATION_KIND) {
        storedHandoffRows.set(row[PUBLICATION_ID_COLUMN], row);
      }
      return result;
    };
    owner.getPublication = async (publicationId, options) =>
      storedHandoffRows.get(publicationId) ??
        getPublication(publicationId, options);
  }
  const network = Object.freeze({
    networkTimeSource: () => clock,
    setTimer: (nodeId, callback, delayMs) =>
      clock.setTimeout(callback, delayMs),
  });
  const partitionAuthority =
    createRowPartitionAuthority(cache, hostsById, time.now);
  // A replica handler reports to the coordinator of its own node.
  const reportExecutorOutcome = (nodeId, outcomeType, operationId, step,
    details) => hostsById.get(nodeId)?.rebalanceCoordinator
    .executorOutcomeEmitter.emitOutcome(outcomeType, operationId, step, details);
  const replicaRuntime =
    createReplicaRuntime(cache, time.now, reportExecutorOutcome);
  const deliveries = [];

  function startNode(nodeId, clusterIncarnationFence) {
    const hosts = createSimulatedNodeHosts({
      network,
      nodeId,
      nodeAddress: nodeAddressOf(nodeId),
      bootIncarnation:
        bootIncarnationByNodeId.get(nodeId) ?? TEST_BOOT_INCARNATION,
      systemTableCache: cache,
      partitionAuthority,
      randomSource: new SeededRandomSource({seed: RANDOM_SEED}),
    });
    const readiness = hosts.controlPlaneReadinessService;
    readiness.setFormationReleaseAuthorityNodeId?.(SEED_NODE_ID);
    const publicationModeOwner = Object.freeze({
      getPublicationModeDiagnostics: () =>
        publicationModeByNodeId.get(nodeId) || PUBLICATION_MODE_GROUPED,
    });
    readiness.syncOwnerDependencies({
      storageAccountingService: hosts.storageAccountingService,
      heartbeatService: hosts.heartbeatService,
      cdcGroupPropagationService: publicationModeOwner,
      localClusterIncarnationFenceProvider: () => clusterIncarnationFence,
    });
    // The one durable node lifecycle owner of the node (the NODES boundary
    // the READY lease is published through), built as control-plane setup
    // builds it.
    const nodeLifecyclePublication = new NodeLifecyclePublication({
      gateway: hosts.controlPlaneSystemTableGateway,
      leaseAuthority: NodeReadyLeaseAuthority.fromConfiguration(),
      now: time.now,
    });
    hosts.heartbeatService.nodeLifecyclePublication = nodeLifecyclePublication;
    // The node's replica dispatch owner, built as control-plane setup builds
    // it; its timers are armed on the world clock and never fire.
    const metadataOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    });
    const dispatchService = new ReplicaDispatchService({
      nodeId,
      messageRouter: hosts.messageRouter,
      cdcIntegrationService: hosts.cdcIntegrationService,
      systemTableCache: cache,
      rebalanceCoordinator: hosts.rebalanceCoordinator,
      sqlQueryEngine: hosts.sqlQueryEngine,
      controlPlaneReadinessService: readiness,
      storageAccountingService: hosts.storageAccountingService,
      cdcGroupPropagationService: publicationModeOwner,
      controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
      nodesOwner: metadataOwners.nodesOwner,
      servicesOwner: metadataOwners.servicesOwner,
      replicaOperationsOwner: metadataOwners.replicaOperationsOwner,
      nodeLifecyclePublication,
      setTimeoutFn: (callback, delayMs) => clock.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => clock.clearTimeout(handle),
    });
    dispatchService.initialize();
    dispatchServiceByNodeId.set(nodeId, dispatchService);
    installStoredHandoffRows(hosts);
    hostsById.set(nodeId, hosts);
    lifecyclePublicationByNodeId.set(nodeId, nodeLifecyclePublication);
    upNodeIds.add(nodeId);
    installMeshTransport(hosts, upNodeIds, downLinks, bootIncarnationByNodeId);
    installDelivery(hosts, cache, replicaRuntime, deliveries,
      dispatchServiceByNodeId);
    return hosts;
  }

  seedSystemRows(cache, time.now());
  const seed = startNode(SEED_NODE_ID, SEED_FENCE);
  const seedRebalancers = mountPlacementDeciders({seedHosts: seed, clock, cache});

  const world = {
    cache,
    clock,
    time,
    hostsById,
    upNodeIds,
    bootIncarnationByNodeId,
    bootIncarnationOf: (nodeId) =>
      bootIncarnationByNodeId.get(nodeId) ?? TEST_BOOT_INCARNATION,
    replicaRuntime,
    deliveries,
    dispatchServiceByNodeId,
    seed,
    seedRebalancers,
    startNode,
    settle: () => time.settle(),
    lifecyclePublicationOf: (nodeId) => lifecyclePublicationByNodeId.get(nodeId),
    // One link of the mesh drops or returns (a connection re-identification
    // is a drop followed by a return).
    setLink(leftNodeId, rightNodeId, up) {
      if (up) {
        downLinks.delete(linkKey(leftNodeId, rightNodeId));
      } else {
        downLinks.add(linkKey(leftNodeId, rightNodeId));
      }
    },
    // A node's fan-out turns conservative while a joiner's message group is
    // joining, and grouped again once that group is active.
    setJoinerGroupPending(nodeId, pending) {
      if (pending) {
        publicationModeByNodeId.set(nodeId, PUBLICATION_MODE_JOINER_GROUP_PENDING);
      } else {
        publicationModeByNodeId.delete(nodeId);
      }
    },
    // Simulation boundary: consensus is doubled by PARTITIONS.leader_node_id
    // and SERVICES.raft_role in the shared row store. When a non-seed leader
    // stops, remaining active voters elect a new leader for that partition.
    reassignStoppedNodeLeadership(nodeId) {
      if (nodeId === SEED_NODE_ID) return;
      for (const partition of cache.getAll(TABLES.PARTITIONS)) {
        if (partition[COLUMN.LEADER_NODE_ID] !== nodeId) continue;
        const partitionId = partition[COLUMN.PARTITION_ID];
        const voters = cache.filter(TABLES.SERVICES, (row) =>
          row[COLUMN.PARTITION_ID] === partitionId &&
          upNodeIds.has(row[COLUMN.NODE_ID]) &&
          row[COLUMN.STATUS] === ReplicaStatus.ACTIVE &&
          row[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEARNER);
        const nextLeader = voters.find((row) =>
          row[COLUMN.NODE_ID] === SEED_NODE_ID) || voters[0];
        if (!nextLeader) continue;
        for (const row of cache.filter(TABLES.SERVICES, (candidate) =>
          candidate[COLUMN.PARTITION_ID] === partitionId &&
          candidate[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER)) {
          cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE,
            {...row, [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER});
        }
        cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE,
          {...nextLeader, [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER});
        cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPDATE, {
          ...partition,
          [COLUMN.LEADER_NODE_ID]: nextLeader[COLUMN.NODE_ID],
        });
      }
    },
    // Stop a node's controllers. Cluster REPLICA_OPERATIONS rows are NEVER
    // deleted. When wipeDataDir is true:
    // - replicaRuntime.wipeNode(nodeId) clears the node's local replica state;
    // - when externalServicesCleanup is false (default local-disk-only wipe),
    //   cluster SERVICES and REPLICA_OPERATIONS rows remain untouched in the
    //   shared store so NodeRegistrationOwner.registerNodeInCluster() discovers
    //   the lost local storage on fresh-storage registration and transitions
    //   the node's partition SERVICES rows to FAILED/LEARNER;
    // - when externalServicesCleanup is true, the wiped node's SERVICES rows
    //   are deleted while REPLICA_OPERATIONS history remains intact to test
    //   storageIncarnation supersession on absent SERVICES rows.
    stopNode(
      nodeId,
      {
        expireLease = false,
        wipeDataDir = false,
        externalServicesCleanup = false,
      } = {},
    ) {
      stopNodeHosts(hostsById.get(nodeId));
      upNodeIds.delete(nodeId);
      if (wipeDataDir) {
        wipeStoppedNodeData(nodeId, {
          replicaRuntime,
          bootIncarnationByNodeId,
          cache,
          externalServicesCleanup,
        });
      }
      this.reassignStoppedNodeLeadership(nodeId);
      if (expireLease) {
        expireStoppedNodeLease(nodeId, {cache, time, clock});
      }
    },
    restartSeed() {
      for (const rebalancer of world.seedRebalancers.values()) {
        rebalancer.shutdown();
      }
      world.stopNode(SEED_NODE_ID);
      const existingSeed = cache.get(TABLES.NODES, SEED_NODE_ID);
      const nextHb = Math.max(
        time.now(), Number(existingSeed?.[COLUMN.LAST_HEARTBEAT] || 0) + 1);
      while (time.now() < nextHb) {
        clock.advance(1);
      }
      const bootIncarnation = nextBootIncarnation(SEED_NODE_ID);
      const storageIncarnation =
        existingSeed?.[STORAGE_INCARNATION_FIELD] ?? TEST_BOOT_INCARNATION;
      const nextSeed = startNode(SEED_NODE_ID, buildClusterIncarnationFence({
        durableStateDetected: true,
        localIdentityMatched: true,
        peerProofRequired: false,
      }));
      insertStoredRow(cache, TABLES.NODES, {
        ...createNodeEntry(SEED_NODE_ID, {
          [COLUMN.NODE_ADDRESS]: nodeAddressOf(SEED_NODE_ID),
          [COLUMN.LAST_HEARTBEAT]: nextHb,
          [COLUMN.READY_LEASE_EXPIRES_AT]: nextHb + READY_LEASE_MS,
          [COLUMN.CREATED_AT]: existingSeed?.[COLUMN.CREATED_AT] ?? nextHb,
          [COLUMN.BOOT_INCARNATION]: bootIncarnation,
          [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
          [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
          [COLUMN.STORAGE_BUDGET_UPDATED_AT]: nextHb,
        }, nextHb),
        [STORAGE_INCARNATION_FIELD]: storageIncarnation,
      });
      insertNodeEndpointRow(
        cache,
        SEED_NODE_ID,
        nextHb,
        bootIncarnation,
        storageIncarnation,
      );
      world.seed = nextSeed;
      world.seedRebalancers =
        mountPlacementDeciders({seedHosts: nextSeed, clock, cache});
      return nextSeed;
    },
    /**
     * A joiner's process starts and registers through the real
     * NodeRegistrationOwner:
     * - On durable rejoin (durableStateDetected: true), existing membership is
     *   reused (created_at and storageIncarnation preserved, boot_incarnation
     *   advanced) and SERVICES rows remain untouched.
     * - On initial join or wiped-data-dir restart (durableStateDetected: false),
     *   NodeRegistrationOwner refuses to reuse any prior boot's membership row,
     *   mints a fresh storageIncarnation = bootIncarnation, and transitions any
     *   partition SERVICES rows still assigned to this node to FAILED/LEARNER.
     * @param {string} nodeId
     * @param {object} [options]
     * @return {Promise<object>} the joiner's hosts
     */
    async registerJoiner(
      nodeId,
      {durableStateDetected = false, registrationNowMs = null} = {},
    ) {
      const existingNode = cache.get(TABLES.NODES, nodeId);
      const minNow = Number(existingNode?.[COLUMN.LAST_HEARTBEAT] || 0) + 1;
      while (time.now() < minNow) {
        clock.advance(1);
      }
      const registrationNow = Number.isFinite(registrationNowMs) ?
        Math.floor(registrationNowMs) :
        time.now();
      nextBootIncarnation(nodeId);
      const clusterIncarnationFence = buildClusterIncarnationFence(
        durableStateDetected ? {
          durableStateDetected: true,
          localIdentityMatched: true,
          peerProofRequired: true,
          peerAddresses: [nodeAddressOf(SEED_NODE_ID)],
        } : {
          durableStateDetected: false,
        });
      const hosts = startNode(nodeId, clusterIncarnationFence);
      const registrationOwner = new NodeRegistrationOwner({
        nodeId,
        nodeAddress: nodeAddressOf(nodeId),
        membershipPublicationRuntimeOwner:
          hosts.membershipPublicationService.membershipPublicationRuntimeOwner,
        delegates: {
          getLogger: () => hosts.controlPlaneReadinessService.logger,
          getNow: () => () => registrationNow,
          getBootIncarnation: () => hosts.bootIncarnation,
          raiseBootIncarnationFloor: async (knownIncarnation) => {
            const updated = await hosts.syncBootIncarnation(knownIncarnation);
            bootIncarnationByNodeId.set(nodeId, updated);
            return updated;
          },
          getNodeCapabilities: () => [],
          getClusterIncarnationFence: async () => clusterIncarnationFence,
          getJoinLifecycleIntentType: () =>
            durableStateDetected ?
              MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
              MEMBERSHIP_LIFECYCLE_INTENT.FRESH_BOOT_ADMISSION,
          getSystemTableCache: () => cache,
          getCdcIntegrationService: () => hosts.cdcIntegrationService,
          getMessageRouter: () => hosts.messageRouter,
          getSeedNodeId: () => SEED_NODE_ID,
          getNodeStorageBudgetService: () => ({
            resolveBudgetRow: (nodeRow) => ({
              budgetRow: {
                ...nodeRow,
                [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
                [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
                [COLUMN.STORAGE_BUDGET_UPDATED_AT]: registrationNow,
              },
              resolution: {
                isValid: true,
                budgetBytes: STORAGE_BUDGET_BYTES,
                source: STORAGE_BUDGET_SOURCE,
                diskBytes: STORAGE_BUDGET_BYTES,
              },
            }),
          }),
        },
      });
      registrationOwner.authoritativeControlPlaneView = {
        canRead: () => true,
        syncOwnerDependencies: () => {},
        readRows: (tableName, sql, params) =>
          hosts.controlPlaneSystemTableGateway.readAuthoritativeRows(
            tableName,
            sql,
            params,
          ),
      };
      await registrationOwner.registerNodeInCluster();
      return hosts;
    },
  };
  return world;
}

export {
  PRIORITY_PARTITION_IDS,
  SEED_NODE_ID,
  WORLD_START_MS,
  createFormationWorld,
  nodeAddressOf,
};
