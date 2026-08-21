/**
 * Single projection owner for the admin snapshot's publication active-gate
 * handoff. It derives coverage and expected membership from one node view,
 * then returns one canonical handoff contract.
 */
import {ADMIN_CACHE_DUMP} from './admin-constants.js';
import {uniqueSorted} from './admin-helpers.js';
import {buildReadinessByNodeId} from '../control-plane/active-node-projection.js';
import {
  buildPublicationActiveGateHandoffContract,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';

const EMPTY_NODE_ID = '';

function normalizeControlSnapshotNodeIdList(values = ADMIN_CACHE_DUMP.EMPTY) {
  return uniqueSorted(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) => String(value || EMPTY_NODE_ID).trim())
      .filter((value) => value.length > 0),
  );
}

function buildControlSnapshotPublicationActiveGateHandoff(options = {}) {
  const readinessByNodeId = buildReadinessByNodeId({
    readinessByNodeId: options.readinessByNodeId || null,
  });
  const snapshotCoverageNodeIds = normalizeControlSnapshotNodeIdList(
    options.activeNodeViews?.effectiveActiveNodeIds,
  );
  const computedHandoff = buildPublicationActiveGateHandoffContract({
    expectedNodeIds: snapshotCoverageNodeIds,
    nodeRows: options.nodeRows,
    snapshotCoverage: {nodeIds: snapshotCoverageNodeIds},
    publicationConvergence: options.publicationConvergence,
    readinessByNodeId,
  });
  const progressHandoff = selectPublicationActiveGateHandoffContract(
    options.publicationConvergence,
  );
  const progressPendingReconcileNodeIds = Array.isArray(
    progressHandoff?.pendingReconcileNodeIds,
  ) ? progressHandoff.pendingReconcileNodeIds : [];
  const progressPendingReconcileCount = Number(
    progressHandoff?.pendingReconcileCount,
  );
  const hasProgressOwnerReconcileDebt =
    progressHandoff?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION &&
    (progressPendingReconcileNodeIds.length > 0 ||
      Number.isFinite(progressPendingReconcileCount) &&
        progressPendingReconcileCount > 0);
  const computedPendingReconcileNodeIds = Array.isArray(
    computedHandoff?.pendingReconcileNodeIds,
  ) ? computedHandoff.pendingReconcileNodeIds : [];
  const computedPendingReconcileCount = Number(
    computedHandoff?.pendingReconcileCount,
  );
  const hasComputedOwnerReconcileDebt =
    computedHandoff?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
    computedPendingReconcileNodeIds.length > 0 ||
    Number.isFinite(computedPendingReconcileCount) &&
      computedPendingReconcileCount > 0;
  return hasProgressOwnerReconcileDebt && !hasComputedOwnerReconcileDebt ?
    progressHandoff : computedHandoff;
}

export {
  buildControlSnapshotPublicationActiveGateHandoff,
  normalizeControlSnapshotNodeIdList,
};
