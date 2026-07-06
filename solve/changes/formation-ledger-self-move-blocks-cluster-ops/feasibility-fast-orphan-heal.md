# Feasibility: sound faster orphan-heal than the ~60s blind hold

Read-only research, 2026-07-06. Target: the ORPHANED 2PC participant transaction that
wedges `replica_operations-p1` (run-23/run-6 zombie class). Question: can it be soundly
rolled back FASTER than the ~60s `preparedStateHoldTimeoutMs` hold without ever aborting a
still-live transaction the coordinator will still commit?

## OVERALL VERDICT: (B) FEASIBLE-BUT-BOUNDED

The 60s hold is **NOT** a 2PC in-doubt safety bound *for this zombie class*, so it **can** be
shortened soundly. But a floor remains and the hold is not the sole latency lever.

## The single most important code fact

The participant BEGIN is delivered **decision-blind**. The coordinator enlists a participant
via `beginParticipant(sessionId, partitionId, tx.transactionEpoch)`
(`src/query/distributed/distributed-transaction-coordinator.js:258`) — it forwards the epoch
but **NOT** `tx.timeoutDeadline` (which the coordinator holds at
`distributed-transaction-coordinator.js:218`, `= createdAt + transactionBudgetMs`). The
participant's ONLY channel to the coordinator's decision is the coordinator-driven
per-partition RPC `commitParticipant` / `rollbackParticipant`
(`distributed-transaction-protocol.js:265` and `:318`), which iterates the coordinator's
`tx.participants` Map. A participant that is absent from that Map — exactly the run-23
empty-set/clobber case — receives **zero** signal: no commit, no abort, no deadline. There is
no participant-side poll of the coordinator and no coordinator-liveness consultation anywhere
on the transaction path. The participant therefore stamps its own local `startTime`
(`partition-service-transaction-base.js:513`) at BEGIN and falls back to a blind local timeout.

## Trace of the lifecycle (what the code actually does)

1. **Participant learns the decision only via the coordinator RPC.** Begin → ACTIVE
   (`beginTransaction`, `partition-service-transaction-base.js:465-535`, `BEGIN IMMEDIATE` +
   `startTime`). Prepare → PREPARED (`prepareTransaction:541`, stamps `preparedAt`). The
   commit/abort decision arrives ONLY through `commitParticipant`/`rollbackParticipant`, driven
   by `executeParticipantStage` walking `tx.participants` (protocol.js:261/314). Not in the map
   ⇒ never contacted.
2. **The zombie is ACTIVE, never PREPARED.** The quest statement seals it
   (`solve/quests/ledger-participant-transaction-zombie-lifecycle.json`: "an ACTIVE
   distributed-transaction participant hold … orphaned when the 2PC coordinator committed with
   an EMPTY participant set"). The sweep's ACTIVE branch (`collectExpiredActiveSessions`,
   `partition-service-transaction-base.js:295-315`) explicitly excludes anything also in
   `preparedTransactions` (`:298`). So the run-23/run-6 wedge is an **unprepared** participant.
3. **Why 60s.** `TRANSACTION_BUDGET_MS = PREPARED_HOLD_TIMEOUT_MS = 60000`
   (`src/control-plane/timeout-budget.js:20-21`). The participant ACTIVE hold reuses the SAME
   constant (`partition-service-core-base.js:166-170`, checked at
   `partition-service-transaction-base.js:305`). This is deliberate: the coordinator's WHOLE
   transaction budget is 60s (`distributed-transaction-coordinator.js:204-208`), so an ACTIVE
   participant older than 60s **cannot** still belong to a live transaction — the coordinator
   itself has already timed out. The 60s is chosen as a **zero-false-positive** upper bound, not
   as an in-doubt safety floor.

## The 2PC safety analysis (the crux)

For an **ACTIVE (never-prepared)** participant, unilateral abort is **always
durability-safe** — presumed-abort. The coordinator cannot have decided COMMIT for a
transaction that includes this participant, because a COMMIT decision requires first collecting
this participant's PREPARE vote (protocol.js prepare stage `:208` precedes commit `:261`). If
the participant is still ACTIVE, it has not been asked to vote, so no COMMIT decision naming it
can exist. Rolling it back can at worst make a later PREPARE fail → coordinator aborts the whole
tx (presumed abort). That is a **spurious abort (liveness / wasted work), never a lost committed
write (durability)**. Therefore the invariant a fast signal must preserve — "never lose a
committed write" — is **automatically satisfied** for the ACTIVE class regardless of timing.

This is why the 60s is NOT an in-doubt bound here: in-doubt (must-wait-for-coordinator) applies
ONLY to the PREPARED branch (`collectExpiredPreparedSessions:273-290`), where a vote-yes has
been given. The run-23 zombie is not in that branch.

## What faster SOUND signals exist, and the floor

Shorter-but-sound options, in increasing power:

