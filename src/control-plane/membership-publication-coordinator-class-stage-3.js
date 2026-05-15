import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  normalizeNodeIdList,
} from './membership-publication-coordinator-stage-1.js';
import {MembershipPublicationCoordinatorClassStage2} from './membership-publication-coordinator-class-stage-2.js';

const MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
  ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_EPOCH_SNAKE: 'publication_epoch',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_ABSENT = Symbol(
  'membership-publication-reconcile-context-absent',
);

function isMembershipPublicationReconcileContext(value) {
  return value && typeof value === TYPEOF.OBJECT;
}

function mergeMembershipPublicationReconcileNodeIds(left, right) {
  return normalizeNodeIdList([
    ...normalizeNodeIdList(left),
    ...normalizeNodeIdList(right),
  ]);
}

function resolveMembershipPublicationReconcileFlag(previousValue, nextValue) {
  if (previousValue === false || nextValue === false) {
    return false;
  }
  if (nextValue === true || previousValue === true) {
    return true;
  }
  return nextValue ?? previousValue;
}

function resolvePublicationRowEpoch(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return NUM.ZERO;
  }
  const epoch = Number(
    row[MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLICATION_EPOCH] ??
      row[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLICATION_EPOCH_SNAKE
      ],
  );
  return Number.isFinite(epoch) && epoch > NUM.ZERO ? epoch : NUM.ZERO;
}

function selectLatestPublicationRow(previousContext, nextContext) {
  const previousRow =
    previousContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW
    ];
  const nextRow =
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW
    ];
  if (!isMembershipPublicationReconcileContext(previousRow)) {
    return nextRow;
  }
  if (!isMembershipPublicationReconcileContext(nextRow)) {
    return previousRow;
  }
  return resolvePublicationRowEpoch(nextRow) >=
    resolvePublicationRowEpoch(previousRow) ?
    nextRow :
    previousRow;
}

function mergeMembershipPublicationReconcileContext(previousContext, nextContext) {
  if (
    !isMembershipPublicationReconcileContext(previousContext) ||
    !isMembershipPublicationReconcileContext(nextContext)
  ) {
    return nextContext;
  }
  const publishedActiveNodeIds = mergeMembershipPublicationReconcileNodeIds(
    previousContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
  const requiredAckNodeIds = mergeMembershipPublicationReconcileNodeIds(
    previousContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS
    ],
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS
    ],
  );
  const acknowledgedNodeIds = mergeMembershipPublicationReconcileNodeIds(
    previousContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS
    ],
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS
    ],
  );
  return {
    ...previousContext,
    ...nextContext,
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW]:
      selectLatestPublicationRow(previousContext, nextContext),
    ...(publishedActiveNodeIds.length > NUM.ZERO ?
      {
        [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLISHED_ACTIVE_NODE_IDS]: publishedActiveNodeIds,
      } :
      {}),
    ...(requiredAckNodeIds.length > NUM.ZERO ?
      {
        [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .REQUIRED_ACK_NODE_IDS]: requiredAckNodeIds,
      } :
      {}),
    ...(acknowledgedNodeIds.length > NUM.ZERO ?
      {
        [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .ACKNOWLEDGED_NODE_IDS]: acknowledgedNodeIds,
      } :
      {}),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PENDING_VISIBILITY]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .ALLOW_PENDING_VISIBILITY
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .ALLOW_PENDING_VISIBILITY
        ],
      ),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER
        ],
      ),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_PUBLICATION_WRITE_READBACK]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .SKIP_PUBLICATION_WRITE_READBACK
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .SKIP_PUBLICATION_WRITE_READBACK
        ],
      ),
  };
}

class MembershipPublicationCoordinatorClassStage3 extends
  MembershipPublicationCoordinatorClassStage2 {
  enqueueClusterMembershipReconcile(
    reason = MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MANUAL,
    context = {},
    options = {},
  ) {
    const ownerKey = this.buildOwnerKey();
    const pendingContext =
      this.reconcileQueue?.pending instanceof Map ?
        this.reconcileQueue.pending.get(ownerKey)?.context :
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_ABSENT;
    const mergedContext = mergeMembershipPublicationReconcileContext(
      pendingContext,
      context,
    );
    return this.reconcileQueue.enqueue(ownerKey, reason, mergedContext, options);
  }
}

export {MembershipPublicationCoordinatorClassStage3 as MembershipPublicationCoordinator};
