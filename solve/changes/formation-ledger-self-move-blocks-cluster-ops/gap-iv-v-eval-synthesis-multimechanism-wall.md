# Gap (iv)/(v) evaluation synthesis — the settle stall is a multi-mechanism wall

Three parallel adversarial subagents (gap iv, gap v, root-unification), grounded in the
clean current-HEAD run. Result: **no single leg greens the settle doneWhen; every
candidate is necessary-but-insufficient.**

## Root-unification: NO shared fix at the fix layer
Both gaps surface the same low-level "No row found for CDC update" (154×, all WRITE-apply
witnesses at `partition-cdc-parameterized-sql.js:337` / `partition-sql-parser.js:243`),
but diverge at distinct decision sites → two independent fixes. Leg A (`06496039`) already
escalated gap (v)'s READ half; the reservation read (iv) and the quorum WRITE (v) are the
residual leaks.

## Gap (iv) — premature reservation orphan-release: SAFE correctness, but MOVES ZERO settle
- Real bug: reservation-reconcile read gets a silent EMPTY (op present+ACTIVE on 3/4
  replicas incl. the releasing node) → `ABSENT_OPERATION → RELEASE_ACTIVE`
  (`rebalance-coordinator-reservation-lifecycle-methods.js:32-35,53-54`). The
  `DEFERRED→KEEP_ACTIVE` safety arm exists but the read never produces a deferral
  (`buildDeferredAuthoritativeOperationVisibilityOutcome` returns null when
  `priorityRecoveryActive!==true`).
- **Correction:** "escalate to OWNER_RPC_PREFERRED" is a NO-OP (already the default).
  Only `requireOwnerRpcRead:true` changes it — and that adds an owner-RPC round-trip per
  active reservation on the ~1/s reconcile loop = the same escalate-per-event
  amplification class that forced the s9 revert `692c9dbb`. **Do NOT do read escalation.**
- **Safe fix = state-table change:** `ABSENT_OPERATION → KEEP_ACTIVE`; release only on
  positively-confirmed TERMINAL; genuine orphans reaped by the existing TTL backstop
  (`SELECT_EXPIRED_ACTIVE_RESERVATIONS`, :386-424). Zero added reads, no amplification.
- **But:** of 7 released orphans, 4 were legitimately terminal; the 3 that stay
  ACTIVE-stuck (`4f9f74a9`,`c986eaf7`,`efae5302`) are stuck because their COMPLETION
  WRITE is lost (gap v) — keeping the reservation adds **zero completions**. Gap (iv)
  moves its own quest metric (premature releases→0) but NOT the demo settle observable.

## Gap (v) — silent ledger write-loss: real durability lie, but the flagged anchor is wrong AND it's ~2 ops
- **The flagged anchor `partition-cdc-parameterized-sql.js:316-357` is a WITNESS, not the
  ack site.** Fixing there is REGRESSIVE (create-on-missing resurrects released
  reservations / fabricates phantom rows across ALL system tables — the run-15 freeze
  class) or NO-OP (it feeds the CDC event generator, never `persistOperationUpdate`).
- **Real durability lie** is at the ack layer: `confirmReplicaOperationVisibility` reads
  OWNER_LOCAL-first (the soon-truncated local copy) and `confirmPersistedOperationUpdate`
  treats DEFERRED as success (`replica-operation-repository-mutation-persistence-methods.js:251,498-592`).
  `b546e25c`'s terminal UPDATE matched changes=1 on a leader replica (r1, term 1) that was
  then superseded by leadership churn (term 26→32) and its un-quorum-committed entries
  discarded (DIRECT self-commit mode, `partition-write-kernel.js:42-60`, flagged
  dangerous). **Fix = gate the terminal-transition ack on a leader/quorum-confirmed read,
  reusing Leg A's owner-RPC escalation as the ACK gate.** VIABLE, narrow blast radius.
- **But:** of 18 deferring ops, only ~2 are durably write-lost (`b546e25c`,`ad5709aa`).
  The MAJORITY are already durably TERMINAL yet still defer on "Cache update not observed"
  = a THIRD mechanism (read-model/cache-visibility lag). The dominant dispatch error is
  "Distributed operation failed due to participant failures" (55×) = a FOURTH (the
  participant-failure storm, gap ii territory, the reverted arm-2).

## The strategic reality
The settle stall is driven by ≥4 mechanisms, each responsible for a few ops:
1. reservation orphan-release (iv) — ~3 net, correctness only
2. quorum-commit write-loss (v) — ~2 ops, real durability lie
3. cache-visibility lag — MAJORITY of deferring ops (durably terminal, read/dispatched as
   in-flight)
4. participant-failure storm — 55× dispatch failures (gap ii, previously reverted)
Common driver: heavy leadership/membership churn on control-plane partitions during cold
formation (the "circular-dependency: formation vs steady-state" class). No single leg
turns the doneWhen (settle 3x) green.

## Options
- **A. Ship the two SAFE correctness legs (iv state-table KEEP + v quorum-ack gate)** as
  incremental hardening — each moves its own metric, both extend Leg A, narrow blast
  radius, no amplification. Honest caveat: settle likely STILL red after (they clear ~2-3
  of the stuck ops, not the cache-lag majority).
- **B. Investigate the cache-visibility-lag mechanism (#3)** — the majority contributor,
  and possibly a stale-read artifact inflating the in-flight count (is the settle SQL
  query reading a lagging replica for durably-terminal ops?). Highest potential leverage
  per fix; least understood.
- **C. Attack the churn root (#common driver)** — reduce control-plane leadership thrash
  during formation so bookkeeping converges. Original quest thesis; high effort; prior
  sessions invested heavily.
- **D. Consolidate toward EXHAUSTED-at-single-leg** — declare the settle needs a
  coordinated multi-mechanism fix and scope that explicitly, rather than shipping more
  necessary-but-insufficient legs.
