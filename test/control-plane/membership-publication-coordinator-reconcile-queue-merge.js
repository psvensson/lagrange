import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../src/control-plane/membership-publication-coordinator-queue.js';
import {TABLES} from '../../src/constants/index.js';
import {MEMBERSHIP_LIFECYCLE_STATE} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';

const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID =
  'publication-handoff-target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH = 41;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS = 3200;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER = false;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS = Object.freeze([
  'node-handoff-seed',
  'node-handoff-a',
  'node-handoff-b',
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS = Object.freeze(
  [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS].sort((left, right) =>
    left.localeCompare(right),
  ),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS =
  Object.freeze([
    PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  ]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS = Object.freeze(
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS = Object.freeze([]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A =
  'ready-node-handoff-a';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B =
  'ready-node-handoff-b';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH = 43;
const PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID = 'node-excluded';
const PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS = Object.freeze([
  'node-retained-a',
  'node-retained-b',
]);
const PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
  ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
].sort((left, right) => left.localeCompare(right)));
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OTHER_OWNER_KEY =
  'membership-publication:other-cluster';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND = 1;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS = 1000;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK = true;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED =
  'enqueued';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_MERGED =
  'merged';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED =
  'rejected';
const PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE =
  'owner_recovery_wake';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON =
  'owner_queue_bounded';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[1],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[2],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_PRELOADED_FIELD =
  'nodeRows';
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_ALLOW_EMPTY_FIELD =
  'allowEmptyPreloadedRows';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYABLE_DRAIN_FAILURE =
  'retryable_drain_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE =
  'distributed_participant_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_MESSAGE =
  'Distributed operation failed due to participant failures';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRY_AFTER_MS = 37;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT = 1;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_FIRST_CALL_COUNT = 1;

test('reconcileActiveGateMembershipPublication reports bounded critical queue pressure',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
    };
    const pending = new Map([
      [PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OTHER_OWNER_KEY, {
        context: {},
      }],
    ]);
    const enqueued = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      reconcileQueue: {
        pending,
        get size() {
          return pending.size;
        },
        has(ownerKey) {
          return pending.has(ownerKey);
        },
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication() {
          return latestPublicationRow;
        },
        async upsertPublication(row) {
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication({
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT,
      'saturated critical convergence queue should not enqueue beyond the bound',
    );
    t.match(
      outcome,
      {
        state: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
          .WRITE_DEFERRED,
        enqueued: false,
        controlPlaneConvergenceClass:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
        controlPlanePressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
        controlPlaneConvergence: {
          ownerKey: coordinator.buildOwnerKey(),
          operation: PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE,
          queueBound: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND,
          queueOutcome:
            PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED,
          reasonCode: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON,
        },
        reasonCode: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON,
        retryAfterMs: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS,
      },
      'bounded critical convergence queue pressure should be typed instead of silently dropped',
    );
  });

test('enqueueClusterMembershipReconcile merges pending explicit handoff targets',
  async (t) => {
    const pending = new Map();
    const enqueued = [];
    const reconcileQueue = {
      pending,
      enqueue(ownerKey, reason, context, options) {
        enqueued.push({ownerKey, reason, context, options});
        const pendingEntry = pending.get(ownerKey);
        if (pendingEntry) {
          pendingEntry.context = context;
          return false;
        }
        pending.set(ownerKey, {context});
        return true;
      },
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A,
      {
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        allowPendingVisibility:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
        allowPressureDefer:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      },
    );
    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        latestPublicationRow: {
          publication_epoch:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
      },
    );

    const mergedContext = pending.get(ownerKey)?.context;
    const ownerQueueDepth = coordinator.getControlPlaneOwnerQueueDepth();
    t.equal(
      enqueued.length,
      2,
      'both enqueue calls should reach the owner queue',
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit publication targets',
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit ACK targets',
    );
    t.same(
      mergedContext?.acknowledgedNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit acknowledged nodes',
    );
    t.match(
      ownerQueueDepth,
      {
        ownerKey,
        pendingWrites: 1,
        pendingKeys: [ownerKey],
        retryingKeys: [],
        inFlightKeys: [],
      },
      'owner queue depth should expose the pending membership publication reconcile',
    );
    t.equal(
      mergedContext?.latestPublicationRow?.publication_epoch,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
      'pending context should retain the newest known publication row',
    );
    t.equal(
      mergedContext?.allowPendingVisibility,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
      'pending context should retain pending visibility permission',
    );
    t.equal(
      mergedContext?.allowPressureDefer,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      'pending context should retain the explicit non-deferred write option',
    );
  });

test('enqueueClusterMembershipReconcile lets handoff-only owner wake clear stale explicit targets',
  async (t) => {
    const pending = new Map();
    const enqueued = [];
    const reconcileQueue = {
      pending,
      has(ownerKey) {
        return pending.has(ownerKey);
      },
      get size() {
        return pending.size;
      },
      enqueue(ownerKey, reason, context, options) {
        enqueued.push({ownerKey, reason, context, options});
        const pendingEntry = pending.get(ownerKey);
        if (pendingEntry) {
          pendingEntry.context = context;
          return false;
        }
        pending.set(ownerKey, {context});
        return true;
      },
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();
    pending.set(ownerKey, {
      context: {
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        [PUBLICATION_CONVERGENCE_HANDOFF_ONLY_ALLOW_EMPTY_FIELD]: true,
        [PUBLICATION_CONVERGENCE_HANDOFF_ONLY_PRELOADED_FIELD]:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS,
      },
    });

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        latestPublicationRow: {
          publication_epoch:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
        },
        publicationActiveGateHandoff: {
          publicationEpoch:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
          ],
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
        skipPublicationWriteReadback:
          PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK,
      },
    );

    const mergedContext = pending.get(ownerKey)?.context;
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT,
      'handoff-only owner wake should still reach the owner queue once',
    );
    t.same(
      mergedContext?.publicationActiveGateHandoff?.pendingReconcileNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS],
      'handoff-only owner wake should retain the active-gate handoff contract',
    );
    t.equal(
      Object.hasOwn(mergedContext, 'publishedActiveNodeIds'),
      false,
      'handoff-only owner wake should clear stale explicit publication targets',
    );
    t.equal(
      Object.hasOwn(mergedContext, 'requiredAckNodeIds'),
      false,
      'handoff-only owner wake should clear stale explicit ACK targets',
    );
    t.equal(
      Object.hasOwn(mergedContext, 'acknowledgedNodeIds'),
      false,
      'handoff-only owner wake should clear stale explicit acknowledged nodes',
    );
    t.equal(
      Object.hasOwn(
        mergedContext,
        PUBLICATION_CONVERGENCE_HANDOFF_ONLY_ALLOW_EMPTY_FIELD,
      ),
      false,
      'handoff-only owner wake should clear stale empty-row read hints',
    );
    t.equal(
      Object.hasOwn(
        mergedContext,
        PUBLICATION_CONVERGENCE_HANDOFF_ONLY_PRELOADED_FIELD,
      ),
      false,
      'handoff-only owner wake should not inherit stale preloaded rows',
    );
    t.equal(
      mergedContext?.skipPublicationWriteReadback,
      PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK,
      'handoff-only owner wake should retain deferred write readback policy',
    );
  });

