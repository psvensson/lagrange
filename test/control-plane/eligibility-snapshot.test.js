import {test} from '../../src/test-helpers/tap.js';
import {
  AUTHORITY_DESCRIPTOR_STATE,
  CONTROL_PLANE_READINESS_DIMENSION,
  PROVISIONING_ELIGIBILITY_STATE,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
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
    runtimeAuthority: {
      state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
      authorityAvailable: true,
      ready: false,
      processAlive: true,
      clusterMemberHealthy: false,
      routingReady: true,
      writeEligible: false,
      recoveryEligible: true,
      repairEligible: false,
      publication: {
        state: RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY,
        healthy: true,
      },
      visibility: {
        state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
        published: false,
        observedAt: FIXTURE_OBSERVED_AT,
      },
      repair: {
        state: RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
        applied: false,
      },
      provisioning: {
        state: PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE,
        eligible: true,
      },
      failure: {
        state: AUTHORITY_DESCRIPTOR_STATE.KNOWN,
        reason: 'control_plane_publication_pending',
      },
      reasonCodes: ['control_plane_publication_pending'],
    },
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
  t.match(
    compact[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY],
    {
      state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
      visibility: {
        state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
      },
      provisioning: {
        state: PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE,
      },
      failure: {
        state: AUTHORITY_DESCRIPTOR_STATE.KNOWN,
      },
    },
  );
});
