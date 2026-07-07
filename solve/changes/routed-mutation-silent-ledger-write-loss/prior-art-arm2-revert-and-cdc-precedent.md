# Prior art: the reverted arm-2 fix + CDC/durability precedent for gap (v)

Research brief grounding the `routed-mutation-silent-ledger-write-loss` quest (gap v,
op `26c60ea9`) in (1) the trap of the just-reverted sibling fix, (2) the arm-2 vs
gap-v distinction, (3) existing in-repo durability/quorum machinery to reuse, and
(4) industry precedent. Read-only; no source edited.

---

## TASK 1 — The reverted arm-2 fix (`1ce80391` → reverted by `692c9dbb`). THE TRAP.

### What `1ce80391` changed (exact method + shape)

Commit `1ce803913b964a7c2cca77015105d85279fe79cc`
("fix(rebalancer): arm-2 failed-mutation divergence repair"), single source file
`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`
(+87/-24), plus a DT `test/rebalancer/replica-operation-failed-update-divergence-repair.test.js`.

- **Method touched:** `resolveFailedOperationUpdateResult` (arm 2 — the
  `!result.success` branch of `persistOperationUpdate`, source lines ~256-272).
  Pre-fix, arm 2's ONLY recovery was `recoverPersistedReplicaOperationMutation`,
  which reads `OWNER_LOCAL_ONLY` visibility
  (`...persistence-methods.js:468-496`, `authoritativeReadMode: OWNER_LOCAL_ONLY`).
  On a genuine divergence the local copy also lacks the fresh row → not
  visibility-satisfied → arm 2 **throws** `buildOperationPersistError` →
  "Deferred retryable ... transition failure" re-armed forever (op `812932a2`
  deferred 32×, `[1/4]` settle stall).
- **The change:** when the failure was the retryable participant-failure class
  (`isRetryableOperationPersistError(result)`), arm 2 now escalated to a NEW shared
  helper `recoverDivergedOperationUpdateThroughAuthority(operation, expectedWorkflowStep)`.
  That helper does an **owner-RPC-escalated authority read**
  (`queryReplicaOperationPersistenceAuthorityOperation`, Leg A's local-first →
  owner-RPC escalation) and either (a) returns durable-success if the row is visible
  on the authority (a minority participant merely lagged), or (b) **re-inserts** the
  owner's OR-IGNORE-idempotent copy via `persistNewOperationUnlocked` if the
  authority proves the row genuinely missing. `resolveZeroChangeOperationUpdate` was
  refactored to delegate to the same helper (behavior-preserving for the zero-change
  arm). This was exactly the design's §3a "EXTEND CL-017(b) owner-RPC create-on-missing".
- **Provenance/verification of the reverted fix:** DT drove the real persist path
  with the live-matching gateway failure shape; red-on-revert proven via `dt:prove`;
  adversarial subagent verify SHIP (A–G safe); full `test/rebalancer` sweep 5417 pass/0
  fail; lint/complexity/file-size clean. **Every unit-level gate was green.**

### The PRECISE mechanism by which it live-regressed (the anti-pattern)

Revert commit `692c9dbb540ef74cc6ca35b7c8ce9632da54dd6a`. Report:
`solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-regression-gapII-reverted.md`.