test('enqueueClusterMembershipReconcile applies explicit node exclusions to merged targets',
  async (t) => {
    const pending = new Map();
    const reconcileQueue = {
      pending,
      has(ownerKey) {
        return pending.has(ownerKey);
      },
      get size() {
        return pending.size;
      },
      enqueue(ownerKey, _reason, context) {
        const pendingEntry = pending.get(ownerKey);
        if (pendingEntry) {
          pendingEntry.context = context;
          return false;
        }
        pending.set(ownerKey, {context});
        return true;
      },
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();
    pending.set(ownerKey, {
      context: {
        publicationActiveGateHandoff: {
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
            PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
          ],
          expectedNodeCount:
            PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS.length,
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
            PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
          ],
          publishedActiveNodeCount:
            PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS.length,
          missingPublishedNodeIds: [PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID],
          missingPublishedCount: 1,
          pendingRecoveryNodeIds: [
            ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
            PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
          ],
          pendingRecoveryCount:
            PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS.length,
          pendingReconcileNodeIds: [
            ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
            PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
          ],
          pendingReconcileCount:
            PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS.length,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
      },
    });

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        excludedNodeIds: [PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID],
      },
    );

    const mergedContext = pending.get(ownerKey)?.context;
    t.same(
      mergedContext?.excludedNodeIds,
      [PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID],
      'merged context should retain explicit node exclusion evidence',
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS],
      'excluded node should be removed from merged published targets',
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS],
      'excluded node should be removed from merged required ACK targets',
    );
    t.same(
      mergedContext?.acknowledgedNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS],
      'excluded node should be removed from merged acknowledged targets',
    );
    t.same(
      mergedContext?.publicationActiveGateHandoff?.pendingReconcileNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS],
      'excluded node should be removed from nested handoff reconcile debt',
    );
    t.equal(
      mergedContext?.publicationActiveGateHandoff?.pendingReconcileCount,
      PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS.length,
      'nested handoff reconcile debt count should match filtered nodes',
    );
    t.same(
      mergedContext?.publicationActiveGateHandoff?.pendingRecoveryNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS],
      'excluded node should be removed from nested handoff recovery debt',
    );
    t.equal(
      mergedContext?.publicationActiveGateHandoff?.pendingRecoveryCount,
      PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS.length,
      'nested handoff recovery debt count should match filtered nodes',
    );
    t.same(
      mergedContext?.publicationActiveGateHandoff?.missingPublishedNodeIds,
      [],
      'excluded node should be removed from nested missing publication debt',
    );
    t.equal(
      mergedContext?.publicationActiveGateHandoff?.missingPublishedCount,
      0,
      'nested missing publication debt count should match filtered nodes',
    );
  });

