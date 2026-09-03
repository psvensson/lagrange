// ProjectionReadinessEvidenceOwner — the single owner of normalized projection
// readiness evidence reuse for a node.
//
// Boundary (quest projection-readiness-evidence-amplification-v3): during cold
// formation the SAME node's readiness evidence is observed and re-normalized
// hundreds of times per formation while its authoritative generation is
// unchanged. normalizeProjectionReadinessOwnDataGraph (a recursive strict
// deep-copy + freeze) is a pure function of the observed source, so a per-node
// generation-keyed memo of the frozen normalized contract collapses the
// redundant normalize (profile owner U2) and its allocation/GC (U4) without
// touching source observation.
//
// This owner does NOT observe, does NOT decide source freshness, and does NOT
// elide any authoritative read — SourceObservationOwner keeps that authority.
// The caller performs the observation under its existing freshness contract and
// hands this owner (a) the assembled contract source, (b) a generation key
// built from the state ACTUALLY observed, and (c) a stability predicate. The
// owner returns the same immutable frozen contract by reference on a key match,
// otherwise it builds once and — only if the generation stayed stable across
// the build (R6, finding D race) — replaces the node's owned entry.
//
// Never shared across nodes: the memo is keyed strictly per nodeId, so two
// nodes whose observed evidence differs are independently owned even at the
// same table generation (R2).


class ProjectionReadinessEvidenceOwner {
  constructor() {
    // nodeId -> { key: string, contract: frozen }
    this.entryByNodeId = new Map();
    // Instrumentation for R1 / PERF: normalize builds this owner actually ran
    // vs reuse hits it served. Consumer evaluation count never moves builds.
    this.normalizeBuildCount = 0;
    this.reuseHitCount = 0;
    // Builds that observed a generation change mid-build and were therefore
    // not memoized (volatile generation — R6 conservative skip).
    this.volatileSkipCount = 0;
  }

  /**
   * Resolve the normalized projection-readiness contract for one node, reusing
   * the owned frozen graph when the generation key is unchanged.
   *
   * @param {string} nodeId
   * @param {string} generationKey  Comparable digest of the state ACTUALLY
   *   observed for this evaluation. Equal keys ⇒ semantically equal source ⇒
   *   the frozen contract may be reused by reference.
   * @param {Function} buildContract  Zero-arg synchronous builder that performs
   *   the normalize/freeze and returns the frozen contract.
   * @param {Function} generationStable  Zero-arg predicate re-evaluated AFTER
   *   the build; returns true iff the authoritative generation has not moved
   *   since `generationKey` was captured. A false result means the observation
   *   window straddled a mutation, so the freshly built contract is returned
   *   but NOT memoized under a generation it may not match.
   * @return {Object} the frozen normalized contract.
   */
  resolveContract(nodeId, generationKey, buildContract, generationStable) {
    if (typeof nodeId !== 'string' || nodeId.length === 0 ||
        typeof generationKey !== 'string' || generationKey.length === 0) {
      // No stable identity/key to memoize against: build without owning it.
      return buildContract();
    }
    const entry = this.entryByNodeId.get(nodeId);
    if (entry && entry.key === generationKey) {
      this.reuseHitCount += 1;
      return entry.contract;
    }
    const contract = buildContract();
    this.normalizeBuildCount += 1;
    if (typeof generationStable === 'function' && generationStable() !== true) {
      // The observed generation changed while we built: publishing this graph
      // under `generationKey` could alias a stale contract to a newer
      // generation on the next hit. Skip memoization; a later stable
      // evaluation populates the entry.
      this.volatileSkipCount += 1;
      return contract;
    }
    this.entryByNodeId.set(nodeId, {key: generationKey, contract});
    return contract;
  }

  /**
   * Drop one node's owned entry. Used when a per-node authoritative signal
   * (NODES/SERVICES change) fires; the key already guards correctness, so this
   * is memory hygiene plus a belt-and-suspenders invalidation (R4).
   * @param {string} nodeId
   */
  invalidateNode(nodeId) {
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      this.entryByNodeId.delete(nodeId);
    }
  }

  /**
   * Drop every owned entry. Used when the backing cache/observation owner is
   * replaced (its mutation-version counters reset), so no prior generation key
   * remains comparable.
   */
  invalidateAll() {
    this.entryByNodeId.clear();
  }

  /** @return {number} distinct nodes with an owned entry. */
  ownedNodeCount() {
    return this.entryByNodeId.size;
  }

  /** @return {Object} instrumentation counters (R1 / PERF receipts). */
  stats() {
    return {
      normalizeBuildCount: this.normalizeBuildCount,
      reuseHitCount: this.reuseHitCount,
      volatileSkipCount: this.volatileSkipCount,
      ownedNodeCount: this.entryByNodeId.size,
    };
  }

  /** Reset instrumentation counters without dropping owned entries. */
  resetStats() {
    this.normalizeBuildCount = 0;
    this.reuseHitCount = 0;
    this.volatileSkipCount = 0;
  }
}

export {
  ProjectionReadinessEvidenceOwner,
};
