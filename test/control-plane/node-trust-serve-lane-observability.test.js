/**
 * Serve-lane observability in the trust state.
 *
 * The serve lane computes blocking reason codes on every readiness build
 * and they were never logged anywhere: a repair_only trust verdict with
 * empty reasonCodes is undiagnosable from a captured run (round-12 spent
 * a full attribution round proving every observable conjunct green while
 * the discriminating signal stayed invisible). The trust state now
 * surfaces the serve lane's reason codes, prefixed serve_lane_, whenever
 * the canonical serve dimension is the blocker — and the readiness
 * revision diagnostic maps the evidence record's REAL field names
 * (localProjectionRevision/requiredPublicationRevision, each
 * {available, value}), which the old localRevision/requiredRevision
 * lookups never matched, leaving the diagnostic structurally null in
 * every run.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildNodeTrustState,
} from '../../src/control-plane/node-trust-state.js';

const NODE_ID = 'node-a';

function buildReadiness(options = {}) {
  return {
    nodeId: NODE_ID,
    observedAt: new Date(1000).toISOString(),
    membershipPublication: {
      publicationEpoch: 7,
      sourceSnapshotVersion: 17,
      status: 'PUBLISHED',
      publishedActiveNodeIdsPresent: true,
      publishedActiveNodeIds: [NODE_ID],
    },
    nodeEvidence: {
      status: 'active',
      lastHeartbeat: 100,
      heartbeatAgeMs: 400,
      staleHeartbeatLimitMs: 30000,
      clusterMemberHeartbeatFreshness: 'fresh',
      routerConnectionState: 'connected',
      transportConnected: true,
    },
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        options.serveEligible === true,
    },
    projectionReadinessContract: options.projectionReadinessContract || null,
    reasons: [],
  };
}

function buildTrust(readiness) {
  return buildNodeTrustState(readiness, {
    observerNodeId: 'observer-a',
    cacheWatermark: {
      state: 'known',
      nodesVersion: 11,
      servicesVersion: 12,
      nodesAppliedAtMs: 900,
      servicesAppliedAtMs: 901,
    },
    transport: {state: 'connected', observedAtMs: 1000},
  });
}

test('a serve-ineligible trust state surfaces the serve lane reason codes',
  (t) => {
    const trust = buildTrust(buildReadiness({
      serveEligible: false,
      projectionReadinessContract: {
        lanes: {
          serve: {
            ready: false,
            reasonCodes: ['serve_not_eligible', 'publication_stream_not_ready'],
          },
        },
      },
    }));
    t.equal(trust.serveEligible, false);
    t.ok(trust.reasonCodes.includes('serve_lane_serve_not_eligible'),
      'the serve lane blocker is named in the trust reason codes');
    t.ok(
      trust.reasonCodes.includes('serve_lane_publication_stream_not_ready'),
      'every serve lane code is surfaced');
    t.end();
  });

test('a serve-eligible trust state adds no serve lane codes', (t) => {
  const trust = buildTrust(buildReadiness({
    serveEligible: true,
    projectionReadinessContract: {
      lanes: {serve: {ready: true, reasonCodes: []}},
    },
  }));
  t.equal(trust.serveEligible, true);
  t.equal(
    trust.reasonCodes.filter((code) => code.startsWith('serve_lane_')).length,
    0,
    'no serve lane codes when the serve dimension passes');
  t.end();
});

test('the readiness revision diagnostic maps the evidence record field ' +
  'names', (t) => {
  const trust = buildTrust(buildReadiness({
    serveEligible: true,
    projectionReadinessContract: {
      lanes: {serve: {ready: true, reasonCodes: []}},
      evidence: {
        projectionRevision: {
          localProjectionRevision: {available: true, value: 5},
          requiredPublicationRevision: {available: true, value: 7},
          stale: true,
        },
      },
    },
  }));
  t.equal(trust.readinessRevision.localProjectionRevision, 5,
    'localProjectionRevision.value reaches the trust diagnostic');
  t.equal(trust.readinessRevision.requiredProjectionRevision, 7,
    'requiredPublicationRevision.value reaches the trust diagnostic');
  t.end();
});