test('enqueueClusterMembershipReconcile lets fresh explicit targets clear stale exclusions',
  async (t) => {
    const pending = new Map();
    const reconcileQueue = {
      pending,
      has(ownerKey) {
        return pending.has(ownerKey);
      },
      get size() {
        return pending.size;
      },
      enqueue(ownerKey, _reason, context) {
        const pendingEntry = pending.get(ownerKey);
        if (pendingEntry) {
          pendingEntry.context = context;
          return false;
        }
        pending.set(ownerKey, {context});
        return true;
      },
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();
    pending.set(ownerKey, {
      context: {
        excludedNodeIds: [PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID],
      },
    });

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_EXCLUSION_RETAINED_NODE_IDS,
          PUBLICATION_CONVERGENCE_EXCLUDED_NODE_ID,
        ],
      },
    );

    const mergedContext = pending.get(ownerKey)?.context;
    t.equal(
      Object.hasOwn(mergedContext, 'excludedNodeIds'),
      false,
      'fresh explicit target should clear stale node exclusion evidence',
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS],
      'fresh explicit published target should survive stale exclusion',
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS],
      'fresh explicit ACK target should survive stale exclusion',
    );
    t.same(
      mergedContext?.acknowledgedNodeIds,
      [...PUBLICATION_CONVERGENCE_EXCLUSION_TARGET_NODE_IDS],
      'fresh explicit acknowledged target should survive stale exclusion',
    );
  });

test('enqueueClusterMembershipReconcile merges retrying explicit handoff targets',
  async (t) => {
    const pending = new Map();
    const retryWorkItems = new Map();
    const enqueued = [];
    const reconcileQueue = {
      pending,
      retryWorkItems,
      get size() {
        return new Set([
          ...pending.keys(),
          ...retryWorkItems.keys(),
        ]).size;
      },
      has(ownerKey) {
        return pending.has(ownerKey) || retryWorkItems.has(ownerKey);
      },
      enqueue(ownerKey, reason, context, options) {
        enqueued.push({ownerKey, reason, context, options});
        const retryingEntry = retryWorkItems.get(ownerKey);
        if (retryingEntry) {
          retryingEntry.reasons.add(reason);
          retryingEntry.context = context;
          return false;
        }
        pending.set(ownerKey, {context});
        return true;
      },
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();
    retryWorkItems.set(ownerKey, {
      ownerKey,
      reasons: new Set([PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A]),
      context: {
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        },
        publicationActiveGateHandoff: {
          publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
          ],
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        allowPendingVisibility:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
        allowPressureDefer:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      },
    });

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        latestPublicationRow: {
          publication_epoch:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
      },
    );

    const mergedContext = retryWorkItems.get(ownerKey)?.context;
    t.match(
      coordinator.lastControlPlaneConvergenceQueueOutcome,
      {
        ownerKey,
        queueOutcome: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_MERGED,
        pressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
      },
      'retrying owner-key merge should be admitted as a critical merge',
    );
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT,
      'retrying owner-key merge should still reach the owner queue once',
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'retrying context should union explicit publication targets',
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'retrying context should union explicit ACK targets',
    );
    t.same(
      mergedContext?.acknowledgedNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'retrying context should union explicit acknowledged nodes',
    );
    t.same(
      mergedContext?.publicationActiveGateHandoff?.pendingReconcileNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS],
      'retrying context should retain the active-gate handoff target',
    );
    t.equal(
      mergedContext?.latestPublicationRow?.publication_epoch,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
      'retrying context should retain the newest known publication row',
    );
    t.equal(
      mergedContext?.allowPressureDefer,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      'retrying context should retain the explicit non-deferred write option',
    );
  });

