# A characterization — readiness sync-read fan-out (measurement only)

Local formation, post-B tree (50bfe369b + uncommitted samplers:
`scratchpad/attribution-plus-A-characterization.patch`). Seed node-0,
3 sampled windows (~3 min formation). Cluster formed. Stopped before repair.

## The five required measurements

1. **Which caller causes the repeated reads:** ONE caller — 100% of 17,364
   sampled sync reads stack through
   `ReadinessPlanningSnapshotOwner.reconcile (readiness-planning-snapshot-owner.js:692)
   ← OwnerKeyReconcileQueue._startReconcile`: the planning owner's own
   BACKGROUND rebuild loop, already routed through the macrotask-bounded
   heavy-work scheduler (the `readiness-freshness-macrotask-bound` coupled
   pair's sanctioned path). Trust-state, dispatch-capture, mutation-readiness
   and participation reads never appear: they are served from the planning
   owner's completed snapshots and do not drive builds.
2. **Sync reads / outer planning cycle & /node:** 15,964 sync reads over
   ~180s ≈ 89/s cluster-view ≈ ~18 per node per second (5 nodes) — one
   reconcile per (node × source-change event), by design.
3. **Owner builds / authoritative generation:** 10,774 builds vs 1,355
   reuses (11.2% reuse), 125 volatile skips (~1.2%). Volatile-skip rate ⇒
   ~20-25 table mutations/s during formation; the generation key's
   table-version segments are CLUSTER-WIDE, so ANY covered-table mutation
   rotates EVERY node's key ≈ 20+ rotations/node/s — matching ~12
   builds/node/s with ~11% reuse. Builds track the key faithfully.
4. **Do repeated calls see the same generation:** ~11% yes (reuse, cheap);
   ~89% see a genuinely rotated KEY. The planning owner's own
   completed-snapshot reuse additionally absorbs ~24% of sync reads before
   they reach the seam (15,964 reads vs 12,129 seam resolutions).
5. **Entry/candidate paths stay collapsed** (B holds concurrently):
   entry-memo misses 1; candidate derivations 866 (~2.3ms each, 1.98s —
   its own separate owner).

## Classification (per the operator's A1-A4 taxonomy)

**A3 — overly-fast generation churn, amplified by key granularity — executed
by a single, legitimate, already-bounded caller loop.** Not A4 (one caller),
not A2 in the redundant-read sense (unchanged-generation repeats reuse
cheaply), and the loop itself is A1-legitimate (it is the designed rebuild
mechanism). The cost driver is that the v3/v4 generation key deliberately
over-approximates with six CLUSTER-WIDE table mutation versions
("over-invalidation is acceptable; under-invalidation is not"), so during
formation churn every table write rotates every node's key even when that
write cannot change that node's readiness semantics.

## Candidate repair directions (NOT started — owner design decision)

1. Finer-grained key segments: per-node/row-scoped version signals for the
   tables where a mutation is node-attributable (NODES/SERVICES rows carry
   nodeId), keeping whole-table versions for genuinely cluster-wide tables —
   shrinks rotation fan-out from O(nodes) to O(1) per write without
   weakening invalidation.
2. Reconcile coalescing: collapse multiple queued source-change reconciles
   for one owner key inside a macrotask window into one rebuild at the
   latest generation (the queue already serializes per key; coalescing is a
   queue-depth policy, not a freshness change).
Both preserve the caller loop; per the operator directive, do not slow a
correct caller loop merely because its count is large. Note: the 250ms
planning-version latch precedent (membership-planning-version-key.js) is the
in-repo prior art for bounding churn-driven rotation inside a sealed
staleness budget.
