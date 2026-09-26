/**
 * The planning owner's deferred answer is evidence-absent exactly when the
 * last completed verdict on the read's own decision dimension was not a
 * denial (fix-f4, Fact 2 of the instrumented join-SLO classification at
 * ab7669fd0).
 *
 * A deferred (refresh-pending) snapshot means "no current verdict yet". When
 * the completed snapshot it defers was ELIGIBLE on the read's dimension, any
 * reason codes it carried were informational (a lifecycle DEGRADED reason
 * such as PRIORITY_CONTROL_PLANE_RECOVERY_PENDING attached to an eligible
 * snapshot); copying them into the deferred denial made that denial
 * substantive, so the critical voter-ready floor stopped counting the node's
 * rows and a REPLACE idled at "(2/3)" for seconds (runs 2, 4, 5 on
 * tv-dator). When the completed snapshot was a DENIAL on that dimension, the
 * deferral keeps that denial's reasons: a stale denial never turns into
 * "no verdict" (every carve-out keeps its substantive guard closed).
 *
 * Expectations come from the production enumerations: every lifecycle
 * reason and every readiness reason code, on every readiness dimension.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {LIFECYCLE_REASON} from
  '../../src/bootstrap/lifecycle-controller-constants.js';
import {buildDeferredSnapshot} from
  '../../src/control-plane/readiness-planning-publication-contract.js';
import {isEvidenceAbsentReadinessDenialSnapshot} from
  '../../src/control-plane/readiness-denial-classification.js';
import {PriorityPublicationSafetyTopology} from
  '../../src/rebalancer/priority-publication-safety-topology.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED} from
  '../../src/rebalancer/priority-publication-safety-shared.js';
import {VOTER_RAFT_ROLES} from '../../src/raft/replica-voter-readiness.js';

const {VOTER_READY_REPLICA_TOPOLOGY_STATUSES} =
  OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED;
const NODE_ID = 'node-seed-deferred';
const TOKEN = Object.freeze({tokenKey: 'deferred-denial-token'});
const DIMENSIONS = Object.values(CONTROL_PLANE_READINESS_DIMENSION);
const REFRESH_PENDING =
  CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING;
// Every reason a completed snapshot can carry: the lifecycle reasons (the
// DEGRADED phase attaches them to otherwise eligible snapshots) and the
// readiness reason codes. The refresh-pending code itself is the deferral's
// own marker, not a completed verdict's reason.
const COMPLETED_REASON_CODES = [...new Set([
  ...Object.values(LIFECYCLE_REASON),
  ...Object.values(CONTROL_PLANE_READINESS_REASON),
])].filter((code) => code !== REFRESH_PENDING);

function completedSnapshot(decisionDimension, eligible, reasonCode) {
  const dimensions = {};
  for (const dimension of DIMENSIONS) {
    dimensions[dimension] = dimension === decisionDimension ? eligible : true;
  }
  return Object.freeze({
    nodeId: NODE_ID,
    dimensions: Object.freeze(dimensions),
    ...dimensions,
    reasons: Object.freeze([Object.freeze({code: reasonCode})]),
  });
}

function deferredCodes(deferred) {
  return deferred.reasons.map((reason) => reason.code);
}

test('a deferral of a completed snapshot that was ELIGIBLE on the read\'s ' +
  'dimension is evidence-absent, whatever informational reason the ' +
  'completed snapshot carried', async (t) => {
  const failures = [];
  for (const dimension of DIMENSIONS) {
    for (const reasonCode of COMPLETED_REASON_CODES) {
      const deferred = buildDeferredSnapshot(
        completedSnapshot(dimension, true, reasonCode),
        TOKEN,
        NODE_ID,
        dimension,
      );
      if (!isEvidenceAbsentReadinessDenialSnapshot(deferred)) {
        failures.push(`${dimension}/${reasonCode}: ` +
          JSON.stringify(deferredCodes(deferred)));
      }
    }
  }
  t.same(failures, [], 'every eligible-verdict deferral classifies ' +
    'evidence-absent (' + DIMENSIONS.length * COMPLETED_REASON_CODES.length +
    ' cases)');
});

test('the named case: a seed snapshot eligible on ' +
  'controlPlaneRecoveryEligible carrying PRIORITY_CONTROL_PLANE_RECOVERY_' +
  'PENDING defers to [planning_snapshot_refresh_pending] only', async (t) => {
  const dimension =
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  const deferred = buildDeferredSnapshot(
    completedSnapshot(
      dimension,
      true,
      LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    ),
    TOKEN,
    NODE_ID,
    dimension,
  );
  t.same(deferredCodes(deferred), [REFRESH_PENDING]);
  t.same([...deferred.runtimeAuthority.reasonCodes], [REFRESH_PENDING]);
  t.same([...deferred.priorityControlPlaneRecovery.reasonCodes],
    [REFRESH_PENDING]);
  t.equal(deferred.dimensions[dimension], false,
    'the deferral still denies: it only has no substantive reason');
});

test('a deferral of a completed DENIAL on the read\'s dimension keeps the ' +
  'denial\'s reasons and is never evidence-absent', async (t) => {
  const leaked = [];
  for (const dimension of DIMENSIONS) {
    for (const reasonCode of COMPLETED_REASON_CODES) {
      const deferred = buildDeferredSnapshot(
        completedSnapshot(dimension, false, reasonCode),
        TOKEN,
        NODE_ID,
        dimension,
      );
      const codes = deferredCodes(deferred);
      if (isEvidenceAbsentReadinessDenialSnapshot(deferred) &&
          !codes.includes(reasonCode)) {
        leaked.push(`${dimension}/${reasonCode}`);
      }
    }
  }
  t.same(leaked, [], 'no substantive denial becomes "no verdict"');
});

function createFloorHarness(readiness, decisionDimension) {
  const harness = Object.create(PriorityPublicationSafetyTopology.prototype);
  harness.controlPlaneReadinessService = {
    getNodeReadinessSync: () => readiness,
  };
  harness.resolveOperationReadinessDecisionDimension = () => decisionDimension;
  // The strict routable read is the participation gate's answer, which a
  // deferred snapshot denies; the floor's carve-out is what is under test.
  harness.isVoterReadyRoutableReplica = () => false;
  return harness;
}

test('the critical voter-ready floor counts a voter row whose node answers ' +
  'the deferral of an eligible snapshot, and not one whose node answers the ' +
  'deferral of a denial', async (t) => {
  const dimension =
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  const replicaRow = {
    node_id: NODE_ID,
    service_id: 'replica_operations-p1-r2',
    partition_id: 'replica_operations-p1',
    status: [...VOTER_READY_REPLICA_TOPOLOGY_STATUSES][0],
    raft_role: [...VOTER_RAFT_ROLES][0],
    address: `${NODE_ID}/partition/replica_operations-p1-r2`,
  };
  for (const reasonCode of COMPLETED_REASON_CODES) {
    const eligibleDeferral = buildDeferredSnapshot(
      completedSnapshot(dimension, true, reasonCode), TOKEN, NODE_ID, dimension);
    const deniedDeferral = buildDeferredSnapshot(
      completedSnapshot(dimension, false, reasonCode), TOKEN, NODE_ID, dimension);
    t.equal(
      createFloorHarness(eligibleDeferral, dimension)
        .isVoterReadyFloorCountableReplica(replicaRow, {
          decisionDimension: dimension,
        }),
      true,
      `eligible verdict + ${reasonCode}: row counted`,
    );
    t.equal(
      createFloorHarness(deniedDeferral, dimension)
        .isVoterReadyFloorCountableReplica(replicaRow, {
          decisionDimension: dimension,
        }),
      false,
      `denied verdict + ${reasonCode}: row not counted`,
    );
  }
});
