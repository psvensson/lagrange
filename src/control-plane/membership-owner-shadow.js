// Single-owner cutover — Phase 0 (divergence probe) + Phase 1 (minimal-input
// owner rule), shadow-only and default-OFF.
//
// The legacy authority for the active-member set is the 7-source
// `resolveActiveNodeViews()` projection, from which the published
// `cluster_membership` row is derived (a projection-of-a-projection). The
// single-owner cutover replaces that with one owner computing the set from a
// minimal authoritative input set. Before flipping authority we must measure
// where the simple owner rule diverges from the legacy projection, so this
// module computes the owner-candidate set ALONGSIDE the projection and emits a
// structured diff. It never writes and never changes behavior while the
// `LAGRANGE_MEMBERSHIP_OWNER_SHADOW` flag is off.
//
// Guardrail (leader-pin-catch-up lesson): a divergence is evidence to explain,
// not to relax away. A node the owner rule drops but the projection retained may
// be a genuine frozen-follower bug to fix in the lifecycle machine — never tune
// the owner toward the projection to make the diff vanish.

import {TYPEOF} from '../constants/index.js';
import {isReadinessPromotable} from './membership-publication-priority-partition-summary.js';
import {
  MEMBERSHIP_MEMBER_STATE,
  normalizeMembershipMemberState,
} from './membership-lifecycle-constants.js';

const MEMBERSHIP_OWNER_SHADOW_ENV = 'LAGRANGE_MEMBERSHIP_OWNER_SHADOW';
// Phase 2 flip flag (default OFF): when on, the owner rule AUTHORS the published
// active-member set instead of the projection. Separate from the shadow-probe flag
// so the probe can run without changing behavior, and from the leader-driven flag.
const MEMBERSHIP_OWNER_AUTHORITATIVE_ENV = 'LAGRANGE_MEMBERSHIP_OWNER_AUTHORITATIVE';
const MEMBERSHIP_OWNER_SHADOW_TRUE = 'true';

// Member states that exclude a node from the active-member set regardless of
// readiness (a draining or retired node is leaving, not serving).
const MEMBERSHIP_OWNER_INACTIVE_MEMBER_STATES = Object.freeze(new Set([
  MEMBERSHIP_MEMBER_STATE.DRAINING,
  MEMBERSHIP_MEMBER_STATE.RETIRED,
]));

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].sort();
}

function normalizeMemberStatesByNodeId(memberStatesByNodeId = {}) {
  if (!memberStatesByNodeId || typeof memberStatesByNodeId !== TYPEOF.OBJECT) {
    return {};
  }
  return Object.keys(memberStatesByNodeId).reduce((accumulator, nodeId) => {
    const normalizedNodeId = String(nodeId || '').trim();
    const normalizedState = normalizeMembershipMemberState(
      memberStatesByNodeId[nodeId],
    );
    if (normalizedNodeId && normalizedState) {
      accumulator[normalizedNodeId] = normalizedState;
    }
    return accumulator;
  }, {});
}

function isMembershipOwnerShadowEnabled(env = process.env) {
  return env?.[MEMBERSHIP_OWNER_SHADOW_ENV] === MEMBERSHIP_OWNER_SHADOW_TRUE;
}

// Phase 2: when true, the owner rule authors the published active-member set.
// DEFAULT-OFF (opt-in). N=8 validated convergence (stat-gate-20260620T183307Z:
// 8/8 converged), BUT default-on revealed the owner rule does not yet reproduce
// the projection's transient recovery-cohort / ACK-set / epoch-monotonicity /
// trim-widen / priority-spread semantics (~45 coordinator unit tests). It is a
// validated OPT-IN for steady-state convergence, NOT a drop-in default — must
// stay off until those behaviors are ported. See the plan's Phase 2 notes.
function isMembershipOwnerAuthoritative(env = process.env) {
  return env?.[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV] === MEMBERSHIP_OWNER_SHADOW_TRUE;
}

