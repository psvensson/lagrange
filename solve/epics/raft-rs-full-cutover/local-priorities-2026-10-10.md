---
audience: development
documentClass: planning
---

# Local agent: verified priorities and immediate continuation

Date: 2026-10-10. This is the follow-on to the operator's adversarial codebase
review. Read the [final risk record](../../../docs/development/adversarial-risk-review-2026-10-10.md)
for all accepted, revised and deferred recommendations. The existing epic and
Quest logs continue to own work state; this page gives the next execution order.

Checkpoint update: reviewed `9c19760aca5306bd400336f9ad15750167151022` on
`takeover/rs-raft-safety-first-20261010`. Step 1's production/test bytes match the
independently approved `a66bef3f7`; the two later commits only append Quest logs.
RS1 is recorded as verified. TX1 is sealed, OPEN and design-rejected. **Start the
TX1 design and witness revision next**, then obtain acceptance of that revision
before participant source changes. The proof reconciliation below can proceed
without blocking design work. Full FreshMG physical completion is not its entry
gate.

## Start on your actual work, not the audit checkout

You are already the capable local implementation owner. Continue working.
First inspect your current HEAD/branch, staged and unstaged changes, unpublished
commits, worktrees and owned lab jobs. Complete the current bounded verification
or correction to a coherent checkpoint before opening an overlapping change.
Preserve current source, evidence, inventory, locks, salvage refs and other
agents' jobs. Do not reset, clean, prune, force-push, or kill foreign work.

The original PR115 subject, `86d53bc79615a91ad70ff5b75b40ee091211519a`, is a
historical audit reference. PR116's planning commit is already incorporated as
`1733e7da7`; do not cherry-pick it again. Inspect any newer continuation commit
as a documentation delta against your actual branch; preserve your source stack.
If your local owner already solved a finding, record exact evidence and continue
with the next unresolved dependency.

Read AGENTS -> rules -> router, then the current Quest and authority owners:

- [FreshMG Quest](../../quests/message-group-fresh-identity-membership/quest.json),
  its current log and [original takeover](../../quests/message-group-fresh-identity-membership/local-takeover-20261010.md).
- [Safety-first ruling](../../quests/message-group-fresh-identity-membership/safety-first-ruling-20261009.md)
  and [authority and recovery](../../../architecture/contracts/authority-and-recovery.md).
- [October 8 continuation](contract-first-2026-10-08.md), including its recovery
  and certification constraints. The current local assignment supersedes its
  earlier cloud execution assignment.
- [Solver runbook](../../../docs/development/solver-runbook.md), named owner
  interactions, and relevant test/verification guidelines.

## 1. Finish the current canonical verification unit

Use normal locked dependencies and the actual source under review. If the
current patch still lacks the canonical verification requested in the original
takeover, read and run its existing script in an isolated owned checkout:

```sh
LAGRANGE_PRIORITY_PROOFS=solve/quests/message-group-fresh-identity-membership/evidence/local-takeover-20261010/proofs
LAGRANGE_PRIORITY_OUT="$HOME/.local/state/lagrange-lab-reports/risk-priorities-$(date -u +%Y%m%dT%H%M%SZ)"
bash "$LAGRANGE_PRIORITY_PROOFS/verify-canonical.sh" "$PWD" "$LAGRANGE_PRIORITY_OUT"
```

The output must be a new absolute path. Read the script's pinned selection and
scope before applying it to newer work; additional changes require their
applicable changed-path/static checks. It is a bounded verification, not the
entire cutover proof. Do not repeat a completed measurement merely because this
handoff is new; inspect source/input identity and the existing evidence first.
Do not fish for green by rerunning unchanged failures, use adapter dependencies,
or promote the old diagnostic/313-entry results to proof of newer bytes.

Retain the first failure and correct its owner. Generate intended metadata from
its producer, preserve before/after, and independently review the final changed
source. Preserve/push a coherent scoped commit through the runbook's non-main
path. Such a push preserves work; it does not certify Quest land, main or release.

