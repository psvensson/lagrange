# Requirements: Large-Scale Data-Plane Certification

## Scope and claim rule

The program certifies explicit profiles; it does not infer support from smaller
runs. A profile is supported only when its hardware class, software revision,
topology, data shape, workload, duration, and every required gate are recorded
and green.

Cardinality scale and physical-data scale are independent:

- **Cardinality:** nodes, tables, partitions, replicas, leaders, metadata rows,
  planners, queues, and control-plane fanout.
- **Physical data:** logical/physical bytes, ingest, replication, snapshot,
  rebuild, compaction, disk pressure, and foreground I/O.

Neither a sparse cardinality run nor a small high-throughput run certifies the
other axis.

## R0 — Shared evidence identity

The versioned profile/config/report envelope SHALL be the single owner of
software revision, hardware class, topology, data shape, workload identity,
duration, safety, performance, resources, convergence, artifact provenance,
and claim eligibility. P0 and later P1–P3 profiles use that identity.
Comparative-efficiency evidence may add pair, alternative, parity, statistics,
price, and relative-claim fields, but SHALL reference this identity rather than
forking it. A valid P0 record is not scale certification.

## R1 — Staged profiles

The report contract SHALL represent at least:

| Profile | Minimum intent | Purpose |
| --- | --- | --- |
| P0 | Existing seven-node development envelope | Cheap regression and report compatibility |
| P1 | 25 nodes / 1 TB logical data | Integration and topology-churn qualification |
| P2 | 100 nodes / 25 TB logical data | Periodic scale qualification |
| P3 | At least 200 nodes / 200 TB logical data across multiple tables | Target certification requested by the product goal |

Exact table count, partition distribution, replication factor, hardware, and
duration SHALL be sealed before each profile Quest. P3 is aspirational until
measured; adding this row does not claim support.

## R2 — Workload and topology matrix

- Profiles SHALL cover unequal table and partition sizes, RF 3 and any higher RF
  claimed, hot/cold skew, mixed reads/writes, and sustained foreground traffic.
- Topology attacks SHALL include node add, failure, restart, replacement,
  decommission, slow follower, disk pressure, and replica rebuild.
- Split/merge SHALL be exercised when the profile claims automatic partition
  lifecycle support.
- Acknowledged-write reconciliation and invariant checks SHALL run across every
  destructive topology transition.

## R3 — Feasibility-qualified balance

- Hard constraints are replication safety, eligible-node/failure-domain rules,
  capacity/admission, readiness, and pinned placement policy.
- A balance assertion SHALL first classify the profile as feasible or emit one
  typed degraded reason such as insufficient eligible nodes, capacity, failure
  domains, or movable entities.
- In feasible homogeneous cases, replica-count skew SHALL be at most one.
- Byte balance SHALL be expressed relative to capacity-weighted targets and the
  measured largest movable partition; it is not a universal absolute promise.
- Leader, measured hot-load, and affinity/remote-byte objectives SHALL carry
  profile-specific numeric thresholds.
- Small deterministic worlds SHALL compare the existing placement owner with an
  exact optimum. Large worlds SHALL report a declared lower-bound/oracle gap and
  hard SLOs. “No improving single move” alone is insufficient.
- Movement rate, bytes moved, convergence time, and post-convergence stability
  SHALL be bounded.

## R4 — Safety, performance, and resources

- Safety gates: zero lost acknowledged writes, zero corrupt/duplicate rows, no
  drop below the declared transient replication safety floor, zero
  under-replication at terminal convergence in profiles classified feasible,
  and no failure-domain or capacity violation.
- Performance gates SHALL enforce throughput and p95/p99 latency floors against
  a named baseline; warning-only or disabled gates do not certify a profile.
- Resource gates SHALL bound heap, RSS, file descriptors, event-loop lag,
  queue/in-flight cardinality, retry rate, disk amplification, and retained Raft
  log/snapshot bytes.
- Leak analysis SHALL extend the enforced `local-memory-soak` mechanism with
  sufficient warmup, samples, and analysis duration.
- A non-terminal run cannot certify a profile, count as a pass, or establish a
  performance or scale floor. When the harness measured the system, its failure
  and regression metrics remain valid evidence; only a broken, disconnected, or
  otherwise non-measuring harness sample is invalid.

## R5 — Statistical convergence

- Add/failure/restart/replacement/decommission scenarios SHALL report pass rate,
  confidence interval, failure-class distribution, and p50/p95 convergence.
- Time budgets SHALL be tied to the recorded hardware class and workload.
- Timeout extension, a single green run, or analyzer availability cannot certify
  convergence.
- A fresh representative rolling-restart terminal is required; exhausted
  omnibus Quest history is not reopened.

## Reuse comparison

- **REUSED:** distributed harness, invariant engine, benchmark comparison,
  memory-soak leak analysis, capacity/admission owners, `UnifiedRebalancer`,
  topology analyzers, and report writers.
- **EXTENDED:** scale configuration, balance oracle, staged execution, and
  enforced resource/performance report fields; comparative consumers extend
  the shared identity only with pair-specific fields.
- **NEW:** declared support-profile contract and exact/lower-bound
  feasibility-aware balance comparison. No parallel scheduler is introduced.