// The minimal-input single-owner rule (Phase 1, first cut). Deliberately simpler
// than the 7-source projection: the published baseline carried forward, unioned
// with nodes whose readiness evidence is promotable, minus nodes whose member
// state says they are leaving. The point is NOT to reproduce every projection
// overlay — it is to expose, via the Phase 0 diff, which overlays are
// load-bearing versus which were papering over racing projections.
function computeShadowActiveMemberSet(options = {}) {
  const publishedBaselineNodeIds = normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const memberStatesByNodeId = normalizeMemberStatesByNodeId(
    options.memberStatesByNodeId,
  );
  const isPromotable = (nodeId) =>
    isReadinessPromotable(readinessByNodeId[nodeId] || null);
  const readinessPromotableNodeIds = Object.keys(readinessByNodeId).filter(
    isPromotable,
  );
  // Phase 1 reconciliation (self-node fast path): the node computing the
  // candidate is alive and executing — the strongest possible membership signal,
  // which the projection captures trivially and the readiness-only rule misses
  // during early formation (the dominant onlyInProjection=[self] divergence).
  // Recovery-eligible nodes are already covered by isReadinessPromotable.
  const localNodeId = String(options.localNodeId || '').trim();
  // Freeze-gated baseline retention (matches the projection's safety semantics):
  // - Under freeze (broad suspicion) RETAIN the full published baseline so a
  //   suspicion storm cannot trim a quorum.
  // - Outside freeze, a baseline node is retained only while it stays
  //   readiness-promotable; a no-longer-promotable baseline node is TRIMMED
  //   (departed member), matching the projection's non-frozen steady trim.
  // `isReadinessPromotable(null)` is true, so a baseline node with no readiness
  // entry is retained — same default the projection uses.
  const membershipFreezeActive = options.membershipFreezeActive === true;
  const baselineRetainedNodeIds = membershipFreezeActive ?
    publishedBaselineNodeIds :
    publishedBaselineNodeIds.filter(isPromotable);
  const candidateNodeIds = normalizeNodeIdList([
    ...baselineRetainedNodeIds,
    ...readinessPromotableNodeIds,
    ...(localNodeId ? [localNodeId] : []),
  ]);
  return candidateNodeIds.filter((nodeId) =>
    !MEMBERSHIP_OWNER_INACTIVE_MEMBER_STATES.has(memberStatesByNodeId[nodeId]),
  );
}

// Phase 0 probe: structured comparison of the legacy projection-derived
// published set against the minimal-input owner candidate. `agree` is the
// falsifiable steady-state signal the cutover needs before any authority flip.
function buildMembershipOwnerDivergence(options = {}) {
  const projectionNodeIds = normalizeNodeIdList(options.projectionNodeIds);
  const shadowNodeIds = normalizeNodeIdList(options.shadowNodeIds);
  const projectionSet = new Set(projectionNodeIds);
  const shadowSet = new Set(shadowNodeIds);
  const onlyInProjection = projectionNodeIds.filter(
    (nodeId) => !shadowSet.has(nodeId),
  );
  const onlyInShadow = shadowNodeIds.filter(
    (nodeId) => !projectionSet.has(nodeId),
  );
  return Object.freeze({
    agree: onlyInProjection.length === 0 && onlyInShadow.length === 0,
    projectionNodeIds: Object.freeze(projectionNodeIds),
    shadowNodeIds: Object.freeze(shadowNodeIds),
    // Nodes the projection includes but the owner rule drops — the load-bearing
    // direction: a real frozen-follower bug, or an overlay that must be ported
    // into the machine before Phase 3 deletes it.
    onlyInProjection: Object.freeze(onlyInProjection),
    // Nodes the owner rule includes but the projection excludes — usually a
    // guard the projection applied that the owner rule has not yet modeled.
    onlyInShadow: Object.freeze(onlyInShadow),
    projectionCount: projectionNodeIds.length,
    shadowCount: shadowNodeIds.length,
    divergenceCount: onlyInProjection.length + onlyInShadow.length,
  });
}

export {
  MEMBERSHIP_OWNER_AUTHORITATIVE_ENV,
  MEMBERSHIP_OWNER_SHADOW_ENV,
  buildMembershipOwnerDivergence,
  computeShadowActiveMemberSet,
  isMembershipOwnerAuthoritative,
  isMembershipOwnerShadowEnabled,
};
