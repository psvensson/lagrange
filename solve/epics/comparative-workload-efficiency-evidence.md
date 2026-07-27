---
epicContractVersion: 2
id: comparative-workload-efficiency-evidence
roadmapRow: null
graduatesTo: comparative-workload-efficiency-evidence
---

# Comparative workload-efficiency evidence

## Intent (why now)

Turn the hypothesis that Lagrange can be more cost-efficient than alternative
architectures into bounded, reproducible evidence. The program identifies
where the architecture could avoid work, measures paired alternatives under
equivalent semantics and SLOs, and publishes losses and neutral results as
readily as wins. It does not presume that larger or more diverse workloads
automatically favor Lagrange.

## Selected boundary

- This program owns workload equivalence, alternative topology definitions,
  paired A/B execution, whole-topology infrastructure-cost projection, and
  evidence-qualified claim generation.
- Large-scale certification owns profile identity, hardware and software
  identity, resource/performance gates, remote-byte thresholds, and certified
  large profiles. Comparative runs consume its shared evidence contract.
- Service-data affinity owns attribution, placement, decay, hysteresis, and
  routing semantics. This program measures those owners; it does not replace
  them.
- The current PostgreSQL comparator is an input to extend, not trustworthy
  publication evidence: it needs semantic SQL parity, correct-operation
  accounting, like-for-like quantiles, open-loop load, and full topology cost.
- The opportunity calculator is a transparent analytical pre-screen, not the
  deterministic virtual-time cost model rejected by
  `solve/epics/dst-cost-model-circle.md`.

## Evidence ladder

Shared prerequisite:

1. `scale-certification-evidence-contract`
2. `scale-certification-receipt-freshness`

Comparative program:

1. `comparative-efficiency-evidence-contract`
2. `comparative-efficiency-opportunity-calculator`
3. `benchmark-semantic-parity`
4. `benchmark-statistical-capacity-protocol`
5. `benchmark-whole-topology-resource-accounting`
6. `comparative-efficiency-negative-controls`
7. `comparative-efficiency-request-enrichment`
8. `comparative-efficiency-movielens-public-request-workload`
9. `comparative-efficiency-movielens-grouped-reduce`
10. `comparative-efficiency-change-rate-crossover`
11. `comparative-efficiency-claim-projection`

The complete dependency graph and terminal predicates live in the graduated
specification. Completion of a workload Quest means the preregistered matrix
produced valid evidence, not that Lagrange won.

## Claim classes

- `analytical_bound`: unit-checked opportunity estimate with explicit
  assumptions; never a measured speed or cost claim.
- `measured_p0`: paired result on the development profile; not a scale claim.
- `certified_profile`: paired result whose named scale profile is currently
  certified.
- `no_claim`: mandatory projection for absent, invalid, stale, incomparable, or
  practically inconclusive evidence.

## Open questions

- Which alternative architecture and deployment topology is the first
  publication comparator after PostgreSQL parity is repaired?
- Which region, billing granularity, reserved/spot policy, storage class, and
  inter-zone price sheet will define the first cost projection?
- Which P0 matrix runs per change and which larger matrices run nightly or on
  release?

## Decision log

- 2026-07-27 — Assigned the exact Cartesian matrix manifest, digest-resolved
  root evidence envelope, resource-window join, and separately recomputable
  capacity/cost effects to C4 before any C5–C9 matrix evidence is emitted.
- 2026-07-27 — Added the scale-owned terminal-receipt freshness prerequisite
  for claim projection. P0 workload measurement remains parallel and can
  support only `measured_p0`; `certified_profile` consumes the scale owner's
  currentness decision.
- 2026-07-26 — Chose an outcome-neutral analytical-plus-measured program and
  graduated executable detail to
  `solve/specs/comparative-workload-efficiency-evidence/`.
- 2026-07-26 — Assigned the common run-profile/report contract to scale
  certification, affinity semantics to the affinity owner, and comparative
  parity, paired measurement, topology accounting, and claims to this program.
- 2026-07-26 — Split PostgreSQL remediation into semantic parity, statistical
  capacity protocol, and whole-topology accounting; classified existing
  comparison artifacts as historical diagnostics only.
- 2026-07-26 — Required the MovieLens comparison to use the public request/WASM
  deployment surface before it can support a product comparison.