At the reported checkpoint, the canonical pass is on `80632c7e4`, before the
discovery/authorization changes in `a66bef3f7`. Run the existing bounded gate on
the intended final source and the changed discovery/fixture checks its pinned
list omits. If another source correction is imminent, finish and review that
coherent candidate first; do not certify every intermediate head. Preserve the
original canonical, RS1, focused-suite, review/mutation and cone outputs through
the existing evidence owner, with per-failure baseline/owner dispositions.
An inherited red, intentional TX1 red and pass after a resource retry are
different outcomes. Packaging existing evidence does not require repeating it.

## 2. P0 local: verify required sync and continue FreshMG

After the current bounded checkpoint, confirm the recorded RS1 evidence and start
TX1 as the next new safety unit. Full FreshMG certification is not an entry gate for TX1. Continue
independent FreshMG prerequisites while serializing changes to shared runtime/
partition owners. If a FreshMG witness exposes a TX1 defect, record that concrete
dependency and advance TX1 instead of rerunning or weakening the FreshMG proof.
The required-sync boundary must be verified before claiming transaction durability.

**RS1:** inspect the existing `commitDurably`/`readyCommitDurability` repair on
your candidate. The epic records its verification on `80632c7e4`; the relevant
code and four witness files are unchanged through `9c19760`. Preserve that
evidence and check relevant inputs before commissioning another run.
The required proof is term/vote/log stability before dependent sends,
persistence failure, and committed-but-unapplied restart replay. Do not start a
competing repair or set every SQLite transaction to FULL by default. Preserve
the distinction between process-crash tests and modeled stable-storage/power-
loss guarantees.

**MG1:** continue `message-group-fresh-identity-membership`, preserving its eight
sealed receipts. Use its existing OperationWorkflowOwner lane and normal
discovery/reconciliation; avoid recursive lane acquisition and a new scheduler.
Wire ordinary recovery and current CREATE through the existing owners, then
complete ordered successor handling, transfer/replay, promotion, leadership
handoff, source absence and exact cleanup. Prove both refusal and eventual
progress after authority returns.

Exact historical receipt recording does not authorize any new CREATE, promotion,
rollback, cleanup or successor. Timeouts, lease expiry and missing history are
not definitive noncommitment. Preserve operation-row CAS, native origin,
physical-generation fences and remaining membership/reservation/cleanup debt.
After promotion, recover forward under the existing J1 rule.

Before the next FreshMG CREATE/progression consumes recorded-row classification,
resolve R4-D1: share the pure immutable validity predicate for discovery and
recording. Do not reuse the recorder's entire live-claim/lease gate for a
historical fact. In the same small follow-up, classify invalid phase/permit
pairs before claim work (D2) and share safe hint filtering with the CDC wake
route (D3). Invalid rows retain durable debt, a typed diagnosis and a repair/
reentry owner. These findings do not revoke the bounded step-1 approval.

Keep the real two serial replacements, distinct off-seed storage, restart and
seed-storage-loss witness. It must continue fresh SQL, CDC and routing/cache
recovery. Focused component green or a permanently parked CREATE cannot close it.

## 3. Next new safety unit: transaction Leg A, then Leg B