- **Coordinator-deadline propagation (cleanest, smallest).** Forward `tx.timeoutDeadline`
  through `beginParticipant` (coordinator `:258` → participant state) and fire the ACTIVE sweep
  at that createdAt-anchored deadline instead of local `startTime + 60s`. Sound with zero false
  positives (past the coordinator's own deadline the tx is provably dead). Gain is only the
  BEGIN-delivery-latency delta (participant `startTime` is stamped strictly after the coordinator
  `createdAt`), so it trims tens–hundreds of ms, not tens of seconds. Marginal.

- **Positive terminal-status / orphan signal (the real accelerator).** run-23's coordinator did
  NOT die — it committed against the empty set and moved on — so a coordinator-liveness (SWIM/FD)
  signal would NOT fire; the coordinator is healthy. The only fast POSITIVE orphan evidence is
  "transaction X reached a TERMINAL status at the coordinator (COMMITTED/ABORTED/FAILED) and I am
  not a committed participant." That outcome IS recorded durably (persistTransactionRecord; the
  recovery reader `recoverFromSystemTables`,
  `distributed-transaction-recovery.js:431-496`, reads those `transactions`/`participants` rows).
  A participant-side resolver that authoritatively reads its held txid's status could abort the
  instant the coordinator went terminal without it — far under 60s.
  **Floor / hazard:** that read re-enters the exact CDC-lag class that CAUSED run-23 (the clobber
  came from a cache-lagging participants view). To be sound it must be a **cache-BYPASSING
  authoritative read** (same discipline as the self-move interlock fix `c7a3bf19`), and it adds a
  read path — which the standing "avoid secondary caches / research existing mechanism first"
  directives push back on. Its latency floor is that authoritative-read cost + status freshness.

- **Shorter blind timeout (safe but lossy on liveness).** Because ACTIVE abort is
  durability-safe, one could simply lower the ACTIVE-branch bound below 60s. This never violates
  safety, but it trades latency for **false-positive spurious aborts** of legitimately-slow live
  transactions (and their wasted work). Acceptable only if the ledger's real ACTIVE-hold p99 is
  known to be far under the chosen bound.

## The other floor: the leader path is co-bound by durability-fitness, not just the hold

Even a zero-latency ACTIVE heal does not fix the LEADER wedge alone. The heal is role-gated:
a LEADER/CANDIDATE must not bare-ROLLBACK (`isStuckTransactionHealPermitted:396-401`,
re-mint→truncation physics, vet doc Z2). On a leader the heal waits for durability-fitness to
demote first — and that detector is ALSO anchored at `LEADER_DURABILITY_LEGAL_HOLD_MS =
PREPARED_HOLD_TIMEOUT_MS` (`partition-service-durability-fitness.js:31-32`) plus a 3-strike
counter (`:33`). So the leader-wedge latency is `detect-unfit(~60s) → strikes → demote → next
sweep heals`. Shortening the participant hold WITHOUT also shortening the fitness detection
window leaves the leader-case latency essentially unchanged. Any real latency attack on the
leader wedge must move BOTH constants (and both would ride the same coordinator-deadline or
terminal-status signal to stay sound).

## Did the companion quest already refute a fast orphan signal?

No — it did not evaluate one. `ledger-participant-transaction-zombie-lifecycle` and its
`vet-zombie-lifecycle-design.md` took the 60s as given (matching `TRANSACTION_BUDGET_MS`) and
spent their entire attack surface on making the heal **SAFE** (FOLLOWER/LEARNER-or-solo role
gate, Z1 cache invalidation, empty-set-commit guard, recovery clobber-guard, absorption
removal), plus surfacing the wedge via durability-fitness demotion. The `verify` doc grep for
orphan/faster/in-doubt/deadline/latency shows no fast-signal discussion. So a faster orphan
signal is **not** something the quest considered and rejected — it is unexplored ground. What
the quest DID close (empty-set commit guard `durable-workflow-coordinator.js:415-430`; recovery
skip-live) removes the *cause*; it did not shorten the *heal latency*.

## Bottom line

- The 60s ACTIVE hold is a coordinator-budget-completion window (zero-false-positive blind
  bound), NOT a 2PC in-doubt safety floor — unilateral abort of the never-prepared zombie is
  presumed-abort-safe. So it CAN be shortened soundly.
- Floor 1: to shorten WITHOUT spurious aborts you must add a POSITIVE signal — deadline
  propagation (marginal gain) or an authoritative cache-bypassing terminal-status read (real
  gain, but re-enters the CDC-lag hazard and adds a read path).
- Floor 2: the PREPARED branch co-resident in the same sweep IS a genuine in-doubt bound;
  and the LEADER wedge latency is co-bound by the identically-60s durability-fitness detector,
  so the hold is not the sole lever.
- If the formation-wedge latency must actually drop, the highest-leverage sound move is
  **coordinator-deadline propagation shared by BOTH the ACTIVE sweep and the fitness detector**
  (bounded, sound, no new read path); the terminal-status resolver is the bigger win but carries
  the CDC-lag caveat and directive friction. Otherwise attack the latency at
  successor-readiness/leadership as the memory frontier already suggests.
