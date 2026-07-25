# Tasks: Large-Scale Data-Plane Certification

## Ordered Quest ladder

| Order | Quest | Required terminal |
| --- | --- | --- |
| L0 | `scale-certification-evidence-contract` | Versioned profile/config/report schema records hardware, cardinality, bytes, workload, feasibility, safety, performance, resources, and statistical convergence. |
| L1 | `placement-balance-feasibility-oracle` | Small worlds compare the existing placement owner with exact optima; infeasible inputs produce typed reasons; large-world lower bounds are defined. |
| L2 | `scale-cardinality-harness` | Cost-bounded sparse runs exercise high node/table/partition/replica cardinality and expose planner/control-plane amplification without claiming physical-byte proof. |
| L3 | `scale-resource-performance-gates` | Benchmark and leak enforcement are enabled; heap/RSS/fds/queues/in-flight work/throughput/latency are fail-closed report fields. |
| L4 | `scale-topology-churn-certification` | P1 add/fail/restart/replace/decommission/rebuild matrix is safe and statistically convergent. |
| L5 | `scale-hundred-node-certification` | P2 passes both cardinality and physical-byte proof on a sealed hardware class. |
| L6 | `scale-two-hundred-node-two-hundred-terabyte-certification` | P3 passes the complete matrix; only this terminal may support the requested hundreds-node/hundreds-TB claim. |

## Authoring and cost gates

- L0–L3 must reuse current harness/report/placement/resource mechanisms.
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