Controlled affinity-demo comparison (same machine, back-to-back, `pf` = "Distributed
operation failed due to participant failures" on `replica_operations`, `throws` =
"Failed to persist operation", `reinsert` = the fix's create-on-missing firing):

| run | source | pf | throws | reinsert | [2/4] load |
|---|---|---:|---:|---:|---|
| run-legA-1 | pre-fix | 4 | 2 | 0 | PASS (100k ratings) |
| run-PREFIX-control | pre-fix | 0 | 0 | 0 | PASS (100k ratings) |
| run-gapII-1 | **fix** | 57 | 28 | 6 | **ABORT** at load |
| run-gapII-2 | **fix** | 55 | 27 | 7 | **ABORT** at load |

**Mechanism:** live, `resolveFailedOperationUpdateResult` is hit by the retryable
participant-failure class *constantly* during cold-formation leadership churn. The fix
reacted to **EVERY** such failure with (a) up to two extra authority reads
(`OWNER_LOCAL_ONLY` + owner-RPC) and (b) a re-insert write when the authority read
missed. That is read/write **amplification on the hottest failure path at the worst
time**. Worse, the pre-fix "Deferred retryable transition failure" is a **backoff**
that lets a lagging participant hydrate; the fix short-circuited that backoff
(advance-now / reinsert-now), pushing ops forward into more writes against
not-yet-ready participants → a ~14× participant-failure / persist-throw **storm** on
`replica_operations` that starved and crashed the `[2/4]` loader. Consistency across
both fix runs (57/28/6, 55/27/7) vs both pre-fix (≤4/≤2/0) attributes it to the fix,
not variance.

**Why every unit gate missed it:** the DT + adversarial verify measured the ISOLATED
behavior correctly (one diverged op recovered) but could not see the AGGREGATE live
load effect. This is the memory directive "Hot-path failure fix needs aggregate LIVE
A/B" (`hotpath-failure-fix-needs-aggregate-live-validation.md`) and the
operational-ground-truth "deterministic-first is necessary but the live binding signal
is the arbiter."

### THE ANTI-PATTERN to avoid in this quest

Do **NOT** ship a per-failure / on-every-participant-failure escalate-and-repair shape
on any hot control-plane write path (persist, confirm, or CDC apply). The reverted fix
fired its expensive recovery (2 authority reads + a re-insert write) on every transient
retryable failure and short-circuited a hydration backoff. The revert's own redesign
direction (lines 46-59 of the revert report):
- Fire divergence repair **RARELY** — only for a genuinely-stuck op (deferred > T
  seconds / K attempts), not on every transient participant failure. Bound the
  amplification to the handful of truly-wedged ops (level-triggered reap-on-timeout;
  K8s finalizers / CRDB 60s circuit breaker / PD operator TTL).
- Prefer a **leader-pinned / owner-authoritative repair write** over re-inserting
  through the same gateway that may re-route to the diverged replica.
- **Re-validate against the same controlled live comparison** (≥2 pre vs ≥2 post,
  compare pf/throws on `replica_operations` AND the `[2/4]` load outcome), not just a
  unit DT.

For gap (v) specifically, this trap warns against "papering over" the durability lie in
the persistence/confirm layer with more reads/re-inserts — that is exactly the shape
that stormed. See Task 2.

---

## TASK 2 — Arm-2 (gap ii) vs gap-v are DIFFERENT MECHANISMS

Source of truth: `design-cdc-nontermination-fix.md` §0, §1, §2, §3
(`solve/changes/formation-ledger-self-move-blocks-cluster-ops/design-cdc-nontermination-fix.md`).
The four stuck ops are **three distinct mechanisms** (on-disk SQLite of all four
`replica_operations-p1` replicas r2/r4/r5/r6 AGREE — no surviving inter-replica
divergence; the `No row found for CDC update` witnesses were TRANSIENT mid-run
hydration misses).

- **op `812932a2` = arm-2 / gap (ii)** — a distributed progress UPDATE
  (`persistOperationUpdate` → `!result.success` → `resolveFailedOperationUpdateResult`)
  that **`fail`ed** because a participant replica lacked the row (retryable participant
  failure). `result.success = false`; arm 2 threw and deferred forever. This is the
  leg the reverted `1ce80391` targeted. **The write is KNOWN-failed; the bug is the
  recovery.** Disk: `pending/SENDING/completed_at=NULL`.

- **op `26c60ea9` = gap (v)** — the write path **RETURNED TRUE**. `Operation completed`
  was logged at 06:39:41.607 → `transitionCommitted === true` → `persistOperationUpdate`
  returned true (proof: `operation-workflow-transition-persistence.js:315-320` only
  logs completion when committed). **Yet the durable ledger row is `PENDING/NULL` on
  ALL replicas** — the terminal (and even the pending→creating) UPDATE never durably
  landed. No persist-failure, no reinsert, no divergence log. The gateway UPDATE
  reported success (changeCount>0 / recovered) against a local/cache copy,
  `confirmPersistedOperationUpdate` recorded a witness and returned true, but the write
  was **lost below the persistence layer**. Downstream, dispatch re-drives forever on
  "Cache update not observed for replica operation 26c60ea9" (REPLICA_OPERATION_
  VISIBILITY_LAG, 46× deferred). Design §1 rules out (a) terminal-conflict short-circuit,
  (b) zero-change arm, (c) reinsert-to-diverged-replica — all would have left a
  distinguishing log that did not fire. Verdict (d, sharpened): a **silent ledger
  write-loss** — a `writeMode=sql-routed` single write acked as success without durable
  quorum replication.

**Key distinction:** gap (ii) is a *recovery-of-a-known-failed-write* bug in
persistence-methods (fixable there in principle — but the fix regressed live). Gap (v)
is a *durability-lie*: the write path CLAIMED success/durability that the ledger never
had. Different code paths.

### Why the design insists gap (v) be fixed WHERE DURABILITY IS CLAIMED

design §2 gap (v) (lines 138-144) and §3b (lines 232-236):

> "Gap (v) / silent ledger write-loss (`26c60ea9`) — root is below persistence
> (`partition-cdc-parameterized-sql.js:316-357` + routed-mutation quorum-ack). **Needs
> its own diagnosis: why does a routed UPDATE ack success while the durable state stays
> `PENDING` on all replicas? Do NOT try to paper over it in persistence-methods; a
> durability lie must be fixed where durability is claimed.**"

Design §3b explicitly flags gap (v) as **"NEEDS OWN DIAGNOSIS FIRST"** — it is NOT
designed in that document, only anchored. The reasoning: if `persistOperationUpdate`
returns true and `confirmPersistedOperationUpdate` returns true while the row is
`PENDING` on every replica, the fault is the write/ack/commit path lying about
durability. Adding another authority-read + re-insert in persistence-methods (the
reverted arm-2 shape) would (a) be the same hot-path amplification trap that just
regressed, and (b) mask — not fix — a durability guarantee that is structurally
missing. The honest fix is to make "committed/durable" actually mean quorum-durable at
the layer that claims it, then let the existing confirm/visibility machinery observe
the truth.

design §1 also records an **honest uncertainty** that must be closed by diagnosis
first (lines 84-91): it cannot pin from logs alone whether `26c60ea9`'s UPDATE took the
`changeCount>0`/`confirmPersistedOperationUpdate` branch or the
`recoveredAfterRetryableFailure===true` branch — both return true and leave no
distinguishing log. The recommended confirming probe is a targeted trace/DT that
records the `result` object (`success`, `changeCount`, `recoveredAfterRetryableFailure`)
for the terminal UPDATE and asserts durable presence on a majority of ledger replicas
afterward. **Diagnose which branch and which layer drops the write before building.**

---

## TASK 3 — Existing durability/quorum machinery to REUSE (not rebuild)

All anchors verified against current (post-revert) HEAD.

### WIRED and usable

1. **Leg A owner-RPC escalation — `06496039`** ("terminal/persistence confirmation
   reads the ledger authority — leader-pinned escalation"). This is the canonical
   local-first → owner-RPC read escalation.
   - `queryReplicaOperationPersistenceAuthorityOperation` /
     `...Observation` — `replica-operation-repository-mutation-persistence-methods.js:383-444`.
   - `confirmReplicaOperationPersistence` (`:446-466`) → `confirmReplicaOperationVisibility`
     (`:498+`) now escalate to `OWNER_RPC_PREFERRED_SQL_FALLBACK` with
     `preferOwnerRpcReadLeader` when the local read cannot confirm; a failed/deferred
     escalated read PRESERVES local evidence (authority-unreachable ≠ row-absent).
   - **Reuse note:** this is a READ escalation, correct for *observing* durability.
     It does NOT make a write durable. Leg A was live-validated as the RIGHT leg
     (ledger row-write failures 63→0, reached `[4/4]` first time — memory s9), so its
     read path is trustworthy. The trap: the reverted arm-2 fix reused this same read
     to drive a *write/re-insert on every failure* — that is what stormed.

2. **`confirmPersistedOperationUpdate` / `confirmReplicaOperationPersistence` /
   `confirmReplicaOperationVisibility`** —
   `replica-operation-repository-mutation-persistence-methods.js:230-252, 446-466,
   498+`. Post-write witness + authoritative visibility confirmation with a bounded
   deadline (`replicaOperationAuthoritativeVisibilityTimeoutMs`) and a
   CONFIRMED/DEFERRED confirmation state. **This is the observation layer that gap (v)
   fools** — it returned true (witness recorded, confirmation not-DEFERRED) while the
   row was PENDING. Reuse target: make confirmation actually gate on durable quorum
   presence (or make the write not claim success until durable) rather than adding a
   parallel checker.

3. **CL-017(b) create-on-missing** — `persistNewOperationUnlocked`
   (`...persistence-methods.js:51`), an OR-IGNORE-idempotent re-insert; the zero-change
   arm's `resolveZeroChangeOperationUpdate` (`:277-320`) already uses it guarded by
   `if (!authoritativeOperation)`. This is the machinery the reverted fix tried to
   extend to arm 2. **For gap (v) this is a re-materialise-the-row tool, NOT a durability
   guarantee** — re-inserting through the same gateway can re-lose the write (the
   "routes to the same diverged replica" trap, design §4).

4. **Raft-commit-resolves-write durability (the REAL durable-write path)** —
   `src/partition/partition-replication-handler.js`. A routed write forwards to the
   leader (`:195-211`), is proposed, and its promise is **resolved only when the Raft
   `commit` event fires** via `applyCommittedEntry` → `resolveCommit(entryId, result)`
   (`:378-444`, `resolveCommit` `:437`). This is where "durable" is *supposed* to be
   established for a replicated partition. **Gap (v) is almost certainly a hole in THIS
   contract** for the `sql-routed` write mode: the write resolved success without the
   entry becoming quorum-durable at the ledger.

5. **Honest durable watermark (DETECTOR, already computed)** —
   `src/partition/partition-service-durability-fitness.js`:
   `readDurableCommittedIndexWitness(declaredIndex)` (`:158-184`) reads the DURABLE
   committed watermark through a **separate readonly connection**
   (`SELECT_DURABLE_COMMITTED_INDEX`, `:60`), compared against the declared
   `getLastDeclaredCommitIndex()` (`:295-301`). **This proves the repo already owns a
   cheap way to read true durable state** — currently used only to detect a
   durability-unfit leader and demote it, NOT to gate acks. It is a ready-made honest
   signal a gap-(v) fix could reuse to assert "durably present on a majority" in a DT or
   a confirm gate.

### ABSENT / half-built (do NOT assume it exists)

6. **Durable-before-ack invariant — ABSENT, never implemented.**
   `verify-inrepo-priorart-machinery.md` §3 (lines 111-131): no fsync / "don't advance
   matchIndex until persisted" invariant exists. The leader **self-acks in `saveCommand`
   regardless of persistence** (`in-memory-log-adapter.js:40`; `sqlite-log-adapter.js`
   commandAck). Recorded pre-existing gap: "leader phantom-ack quorum accounting —
   saveCommand self-acks regardless of persistence; majority ceil(others/2)+1 can rest
   on 2 durable + 1 phantom copy." **This is the structural root that makes a
   `sql-routed` write ack success without durable quorum — i.e. gap (v).** A
   "durable-before-ack" framing would be NEW machinery on the commit/ack hot path (the
   high-blast-radius protocol surgery the durability-fitness sibling quest deliberately
   AVOIDED in favour of detect+demote). Weigh scope carefully.

7. **No `replicateToQuorum` / `awaitDurable` / `quorumAck` helper exists** — grep of
   `src/**` for those names returns nothing. There is no drop-in "await durable quorum"
   call to wrap a routed write in. The only durability-commit machinery is the Raft
   proposal→commit→`resolveCommit` path (#4) and the readonly durable watermark (#5).

8. **Cardinal raft committed-entry-loss guard — `3717c518` (just shipped, s10).**
   `src/raft/sqlite-log-adapter.js` `removeEntriesAfter` now clamps its deletion floor
   to `committedIndex` (never deletes committed entries). This closed the durable-index
   FREEZE (log hole 192-204 → frozen watermark). **Relevant context:** it fixed the
   *freeze/committed-entry-loss* class; memory (s10) explicitly states the residual ~8
   ops stall on DOWNSTREAM CDC-miss / deferred-dispatch — i.e. gap (v) is a **distinct
   residual**, not a freeze recurrence. Gap (v) lives above the log-truncation bug.

**Reuse verdict:** the read/observe side is well-machined (Leg A escalation #1,
confirm layer #2, durable watermark #5) and should be REUSED to *witness* durability.
The write-durability side has exactly one real mechanism (Raft commit → `resolveCommit`,
#4) and a KNOWN structural hole (durable-before-ack absent, #6). The honest gap-(v) fix
lives at #4/#6 — make the `sql-routed` routed UPDATE not report success until the entry
is quorum-durable (or have confirm gate on the durable watermark #5) — NOT a new
persistence-methods re-insert (the reverted trap) and NOT a new secondary cache
(directive `avoid-secondary-tertiary-caches`).

---

## TASK 4 — Industry precedent (sanity check on direction)

Mature CDC/ledger systems make a mutation durable **before** it is considered applied
or emitted, via two complementary gates. (1) **Quorum commit before ack:** Raft/Paxos
systems (etcd, CockroachDB, TiKV) do not acknowledge a write to the client until the
log entry is replicated to a majority quorum and committed — the leader's own copy is
never sufficient, precisely to avoid the "acked-but-lost" phantom the repo's
durable-before-ack gap (#6) permits. (2) **Resolved-timestamp / watermark gating of CDC
emission:** CockroachDB CDC (changefeeds) only emits a row change once the **resolved
timestamp** advances past it, guaranteeing no earlier mutation can still arrive —
emission is gated on a durable, monotonic watermark rather than on an optimistic local
apply. Debezium takes the log-based equivalent: it reads the database's committed WAL
/ binlog (already durably committed by the source DB) and its connectors use
**idempotent upserts** keyed by primary key on the sink so a re-delivered or
out-of-order change converges rather than being lost or duplicated. **All three
patterns agree with the design's insistence:** durability must be established at the
layer that commits (quorum ack), and CDC/apply must be gated on a durable watermark —
NOT patched by re-reading/re-inserting at the consumer. This validates the fix
direction (fix gap (v) where durability is claimed: the routed-write ack / Raft-commit
resolve, optionally gated on the existing durable watermark) and confirms the reverted
per-failure re-insert was the wrong layer.

---

## Bottom line for the quest

1. **Do not repeat `1ce80391`.** It was unit-green + DT-red-on-revert + verify-SHIP and
   still regressed live via hot-path load amplification (per-failure escalate + reinsert,
   short-circuiting a hydration backoff). Any gap-(v) fix must be validated by the same
   controlled ≥2-pre-vs-≥2-post live A/B on pf/throws + `[2/4]` load, not just a DT.
2. **Gap (v) ≠ gap (ii).** Gap (v) is a durability LIE (write returned true, row PENDING
   on all replicas), not a known-failed-write recovery. Fix it where durability is
   claimed — the routed-write ack / Raft-commit-resolve path — after the design's
   required "own diagnosis first" pins which branch/layer drops the write.
3. **Reuse:** Leg A owner-RPC read escalation (`06496039`), the confirm layer, and the
   already-computed durable watermark (`readDurableCommittedIndexWitness`) for
   *witnessing* durability. The single real write-durability mechanism is Raft
   commit → `resolveCommit` (`partition-replication-handler.js:437`); the structural
   hole is the ABSENT durable-before-ack invariant (verify report §3). No
   `replicateToQuorum`/`awaitDurable` helper exists to reuse.
4. **Industry agrees:** quorum-commit-before-ack + resolved-timestamp/watermark-gated
   CDC emission (CRDB), idempotent WAL-sourced upserts (Debezium) — durability at the
   commit layer, not papered over at the consumer.

### Citations
- Reverted fix: `1ce803913b964a7c2cca77015105d85279fe79cc`; revert:
  `692c9dbb540ef74cc6ca35b7c8ce9632da54dd6a`.
- Leg A: `0649603949d9034ff2ba76dab13e948fc75fa5d6`. Raft committed-entry-loss guard:
  `3717c518`.
- `solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-regression-gapII-reverted.md`
- `solve/changes/formation-ledger-self-move-blocks-cluster-ops/design-cdc-nontermination-fix.md` §0,§1,§2,§3
- `solve/changes/formation-ledger-self-move-blocks-cluster-ops/verify-inrepo-priorart-machinery.md` §3
- `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:256-272,230-252,383-444,446-466,468-496,498+,51`
- `src/partition/partition-replication-handler.js:195-211,378-444,437`
- `src/partition/partition-service-durability-fitness.js:60,158-184,295-301`
- `src/partition/partition-cdc-parameterized-sql.js:316-357`
</content>
</invoke>
