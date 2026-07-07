# Synthesis: the post-raft-fix binding residual is the ledger-partition durability-fitness FLAP (gap v is a downstream symptom)

Session s11. Picks up the routed residual (gaps iv + v) after the raft fix
`3717c518` (removeEntriesAfter committed-entry guard) shipped. Evidence: a fresh
**post-raft-fix** affinity-demo run on HEAD `3717c518` (logs span 15:00→15:09Z,
its own on-disk `replica_operations-p1` replica DBs), three parallel diagnosis
subagents, and direct disk/log queries.

## 0. Headline
- **gap iv (reservation orphan-release) = WRONG LEG** — causally incapable of
  holding an op in-flight. Disproven, reverted, quest parked. See
  `../formation-reservation-reconcile-premature-orphan-release/wrong-leg-reservation-release-causally-noncoupled.md`.
- **The raft fix materially helped but is not sufficient:** formation completions
  13-15 (pre-fix) → **43** (post-fix), but settle STILL stalls (7 ops stuck
  in-flight, 120s no-progress) and **[2/4] load times out**. doneWhen not green.
- **The post-fix BINDING residual = leader-durability-fitness FLAP on
  `replica_operations-p1`.** `gap v` (routed-mutation silent ledger write-loss)
  is a *downstream symptom* of it, exactly as s10 predicted ("gaps ii/iv/v are
  downstream symptoms of the freeze, not independent legs").

## 1. Live outcome (post-fix run, HEAD 3717c518)
```
formation completions climb 2 → 43, then STALL at 43 for 120s (7 in-flight, never drains)
→ "Control plane settling STALLED" → [2/4] load → "Timed out waiting for admin response"
```
Pre-fix comparison run (10:28Z) plateaued ~13-15. So the raft fix ~3× the
completions but the ledger partition never quiesces.

## 2. The binding residual, proven on-disk
Top persistently-stuck ops (by "No row found for CDC update" count), all on
`replica_operations-p1` (the ledger self-move partition), all DIVERGENT across
the 5 replica DBs:

| op | type | r9 (n3) | r8 (n2) | r7 (n4) | r4 (n1) | r8 (n0) |
|---|---|---|---|---|---|---|
| `2e93b10a` | REPLACE | ACTIVE | ACTIVE | SYNCING | **FAILED** | no-table |
| `c6ac4d4e` | REMOVE | PENDING | PENDING | PENDING | **FAILED** | no-table |
| `c0af37ff` | ADD | — | — | — | **ACTIVE** | — |

- `c0af37ff` = classic **phantom-ack** (leader-local ACTIVE, absent on the whole
  quorum) = the gap-v durability lie in its purest form.
- `2e93b10a`/`c6ac4d4e` = **divergent terminal**: the leader (r4/node-1) reaches
  FAILED while the quorum sits at an earlier state — the leader's terminal write
  never durably replicated.
Common thread: **r4 (node-1) is the odd-one-out**; its local writes report success
but do not durably reach the r7/r8/r9 quorum.

## 3. WHY: the durability-fitness flap (the actual root)
`replica_operations-p1` leadership FLAPS the whole run. Multiple replicas (r2, r4,
r8) repeatedly log:
> "Replica local durability is unfit for leadership: writes are not reaching
> durable storage (stuck transaction or commit/durable divergence); shedding
> leadership if a viable successor exists"
> … then "durability recovered; leadership fitness restored" … then unfit again.

Two distinct unfit reasons, **5× each**:
- `leader_durability_unfit_commit_durability_divergence` — declared committed index
  ≫ durable index (declaredIndex 320/755/761 vs durableIndex 180/185/343). Raft
  says "committed to N" but only M<N entries are durably persisted. **This is the
  s10 root** (declaredIndex=228 vs durableIndex=191), still present post-fix.
- `leader_durability_unfit_transaction_hold` — a stuck transaction blocking durable
  writes. (Flagged for scrutiny — the demo was previously believed to issue zero
  participant txns; verify whether real or a false signal.)

Because no replica stays durability-fit long enough, no stable durable leader
emerges on the ledger partition. The self-move ops write their progress to that
very partition, so their writes land on churning leadership and a lagging durable
quorum → divergence (§2) → CDC read-back "No row found" on the target replica →
op immortal in-flight → settle stall → [2/4] fail.

## 4. What the raft fix did and did not do
`3717c518` guarded `removeEntriesAfter` so committed entries can never be deleted
(fixing the committed-entry LOSS that produced the log HOLE and the frozen
watermark). That removed the divergence-EVENT storm and let completions rise to
43. But it did **not** make the durable index ADVANCE to meet the declared index —
the "writes not reaching durable storage" condition persists, so the fitness flap
continues. The guard prevents the hole; it does not heal a replica whose durable
write path is stalled. (Open: real adapter stall vs stale readonly watermark vs
transaction hold — being pinned by the vet subagent.)

## 5. Reframe of the routed-mutation quest
`routed-mutation-silent-ledger-write-loss` (gap v) is **not an independent
sql-routed-ack bug** to fix in the write/persist path. Its live manifestation
(phantom-ack `c0af37ff`, leader-only ACTIVE) is produced by the durability-fitness
flap: the leader's local apply reports `changes>0` (write-path map:
`partition-write-kernel.js:67-73` local apply; `write-metrics-base.js:744`
returns `committedResult`), but the raft commit's durable quorum never lands
because the durable index can't advance. So the fix belongs at the
**durable-before-ack / durability-fitness / log-adapter** layer, NOT in
persistence-methods (papers over — the rejected surface) and NOT in the CDC
witness `partition-cdc-parameterized-sql.js` (regressive, per s10).

