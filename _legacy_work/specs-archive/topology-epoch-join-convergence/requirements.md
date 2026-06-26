# Requirements

## Summary

Join and restart convergence currently mix one authoritative bootstrap snapshot
with repeated point-in-time topology discovery against hot control-plane
partitions. The system needs a canonical bootstrap topology snapshot contract
that is published by one owner, hydrates the existing `SystemTableCache`, and
gives join readiness an explicit epoch/snapshot baseline before steady-state CDC
catch-up.

## Requirements

### 1. Canonical Bootstrap Topology Snapshot Owner

1.1 Bootstrap publication MUST expose one owner-derived topology snapshot
envelope built from the authoritative bootstrap snapshot rows and the current
assignment epoch.

1.2 The bootstrap topology snapshot envelope MUST be additive over the existing
bootstrap response and MUST NOT introduce a second topology store or second
cache.

1.3 The envelope MUST include topology metadata sufficient for a joining node
to reason about the snapshot without re-reading hot system partitions, including
the published epoch, active node IDs, hydration tables, and per-table row
counts.

### 2. Join-Side Snapshot Hydration Contract

2.1 Query-system-state bootstrap hydration MUST continue to hydrate the local
`SystemTableCache` from `systemTableSnapshots`.

2.2 During bootstrap hydration, the joining node MUST apply the authoritative
bootstrap epoch to the local `SystemTableCache` epoch watermark when a valid
bootstrap epoch is present.

2.3 The joining node MUST retain the published bootstrap topology snapshot
metadata as owner-provided state for later readiness evaluation.

### 3. Snapshot-First Canonical Join Readiness

3.1 Canonical join readiness MUST consume the published bootstrap topology
snapshot metadata instead of treating the bootstrap snapshot as unstructured
fallback data.

3.2 Canonical join readiness diagnostics MUST include the bootstrap topology
snapshot epoch and the locally applied topology epoch.

3.3 When authoritative cache state is not yet rich enough to answer active-node
or mesh-membership diagnostics, join readiness MUST use the bootstrap topology
snapshot metadata as the bootstrap baseline rather than issuing new discovery
waves.

### 4. Verification

4.1 Unit tests MUST cover bootstrap topology snapshot envelope publication.

4.2 Unit tests MUST prove bootstrap hydration applies the published epoch to the
local cache watermark.

4.3 Unit tests MUST prove canonical join readiness uses bootstrap topology
snapshot metadata for required-node and topology-epoch diagnostics.
