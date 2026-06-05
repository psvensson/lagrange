/**
 * Tests for break-point (b): a node's own priority-recovery spread dispatch must
 * NOT be gated on the node already being publication-ready.
 *
 * Root cause (TLA+ verified, models/readiness-starvation): after a rolling
 * restart the restarted node needs to run its priority-recovery spread dispatch
 * to ADVANCE its publication epoch and spread the priority partitions. The
 * break-glass exemption that lets that dispatch run while the node is otherwise
 * not serve-eligible previously required CONTROL_PLANE_PUBLISHED and
 * METADATA_PUBLICATION_HEALTHY to already be true — but those are exactly the
 * dimensions the dispatch produces, so during the wedge they are pending and the
 * exemption never fires (self-readiness gate). For self-targeted dispatches we
 * drop the publication-cluster and already-selected placement/provisioning
 * preconditions; for peer-targeted dispatches the stricter precondition is
 * preserved.
 */

import {test} from '../../src/test-helpers/tap.js';
import {shouldAllowPriorityRecoveryDispatchBootstrap} from
  '../../src/control-plane/replica-dispatch-priority-recovery-bootstrap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION as DIM,
  CONTROL_PLANE_READINESS_REASON as REASON,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON as RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const SELF_NODE_ID = 'node-self';
const PEER_NODE_ID = 'node-peer';
const PRIORITY_PARTITION_ID = 'replica_operations-p1';
const DECISION_DIMENSION = DIM.CONTROL_PLANE_RECOVERY_ELIGIBLE;

// The production wedge: the node's publication epoch is still pending, so the
// publication-cluster dimensions are false and the recovery-eligible decision
// dimension is false. This is precisely the state in which the node must run its
// own spread dispatch to make progress.
function buildPublicationPendingReadiness() {
  return {
    dimensions: {
      [DIM.PROCESS_ALIVE]: true,
      [DIM.CLUSTER_MEMBER_HEALTHY]: true,
      [DIM.LOAD_READY]: true,
      [DIM.PLACEMENT_ELIGIBLE]: false,
      [DIM.PROVISIONING_ELIGIBLE]: false,
      [DIM.CONTROL_PLANE_PUBLISHED]: false,
      [DIM.METADATA_PUBLICATION_HEALTHY]: false,
      [DIM.ROUTING_READY]: false,
      [DIM.CONTROL_PLANE_WRITABLE]: false,
      [DIM.CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
    },
    reasons: [
      {code: REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING},
      {code: RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD},
      {code: RECOVERY_REASON.PUBLICATION_EPOCH_PENDING},
    ],
    runtimeAuthority: {
      reasonCodes: [
        REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        REASON.ROUTING_NOT_READY,
      ],
    },
  };
}

// A node that IS already published but is merely not yet recovery-eligible — the
// pre-existing (peer-safe) break-glass condition.
function buildPublishedRecoveryPendingReadiness() {
  return {
    dimensions: {
      [DIM.PROCESS_ALIVE]: true,
      [DIM.CLUSTER_MEMBER_HEALTHY]: true,
      [DIM.LOAD_READY]: true,
      [DIM.PLACEMENT_ELIGIBLE]: true,
      [DIM.PROVISIONING_ELIGIBLE]: true,
      [DIM.CONTROL_PLANE_PUBLISHED]: true,
      [DIM.METADATA_PUBLICATION_HEALTHY]: true,
      [DIM.ROUTING_READY]: false,
      [DIM.CONTROL_PLANE_WRITABLE]: false,
      [DIM.CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
    },
    reasons: [
      {code: REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING},
      {code: RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD},
    ],
    runtimeAuthority: {
      reasonCodes: [
        REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        REASON.ROUTING_NOT_READY,
      ],
    },
  };
}

test('self-targeted dispatch is allowed while publication epoch is pending', async (t) => {
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: SELF_NODE_ID},
    readiness: buildPublicationPendingReadiness(),
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.ok(
    allowed,
    'the dispatch that produces publication readiness must not require it',
  );
  t.end();
});

test('peer-targeted dispatch is NOT allowed while publication epoch is pending', async (t) => {
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: PEER_NODE_ID},
    readiness: buildPublicationPendingReadiness(),
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.notOk(
    allowed,
    'a peer that is not yet published must not get the relaxed exemption',
  );
  t.end();
});

test('peer-targeted dispatch keeps the pre-existing exemption when published', async (t) => {
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: PEER_NODE_ID},
    readiness: buildPublishedRecoveryPendingReadiness(),
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.ok(
    allowed,
    'existing published-but-recovery-pending exemption is unchanged',
  );
  t.end();
});

test('peer-targeted dispatch still requires provisioning eligibility', async (t) => {
  const readiness = buildPublishedRecoveryPendingReadiness();
  readiness.dimensions[DIM.PLACEMENT_ELIGIBLE] = false;
  readiness.dimensions[DIM.PROVISIONING_ELIGIBLE] = false;
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: PEER_NODE_ID},
    readiness,
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.notOk(
    allowed,
    'peer-targeted recovery dispatches must keep the provisioning gate',
  );
  t.end();
});

test('self-targeted dispatch still requires the core liveness dimensions', async (t) => {
  const readiness = buildPublicationPendingReadiness();
  readiness.dimensions[DIM.LOAD_READY] = false;
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: SELF_NODE_ID},
    readiness,
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.notOk(
    allowed,
    'the relaxation only drops publication preconditions, not core liveness',
  );
  t.end();
});

test('exemption only applies on the recovery-eligible decision dimension', async (t) => {
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: PRIORITY_PARTITION_ID, targetNodeId: SELF_NODE_ID},
    readiness: buildPublicationPendingReadiness(),
    decisionDimension: DIM.SERVE_ELIGIBLE,
    selfNodeId: SELF_NODE_ID,
  });
  t.notOk(
    allowed,
    'the break-glass is scoped to the recovery-eligible decision only',
  );
  t.end();
});

test('exemption only applies to priority control-plane partitions', async (t) => {
  const allowed = shouldAllowPriorityRecoveryDispatchBootstrap({
    operation: {partitionId: 'users-p1', targetNodeId: SELF_NODE_ID},
    readiness: buildPublicationPendingReadiness(),
    decisionDimension: DECISION_DIMENSION,
    selfNodeId: SELF_NODE_ID,
  });
  t.notOk(
    allowed,
    'ordinary partitions never receive the priority-recovery break-glass',
  );
  t.end();
});
