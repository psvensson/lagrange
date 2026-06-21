# Lever #2 (failure-detector consolidation) — scoping verdict (2026-06-21)

Scoping pass for cutover plan §5 step 3 / inventory Lever #2, done **before** any
FD-extraction code, applying the arc's discipline ("deterministic implementation is the
real test of a simplification thesis"; plan §7/§8). Premise tested against the source +
adversarially verified by an independent subagent. **The premise largely does not hold —
same pattern as Levers #1 and #3.**

## Premise (inventory rev 2, Lever #2)
> The readiness guards ARE an ad-hoc, unnamed failure detector, SCATTERED across
> `resolveActiveNodeViews` overlays + ~8 readiness guards with **no named owner**.
> Consolidate the ~10 membership-derived guards into ONE named FD module.

## Verdict: the control-plane FD is ALREADY consolidated (one owner). Premise refuted there.

- The control-plane membership/active-set detector is a **single function with one owner**:
  `resolveProjectedActiveNodeSelection` (`active-node-projection.js:457`). It builds the
  candidate set, integrates per-node evidence, and emits a structured selection with
  **named evidence diagnostics** (`recoveryEligibleIncludedNodeIds`,
  `runtimeAuthorityIncludedNodeIds`, `livenessFallbackIncludedNodeIds`,
  `readinessExcludedNodeIds`, `clusterMemberUnhealthyExcludedNodeIds`,
  `retentionGraceMisses`).
- All ~15 cited "scattered guards" are **in-pipeline helpers** of that function
  (`evaluateProjectionReadinessDimensions`, `shouldAllowLivenessFallbackProjection`,
  `hasRuntimeTransportEvidence`, `isCanonicallyActiveNode`,
  `resolveTransportAliveRetentionMissReason`, `buildReadinessByNodeId`) — heartbeat grace
  (:41), ready-lease grace (:85), transport-retention grace (:316), liveness-fallback
  (:329), runtime-authority overlays (:202/:205), recovery-eligible (:226), self-node fast
  paths, lease/transport guards. **~14 of 15 are class A (in the one pipeline).**
- The `control-plane-readiness-*` family **produces the readiness evidence that FEEDS**
  this function (assembled in `membership-publication-coordinator-planning.js` →
  `buildMembershipPublicationEvidenceSnapshot` → passed in as `readinessByNodeId` /
  `connectedNodeIds`). Upstream pipeline, **not** an independent detector.
- The **membership freeze** (`active-node-projection.js:675`,
  `membership-publication-target-selection.js:113`) is a **suspicion-quorum safety clamp**
  over the already-projected set (don't trim a quorum under mass suspicion) — the SWIM /
  Akka split-brain property. It already exists and is named in effect; formalize, keep.

## The genuinely-scattered residual: ~9–10 independent transport-liveness probes

These read the transport (`messageRouter.getConnectedNodes/getConnectionState/pingNode`)
to make their OWN liveness decision, outside the projection:

| # | Site | Role |
|---|------|------|
| 1 | `rebalancer/unified-rebalancer-priority-readiness.js:381` `resolveConnectedClusterNodeIds()` | own connected-set for priority-readiness/quorum |
| 2 | `rebalancer/unified-rebalancer-available-nodes.js:310` | filter rebalance candidates by transport-connected |
| 3 | `rebalancer/unified-rebalancer-replica-state.js:103/185/201` | transport+ping gate on replica-op targets |
| 4 | `rebalancer/operation-workflow-remove-safety-evaluator.js:543/548` | remove-safety quorum ping over voter-ready rows |
| 5 | `rebalancer/operation-workflow-recovery-timeout.js:630` | ping to unblock a waiting recovery op |
| 6 | `control-plane/lease-service.js:282` `isNodeTransportConnected()` | expired-lease = CDC-lag vs failure (lease-expiry) |
| 7 | `node/node-readiness-policy.js:268/296` | node-local readiness gate |
| 8 | `node/replica-handler-transition-policy.js:130` | exclude disconnected from replica transition |
| 9 | `query/query-executor-partition-service-resolution.js:173` | connected-only routing for CP writes (split-brain envelope) |
| 10 | `bootstrap/join-readiness-mesh-connectivity-methods.js:298` | mesh-divergence reconciliation trigger |

**Crucial caveat — these are NOT a clean consolidation target.** Most are *local,
real-time operational gates* ("is this peer reachable right now for THIS lease/op/route"),
deliberately faster and more local than the consensus-installed view. Routing #4/#6/#9
through a slower installed-view FD could be a **correctness regression** (a remove-safety
quorum check wants live reachability, not last-installed membership). So this residual is
a *per-site judgment* (should this defer to the FD or stay a local probe?), not a
mechanical fold. A few (#1/#2 vs #4) may compute the same "connected cluster set" and are a
candidate small DRY helper — verify equivalence before merging.

## What Lever #2 actually reduces to

1. **Naming / formalization (low-risk, modest value).** Rename/doc
   `resolveProjectedActiveNodeSelection` + its diagnostics to literature vocabulary (SWIM
   suspect/confirm, Lifeguard local-health/refute, φ-accrual suspicion); formalize the
   freeze gate as the named suspicion-quorum property. Cosmetic — a load-bearing rename
   across the publication pipeline is churn for little behavioral gain; prefer DOC over
   rename. The FD-layer naming is already partly delivered by the layer-ownership
   contract + this doc.
2. **FD-protocol REPLACEMENT (the real, larger investment — operator-gated).** Replace the
   per-node eligibility filter with an actual suspicion-accrual protocol (SWIM probe/
   suspect/confirm + Lifeguard local-health to cut false-positive removals, or φ-accrual
   for tunable suspicion). This is a **behavior change**, not a consolidation: it needs the
   Phase-0 divergence-probe + equivalence harness (already built, reusable), N≥8 gate
   validation, and the plan §6 operator decisions below. The payoff (fewer false-positive
   trims, tunable/known-correct semantics) is real but is a multi-session project.

## Decision points (plan §6 — operator's call, blocks the protocol path)
- **Strong vs weak membership** (recommend keep strong: agreement stays Raft; SWIM gossip
  for the FD layer only).
- **Adopt vs specify the detector** (recommend adopt memberlist/Lifeguard *semantics*,
  implement in-tree against this transport).
- **Appetite.** Naming/doc is cheap and safe now. The protocol replacement is the only
  remaining *large* membership-simplification investment, and it is an upgrade (better
  false-positive behavior), not a cleanup of accidental complexity — because the
  thorough audit found little accidental complexity left.

## Net strategic conclusion
After three implementation-contact audits, all three rev-2 near-term levers shrank: the
membership architecture is **already substantially correct and consolidated** (consensus-
installed monotonic view + a single-owner FD projection + a named suspicion-quorum freeze).
The structural-guard (§5 step 1) locked that in. The remaining work is NOT cleanup; it is an
optional **protocol upgrade** (SWIM/Lifeguard) gated on operator appetite + the §6 decisions.
The original "membership truth has no owner / 7 sources = mess / big LOC collapse" thesis is
fully retired: the complexity is essential evidence integration, now named and guarded.