## 6. Anti-patterns (do NOT repeat)
- **Per-failure escalate-and-repair on the hot write path** — this is what
  regressed `1ce80391`→`692c9dbb` (14× load amplification, short-circuited the
  defer-backoff that lets laggards hydrate). Any re-drive must be level-triggered
  / reap-on-timeout, fired rarely.
- **A DT green on an injected precondition the real path never hits** (the
  `a9344058`/`96a0917f` wrong-leg trap). Validate with a 2-pre/2-post live A/B,
  not a unit DT alone.

## 7. Root-cause tree (all four subagents in) — a CIRCULAR FORMATION DEADLOCK
The vet pinned the durable-lag to **(c) a genuine orphaned 2PC participant
`BEGIN IMMEDIATE`**; the two follow-on traces resolved WHY it orphans and whether
it is avoidable. The binding root is a self-sustaining cycle, not a single bug:

```
(A) An op's progress write to replica_operations opens a 2PC participant
    BEGIN IMMEDIATE on replica_operations-p1 (spurious — see §8)
 └→ (B) the 2PC cannot COMMIT because sibling sql_transaction_participants-p1
        has NO LEADER ("No leader available for write" ×124)
     └→ (C) the BEGIN IMMEDIATE orphans ~60s (PREPARED_HOLD_TIMEOUT_MS), pinning
            the single SQLite connection that also holds _raft_log/_raft_state
         └→ (D) every raft write lands inside the uncommitted txn → durable
                watermark frozen → declaredIndex≫durableIndex → durability-fitness
                detector correctly DEMOTES → 5-replica leadership FLAP
             └→ (E) while frozen/flapping, replica_operations-p1 stays
                    quorum-concentrated → DEFERS the ADD moves (52×:
                    quorum_concentrated ×25, self_move_in_flight ×27) that would
                    hydrate sql_transaction_participants-p1's empty replicas
                 └→ back to (B): sibling never gets a data-bearing quorum/leader ⟲
```
- Sibling `sql_transaction_participants-p1` has **no durability flap of its own**
  (0 unfit events); its leaderlessness is purely the far side of the cycle — its
  live quorum replicas are EMPTY (only a stale, never-recampaigning r3 holds data).
