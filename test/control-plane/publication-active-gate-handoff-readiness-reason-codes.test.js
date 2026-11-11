/**
 * The active-gate handoff reads a node's readiness reason codes in the two
 * shapes their producers write: the readiness owner's `reasons` records
 * (built by buildReasons and normalised by createEligibilitySnapshot), read
 * through the owner's own collectReasonCodes, and the `reasonCodes` list the
 * control snapshot's observation overlay adds. No producer writes a bare
 * string reason, a `{reasonCode}` reason record or an entry-level
 * `reasonCode`, so none of those is a reason source.
 *
 * Until 2026-11-11 the record read named a constant member that did not
 * exist, so the readiness owner's PRIORITY_CONTROL_PLANE_RECOVERY_PENDING
 * never reached the handoff and a node in priority recovery was handed to
 * owner reconcile. The handoff's own contract names that reason as one the
 * owner must finish first (PENDING_OWNER_REASON_CODES, WAIT_OWNER_RECOVERY),
 * so the live read is the correct behaviour and is pinned here through the
 * real producer.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {buildReasons} from
  '../../src/control-plane/control-plane-readiness-evidence-reasons.js';
import {createEligibilitySnapshot} from
  '../../src/control-plane/eligibility-snapshot.js';
import {
  normalizePublicationActiveGateHandoffReasonCodes,
  resolvePublicationActiveGateHandoffPendingRecoveryNodeIds,
} from '../../src/control-plane/publication-active-gate-handoff-contract-evidence.js';
import {buildPublicationActiveGateHandoffContract} from
  '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION} from
  '../../src/control-plane/publication-active-gate-handoff-contract-constants.js';

const PENDING = CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
const OBSERVED_AT = '2026-11-11T00:00:00.000Z';
const READY_BUT_NOT_SERVE_ELIGIBLE = Object.freeze({
  processAlive: true,
  clusterMemberHealthy: true,
  routingReady: true,
  loadReady: true,
  metadataPublicationHealthy: true,
  controlPlaneWritable: true,
  controlPlanePublished: true,
  [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
});
const READINESS_SERVICE = Object.freeze({
  isLocalQueryTransportBlockedForNode: () => false,
  isCapacityPlacementEligible: () => true,
  buildNodeEvidence: () => null,
});

// A readiness snapshot as the readiness owner builds it.
function producedReadiness(nodeId, priorityRecoveryActive) {
  const reasons = buildReasons(READINESS_SERVICE, {
    nodeId,
    dimensions: READY_BUT_NOT_SERVE_ELIGIBLE,
    observedAt: OBSERVED_AT,
    priorityControlPlaneRecovery: {active: priorityRecoveryActive},
  });
  return createEligibilitySnapshot({
    nodeId,
    dimensions: READY_BUT_NOT_SERVE_ELIGIBLE,
    observedAt: OBSERVED_AT,
    reasons,
  });
}

test('reason codes come from the owner records and the overlay list only',
  async (t) => {
    t.same(
      normalizePublicationActiveGateHandoffReasonCodes({
        reasonCodes: ['from_overlay'],
        reasons: [
          {code: 'from_owner_record'},
          {reasonCode: 'no_producer_writes_this'},
          'no_producer_writes_this_either',
        ],
        reasonCode: 'nor_this',
      }),
      ['from_overlay', 'from_owner_record'],
    );
    t.same(normalizePublicationActiveGateHandoffReasonCodes(null), []);
  });

test('a node the readiness owner reports in priority recovery is pending ' +
  'recovery, and the handoff waits for the owner', async (t) => {
  const readinessByNodeId = {
    'node-a': producedReadiness('node-a', false),
    'node-b': producedReadiness('node-b', true),
    'node-c': producedReadiness('node-c', false),
  };
  t.same(readinessByNodeId['node-b'].reasons.map((reason) => reason.code),
    [PENDING], 'the producer states the reason as a {code} record');

  t.same(
    resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
      ['node-a', 'node-b', 'node-c'], readinessByNodeId),
    ['node-b'],
  );

  const contract = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: ['node-a', 'node-b', 'node-c'],
    readinessByNodeId,
    publicationConvergence: {
      publishedActiveNodeIds: ['node-a', 'node-c'],
      publicationStatus: 'PUBLISHED',
      recoveryProtocolState: 'open',
    },
  });
  t.same(contract.missingPublishedNodeIds, ['node-b']);
  t.same(contract.pendingRecoveryNodeIds, ['node-b']);
  t.same(contract.pendingReconcileNodeIds, []);
  t.equal(contract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
});

test('the observation overlay list still names pending recovery', async (t) => {
  t.same(
    resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
      ['node-a', 'node-b'],
      {'node-a': {reasonCodes: [PENDING]}, 'node-b': {reasons: [PENDING]}},
    ),
    ['node-a'],
  );
});
