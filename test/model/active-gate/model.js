// Phase A — executable abstract model of the active-gate / snapshot-coverage
// convergence protocol (see models/active-gate/abstract-protocol.md). The same
// state variables and actions are rendered in TLA+ at models/active-gate/
// ActiveGate.tla; the shared models/active-gate/action-manifest.json plus the
// Phase D drift lint keep the two surfaces in lockstep.
//
// The model is kept honest against production by asserting, on every reachable
// state, that its convergence predicate equals the real catch-up fence
// buildPublicationActiveGateCatchupFence(...).promotionAllowed.

import {
  buildPublicationActiveGateCatchupFence,
} from '../../../src/control-plane/publication-active-gate-handoff-contract-fence.js';

export const STATE_VARIABLES = Object.freeze([
  'covered',
  'published',
  'fresh',
  'pending',
]);

export const ACTION_NAMES = Object.freeze([
  'ReconcileOwner',
  'DeferReentry',
  'AdvanceSnapshotCoverage',
  'PublishNode',
  'StaleEvent',
  'RefreshSnapshot',
]);

export const PROGRESS_ACTIONS = Object.freeze([
  'ReconcileOwner',
  'AdvanceSnapshotCoverage',
  'PublishNode',
  'RefreshSnapshot',
]);

export const REGRESSION_ACTIONS = Object.freeze([
  'DeferReentry',
  'StaleEvent',
]);

export const DEFAULT_NODES = Object.freeze(['n1', 'n2', 'n3']);

export function quorum(nodeCount) {
  if (nodeCount <= 0) return 0;
  return Math.floor(nodeCount / 2) + 1;
}

// The abstract state machine. `allowUnboundedReentry` mirrors the TLA+ constant:
// when false the regression actions (DeferReentry, StaleEvent) are disabled,
// modelling the bounded-re-entry architecture route.
export class AbstractGate {
  constructor(nodes = DEFAULT_NODES, {allowUnboundedReentry = true} = {}) {
    this.nodes = [...nodes];
    this.allowUnboundedReentry = allowUnboundedReentry;
    this.pending = new Set(this.nodes);
    this.covered = new Set();
    this.published = new Set();
    this.fresh = true;
  }

  get quorum() {
    return quorum(this.nodes.length);
  }

  // ----- guards -------------------------------------------------------------
  canReconcileOwner(n) {
    return this.pending.has(n);
  }

  canAdvanceSnapshotCoverage(n) {
    return !this.pending.has(n) && !this.covered.has(n);
  }

  canPublishNode(n) {
    return !this.pending.has(n) && this.covered.has(n) && !this.published.has(n);
  }

  canRefreshSnapshot() {
    return !this.fresh;
  }

  canDeferReentry(n) {
    return this.allowUnboundedReentry &&
      !this.pending.has(n) && !this.published.has(n);
  }

  canStaleEvent() {
    return this.allowUnboundedReentry && this.fresh;
  }

  // ----- effects ------------------------------------------------------------
  reconcileOwner(n) {
    this.pending.delete(n);
  }

  advanceSnapshotCoverage(n) {
    this.covered.add(n);
  }

  publishNode(n) {
    this.published.add(n);
  }

  refreshSnapshot() {
    this.fresh = true;
  }

  deferReentry(n) {
    this.pending.add(n);
    // Re-entry invalidates any snapshot coverage the node had accrued.
    this.covered.delete(n);
  }

  staleEvent() {
    this.fresh = false;
  }

  // ----- convergence & residual --------------------------------------------
  // Green iff every node is durably published and the snapshot is fresh.
  // published ⊆ covered is an invariant, so published == Nodes ⇒ covered == Nodes.
  convergedAbstract() {
    return this.nodes.length > 0 &&
      this.published.size === this.nodes.length &&
      this.covered.size >= this.quorum &&
      this.fresh === true;
  }

  // Distance to the green gate: unpublished nodes plus a staleness penalty.
  // Zero iff converged.
  residual() {
    const unpublished = this.nodes.length - this.published.size;
    return unpublished + (this.fresh ? 0 : 1);
  }

  // The exact option shape the production catch-up fence consumes.
  toFenceOptions() {
    return {
      expectedNodeIds: [...this.nodes],
      publishedActiveNodeIds: [...this.published],
      snapshotCoverage: {
        nodeIds: [...this.covered],
        fresh: this.fresh,
      },
    };
  }

  // Model↔code oracle: what production says about promotion for this state.
  realPromotionAllowed() {
    return buildPublicationActiveGateCatchupFence(this.toFenceOptions())
      .promotionAllowed === true;
  }

  // Safety invariants from the manifest.
  publishedSubsetCovered() {
    for (const n of this.published) {
      if (!this.covered.has(n)) return false;
    }
    return true;
  }

  coveredDisjointPending() {
    for (const n of this.covered) {
      if (this.pending.has(n)) return false;
    }
    return true;
  }

  snapshot() {
    return {
      pending: [...this.pending].sort(),
      covered: [...this.covered].sort(),
      published: [...this.published].sort(),
      fresh: this.fresh,
      residual: this.residual(),
    };
  }
}

// Deterministically drive a gate to convergence using only progress actions.
// Returns the residual trajectory so callers can assert strict progress. In
// route mode (allowUnboundedReentry=false) this always converges.
export function greedyDriveToConvergence(gate, maxSteps = 64) {
  const trajectory = [gate.residual()];
  let steps = 0;
  while (!gate.convergedAbstract() && steps < maxSteps) {
    let acted = false;
    for (const n of gate.nodes) {
      if (gate.canReconcileOwner(n)) {gate.reconcileOwner(n); acted = true;}
    }
    for (const n of gate.nodes) {
      if (gate.canAdvanceSnapshotCoverage(n)) {
        gate.advanceSnapshotCoverage(n); acted = true;
      }
    }
    for (const n of gate.nodes) {
      if (gate.canPublishNode(n)) {gate.publishNode(n); acted = true;}
    }
    if (gate.canRefreshSnapshot()) {gate.refreshSnapshot(); acted = true;}
    steps += 1;
    trajectory.push(gate.residual());
    if (!acted) break;
  }
  return {
    converged: gate.convergedAbstract(),
    steps,
    trajectory,
  };
}

// A stall window is `windowSize` consecutive recorded steps over which the
// residual never strictly decreased while it was still positive — the
// executable analog of R14's metric-stall (metricDelta <= 0 for K routes).
export function detectStallWindows(trajectory, windowSize = 4) {
  const windows = [];
  for (let i = 0; i + windowSize < trajectory.length; i += 1) {
    const start = trajectory[i];
    const slice = trajectory.slice(i, i + windowSize + 1);
    const decreased = slice.some((value, idx) => idx > 0 && value < slice[idx - 1]);
    if (start > 0 && !decreased) {
      windows.push({startIndex: i, residual: start, slice});
    }
  }
  return windows;
}

// Build the Phase C evidence artifact for a model run.
export function buildModelReport({
  source,
  mode,
  nodes,
  converged,
  residual,
  trajectory = [],
  stallWindows = [],
  livenessHolds,
  extra = {},
}) {
  return {
    schemaVersion: 'active-gate-model-report-v1',
    modelReport: true,
    source,
    mode,
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
    nodes: [...nodes],
    quorum: quorum(nodes.length),
    converged,
    residual,
    frontierCount: residual,
    livenessHolds,
    stallWindows,
    residualTrajectory: trajectory,
    generatedAt: new Date().toISOString(),
    ...extra,
  };
}
