# Tasks: Large-Scale Data-Plane Certification

## Ordered Quest ladder

| Order | Quest | Required terminal |
| --- | --- | --- |
| L0 | `scale-certification-evidence-contract` | Shared versioned profile/config/report schema records software, hardware, topology, cardinality, bytes, workload, feasibility, safety, performance, resources, convergence, provenance, and claim eligibility for scale and comparative consumers. |
| L0a | `scale-certification-receipt-freshness` — ✅ SOLVED 2026-07-28 | A content-bound terminal-certification receipt binds its exact Quest, profile, measured evidence, issuance, and expiry, and the scale owner alone makes the fail-closed currentness decision consumed by claim projectors. |
| L1 | `placement-balance-feasibility-oracle` | Small worlds compare the existing placement owner with exact optima; infeasible inputs produce typed reasons; large-world lower bounds are defined. |
| L2 | `scale-cardinality-harness` | Cost-bounded sparse runs exercise high node/table/partition/replica cardinality and expose planner/control-plane amplification without claiming physical-byte proof. |
| L3 | `scale-resource-performance-gates` | Benchmark and leak enforcement are enabled; heap/RSS/fds/queues/in-flight work/throughput/latency are fail-closed report fields. |
| L4 | `scale-topology-churn-certification` | P1 add/fail/restart/replace/decommission/rebuild matrix is safe and statistically convergent. |
| L5 | `scale-hundred-node-certification` | P2 passes both cardinality and physical-byte proof on a sealed hardware class. |
| L6 | `scale-two-hundred-node-two-hundred-terabyte-certification` | P3 passes the complete matrix; only this terminal may support the requested hundreds-node/hundreds-TB claim. |

## L0 — Shared evidence contract

Create the single versioned profile/config/report identity for P0 and future
certified profiles. It must accept complete scale and comparative-consumer
fixtures, reject missing identity or gate fields, and keep P0 validity distinct
from P1–P3 certification.

## L0a — Certification receipt freshness

Extend the external terminal-certification receipt referenced by L0 without
forking the scale report identity. The receipt must have its own exact versioned
schema and content digest; bind the terminal Quest, profile identity, measured
evidence identity, `issuedAt`, and `validUntil`; and be evaluated against an
explicit injected time. The scale owner rejects missing, malformed, unresolved,
replayed, not-yet-valid, and expired receipts. Comparative consumers resolve
content and consume this decision rather than reimplementing it. P0 remains
development-profile evidence and cannot become scale-certified.

## Authoring and cost gates

- L0–L3 must reuse current harness/report/placement/resource mechanisms.
- L0 must prove P0 round-trip validation and rejection fixtures before
  `comparative-efficiency-evidence-contract` seals; comparative fields extend
  its identity and never fork it.
- L0a must be terminal before a consumer projects `certified_profile`; it does
  not gate P0 workload measurement or `measured_p0`.
- L4 cannot seal until Raft snapshot recovery is sufficient for its rebuild
  envelope, or its profile explicitly retains the complete required log.
- L5/L6 cannot be authored until infrastructure, budget, duration, cleanup,
  data-generation, and artifact-retention contracts are approved.
- Large physical runs are periodic/release gates, not the deterministic
  iteration loop.
- Every profile records logical and physical bytes separately, including RF and
  temporary movement/rebuild amplification.
- A typed infeasible result is truthful diagnostic evidence but never a passing
  balance sample for a profile declared feasible.

## Release claim

The support envelope is a projection of terminal profile evidence, not a
roadmap symbol. If a later software or hardware change invalidates the profile
contract, the release gate must rerun before retaining the claim.
