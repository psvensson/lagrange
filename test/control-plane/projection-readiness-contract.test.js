import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_OPERATOR_STATE,
  PROJECTION_READINESS_REASON,
} from '../../src/control-plane/projection-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_REASON,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
  STARTUP_AUTHORITY_STATE,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';

const TEST_NODE_ID = 'node-projection-ready';
const TEST_PUBLICATION_REVISION = Object.freeze({
  LOCAL_STALE: 4,
  REQUIRED: 5,
});
const TEST_READY_DIMENSIONS = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
});
const TEST_PUBLISHED_MEMBERSHIP = Object.freeze({
  publicationEpoch: TEST_PUBLICATION_REVISION.REQUIRED,
  status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  requiredAckNodeIds: Object.freeze([TEST_NODE_ID]),
  acknowledgedNodeIds: Object.freeze([TEST_NODE_ID]),
});
const TEST_EMPTY_REASON_CODES = Object.freeze([]);
const TEST_PUBLICATION_DETAIL_REASON_CODES = Object.freeze([
  PUBLICATION_OWNER_REASON.ACK_COMPLETE,
  PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_OWNER_REASON.STREAM_FRESH,
]);
const TEST_PRIORITY_RECOVERY_DETAIL_REASON_CODES = Object.freeze([
  PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
]);
const TEST_PROJECTION_READINESS_REASON_CODE_SET = new Set(
  Object.values(PROJECTION_READINESS_REASON),
);

function assertTopLevelProjectionReadinessReasonsAreCanonical(t, readiness) {
  t.same(
    readiness.reasonCodes.filter((reasonCode) =>
      TEST_PROJECTION_READINESS_REASON_CODE_SET.has(reasonCode) !== true,
    ),
    TEST_EMPTY_REASON_CODES,
    'top-level reason codes should use only projection-readiness reasons',
  );
}

test('ProjectionReadiness blocks stale local projection revision by lane',
  (t) => {
    const readiness = buildProjectionReadinessContract({
      dimensions: TEST_READY_DIMENSIONS,
      membershipPublication: TEST_PUBLISHED_MEMBERSHIP,
      localProjectionRevision: TEST_PUBLICATION_REVISION.LOCAL_STALE,
      requiredProjectionRevision: TEST_PUBLICATION_REVISION.REQUIRED,
    });

    t.equal(
      readiness.lanes.internal.ready,
      false,
      'stale projection should block the internal lane',
    );
    t.equal(
      readiness.lanes.serve.ready,
      false,
      'stale projection should also block serve readiness',
    );
    t.equal(
      readiness.reasonCodes.includes(
        PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE,
      ),
      true,
      'stale projection should expose a canonical reason',
    );
    assertTopLevelProjectionReadinessReasonsAreCanonical(t, readiness);
    t.end();
  });

test('ProjectionReadiness keeps publication lag out of repair lane',
  (t) => {
    const readiness = buildProjectionReadinessContract({
      dimensions: TEST_READY_DIMENSIONS,
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_REVISION.REQUIRED,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        requiredAckNodeIds: [TEST_NODE_ID],
        acknowledgedNodeIds: [],
      },
    });

    t.equal(
      readiness.lanes.repair.ready,
      true,
      'repair lane should stay ready while publication awaits ACK',
    );
    t.equal(
      readiness.lanes.serve.ready,
      false,
      'serve lane should stay closed on publication lag',
    );
    t.equal(
      readiness.lanes.serve.reasonCodes.includes(
        PROJECTION_READINESS_REASON.PUBLICATION_STREAM_NOT_READY,
      ),
      true,
      'publication lag should use the canonical serve-lane reason',
    );
    assertTopLevelProjectionReadinessReasonsAreCanonical(t, readiness);
    t.end();
  });

test('ProjectionReadiness reports repair-only operator state',
  (t) => {
    const readiness = buildProjectionReadinessContract({
      dimensions: {
        ...TEST_READY_DIMENSIONS,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      },
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_REVISION.REQUIRED,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        requiredAckNodeIds: [TEST_NODE_ID],
        acknowledgedNodeIds: [],
      },
    });

    t.equal(
      readiness.state,
      PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
      'repair-ready but serve-blocked state should remain recovery_open',
    );
    t.equal(
      readiness.lanes.repair.ready,
      true,
      'repair lane should be open from recovery eligibility',
    );
    t.equal(
      readiness.lanes.operator.state,
      PROJECTION_READINESS_OPERATOR_STATE.DEGRADED,
      'operator lane should report degraded repair-only readiness',
    );
    t.equal(
      readiness.activeGate.state,
      PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY,
      'downstream active gate should expose repair-ready state',
    );
    assertTopLevelProjectionReadinessReasonsAreCanonical(t, readiness);
    t.end();
  });

test('ProjectionReadiness reports serve readiness only when all lanes close',
  (t) => {
    const readiness = buildProjectionReadinessContract({
      dimensions: TEST_READY_DIMENSIONS,
      membershipPublication: TEST_PUBLISHED_MEMBERSHIP,
      priorityControlPlaneRecovery: {
        active: false,
        reasonCodes: TEST_PRIORITY_RECOVERY_DETAIL_REASON_CODES,
      },
    });

    t.equal(
      readiness.state,
      PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
      'contract state should be serve_ready',
    );
    t.equal(readiness.lanes.internal.ready, true);
    t.equal(readiness.lanes.repair.ready, true);
    t.equal(readiness.lanes.serve.ready, true);
    t.equal(readiness.lanes.operator.ready, true);
    t.equal(
      readiness.activeGate.state,
      PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY,
      'downstream active gate should expose serve readiness',
    );
    t.same(
      readiness.reasonCodes,
      TEST_EMPTY_REASON_CODES,
      'serve-ready contract should not expose top-level blocker reasons',
    );
    assertTopLevelProjectionReadinessReasonsAreCanonical(t, readiness);
    t.same(
      readiness.evidence.publicationReasonCodes,
      TEST_PUBLICATION_DETAIL_REASON_CODES,
      'publication detail should remain in evidence reason codes',
    );
    t.same(
      readiness.evidence.priorityRecoveryReasonCodes,
      TEST_PRIORITY_RECOVERY_DETAIL_REASON_CODES,
      'priority detail should remain in evidence reason codes',
    );
    t.same(
      readiness.priorityRecovery.reasonCodes,
      TEST_PRIORITY_RECOVERY_DETAIL_REASON_CODES,
      'priority detail should remain nested under priority recovery',
    );
    t.end();
  });

test('Startup authority consumes projection readiness active gate',
  (t) => {
    const repairOnlyReadiness = buildProjectionReadinessContract({
      dimensions: {
        ...TEST_READY_DIMENSIONS,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      },
      membershipPublication: {
        publicationEpoch: TEST_PUBLICATION_REVISION.REQUIRED,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        requiredAckNodeIds: [TEST_NODE_ID],
        acknowledgedNodeIds: [],
      },
    });
    const startupAuthority = buildStartupAuthoritySnapshotFromPlanningAnswer({
      publicationEpoch: TEST_PUBLICATION_REVISION.REQUIRED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      priorityPartitionSummary: {satisfied: true},
      projectionReadinessContract: repairOnlyReadiness,
    });

    t.equal(
      startupAuthority.state,
      STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
      'startup authority should keep active gate pending for repair-only projection readiness',
    );
    t.same(
      startupAuthority.projectionReadinessActiveGate,
      repairOnlyReadiness.activeGate,
      'startup authority should preserve the projection active-gate outcome',
    );
    t.end();
  });