test('enqueueClusterMembershipReconcile preserves retryable owner drain ' +
  'state after distributed participant failure', async (t) => {
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  });
  const ownerKey = coordinator.buildOwnerKey();
  const observedContexts = [];
  coordinator.reconcileClusterMembership = async (context) => {
    observedContexts.push(context);
    const error = new Error(
      PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_MESSAGE,
    );
    error.code =
      PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_CODE;
    error.retryAfterMs =
      PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRY_AFTER_MS;
    throw error;
  };

  const accepted = coordinator.enqueueClusterMembershipReconcile(
    PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A,
    {
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      },
      publicationActiveGateHandoff: {
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
        ],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
      publishedActiveNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
      ],
      requiredAckNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
      ],
      acknowledgedNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
      ],
    },
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  const diagnostics = coordinator.reconcileQueue.getDiagnostics();
  t.equal(
    accepted,
    true,
    'owner recovery queue item should be accepted before drain failure',
  );
  t.match(
    coordinator.lastControlPlaneConvergenceQueueOutcome,
    {
      ownerKey,
      operation: PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE,
      queueOutcome: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED,
      pressureOutcome:
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
    },
    'accepted owner recovery wake should remain observable',
  );
  t.equal(
    observedContexts.length,
    PUBLICATION_CONVERGENCE_OWNER_QUEUE_FIRST_CALL_COUNT,
    'accepted owner queue item should attempt owner reconcile once',
  );
  t.same(
    diagnostics.retryingKeys,
    [ownerKey],
    'retryable distributed failure should preserve owner queue retry state',
  );
  t.equal(
    diagnostics.retryableDrainFailureCount,
    PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT,
    'retryable owner drain failure should be counted',
  );
  t.match(
    diagnostics.retryStates[ownerKey],
    {
      type: PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYABLE_DRAIN_FAILURE,
      ownerKey,
      failureReason: PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE,
      retryAfterMs: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS,
      failureCount: PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT,
    },
    'owner queue retry state should classify the distributed participant failure',
  );
  t.match(
    coordinator.getControlPlaneOwnerQueueDepth(),
    {
      ownerKey,
      pendingWrites: PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT,
      retainedBacklogGrowthCount:
        PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT,
      retryingKeys: [ownerKey],
      retryableDrainFailureCount:
        PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT,
    },
    'owner queue depth should expose retrying handoff reconcile work',
  );
  t.same(
    observedContexts[0]?.publishedActiveNodeIds,
    [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
    'owner drain retry must preserve the complete handoff target context',
  );

  coordinator.reconcileQueue.shutdown();
});

test('deriveMembershipPublicationCandidate promotes healthy projected members while publication acknowledgements are still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'convergence-time promotions should advance the publication epoch from the latest durable epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'healthy projected members should be promoted even while the current publication epoch is still awaiting acknowledgements',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'serving',
          'node-3': 'joining',
        },
      },
      'the promoted member should remain publish-pending while the new epoch converges',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible projected members while publication is not converged',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'ack-pending convergence should accept projected members that are recovery-eligible even before full traffic eligibility converges',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.lifecycleState,
      MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      'promoted recovery-eligible members should stay publish-pending until acknowledgements close the new epoch',
    );
  });

test('deriveMembershipPublicationCandidate closes unchanged recovery-eligible ACK debt through the publication owner',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      false,
      'the fixture must stay on the existing publication epoch',
    );
    t.equal(
      candidate.publicationStatus,
      'PUBLISHED',
      'unchanged recovery-eligible ACK debt should close through canonical owner planning',
    );
    t.same(
      candidate.acknowledgedNodeIds,
      ['node-1', 'node-2'],
      'the pending required node should be folded into the owner ACK set',
    );
    t.same(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'serving',
      },
      'ACK closure should publish the durable member state instead of preserving publish-pending debt',
    );
  });

test('deriveMembershipPublicationCandidate does not block recovery-eligible promotion while recovery epochs are open',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      recoveryEpochsByNodeId: {
        'node-2': [
          {
            epochId: 'node-2:1',
            open: true,
          },
        ],
        'node-3': [
          {
            epochId: 'node-3:1',
            open: true,
          },
        ],
      },
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'open recovery epochs should not prevent promotion once recovery-eligible readiness is true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-2': 'catching_up',
        'node-3': 'catching_up',
      },
      'promoted members with open recovery epochs should remain marked as catching_up until convergence closes',
    );
  });
