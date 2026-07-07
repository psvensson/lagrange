# Core-logic simplification / consolidation audit

Motivation (user, 2026-07-07 s11): many agents solved similar things across sessions;
likely overlapping mechanisms that could be MERGED or REUSED. Goal: find concrete,
**behavior-preserving** consolidations (dead code, duplicated logic, redundant enums),
implement the safe mechanical wins, flag safety-critical ones as design-only.

Rule for every proposal: only behavior-preserving merges/removals count; anything
touching raft-safety/durability is design-only; verify call paths (grep, exclude tests);
flag look-alike-but-keep-separate cases with the guarding reason.

## Cluster reports (parallel agents)
- `audit-authoritative-read-visibility-cluster.md` — the 5-value read-mode enum +
  overlapping `queryAuthoritative…` / `getOperationByIdVisibilityObservation` /
  `queryReplicaOperationPersistenceAuthority…` escalation helpers.
- `audit-persist-confirm-repair-cluster.md` — `persistOperationUpdate` arms +
  3 confirm layers + create-on-missing / recover / (reverted arm-2) repair paths.
- `audit-durability-heal-interlock-cluster.md` — durability-fitness detect+demote +
  transaction-heal + ledger-admission interlock gates.

## Fourth angle (owner scan) — the write-routing / commit-mode decision surface
Multiple overlapping "how does this write commit/route" decision layers, worth a
consolidation pass:
- `WRITE_ROUTER_MODE` (BOOTSTRAP_DIRECT, SQL_ROUTED) — `src/cdc/write-router/index.js`.
- `PARTITION_WRITE_COMMIT_MODE` (DIRECT/RAFT/REJECTED) — `src/partition/partition-write-kernel.js:42`.
- `bypassExecutionTransaction` (priority gate) + `enlistParticipants` (txState gate) —
  `src/rebalancer/operation-workflow-transition-orchestration.js:273` +
  `src/query/sql-query-engine-write-execution.js:246,252`.
- `isPriorityControlPlanePartition` — **173 call sites** (grep); either a well-factored
  shared predicate or a concept leaked everywhere — assess whether it can be encapsulated
  behind fewer decision points.
- A proliferation of `src/query/query-executor-*-routing*.js` modules
  (partition-service-resolution, priority-recovery-bootstrap-routing, write-retry-routing,
  canonical-leader-routing, partition-routing-snapshot) — candidate overlap.

**Concrete simplification already found (s11 gap-v diagnosis):** a single-partition
`replica_operations` progress write needlessly opens a 2PC participant transaction
because the bypass gate keys on the op's TARGET partition, not the write's table
(`write-execution.js:252`). Collapsing "single-partition write ⇒ no 2PC" is BOTH a
simplification AND half of the gap-v fix — see
`../routed-mutation-silent-ledger-write-loss/trace-self-referential-participant-hold.md`.
