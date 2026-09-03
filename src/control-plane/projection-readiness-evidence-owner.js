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
//
// v4 (semantic-core / envelope split): the owned entry is the TIMESTAMP-FREE
// SEMANTIC CORE of the readiness contract — its generation key digests only
// semantic dependencies (observation-time fields are excluded by
// projection-readiness-evidence-generation.js, each embed site classified),
// so a moving clock alone never rotates it. Per-evaluation observation time
// lives in the evaluation snapshot ENVELOPE composed downstream
// (control-plane-readiness-evidence-reasons.js), never inside this owner's
// reusable core, and a cached core is never mutated to refresh a timestamp.
//
// Generation granularity (quest projection-readiness-per-node-generation-
// granularity-v2): the key is a pure content digest of the node's OWN
// observed semantic inputs (projection-readiness-evidence-generation.js
// classifies every seam source field; no cluster-wide version, no planning
// segment), so a mutation that cannot change node N's core never rotates N's
// key. Every build is attributed to the key segment that rotated
// (membershipPublication / nodeEvidence / verdict digests / initial) in both
// the sync-section tags and `stats()`, so a live profile names the residual
// rotator. A generation the owner cannot prove complete is never memoized
// (`resolveContractUnowned`, counted by reason).

import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {
  PROJECTION_READINESS_GENERATION_SEGMENT,
  attributeProjectionReadinessGenerationRotation,
} from './projection-readiness-evidence-generation.js';

// Sync-section attribution (instrumentation-only, projection-readiness
// re-measurement): per-window counts and time for owner builds vs reuse hits,
// so a live profile can tell generation-key rotation (builds ~ evaluations,
// reuse ~ 0) from un-memoized-caller dominance (reuse high, normalize time
// attributed to other sections).
const OWNER_SYNC_SECTION = Object.freeze({
  BUILD: 'projection_readiness_owner_build',
  BUILD_PREFIX: 'projection_readiness_owner_build_',
  REUSE: 'projection_readiness_owner_reuse',
  UNKEYED_BUILD: 'projection_readiness_owner_unkeyed_build',
  UNOWNED_BUILD_PREFIX: 'projection_readiness_owner_unowned_build_',
  VOLATILE_SKIP: 'projection_readiness_owner_volatile_skip',
});

// Build cause = the rotated key segment, or the node's first build.
const OWNER_BUILD_CAUSE_INITIAL = 'initial';
const OWNER_BUILD_CAUSES = Object.freeze([
  OWNER_BUILD_CAUSE_INITIAL,
  ...PROJECTION_READINESS_GENERATION_SEGMENT,
]);
// Per-cause build sections nest inside the aggregate BUILD section, so the
// watchdog site sample ranks each rotator by the normalize time it actually
// cost while the aggregate stays comparable across profiles.
const OWNER_BUILD_SECTION_BY_CAUSE = Object.freeze(Object.fromEntries(
  OWNER_BUILD_CAUSES.map((cause) =>
    [cause, OWNER_SYNC_SECTION.BUILD_PREFIX + cause]),
));

function zeroCountByCause() {
  return Object.fromEntries(OWNER_BUILD_CAUSES.map((cause) => [cause, 0]));
}

