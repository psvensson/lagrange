---
epicContractVersion: 2
id: large-scale-data-plane-certification
roadmapRow: null
graduatesTo: large-scale-data-plane-certification
---

# Large-scale data-plane certification

## Intent (why now)

Replace extrapolation from the seven-node harness with a declared, reproducible
support envelope for nodes, tables, partitions, replicas, bytes, topology
changes, and foreground workload. Cardinality scale and physical-data scale are
separate proof axes and neither may stand in for the other.

## Selected boundary

- Reuse the distributed harness, invariant engine, benchmark gate,
  `local-memory-soak` leak analysis, capacity accounting, placement owner, and
  topology analyzers.
- Add scale profiles and report schemas, not a second scheduler or diagnostics
  vocabulary.
- Qualify every balance claim by feasibility. Infeasible profiles return a
  typed reason and never masquerade as convergence.
- Compare small worlds with an exact oracle and large worlds with declared lower
  bounds plus hard SLOs. A one-move fixpoint is not global balance evidence.
- The target program includes at least 200 nodes and 200 TB of logical user data
  across multiple tables, but that profile is unsupported until its hardware
  class and every safety, performance, resource, and convergence gate pass.

## Quest ladder

1. `scale-certification-evidence-contract`
2. `placement-balance-feasibility-oracle`
3. `scale-cardinality-harness`
4. `scale-resource-performance-gates`
5. `scale-topology-churn-certification`
6. `scale-hundred-node-certification`
7. `scale-two-hundred-node-two-hundred-terabyte-certification`

The first Quest seals the report and configuration contract. Later profiles
cannot be authored until their cost, hardware class, and predecessor evidence
are known.

## Open questions

- Which infrastructure provider and storage class own the 100- and 200-node
  profiles?
- Which physical-data subsets run per change, nightly, and on release?
- Which measured partition-size distribution sets the profile-specific
  indivisibility bound?

## Decision log

- 2026-07-25 — Selected independent cardinality and byte ladders,
  feasibility-qualified balance, enforced resource/performance gates, and a
  staged target of at least 200 nodes / 200 TB. Graduated requirements to
  `solve/specs/large-scale-data-plane-certification/requirements.md`.