Coordinate now with the separate query owner on
[PR100's existing design](https://github.com/psvensson/lagrange/blob/daddead73ffeb8c348663695ac2f0eaa8873cf75/solve/changes/0-3-prepared-transactions-split-merge/design.md).
It is design only at that SHA. Agree the partition/replication and coordinator
seam before either lane changes it. Query owns coordinator/query behavior;
you own the local participant/replication and topology integration. Do not alter
PR74/A1 as part of this local unit. If no query owner is actively available,
record the seam and progress the agreed local prerequisites without inventing
coordinator behavior or silently taking its branch.
Keep the coordinator decision/recovery repair and its concrete consumer
falsifier explicitly outstanding; local participant PREPARE proof cannot close
the whole TX1 leg.

TX1 is the next new safety-critical boundary implementation after the current
coherent local unit. Schedule it without simultaneous writers to FreshMG/shared
Raft owners. It must cover **one-phase and two-phase** transactions, not merely
PREPARE acknowledgment. The source findings to falsify are:

- local COMMIT can precede consensus; the current committed marker does not
  apply its carried operations to followers;
- `NO_TRANSACTION` can be treated as COMMITTED without an outcome read;
- timeout/failure after COMMITTING can select rollback or strand recovery;
- local expiry can discard prepared obligations.

Use the complete TX1 requirements and witness matrix in the final risk record.
In particular, discard speculative staging safely, retain deterministic
prepared operations/conflict evidence, apply operations/outcome/applied index
atomically, and persist one immutable coordinator decision before participant
COMMIT fanout.
Resolve uncertain persistence and exact participant outcomes; keep recovery and
CDC obligations after the caller deadline. Never treat a missing session as
proof of a terminal decision.

The [TX1 Quest](../../quests/replicated-transaction-decision-and-apply/quest.json)
is now sealed and OPEN. Read its log, seam and
[rejected design](../../quests/replicated-transaction-decision-and-apply/design-leg-a-2026-10-10.md).
Revise that design before participant implementation. Resolve these decisions
with the query coordinator owner, recording concrete transition tables, source
owners and reachable falsifiers:

1. **Isolation throughout ACTIVE.** Ending staging only at PREPARE is too late
   for other users of the shared SQLite connection. Resolve observer scope
   against the existing read-your-writes contract. Reuse the earlier
   [F6 alternatives](quest-records/raft-rs-single-path-partition-cutover/design-f6-session-transaction-isolation.md):
   its c' is synchronous savepoint/replay/rollback per request, not a private
   snapshot database. It still needs a stable-read/conflict rule and deterministic
   results, a replay work/byte bound and no await or escaping observer while the
   savepoint is open; another connection to the same file still competes for
   SQLite's single writer. Prefer a bounded existing concurrency model to new row MVCC.
2. **Exact identity end to end.** Allocate one non-reused logical transaction ID
   before fanout and retain it through restart/retry. Carry it, participant
   identity, mode and the needed epoch/decision/digest fields on every applicable
   BEGIN/write/PREPARE/COMMIT/ROLLBACK/outcome request and delivery key. Today
   PREPARE/COMMIT/ROLLBACK omit the epoch; session ID plus a per-coordinator clock
   is insufficient. Specify deterministic operation encoding and its actual
   values, including SQL-generated values and per-operation dedup interactions.
   The current proposal codec uses JSON.stringify, not key-order canonicalization;
   pin the chosen durable bytes rather than assuming canonicalization exists.
3. **A durable PREPARE promise.** Choose one replicated conflict authority and
   reservation whose protection survives leader change/restart until a terminal
   decision. Cover ordinary writes, transaction writes, schema and mirror apply;
   leader-only rowCommitEpoch/committedWriteLog cannot supply it. A conservative
   partition reservation is an option to evaluate before row-level locking.
   Deterministic validation belongs before positive PREPARE. A local apply/storage
   failure after PREPARED does not authorize a new abort decision.
   A conflicting command already in the committed log needs a deterministic,
   non-mutating disposition: do not stall apply waiting for a later releasing
   COMMIT in that same log.
4. **One decision and exact outcomes.** Bind terminal commands to the immutable
   coordinator decision and exact prepared content. First-terminal-wins prevents
   reversal but cannot authorize a rollback after global COMMIT. Reuse the
   coordinator's durable transaction owner with conditional monotonic writes;
   mutable status UPSERT and commitPointReached are not that decision. Resolve
   uncertain persistence before an incompatible decision. Even a fresh absent
   PREPARE row is not definitive NOT_COMMITTED while delayed PREPARE/COMMIT can
   arrive; use an authoritative terminal decision/fence and retain UNKNOWN
   otherwise. Preserve proof identity when the outcome callback crosses owners.
5. **Resolve 1PC before promising its fast path.** The current seal requires a
   coordinator decision before COMMIT fanout for both modes. An unconditional
   COMMIT followed by participant conflict refusal is inconsistent. Jointly
   choose a prepare-first single-participant path or a clearly distinct intent/
   participant-decision protocol; explicitly supersede any sealed promise whose
   meaning changes. Do not silently rename an intent COMMIT, promise one round
   prematurely, or prescribe participant refusal after an irrevocable decision.
6. **One recovery/apply authority.** Reconcile reconstructPreparedState and
   hasPendingPreparedTransactions with the selected durable owner; avoid another
   authoritative log scan. Apply operations, terminal outcome and applied index
   atomically. Account for split/merge mirroring and whole-transaction replay.
   Cite the CDC replay/cursor/retention owner and prove the crash-after-data-commit
   window; bounded in-memory dedup alone cannot discharge restart delivery.
7. **Repair and complete the witnesses.** Start COMMIT without awaiting its
   acknowledgment, observe the proposal and forbidden visibility/pending ACK,
   then drive committed application and await completion. P1/P2 currently await
   the ACK before advancing consensus. P2 also needs actual outcome/applied-index
   atomicity and fault checks, not only follower row count. Preserve original red
   evidence, add conflict/restart/late-command/1PC subcases under the eight existing
   receipts where meaning is unchanged, and leave receipts red until covered.
   Inventory old witnesses affected by the semantic change. Independent design
   review must resolve the rejection; independent source and real three-replica
   verification follow implementation.

The controllable port does not prove durable Ready/log persistence; its second
delivery of a marker is a new-index duplicate, not crash replay at the original
boundary. Keep positive controls in separately executed cases, so a failing
negative assertion cannot prevent their execution. Use the real backend for
durable restart and quorum witnesses.

Register the coordinator-participant coupled interaction with its discriminating
witness when implementing the agreed seam. The local owner can revise the design
and local witnesses now; coordinator edits remain with the query owner. Preserve
the seal and append corrections to the review record rather than silently
rewriting its conclusions or multiplying Quests for individual test repairs.

Leg B follows Leg A's proved participant contract. Atomically order new
BEGIN/PREPARE admission against cutover, account for in-flight work, and preserve
frozen terminal routes through split/merge. Reconstruct the fence after restart.
Test admission after the last EMPTY observation, leader/owner restart, stale
routes and both merge sources. Show COMMIT/ROLLBACK can release the hold and
ordinary cutover then completes. Do not remap participants or use timeout as
permission. Declare a separate bounded Leg B Quest when its red is executable;
do not widen an unrelated sealed split/merge Quest.

## 4. P1 corrections after or alongside independent prerequisites

**RS2:** bound/remove the durable-store diagnostic journal as a small independent
change, preferably before long soak runs. Keep observation separate from
durability and retain existing test/error visibility. Do not bundle it with a
new memory framework or the entire snapshot program.

**SN1:** finish the general SQL-partition checkpoint/install/compaction path
through current owners. Do not enable partition cadence with the FreshMG
`raft_rs_replica_image`: that image scrubs application tables and has no real
partition HLC witness. Preserve application/transaction/outcome/idempotency/HLC
state, exact group/peer/configuration identity and replay consumers before
truncating. FreshMG's own transfer prerequisites remain within its current unit.

**RT1/RT2:** coordinate the bounded busy-health fix and host-memory investigation
through the pilot owner. A legitimate busy WASI invocation must survive health
admission while dead/hung workers still fail under their actual budget owners.
Measure host allocations and aggregate pressure before choosing a broader fix.

## 5. Evidence and stopping rules for each increment

Use existing review templates and proof owners. Identify candidate content and
relevant inputs, the individual run/environment, and the final integrated SHA
separately. Until generic Solver binding is repaired, the independent reviewer
must compare the manifest against actual bytes; a newer log entry or booleans-
only receipt is insufficient. Preserve initial failures, retry context and
incomplete/cancelled runs. A diagnostic pass after retry is not a clean pass.

The apparatus backlog carries the narrow enforcement repairs. They support the
next product proof; do not stop all runtime work to rewrite Solver. Keep existing
file-size/ratchet gates, R27's read-only probe rule and all sealed fault cases.
Do not add a new script/workflow for every finding. Do not move nightly records
or narrow A1's intrinsic-defense promise under this handoff.

For each coherent increment, record: addressed risk ID, actual source and proof
inputs, exact command/run outcome, independent verdict, unresolved obligations,
published branch/commit and next bounded step. New evidence may supersede this
review's diagnosis; append the correction and its evidence instead of editing
history. Report blockers at their actual owner and continue independent work.

After accepted changes compose, prove the actual final tree through its required
static, changed-path, corpus and real fault/recovery gates. A component receipt,
preservation push or this plan never substitutes for main/release acceptance.
Continue through the existing authorized gates; this instruction does not grant
an uncertified merge, release, safety waiver or product/edition scope change.