function resolveBuildCause(entry, generationKey) {
  if (!entry) {
    return OWNER_BUILD_CAUSE_INITIAL;
  }
  return attributeProjectionReadinessGenerationRotation(
    entry.key, generationKey) || OWNER_BUILD_CAUSE_INITIAL;
}

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
    // Rotation attribution: builds by the key segment that rotated.
    this.buildCountByCause = zeroCountByCause();
    // Fail-closed builds (generation not provably complete), by reason.
    this.unownedBuildCountByReason = {};
    // Per-node attribution (BOUNDED-WORK receipts): nodeId -> counters.
    this.statsByNodeId = new Map();
  }

  /** @private */
  nodeCounters(nodeId) {
    let counters = this.statsByNodeId.get(nodeId);
    if (!counters) {
      counters = {
        buildCount: 0,
        reuseCount: 0,
        volatileSkipCount: 0,
        buildCountByCause: zeroCountByCause(),
      };
      this.statsByNodeId.set(nodeId, counters);
    }
    return counters;
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
   * @param {Function} [generationStable]  Optional zero-arg predicate
   *   re-evaluated AFTER the build; returns true iff the generation has not
   *   moved since `generationKey` was captured. A false result means the
   *   observation window straddled a mutation, so the freshly built contract
   *   is returned but NOT memoized under a generation it may not match. The
   *   production seam passes none since v2 (a content key cannot straddle);
   *   the owner keeps the R6 discipline for any version-bracketed caller.
   * @return {Object} the frozen normalized contract.
   */
  resolveContract(nodeId, generationKey, buildContract, generationStable) {
    if (typeof nodeId !== 'string' || nodeId.length === 0 ||
        typeof generationKey !== 'string' || generationKey.length === 0) {
      // No stable identity/key to memoize against: build without owning it.
      return trackSyncSection(OWNER_SYNC_SECTION.UNKEYED_BUILD, buildContract);
    }
    const entry = this.entryByNodeId.get(nodeId);
    const counters = this.nodeCounters(nodeId);
    if (entry && entry.key === generationKey) {
      this.reuseHitCount += 1;
      counters.reuseCount += 1;
      return trackSyncSection(OWNER_SYNC_SECTION.REUSE, () => entry.contract);
    }
    const cause = resolveBuildCause(entry, generationKey);
    const contract = trackSyncSection(OWNER_SYNC_SECTION.BUILD, () =>
      trackSyncSection(OWNER_BUILD_SECTION_BY_CAUSE[cause], buildContract));
    this.normalizeBuildCount += 1;
    this.buildCountByCause[cause] += 1;
    counters.buildCount += 1;
    counters.buildCountByCause[cause] += 1;
    if (typeof generationStable === 'function' && generationStable() !== true) {
      // The observed generation changed while we built: publishing this graph
      // under `generationKey` could alias a stale contract to a newer
      // generation on the next hit. Skip memoization; a later stable
      // evaluation populates the entry.
      this.volatileSkipCount += 1;
      counters.volatileSkipCount += 1;
      trackSyncSection(OWNER_SYNC_SECTION.VOLATILE_SKIP, () => null);
      return contract;
    }
    this.entryByNodeId.set(nodeId, {key: generationKey, contract});
    return contract;
  }

  /**
   * Build WITHOUT owning the result because the generation is not provably
   * complete (DEP-SCOPE fail-closed: an unclassified source field, a digest
   * depth overflow, or an unavailable global revision). Counted by reason so
   * a live profile shows exactly why reuse did not fire.
   * @param {string} reason
   * @param {Function} buildContract
   * @return {Object} the frozen normalized contract.
   */
  resolveContractUnowned(reason, buildContract) {
    const key = String(reason);
    this.unownedBuildCountByReason[key] =
      (this.unownedBuildCountByReason[key] || 0) + 1;
    return trackSyncSection(
      OWNER_SYNC_SECTION.UNOWNED_BUILD_PREFIX + key, buildContract);
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

  /**
   * Per-node instrumentation counters (BOUNDED-WORK receipts).
   * @param {string} nodeId
   * @return {Object}
   */
  nodeStats(nodeId) {
    const counters = this.nodeCounters(nodeId);
    return {
      buildCount: counters.buildCount,
      reuseCount: counters.reuseCount,
      volatileSkipCount: counters.volatileSkipCount,
      buildCountByCause: {...counters.buildCountByCause},
    };
  }

  /** @return {Object} instrumentation counters (R1 / PERF receipts). */
  stats() {
    return {
      normalizeBuildCount: this.normalizeBuildCount,
      reuseHitCount: this.reuseHitCount,
      volatileSkipCount: this.volatileSkipCount,
      ownedNodeCount: this.entryByNodeId.size,
      buildCountByCause: {...this.buildCountByCause},
      unownedBuildCountByReason: {...this.unownedBuildCountByReason},
    };
  }

  /** Reset instrumentation counters without dropping owned entries. */
  resetStats() {
    this.normalizeBuildCount = 0;
    this.reuseHitCount = 0;
    this.volatileSkipCount = 0;
    this.buildCountByCause = zeroCountByCause();
    this.unownedBuildCountByReason = {};
    this.statsByNodeId = new Map();
  }
}

export {
  ProjectionReadinessEvidenceOwner,
};
