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
 * exist, so no readiness reason reached the handoff. Reading it again showed
 * what the reasons are:
 *   - PRIORITY_CONTROL_PLANE_RECOVERY_PENDING is cluster-level: the readiness
 *     owner writes it on every node that is not serve eligible while the
 *     publication recovery gate is active. It is ONE fact on the handoff
 *     (recoveryGate) and never lists a node as pending recovery, so a node
 *     missing from the publication stays a reconcile target;
 *   - the observation overlay's deferred-snapshot-source reasons are
 *     per-node: they list the node whose own entry carries them.
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
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE,
  normalizePublicationActiveGateHandoffReasonCodes,
  resolvePublicationActiveGateHandoffPendingRecoveryNodeIds,
  resolvePublicationActiveGateHandoffRecoveryGate,
} from '../../src/control-plane/publication-active-gate-handoff-contract-recovery-evidence.js';
import {
  buildPublicationActiveGateHandoffContract,
  hasPublicationActiveGateOwnerReconcileSignal,
  normalizePublicationActiveGateHandoffContract,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_OBSERVATION_REASON,
} from '../../src/control-plane/publication-active-gate-handoff-contract-constants.js';

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

const NODES = Object.freeze(['node-a', 'node-b', 'node-c']);
const PUBLISHED_WITHOUT_B = Object.freeze({
  publishedActiveNodeIds: ['node-a', 'node-c'],
  publicationStatus: 'PUBLISHED',
  recoveryProtocolState: 'open',
});

test('the readiness owner states recovery pending on every node that is not ' +
  'serve eligible: one cluster fact, and the missing node is reconciled',
async (t) => {
  // The gate is active for the cluster, so the producer writes the reason on
  // the published nodes and on the missing node alike.
  const readinessByNodeId = Object.fromEntries(
    NODES.map((nodeId) => [nodeId, producedReadiness(nodeId, true)]));
  for (const nodeId of NODES) {
    t.same(readinessByNodeId[nodeId].reasons.map((reason) => reason.code),
      [PENDING], 'the producer states the reason as a {code} record');
  }
  t.same(
    resolvePublicationActiveGateHandoffRecoveryGate(NODES, readinessByNodeId),
    {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE,
      reasonCode: PENDING,
    },
  );
  t.same(
    resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
      NODES, readinessByNodeId),
    [],
    'the cluster reason lists no node as waiting',
  );

  const contract = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: NODES,
    readinessByNodeId,
    publicationConvergence: PUBLISHED_WITHOUT_B,
  });
  t.same(contract.missingPublishedNodeIds, ['node-b']);
  t.same(contract.pendingRecoveryNodeIds, []);
  t.same(contract.pendingReconcileNodeIds, ['node-b']);
  t.equal(contract.recoveryGate.state,
    PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE);
  t.equal(contract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION);
  t.same(contract.crossOwnerHandoffContract.acknowledgementRule
    .requiredAckNodeIds, NODES, 'the gate excuses no node from publication');
  t.equal(contract.crossOwnerHandoffContract.acknowledgementRule
    .acknowledgementSatisfied, false);
  const target = resolvePublicationActiveGateMembershipPublicationTarget({
    publicationActiveGateHandoff: contract,
  });
  t.equal(target.reconcileRequired, true);
  t.same(target.publishedActiveNodeIds, NODES,
    'the cluster gate removes no node from the reconcile target');
});

test('the overlay list stating the cluster reason on the missing node alone ' +
  'still reconciles it', async (t) => {
  const contract = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: NODES,
    readinessByNodeId: {'node-b': {reasonCodes: [PENDING]}},
    publicationConvergence: PUBLISHED_WITHOUT_B,
  });
  t.same(contract.pendingRecoveryNodeIds, []);
  t.same(contract.pendingReconcileNodeIds, ['node-b']);
  t.equal(contract.recoveryGate.state,
    PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE);
  t.equal(contract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION);
});

test('with every node published and the gate active, the handoff waits for ' +
  'the recovery owner and names no node', async (t) => {
  const readinessByNodeId = Object.fromEntries(
    NODES.map((nodeId) => [nodeId, producedReadiness(nodeId, true)]));
  const contract = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: NODES,
    readinessByNodeId,
    publicationConvergence: {
      ...PUBLISHED_WITHOUT_B,
      publishedActiveNodeIds: NODES,
    },
  });
  t.same(contract.missingPublishedNodeIds, []);
  t.same(contract.pendingRecoveryNodeIds, []);
  t.equal(contract.pendingRecoveryCount, 0);
  t.equal(contract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
  t.equal(contract.runtimePromotionAllowed, false);
  // The wait survives the contract being re-read: the gate is carried on the
  // contract, and no node count decides it.
  const normalized = normalizePublicationActiveGateHandoffContract(contract);
  t.equal(normalized.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
  t.equal(normalized.pendingRecoveryCount, 0);
  t.equal(hasPublicationActiveGateOwnerReconcileSignal({
    publicationActiveGateHandoff: contract,
  }), true, 'the wait is the owner\'s to answer');
  const target = resolvePublicationActiveGateMembershipPublicationTarget({
    publicationActiveGateHandoff: contract,
  });
  t.equal(target.reconcileRequired, false);
  t.equal(target.handoffContract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
});

test('the gate is clear when entries were read and none states it, and ' +
  'unavailable when no entry was read', async (t) => {
  const clear = Object.fromEntries(
    NODES.map((nodeId) => [nodeId, producedReadiness(nodeId, false)]));
  t.same(resolvePublicationActiveGateHandoffRecoveryGate(NODES, clear), {
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.CLEAR,
    reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON
      .NO_ENTRY_REPORTS_RECOVERY_PENDING,
  });
  for (const unread of [null, {}, {'node-z': producedReadiness('node-z', true)}]) {
    t.same(resolvePublicationActiveGateHandoffRecoveryGate(NODES, unread), {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.UNAVAILABLE,
      reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_REASON
        .READINESS_EVIDENCE_UNAVAILABLE,
    });
  }
});

test('a per-node reason lists the node whose own entry carries it, and only ' +
  'that node waits', async (t) => {
  const readinessByNodeId = {
    'node-a': {reasonCodes: [PENDING]},
    'node-b': {
      reasonCodes: [SELECTED_SNAPSHOT_SOURCE_TIMEOUT_OBSERVATION_REASON],
    },
    // No producer writes a bare string reason.
    'node-c': {reasons: [SELECTED_SNAPSHOT_SOURCE_TIMEOUT_OBSERVATION_REASON]},
  };
  t.same(
    resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
      NODES, readinessByNodeId),
    ['node-b'],
  );
  const contract = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: NODES,
    readinessByNodeId,
    publicationConvergence: PUBLISHED_WITHOUT_B,
  });
  t.same(contract.pendingRecoveryNodeIds, ['node-b']);
  t.same(contract.pendingReconcileNodeIds, []);
  t.equal(contract.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
});