- This is the memory's "circular-dependency class: formation vs steady-state".

## 8. The 2PC hold is SPURIOUS — clean fix locus, but COUPLED to gap v
A `replica_operations` progress write is **single-partition with exactly one
durable participant** (the workflow `persistWorkflow` is a no-op for the
rebalancer; multi-partition participants exist only during SPLIT_CUTOVER). 2PC
adds zero atomicity and only drags in the leaderless `sql_transaction_participants`
bookkeeping that strands the hold.
- Decision point: `sql-query-engine-write-execution.js:246,252` — a single-partition
  UPDATE becomes 2PC iff `getTransaction(sessionId)` is truthy.
- Transaction opened at `operation-workflow-transition-orchestration.js:317`
  (`txCoordinator.begin`) UNLESS `bypassExecutionTransaction`
  (:273-291 → plain `persistFn(null)`), gated on
  `isPriorityControlPlanePartition(operation.partitionId)`.
- `replica_operations` IS already priority, so **self-move ops (target=ledger) are
  already bypassed**; the residual holds come from **non-priority data-partition
  ops** (target e.g. `ratings-p3`) whose ledger progress write still enlists 2PC
  because the gate keys on the op's TARGET partition, not the WRITE's table.

**Fix 1 (bounded):** widen the bypass so a single-partition `replica_operations`
write never enlists 2PC — short-circuit `enlistParticipants`
(`write-execution.js:252`) when `writePartitions.length === 1` on a priority ledger
table, or broaden the predicate at `operation-workflow-owner-execution-lane.js:696-699`.
Invariant preserved: keep 2PC when `writePartitions.length > 1` (SPLIT_CUTOVER).

**COUPLING — fix 1 alone is REGRESSIVE.** The bypass path (`persistFn(null)`,
single-write) is EXACTLY the path gap v shows can ack success without durable
quorum replication (Pattern A leader-only rows → CDC "No row found" → immortal
in-flight). Widening the bypass moves MORE ops onto that buggy path → trades the
hold-wedge for the write-loss-wedge. **Fix 2 must ship WITH fix 1:**

**Fix 2 (the actual gap-v durability fix):** the single-write / bypass
`persistFn(null)` path must confirm **quorum-durable** success before reporting
committed — not ack on the leader-local apply's `changes>0`
(`partition-write-kernel.js:67-73`, `write-metrics-base.js:744` returns
`committedResult` but the durable spread must be real). No `replicateToQuorum` /
`awaitDurable` helper exists today (write-path map §3) — this is the deep half.

## 9. Recommendation (decision point — genuine design weight)
The raft fix `3717c518` was necessary and delivered (completions 13-15→43). The
remaining binding blocker is the circular deadlock above, whose only *sufficient*
and *memory-safe* cut is **fix 1 + fix 2 together** at the 2PC-hold / durable-ack
layer. Explicitly NOT the ledger-admission interlock: the fourth subagent
recommended narrowing it, but the memory verdict (runs 20/22) is that
interlock-narrowing is UNSAFE + INEFFECTIVE — do not take that edge.

This is a coupled, high-risk change in the raft durability core, stacked on the
just-landed raft fix, in the exact area the arm-2 fix (`1ce80391`) regressed live
despite passing every unit gate. Per "NEVER cheap/quick — correctness + overall
picture" and "hotpath fix needs aggregate live A/B", it should be built as its own
designed + adversarially-vetted + 2-pre/2-post-live-validated increment, NOT rushed
this session. Sequencing: design fix 2 (quorum-durable single-write ack) first —
it independently fixes the already-bypassed self-move write-loss and makes fix 1
safe — then land fix 1 to eliminate the spurious holds, and live-A/B the pair.
The `routed-mutation-silent-ledger-write-loss` quest is the correct home; its scope
should absorb fix 1 (the coupled 2PC-hold half).
