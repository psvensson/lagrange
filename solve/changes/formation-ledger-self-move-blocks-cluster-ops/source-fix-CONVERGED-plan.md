# Source fix — converged, vetted plan (external practice + in-repo adversarial)

Both passes converge: `verify-source-fix-vs-practice.md` (etcd/CRDB/Spanner/Kleppmann/
2PC presumed-abort) and `vet-source-fix-inrepo-safety.md` (adversarial code trace).

## Split the fix in two

### LEG #1 — term-fenced rollback-on-step-down — SHIP (SAFE under C1–C4)
When a partition replica loses leadership, roll back any open **ACTIVE (never-PREPARED)**
participant transaction immediately, reusing the shipped crash-equivalent follower-heal
sequence. This unwedges the ex-leader at the step-down EDGE instead of after the ~60s
hold — the binding-latency fix. Both passes endorse it (CRDB drops latches / Spanner
relinquishes leases on leadership loss; safe because a never-voted participant is
presumed-abort).

Constraints (in-repo adversarial C1–C4, all load-bearing):
- **C1** reuse the FULL crash-equivalent sequence (`isStuckTransactionHealPermitted` +
  committedIndex guard + the dedup/cache handling at
  `partition-service-transaction-base.js:317-401,356-357`) — do not hand-roll a bare
  `db.exec(ROLLBACK)`.
- **C2** ACTIVE-only, and fire ONLY after the role has flipped to FOLLOWER (ordering at
  `replica-leadership-state.js:130-131` is load-bearing). NEVER roll back a PREPARED/
  voted-yes tx — it is in-doubt (and is recoverable anyway because PREPARE is
  raft-replicated, `:867-891`). External pass's single biggest risk = mis-classifying a
  PREPARED branch as never-voted → silent divergence; C2 is the guard.
- **C3** clear the apply dedup (`recentlyAppliedEntryKeys`) / refresh the committed-index
  cache ONLY when a rollback actually fired — else the ~19 flap edges cause spurious
  re-application.
- **C4** hang the trigger on the single reliable edge `onFollower`
  (`partition-service-raft-init-base.js:452`); the direct LEADER→CANDIDATE gap is
  heal-forbidden anyway and the 60s sweep backstops it.

Known residual (accepted, narrow): a tx whose COMMIT landed durably microseconds before
the step-down (the `await` at `commitTransaction:632` yields before `db.exec(COMMIT):637`
and the session delete `:660`) can be rolled back → recorded coordinator-FAILED. Data
stays crash-consistent; the exposure is a spurious FAILED record on a genuinely-committed
tx, strictly rarer than today's silent stranding. The eventual Leg #2 fence closes it.

### LEG #2 — commit-miss correctness — DROP the heuristic; defer to a term/epoch fence
DO NOT narrow `shouldTreatParticipantCommitMissAsSuccess` heuristically. Both passes
agree it is UNSAFE: a stranded-hold miss and a legit already-committed miss throw the
IDENTICAL `NO_ACTIVE_TRANSACTION_COMMIT` (`partition-service-transaction-base.js:622` =
`constants.js:396`) with identical COMMITTING status, and the mask converges the live
ACK-loss retry (`protocol.js:456`) + recovery replay
(`distributed-transaction-recovery.js:124-129,231-236`). Any local narrowing marks a
durably-committed tx FAILED and breaks recovery.

The ONLY sound form (both passes): an end-to-end **fencing token** — capture the raft
term/epoch at BEGIN (already carried, `transaction-base.js:516`), propagate it on the
COMMIT path, check it at the executing node, and emit a DISTINCT TYPED "stale-term/fenced"
error on positive mismatch that the mask does not green. This is Kleppmann's fencing
token and 2PC presumed-abort (absence-of-record = abort, never success). It is a larger,
separable change → its OWN follow-on quest, not this one.

## Why Leg #1 alone is the right scope for this quest
Leg #1 unwedges the ex-leader at the step-down edge, collapsing the ~60–78s freeze that
stalls the demo at [2/4]. The self-move's progress write, once the node is healthy, is
re-driven by the idempotent operation-workflow reconcile. Leg #2 hardens 2PC commit
atomicity (a real but separable correctness concern) and needs the bigger fence.

## Quest scope (sealed doneWhen target)
"On the LEADER→FOLLOWER edge a partition replica rolls back its open ACTIVE (never-
PREPARED) participant transaction via the crash-equivalent follower-heal sequence, so a
ledger self-move can never strand a wedged BEGIN past the step-down; PREPARED txns are
never rolled back; proven by a DT where the stranded-BEGIN-across-step-down wedge
reproduces RED and the edge rollback clears it GREEN (red-on-revert), with the
PREPARED-exemption and dedup-clear-only-on-rollback guards asserted." Follow-on quest:
the end-to-end term/epoch commit fence (Leg #2).
