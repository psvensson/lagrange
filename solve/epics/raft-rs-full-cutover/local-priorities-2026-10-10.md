---
audience: development
documentClass: planning
---

# Local agent: verified priorities and immediate continuation

Date: 2026-10-10. This is the follow-on to the operator's adversarial codebase
review. Read the [final risk record](../../../docs/development/adversarial-risk-review-2026-10-10.md)
for all accepted, revised and deferred recommendations. The existing epic and
Quest logs continue to own work state; this page gives the next execution order.

## Start on your actual work, not the audit checkout

You are already the capable local implementation owner. Continue working.
First inspect your current HEAD/branch, staged and unstaged changes, unpublished
commits, worktrees and owned lab jobs. Complete the current bounded verification
or correction to a coherent checkpoint before opening an overlapping change.
Preserve current source, evidence, inventory, locks, salvage refs and other
agents' jobs. Do not reset, clean, prune, force-push, or kill foreign work.

The last published local subject inspected by this review was
`86d53bc79615a91ad70ff5b75b40ee091211519a`, branch
`handoff/rs-raft-safety-first-20261010`, PR115. It is an audit reference and may
be behind you. The priorities branch is
`planning/verified-risk-priorities-20261010`, based on that subject. Fetch and
inspect its documentation-only commit and ancestry. Bring that planning commit
into your current branch only after checking conflicts with your newer work;
do not replay its parent source stack or replace your checkout with PR115.
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

## 2. P0 local: verify required sync and continue FreshMG

After the current bounded checkpoint, verify RS1 and start TX1 as the next new
safety unit. Full FreshMG certification is not an entry gate for TX1. Continue
independent FreshMG prerequisites while serializing changes to shared runtime/
partition owners. If a FreshMG witness exposes a TX1 defect, record that concrete
dependency and advance TX1 instead of rerunning or weakening the FreshMG proof.
The required-sync boundary must be verified before claiming transaction durability.

**RS1:** inspect the existing `commitDurably`/`readyCommitDurability` repair on
your candidate. Verify required term/vote/log stability before dependent sends,
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

For this multi-attempt boundary work, reconcile any actual local Quest first.
If none exists, prepare one bounded Leg A Quest with a real read-only completion
probe over retained behavioral evidence; run the existing `start` command only
after the supported baseline has produced a meaningful red witness. Do not
invent a seal or placeholder passing receipt. Use existing runners/owners.

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
