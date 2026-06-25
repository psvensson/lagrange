// Single-owner cutover — divergence diff helper.
//
// The Phase 0 owner-shadow probe and the Phase 2 owner-authoritative flip
// (both env-gated) were retired after the cutover thesis was refuted. The pure
// `buildMembershipOwnerDivergence` diff is retained because the FD-upgrade SWIM
// divergence probe (coordinator-reads `_emitMembershipSwimDivergence`) reuses it
// to diff the SWIM detector's active set against the projection's published set.

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].sort();
}

// Structured comparison of two active-member sets. `agree` is the falsifiable
// quiescence signal the SWIM divergence probe emits.
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
  buildMembershipOwnerDivergence,
};
