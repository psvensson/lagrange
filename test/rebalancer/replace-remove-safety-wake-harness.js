/**
 * Harness for the R-2 remove-safety readiness wake evidence (quest
 * replace-source-removal-owner; owner directive 2026-09-25 points 2-5 and 7;
 * record quest-records/replace-source-removal-owner/
 * evidence-remove-safety-wake.md).
 *
 * The REPLACE owner runs on a real RebalanceCoordinator. Two things are
 * replaced by controllable authorities, never the owner's decision:
 *
 *  - the readiness authority: per-node readiness answers (the remove-safety
 *    participation read and the node readiness read) plus the readiness
 *    owner's publication channel (subscribeReadinessPlanningSnapshots). A
 *    publication is emitted in its own macrotask, exactly like the readiness
 *    planning owner's queue, and carries an unchanged planning token unless
 *    a test says otherwise (BR1: the placeholder flips under the same
 *    identity);
 *  - the fallback clock: every owner timer (setTimeoutFn) is virtual and
 *    fires only when the test advances it, so "frozen" means zero fallback
 *    advance.
 *
 * A third authority is the group itself (committed-voter-group-fixture.js):
 * the four replicas are the committed voters, the target leads, and every
 * replica answers the witness read for itself - unless its node's process is
 * gone, when its read fails as a delivery failure.
 *
 * Readiness profiles come from the readiness reason enum:
 *  - READY: eligible, no reasons; the node holds its ready lease;
 *  - SYSTEM_FLOOR: the lab-classified placeholder
 *    (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING + planning_snapshot_refresh_pending):
 *    the node is not routable and holds no ready lease, but its process
 *    runs and its replica answers. The remove-safety floor credits such a
 *    voter from the group's committed evidence, so it does not defer
 *    (superseding the 2026-09-25 "below minimum 2/3" placeholder deferral);
 *  - UNSAFE: a substantive denial (process_not_alive): no ready lease and a
 *    silent replica. Nothing credits it; the floor defers.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createMockControlPlaneReadinessService} from './test-helpers.js';
import {
  createCommittedVoterGroup,
  withCommittedVoterGroup,
} from './committed-voter-group-fixture.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OperationType,
  RAFT_ROLE,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  buildPriorityDrainConvergedPlanningSnapshot,
  createTestCoordinator,
  installActualReplicaObservationResolver,
} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

const WAKE_NODE = Object.freeze({
  SOURCE: 'wake-source',
  PEER: 'wake-peer',
  SECOND_PEER: 'wake-second-peer',
  OWNER: 'wake-owner',
});
const WAKE_OPERATION_ID = 'replace-remove-safety-wake-op';
// A priority control-plane partition and the operation-ledger partition
// (the case the implementer named as its gap).
const WAKE_PARTITIONS = Object.freeze([
  'sql_write_operations-p1',
  'replica_operations-p1',
]);
const WAKE_START_MS = 2_000_000_000_000;
const WAKE_ENTITY_TYPE = 'partition';
const WAKE_PLANNING_TOKEN_KEY = 'wake-planning-identity-unchanged';

const READINESS_PROFILE = Object.freeze({
  READY: 'ready',
  SYSTEM_FLOOR: 'system_floor',
  UNSAFE: 'unsafe',
});

const PROFILE_REASONS = Object.freeze(new Map([
  [READINESS_PROFILE.READY, Object.freeze([])],
  [READINESS_PROFILE.SYSTEM_FLOOR, Object.freeze([
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  ])],
  [READINESS_PROFILE.UNSAFE, Object.freeze([
    CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
  ])],
]));

/**
 * The fallback clock: virtual timers that fire only on advance().
 * @param {number} startMs
 * @return {Object}
 */
function createFallbackClock(startMs = WAKE_START_MS) {
  let nowMs = startMs;
  let nextHandle = 1;
  const timers = new Map();
  return {
    now: () => nowMs,
    setTimeoutFn(callback, delayMs) {
      const handle = nextHandle++;
      timers.set(handle, {callback, dueAt: nowMs + Math.max(0, delayMs || 0)});
      return handle;
    },
    clearTimeoutFn(handle) {
      timers.delete(handle);
    },
    pendingCount: () => timers.size,
    /**
     * Advance the clock, firing due timers in due order.
     * @param {number} deltaMs
     * @return {Promise<number>} timers fired
     */
    async advance(deltaMs) {
      const targetMs = nowMs + deltaMs;
      let fired = 0;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= targetMs)
          .sort((left, right) => left[1].dueAt - right[1].dueAt);
        if (due.length === 0) {
          break;
        }
        const [handle, timer] = due[0];
        timers.delete(handle);
        nowMs = Math.max(nowMs, timer.dueAt);
        fired++;
        timer.callback();
      }
      nowMs = targetMs;
      return fired;
    },
  };
}

