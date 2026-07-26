# Tasks: Comparative Workload-Efficiency Evidence

## Dependency graph

| Order | Quest | Requires | Required terminal |
| --- | --- | --- | --- |
| L0 | `scale-certification-evidence-contract` | Existing scale epic/spec | Shared versioned profile/config/report identity validates P0 and future certified profiles. |
| C0 | `comparative-efficiency-evidence-contract` | L0 | Pair, parity, statistics, accounting, price, artifact, and claim fields extend the shared identity and reject incomplete evidence. |
| C1 | `comparative-efficiency-opportunity-calculator` | C0 | Unit-checked immutable analytical estimates and sensitivity bounds are reproducible and fail closed. |
| C2 | `benchmark-semantic-parity` | C0 | Dialect-aware execution proves result, ordering, error, transaction, durability, and correct-operation parity. |
| C3 | `benchmark-statistical-capacity-protocol` | C2 | Open-loop randomized blocked pairs produce preregistered SLO capacity curves and uncertainty. |
| C4 | `benchmark-whole-topology-resource-accounting` | C3 | Live-calibrated whole-topology resources and versioned infrastructure-price projection produce auditable cost per million correct operations. |
| C5 | `comparative-efficiency-negative-controls` | C3, C4 | The complete small/unfavorable/no-reuse/update-heavy/uniform matrix yields valid direction-neutral results. |
| C6 | `comparative-efficiency-request-enrichment` | C3, C4 | The complete locality/skew/size request-enrichment matrix yields paired capacity and cost evidence. |
| C7 | `comparative-efficiency-movielens-public-request-workload` | C2 | MovieLens grouped reduce runs with equivalent results through the public installed request/WASM Cell surface. |
| C8 | `comparative-efficiency-movielens-grouped-reduce` | C3, C4, C7 | The complete MovieLens size/skew/topology matrix yields paired capacity and cost evidence. |
| C9 | `comparative-efficiency-change-rate-crossover` | C3, C4 | The complete size/change/diversity/materialization sweep yields crossover evidence without presuming its sign. |
| C10 | `comparative-efficiency-claim-projection` | C1, C5, C6, C8, C9 | Digest-verified evidence projects qualified wins, neutral results, losses, and `no_claim` without promotion. |

## L0 — Shared scale evidence contract

Extend `solve/specs/large-scale-data-plane-certification/` first. Its schema is
the sole owner of profile, hardware, topology, workload, safety, performance,
resource, convergence, and provenance identity. P0 must be executable without
implying that P1–P3 are supported.

## C0 — Comparative evidence contract

Define versioning, immutable matrix and pair identifiers, schema migrations,
content addressing, comparator topology inventory, parity receipts,
preregistration, raw-sample references, price-sheet identity, evidence class,
and invalidation rules. A schema-valid result can represent a loss or neutral
outcome; validation must not encode a desired sign.

## C1 — Opportunity calculator

Ship a CLI/library plus checked fixtures for request enrichment, grouped
reduce, invalidation, and alternative-favored controls. Compare calculator
predictions to measured unit counters when they become available, retaining
prediction error rather than tuning it away.

## C2 — Semantic parity

Replace textual SQL forwarding with per-dialect semantic compilation and
explicit correctness/durability oracles. Invalidate the current PostgreSQL
cache artifacts for publication.

## C3 — Statistical capacity protocol

Seal offered-load schedules, SLOs, randomized blocked pairs, N bounds,
estimator, CI, practical significance, stopping rule, tail sample minimum,
cache/warmup/run-order policy, and multiple-comparison treatment.

## C4 — Whole-topology resource accounting

Inventory and meter every component. Calibrate synthetic byte accounting at
live seams under the harness-fidelity attack checklist. Keep cost projection
separate from measured resources and use immutable price sheets.

## C5 — Negative controls

Execute every small/simple, uniform-access, no-reuse, update-heavy, and
alternative-favored cell. Publish invalid cells as well as valid losses,
neutral outcomes, and wins.

## C6 — Request enrichment

Execute the complete size/fanout/locality/skew matrix. Consume, without
redefining, the affinity owner's routing, attribution, placement, decay, and
hysteresis semantics.

## C7 — MovieLens public request workload

Move the comparison workload onto an installed request Binding and WASM Cell
invoked through the public request path. Prove semantic equivalence only; this
Quest does not own a comparative claim.

## C8 — MovieLens grouped reduce

Execute the complete size/skew/topology matrix over C7's public workload.
Internal `native_js` results remain functional diagnostics and cannot satisfy
this terminal.

## C9 — Change-rate crossover

Execute the complete size/change/diversity/skew/materialization matrix. Publish
the measured response surface even when no crossover exists or its direction
contradicts the analytical model.

Every workload Quest C5–C9 publishes its full preregistered matrix, explicit
non-measuring cells, raw artifacts, confidence intervals, practical-effect
classification, resource breakdown, and cost projection. None requires
Lagrange to win.

## C10 — Claims and documentation

Generate machine-readable and human-readable claim tables from immutable
evidence. The projection must be red-tested against historical comparator
reports, missing components, expired profiles, calculator-only input,
inconclusive intervals, regressions, and alternative wins. `no_claim` is a
successful fail-closed result, not an error to paper over.

## Execution and cost gates

- L0 and C0 precede all benchmark implementation.
- P0 work may run locally or in bounded CI; it supports only `measured_p0`.
- P1–P3 comparisons require terminal certification for the exact scale profile,
  an approved budget, cleanup plan, artifact-retention plan, and price sheet.
- Large physical matrices run periodically or on release, never in the
  deterministic iteration loop.
- Every product Quest applies
  `docs/steering/verification-templates/harness-fidelity.md` and records live
  engagement evidence before terminal claim use.
