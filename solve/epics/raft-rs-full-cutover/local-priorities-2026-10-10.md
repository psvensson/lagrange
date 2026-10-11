---
audience: development
documentClass: planning
---

# Local agent: verified priorities and immediate continuation

Date: 2026-10-10. This is the follow-on to the operator's adversarial codebase
review. Read the [final risk record](../../../docs/development/adversarial-risk-review-2026-10-10.md)
for all accepted, revised and deferred recommendations. The existing epic and
Quest logs continue to own work state; this page gives the next execution order.

Checkpoint update: reviewed `6d24e3b4f0b64212e05ce0b66668d67dc82ba812` on
`takeover/rs-raft-safety-first-20261010`. FreshMG's R4-D1/D2/D3 follow-up was
committed at `045c9130e` with bounded independent approval recorded. RS1 remains recorded
as verified. TX1 is sealed, OPEN; revision 6 was rejected and the local owner
reports revision 7 in progress. **The query seam and six owner choices are now
agreed in the [TX1 owner decisions](../../quests/replicated-transaction-decision-and-apply/owner-decisions-2026-10-10.md).**
Finish that revision and obtain a bounded review of its remaining correctness
delta before participant implementation. FreshMG physical completion is not
its entry gate. Preserve the mixed branch and isolate the integration stacks;
do not introduce a red-test exemption.

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

At the reported checkpoint, the retained canonical pass is on `80632c7e4`,
before later discovery/authorization changes including `045c9130e`. Run the existing bounded gate on
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

R4-D1/D2/D3 are complete in the bounded follow-up at `045c9130e`; do not redo
them. Before the next new promotion or abandonment branch is selected from
LEARNER_COMMITTED, make branch selection consume recordedLearnerFactIsValid,
then retain settlement, exact permit, live claim/boot and CAS checks. Preserve
its separate idempotent selected-branch readback, whose phase is later. The
pure historical predicate must not acquire clocks or current-owner checks.
Invalid rows retain durable debt, a typed diagnosis and a repair/reentry owner.

Keep the real two serial replacements, distinct off-seed storage, restart and
seed-storage-loss witness. It must continue fresh SQL, CDC and routing/cache
recovery. Focused component green or a permanently parked CREATE cannot close it.

## 3. Next new safety unit: transaction Leg A, then Leg B

Read the [agreed owner decisions and seam](../../quests/replicated-transaction-decision-and-apply/owner-decisions-2026-10-10.md).
They replace this handoff's earlier list of unresolved design choices. The
query lane owns coordinator persistence, decisions, wire identity, recovery
and statement retry; local owns participants/Raft, seed composition and the
CDC crash boundary. PR74/A1 remains with its existing owner.

Finish revision 7, then obtain a bounded independent review of the remaining
rowid/order/PRAGMA divergence, the production-shaped self-check fixture and
the decision-dependent changes. Do not treat another opcode census as proof
of deterministic SQL or reopen unaffected accepted findings for wording nits.
A new reachable correctness counterexample still blocks its affected claim.
After design acceptance, implement in owned worktrees and integrate one
compatible protocol cutover. Serialize shared partition/runtime edits.

The eight TX1 receipts still cover speculative visibility, replicated PREPARE,
atomic operations/outcome/applied-index application, exact terminal identity,
one immutable decision before fanout, no rollback after COMMIT and recovery/CDC
after deadline/crash, for both single- and multi-participant transactions.
Prepare-first is selected. No new MVCC, coordinator or retry framework is
required by this decision. Retain real three-replica fault/restart proof.

The original P1/P2/P3 runnable revision must have an explicit replacement map
and be retired from the active corpus when its stronger replacements land.
Its red TAP and original bytes remain history. Required unresolved witnesses
remain red; no sealed-red skip convention is introduced. Receipt 8 has a
named local CDC owner and is not waived. The separately agreed kernel UNKNOWN
correction may proceed with its own bounded acceptance and independent review.

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