/**
 * The readiness authority: per-node answers plus the publication channel.
 * @param {string} partitionId
 * @param {Object<string, string>} profiles - nodeId -> READINESS_PROFILE
 * @return {Object}
 */
function createReadinessAuthority(partitionId, profiles, clock) {
  const profileByNode = new Map(Object.entries(profiles));
  const listeners = new Set();
  const reasonsFor = (nodeId) => PROFILE_REASONS.get(
    profileByNode.get(nodeId) || READINESS_PROFILE.READY,
  );
  // The planning answer agrees with the readiness levels: every node is
  // published; the recovery projection after the removal is the ready nodes
  // other than the REPLACE's source.
  const readPlanningAnswer = () => {
    const converged = buildPriorityDrainConvergedPlanningSnapshot(partitionId);
    const allNodeIds = Object.freeze(Object.values(WAKE_NODE));
    const projectedNodeIds = Object.freeze(allNodeIds.filter((nodeId) =>
      nodeId !== WAKE_NODE.SOURCE && reasonsFor(nodeId).length === 0));
    return Object.freeze({
      ...converged,
      publishedActiveNodeIds: allNodeIds,
      recoveryActiveNodeIds: projectedNodeIds,
      projectedServingNodeIds: projectedNodeIds,
      locallyEligibleNodeIds: projectedNodeIds,
    });
  };
  const authority = createMockControlPlaneReadinessService({
    now: clock.now,
    readNodeRows: () => Object.values(WAKE_NODE).map((nodeId) => ({
      node_id: nodeId, status: 'active',
      ready_lease_expires_at: profileByNode.get(nodeId) === READINESS_PROFILE.UNSAFE ?
        null : reasonsFor(nodeId).length === 0 ? clock.now() + 60000 : 0,
    })),
    callbacks: {
      reads: 0,
      publications: 0,
      getNodeReadinessSync(nodeId, options = {}) {
        authority.reads++;
        const reasons = reasonsFor(nodeId);
        const ready = reasons.length === 0;
        const dimension = options?.decisionDimension;
        return {
          nodeId,
          reasons: [...reasons],
          dimensions: {
            ...(dimension ? {[dimension]: ready} : {}),
            controlPlaneRecoveryEligible: ready,
            repairEligible: ready,
            serveEligible: ready,
          },
        };
      },
      getControlPlaneParticipationSync(nodeId) {
        authority.reads++;
        const reasons = reasonsFor(nodeId);
        return {
          nodeId,
          eligible: reasons.length === 0,
          decision: reasons.length === 0 ?
            CONTROL_PLANE_PARTICIPATION_DECISION.READY :
            CONTROL_PLANE_PARTICIPATION_DECISION.DEFER,
          reasons: [...reasons],
        };
      },
      getPriorityRecoveryPlanningAnswerForOwnerRead: readPlanningAnswer,
      getPriorityRecoveryPlanningAnswerSync: readPlanningAnswer,
      getPriorityRecoveryPlanningSnapshotBestEffort: readPlanningAnswer,
      subscribeReadinessPlanningSnapshots(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscriberCount: () => listeners.size,
      /** Change a node's readiness level without publishing. */
      setProfile(nodeId, profile) {
        profileByNode.set(nodeId, profile);
      },
      /** Whether the node's process is gone (its replicas are silent). */
      isProcessGone: (nodeId) =>
        profileByNode.get(nodeId) === READINESS_PROFILE.UNSAFE,
      /**
     * Emit the readiness owner's publication for a node, synchronously.
     * @param {string} nodeId
     * @param {string} [tokenKey]
     */
      publishNow(nodeId, tokenKey = WAKE_PLANNING_TOKEN_KEY) {
        authority.publications++;
        const event = Object.freeze({
          ownerKey: nodeId,
          snapshot: authority.getNodeReadinessSync(nodeId),
          capturedToken: Object.freeze({tokenKey}),
        });
        for (const listener of [...listeners]) {
          listener(event);
        }
      },
      /**
     * Emit the publication in its own macrotask (the readiness owner's queue).
     * @param {string} nodeId
     * @param {string} [tokenKey]
     * @return {Promise<void>}
     */
      publish(nodeId, tokenKey) {
        return new Promise((resolve) => setImmediate(() => {
          authority.publishNow(nodeId, tokenKey);
          resolve();
        }));
      },
    },
  });
  return authority;
}

function buildServiceRow(partitionId, replicaIndex, nodeId) {
  const replicaId = `${partitionId}-r${replicaIndex}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: WAKE_ENTITY_TYPE,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: RAFT_ROLE.FOLLOWER,
    status: ReplicaStatus.ACTIVE,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

function buildReplaceRow(partitionId, nowMs) {
  return {
    operation_id: WAKE_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: partitionId,
    replica_id: `${partitionId}-r4`,
    source_node_id: WAKE_NODE.SOURCE,
    target_node_id: WAKE_NODE.OWNER,
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: null,
    error_message: null,
    entity_type: WAKE_ENTITY_TYPE,
    entity_id: partitionId,
    steps_history: JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: nowMs,
        sourceReplicaId: `${partitionId}-r1`,
      },
      {step: WORKFLOW_STEP.ACTIVE, timestamp: nowMs},
    ]),
  };
}

/**
 * The REPLACE owner (the target node) at ACTIVE, three voters, its witness
 * reporting the target leading (no handoff deferral), on a frozen fallback
 * clock and a controllable readiness authority.
 * @param {Object} options - {partitionId, profiles}
 * @return {Object}
 */
function createWakeScenario(options) {
  const partitionId = options.partitionId;
  const clock = createFallbackClock();
  const readiness = createReadinessAuthority(partitionId, options.profiles, clock);
  const removals = [];
  const serviceRows = [
    buildServiceRow(partitionId, 1, WAKE_NODE.SOURCE),
    buildServiceRow(partitionId, 2, WAKE_NODE.PEER),
    buildServiceRow(partitionId, 3, WAKE_NODE.SECOND_PEER),
    buildServiceRow(partitionId, 4, WAKE_NODE.OWNER),
  ];
  const nodeIdByReplicaId = new Map(
    serviceRows.map((row) => [row.replica_id, row.node_id]));
  // The group: four committed voters, the target (r4) leading; a replica
  // whose node's process is gone does not answer.
  // Replicas a test silences on their own (the replica's process is gone
  // while its node's readiness level says nothing new).
  const silencedReplicaIds = new Set();
  const group = createCommittedVoterGroup({
    voterReplicaIds: serviceRows.map((row) => row.replica_id),
    leaderReplicaId: `${partitionId}-r4`,
    isSilent: (replicaId) => silencedReplicaIds.has(replicaId) ||
      readiness.isProcessGone(nodeIdByReplicaId.get(replicaId)),
  });
  const coordinator = createTestCoordinator({
    nodeId: WAKE_NODE.OWNER,
    enableTimeouts: false,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    // The group's replicas answer the witness read for themselves; the
    // fixture-world witness (a leader naming itself alone) is not used.
    replaceWitness: false,
    messageRouter: withCommittedVoterGroup({
      async deliver(target, payload) {
        if (payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          removals.push({target, replicaId: payload.replicaId});
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.INITIATED,
        });
      },
      async pingNode() {
        return true;
      },
    }, group),
    controlPlaneReadinessService: readiness,
    cacheData: {
      services: serviceRows,
      replicaOperations: [buildReplaceRow(partitionId, clock.now())],
    },
  });
  const owner = coordinator.workflowOwner;
  owner.timeSource = {now: clock.now};
  installActualReplicaObservationResolver(
    coordinator,
    async () => ReplicaStatus.ACTIVE,
  );
  // No handoff deferral: the REPLACE's leadership is decided from its
  // witness's fresh leader (BR11), which the group answers as the target.
  // Nothing is planted in the per-leg evidence maps, which no operation
  // reaches any more.
  return {
    coordinator,
    owner,
    group,
    silencedReplicaIds,
    clock,
    readiness,
    removals,
    partitionId,
    startMs: clock.now(),
    readOperation: () => coordinator.getOperation(WAKE_OPERATION_ID),
    async readStep() {
      return (await coordinator.getOperation(WAKE_OPERATION_ID))
        ?.workflowStep || null;
    },
    /** The owner's own entry: EXECUTE of the REPLACE (ACTIVE -> STOPPING). */
    async execute() {
      const operation = await coordinator.getOperation(WAKE_OPERATION_ID);
      return coordinator.executeOperation(operation);
    },
  };
}

/**
 * Let the owner's pending microtasks and macrotasks run without moving the
 * fallback clock. Bounded: a fixed number of macrotask turns.
 * @param {number} [turns]
 * @return {Promise<void>}
 */
async function settleWithoutFallback(turns = 20) {
  for (let turn = 0; turn < turns; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export {
  READINESS_PROFILE,
  WAKE_NODE,
  WAKE_OPERATION_ID,
  WAKE_PARTITIONS,
  createWakeScenario,
  settleWithoutFallback,
};
