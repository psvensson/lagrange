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

---

## SYNTHESIZED RANKED PLAN + STATUS

**Headline:** the core is MORE principled than it looks. Of ~15 candidate
consolidations, most "why are there three of these?" resolve to deliberately-layered /
keep-separate, and the tempting collapses are the known live-regression traps. Net safe
wins are modest and real.

### SHIPPED (behavior-preserving, gates+tests green)
| # | win | commit | files |
|---|---|---|---|
| C1 | remove dead `allowFallbackQuery` branch (0 callers) | `eb7d7702` | read-methods.js |
| P1 | extract `confirmPersistenceThroughWitness` (dedup, returns visibility) | `eb7d7702` | mutation-persistence-methods.js |
| D2 | extract `clearPostRollbackApplyState` (anti-drift, 2-cache invariant) | `56b5007e` | transaction-base.js |

### NOT A WIN (already factored — audit over-counted)
- **D1** interlock error-builders: `createOperationLedgerInterlockError` is already the
  single builder (~8 call sites); the "7 blocks" are call sites, not duplication.
- **Q3 concentration logic:** already single-sourced in `operation-ledger-quorum-concentration.js`.

### REMAINING SAFE WINS (ranked, deferred — value vs surface)
1. **C2** drop always-constant params from `getOperationByIdVisibilityObservation`
   (`requireOwnerRpcRead` always false, `authoritativeReadMode` never passed,
   `allowPriorityRecoveryDeferredVisibility` always true) — 10 call sites; needs
   all-caller verification first (the P1 near-miss shows why).
2. **P3** `isDurableMutationChangeCount` helper for the `null||>0` predicate — SKIPPED:
   crosses two mixin files, adds coupling to save 2 lines (not a net simplification).
3. **C3** unify the two 3-tier read-mode spellings (`CONTROL_PLANE_AUTHORITATIVE_READ_MODE`
   subset vs `REPLICA_OPERATION_VISIBILITY_READ_MODE`) — naming only; keep gateway enum 5-valued.
4. **P4/C4** factor the two hand-rolled local→authority read-pair escalations
   (mutation-persistence `:404-432`/`:505-548`) — highest-consequence read surface; requires
   a red-on-revert DT before touching.
5. **D6** stale doc at `durability-fitness.js:84-89` — DEFERRED: the `setLeaderDurabilityUnfitHook`
   has no src producer (test-only); whether that's a stale doc or a real missing-wiring
   question needs a durability-path trace, not a doc edit.

### DESIGN-ONLY / KEEP-SEPARATE (traps — do NOT collapse)
- 3 confirm tiers (layered, external callers).
- 3 repair paths — unifying = the reverted arm-2 `1ce80391` (`692c9dbb` live regression).
- Demote-before-rollback prerequisite — SAFETY-CRITICAL, only partly backstopped by the
  raft committed-entry guard `3717c518`; do not weaken.
- 2 durability-fitness signals — signal (b) catches the silently-closed-adapter family
  signal (a) structurally can't.
- 5-value `CONTROL_PLANE_AUTHORITATIVE_READ_MODE` — each a distinct contract tuple.
- **C5** `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC` has no named producer (reached via the
  query engine's internal path) — not safe to remove on current evidence.

### The biggest simplification is the bug fix
The single largest available simplification is removing the **spurious 2PC** on
single-partition ledger writes (`write-execution.js:252` — key on the write's table, not
the op's target partition). It is BOTH a simplification AND half the gap-v fix. See
`../routed-mutation-silent-ledger-write-loss/postfix-binding-residual-synthesis.md` §8-9.
Ships only coupled with the quorum-durable single-write ack; high-risk; its own increment.
