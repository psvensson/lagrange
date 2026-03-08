import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  READINESS_SNAPSHOT_KEY,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
} from '../../src/control-plane/eligibility-snapshot.js';

const FIXTURE_NODE_ID = 'node-eligibility';
const FIXTURE_OBSERVED_AT = '2026-03-07T08:00:00.000Z';

test('EligibilitySnapshot reuses one immutable readiness object for repair ' +
  'and serve decisions', async (t) => {
  const snapshot = createEligibilitySnapshot({
    nodeId: FIXTURE_NODE_ID,
    observedAt: FIXTURE_OBSERVED_AT,
    lifecycleState: 'running',
    dimensions: {
      processAlive: true,
      clusterMemberHealthy: true,
      routingReady: true,
      loadReady: false,
      placementEligible: false,
      controlPlaneWritable: true,
      metadataPublicationHealthy: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    },
    reasons: [
      {code: 'load_not_ready'},
      {code: 'storage_budget_unavailable'},
    ],
  });

  const repairDecision = evaluateEligibilityDecision(
    snapshot,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  );
  const serveDecision = evaluateEligibilityDecision(
    snapshot,
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  );
  const compact = compactEligibilitySnapshot(
    snapshot,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  );

  t.ok(Object.isFrozen(snapshot), 'snapshot must be immutable');
  t.equal(repairDecision.eligible, true);
  t.same(repairDecision.failedDimensions, []);
  t.equal(serveDecision.eligible, false);
  t.same(
    [...serveDecision.failedDimensions].sort(),
    ['loadReady', 'placementEligible', 'serveEligible'],
    'serve decisions should be evaluated from the shared dimensions',
  );
  t.same(
    serveDecision.reasonCodes,
    ['load_not_ready', 'storage_budget_unavailable'],
  );
  t.equal(
    compact[READINESS_SNAPSHOT_KEY.NODE_ID],
    FIXTURE_NODE_ID,
  );
  t.equal(
    compact[READINESS_SNAPSHOT_KEY.OBSERVED_AT],
    FIXTURE_OBSERVED_AT,
  );
  t.equal(
    compact[READINESS_SNAPSHOT_KEY.DECISION_DIMENSION],
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  );
});
