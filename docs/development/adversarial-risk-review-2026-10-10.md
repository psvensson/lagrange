---
audience: development
documentClass: planning
---

# Adversarial risk review and final priorities - 2026-10-10

Status: accepted planning direction from the operator's request to challenge the
codebase review, preserve the final recommendations and instruct the running
local agent. This record does not certify an implementation. The linked epics
and Quest logs own execution state; this page owns the dated recommendation
inventory and its reasoning.

## Basis and execution authority

Three independent reviews challenged runtime/recovery, proof/workflow, and
scope/ownership. They compared current owners, sealed requirements, reachable
code and the published work already in progress. Findings below distinguish
source observations, bounded reproductions, pending corrections and questions
that still need measurement.

| Reviewed subject | Exact commit | Role |
| --- | --- | --- |
| Shared main | `ef3c7b1911b72b55da446b31cf914afec42e82af` | Shared-main source comparison, not a claim about an unseen local checkout |
| Published local takeover, PR115 | `86d53bc79615a91ad70ff5b75b40ee091211519a` | Basis of this planning branch; includes pending corrections |
| Queryable Core, PR74 | `0ec0d720e2278d756149a334d8bcb7a7543eb4a6` | Separate query lane and A1 work |
| Prepared-transaction design, PR100 | `daddead73ffeb8c348663695ac2f0eaa8873cf75` | Design only; not implemented transaction safety |

Unless a row says otherwise, source paths below were checked on the published
PR115 subject. Main and pending code must not be described interchangeably.
The running local agent may already be ahead: inspect its actual HEAD, worktree,
unpublished commits and running jobs before deciding what remains. Do not reset
it to an audit anchor or repeat a correction already present and proved.

The local agent owns Raft, formation, membership, lifecycle, reservation,
identity, recovery and their certification. The separate cloud query lane keeps
0.3 query work. Transaction coordinator changes and local participant/topology
changes meet at one agreed owner contract; neither lane silently edits the
other's live work. This updates the assignment in the October 8 continuation,
while retaining its technical constraints and historical decisions.

Read the actionable [local handoff](../../solve/epics/raft-rs-full-cutover/local-priorities-2026-10-10.md).
This plan authorizes preparation and scoped continuation, not uncertified main
integration, a release, worktree cleanup, or changing existing safety meaning.

## Priority decisions

P0 means a correctness/recoverability prerequisite for the associated claim.
Finish the running agent's current bounded verification/correction unit before
opening overlapping work. P1 closes the next operational or proof gap. P2 is a
tracked design/readiness item, not another active implementation queue.

| ID | Final recommendation and adversarial disposition | Priority and execution home |
| --- | --- | --- |
| TX1 | **Strengthen:** complete replicated transaction application, immutable durable decisions and uncertain-outcome recovery; an acknowledgment wait alone is insufficient. | P0; PR100 Leg A, query coordinator plus local partition/replication seam |
| TX2 | **Strengthen:** serialize admission and drain against split/merge cutover; retain frozen participant routes. An EMPTY observation alone is not a barrier. | P0 prerequisite to transaction-safe cutover; PR100 Leg B after TX1 |
| RS1 | **Accept, narrow:** finish and verify the existing required-sync Ready correction; do not prescribe FULL for every SQLite transaction. | P0 local; existing cutover/durable-store owners |
| MG1 | **Accept:** complete ordinary FreshMG replacement, restart and distinct off-seed seed-loss recovery. Safe permanent refusal is not completion. | P0 local; existing `message-group-fresh-identity-membership` Quest |
| SN1 | **Revise:** distinguish the FreshMG consensus image from a complete SQL-partition snapshot; keep general truncation refused until its recovery state is preserved. | P1 local; current cutover snapshot/install owners |
| RS2 | **Accept:** remove or bound the unused production diagnostic journal without creating another persistent ledger. | Small P1 local; durable-store owner, before long soak runs if independently schedulable |
| KY1 | **Accept:** finish one typed ordering contract and persisted boundary representation before relying on advanced query access paths. | P0 within query lane; existing A1, then planned A2 `partition-key-boundary-representation` |
| RT1 | **Accept with proof limit:** fix busy-worker health behavior; source and synthetic-worker reproduction exist, supported WASI/public-path closure does not. | P1; pilot-readiness runtime follow-up, bounded fix after current local unit |
| RT2 | **Investigate:** measure host-side and aggregate memory retention, then enforce limits before unbounded allocation/retention. | P1 investigation; planned pilot Q11 and existing runtime budget owners |
| WF1 | **Accept, constrain:** bind active Solver review/task evidence to actual candidate and proof inputs; repair v2 rather than restoring the retired Solver. | P1 supporting next proof; apparatus planned `candidate-review-evidence-binding` |
| WF2 | **Accept, revise rollout:** distinguish clean pass, pass after retry, failure and incomplete runs; retain all failures and diagnostic reruns. | P1; apparatus planned successor `retry-outcome-release-acceptance` |
| WF3 | **Accept, qualify:** expose one complete verdict for the actual integrated/release candidate, including unfinished or superseded corpus obligations. | P1; existing apparatus `workflow-budget` slot and publication/proof owners |
| WF4 | **Accept:** behavioral claims need behavioral attempts and source-bound retained evidence; shape checks are only structural checks. | P1; existing checker/harness owners, WF1 and query A1 |
| WF5 | **Accept prospectively:** stabilize acceptance around invariants and extend existing harnesses; do not create a checker for every review iteration. | Ongoing; apparatus and query owner; preserve sealed contracts |
| WF6 | **Defer explicit successor:** consider moving future nightly observations off main only with durable retention and consumer migration. | P2; apparatus `workflow-budget`; preserve solved `formation-health-verdicts` history |
| DOC1 | **Accept:** correct capability claims and make their evidence invalidate when relevant code changes. | P1; existing apparatus `public-claims-match-shipped-bytes` slot |
| CX1 | **Accept opportunistically:** reduce shared mutable ownership when touching a boundary; avoid a mass mixin/file rewrite. | Ongoing; current architecture and code-style owners |
| CX2 | **Reject immediate relaxation:** retain file-size gates and one-way ratchets. A measured replacement/allowance needs an explicit successor policy. | P2 design only; existing apparatus `ratchet-realignment` slot |
| CX3 | **Narrow prospectively:** define the supported JS trust boundary; do not remove defenses promised by a sealed contract. | P2 query/platform decision; A1-v13 obligations remain intact |
| SC1 | **Revise:** enforce safety dependencies without silently deleting approved 0.3 features or adding new release scope. | Existing Queryable Core owner and canonical feature map |
| OP1 | **Accept within edition scope:** make the supported upgrade/recovery envelope executable before a production-readiness claim. | P2 readiness gate; planned pilot Q12; commercial backup/restore/PITR stays external |
| OP2 | **Accept:** core authenticated/encrypted node transport and explicit admin access boundaries precede broader enterprise identity claims. | Planned pilot Q7 for node transport; security/admin owners for exposure policy |
| AR1 | **Retain:** one authority per decision, existing recovery paths, and separate historical facts from permission for a new effect. | Cross-cutting constraint; existing authority-and-recovery contract |

The existing architecture is a useful foundation. This review does not justify
a second consensus layer, a generic replacement workflow, a new durable proof
database, or reopening retired epics. Historical Quest volume is not active-work
volume. Current ownership and outstanding falsifiers matter more than directory
counts or making individual files artificially small.

## TX1 and TX2: the complete transaction correction

The existing [PR100 design](https://github.com/psvensson/lagrange/blob/daddead73ffeb8c348663695ac2f0eaa8873cf75/solve/changes/0-3-prepared-transactions-split-merge/design.md)
already requires committed/applied PREPARE, atomic COMMIT application and a
topology hold. Keep its two-leg structure. The audit exposes additional ways an
incomplete implementation could still pass an acknowledgment-only test:

- `partition-service-transaction-base.js` returns `LOCAL_STAGING` for PREPARE,
  commits local SQLite before proposing the marker, and does not await actual
  committed-entry application. Marker errors can be logged after local success.
- `executeTransactionWrite` stages operations locally, but the examined
  `TRANSACTION_COMMIT` branch of `partition-service-entry-apply-base.js` records
  the outcome without executing `command.operations`. This is a source-confirmed
  replication defect; a real three-replica reproduction remains required.
- `resolveParticipantCommitMiss` treats `NO_TRANSACTION` as COMMITTED in 2PC
  without reading a durable outcome. A direct execution of the exported method
  on main `ef3c7b1911b72b55da446b31cf914afec42e82af` returned COMMITTED with zero
  outcome reads when the supplied authority would have answered UNKNOWN. The
  same behavior was source-checked on PR115. Missing state cannot prove success.
- A COMMITTING timeout can enter rollback, and other commit failures can become
  FAILED and leave the recovery sweep. PR115's `commitPointReached` diagnostic
  does not enforce an immutable durable decision.

Source: [participant staging and decisions](../../src/partition/partition-service-transaction-base.js),
[transaction write staging](../../src/partition/partition-service-write-metrics-base.js),
[committed-entry apply](../../src/partition/partition-service-entry-apply-base.js),
[coordinator protocol](../../src/query/distributed/distributed-transaction-protocol.js),
and [coordinator recovery](../../src/query/distributed/distributed-transaction-recovery.js).

Leg A must cover one-phase transactions as well as 2PC:

1. End speculative staging by rollback/discard or an equivalent isolated
   mechanism before proposing durable work. Do not expose local committed data
   before consensus and then apply it a second time on the leader.
2. Replicate exact transaction identity/epoch, participant identity, operation
   digest and deterministic operations. Retain the conflict/lock evidence needed
   to prevent another write invalidating PREPARE after staging ends.
3. Acknowledge PREPARE only after the participant group's committed application.
   Replicas reconstruct the same PREPARED state when they reach that committed
   prefix, including after leadership change and restart. An unavailable
   non-quorum replica does not add an all-replicas acknowledgment requirement.
4. Apply prepared operations, immutable terminal outcome and applied boundary
   atomically through the existing committed-entry owner. Duplicates are
   idempotent; conflicting content and outcome reversal are refused.
5. Persist one monotonic coordinator decision before participant COMMIT fanout. Once COMMIT is
   decided, timeout, lost response or cancellation can delay completion but may
   not authorize rollback. A failed decision-write response must be resolved
   against durable authority before choosing an incompatible decision.
6. Resolve missing/uncertain participant state through exact durable outcomes.
   Keep recovery obligations after the original request deadline; FAILED or a
   missing process-local session cannot strand them.
7. Reenter the decision/recovery owner on prepared-state expiry. Neither a local
   sweep nor a role check may discard durable PREPARED to release a hold.
8. Preserve the existing CDC ownership and specify recoverable delivery and
   deduplication across a crash after data commit. Merely invoking CDC after
   COMMIT does not prove delivery survives that crash.

Leg B must order admission against cutover through the existing partition and
split/merge owners. Fence new participant admission, account for/drain already
admitted BEGIN/PREPARE work, and keep frozen participant terminal traffic
routable until its exact obligation is terminal. Reconstruct the fence from
authoritative topology/transaction state after restart. A volatile serving flag
or a count read followed by a separate cutover is insufficient. Do not remap
unresolved participants to children or a merge target.

The local removal admission/drain mechanism is a useful existing precedent, not
automatically the durable split/merge solution. Use one agreed cross-owner seam;
do not add a second transaction protocol to topology management.

Required falsifiers extend PR100's existing matrix: leader loss after PREPARE;
each coordinator decision-write/fanout boundary; missing state and UNKNOWN;
one participant committed before another times out; one-phase replay; duplicate
and conflicting decisions; original-request timeout followed by recovery;
BEGIN/PREPARE racing after the last EMPTY observation; fence-owner restart;
two merge sources with only one terminal; and CDC recovery. Pair every hold with
a positive case where transaction completion allows cutover. Run real three-replica witnesses
and exact composed transaction/split/merge suites before claiming closure.

## RS1, MG1, SN1 and RS2: durable and complete recovery

### Required sync is already being repaired

Main's ordinary store transaction did not itself establish the required stable
Ready boundary. PR115 adds `commitDurably`, `readyCommitDurability` and conservative
required-sync handling in the [durable store](../../src/raft/raft-rs-durable-store.js).
Verify that correction on the actual composed candidate; do not reimplement it.
The [runtime owner](../../src/raft/raft-rs-runtime-owner.js) must send dependent
messages only after required stable state is persisted.

Distinguish durable term/vote/log state, atomic application/applied-index state,
and replay of committed-but-unapplied work. FULL for every SQLite transaction is
not the goal. Include persistence/sync failure, dependent-send ordering, restart,
and later checkpoint/truncation interaction. State storage assumptions: a
process-kill test is not a power-loss/storage-controller certification.

### Complete the existing FreshMG operation

The published takeover contains recovery/recording foundations; automatic
discovery/reentry and current CREATE are still incomplete at the audit anchor.
The [existing Quest](../../solve/quests/message-group-fresh-identity-membership/quest.json)
already owns the right completion bar. Continue its ordinary owner chain:
discovery, recovery, committed learner, admitted CREATE, real transfer/replay,
promotion, leadership handoff, committed source absence, exact-generation
cleanup and independently owned reservation settlement.

Preserve the safety-first distinction between recording an exact historical fact
and authorizing a new effect. Lease expiry, timeout, pruning or a new term is not
proof of predecessor noncommitment. Successor issuance requires definitive
fencing and noncommitment ordered against delayed predecessor execution. After
authorized promotion, recover forward; do not delete a replacement while source
retirement can progress. Ordinary settlement, membership debt, cleanup and
reservation obligations remain distinct.

Closure includes the already sealed two serial replacements on distinct off-seed
storage, restart, seed-storage loss, quorum/election, and fresh authoritative
SQL, CDC and routing/cache recovery. Component counts and safety refusals cannot
replace that public operation. Do not weaken fault domains or sealed receipts.

### A SQL-partition snapshot is a separate payload contract

The [partition cadence](../../src/partition/partition-snapshot-cadence.js) still
returns `COMMITTED_LOG_UNSUPPORTED` on the active backend. The pending
`raft_rs_replica_image` in the [checkpoint owner](../../src/raft/snapshot-checkpoint-store.js)
is a FreshMG foundation: it retains consensus/peer identity, scrubs application
tables and returns a zero HLC witness. No inspected production caller supplies
its `raftRsGroupId`. It is not a SQL-partition backup or a switch to turn on the
general partition cadence.

Before general partition installation/truncation, define and prove one image
boundary covering rows/schema, prepared operations and conflict state, terminal
and idempotency outcomes, HLC, applied index/term/configuration, exact group/peer
identity and every retained-log consumer, including split/merge and CDC recovery.
An applied prefix may lag the commit index if the committed suffix is retained
and replayed correctly. Equal index/term alone does not identify the same group.
Check wrong-group and stale/partial image rejection before enabling compaction.

Distinguish intact voter restart, fresh learner installation and known
destructive loss. Use the existing native snapshot/admission and lifecycle
boundaries, preserve the receiver's valid term/vote and exact physical
generation, and never copy sender-local voting or lifecycle authority into the
receiver. Revalidate current installation authority at the actual file/state
replacement boundary and retain its crash-recovery record.

Use the current snapshot/install owners and the preserved cutover catch-up work;
do not reopen the superseded snapshot-transfer epic. Keeping truncation refused,
reporting growth and applying bounded pressure is a safe intermediate state, not
a claim of bounded steady-state recovery. Never erase PREPARED to unblock it.

### Bound diagnostic retention independently

The durable store's `journal` retains write observations without a production
clearer in the inspected paths. A bounded buffer or explicit test observer is a
small correction. Bound retained bytes/details as well as count where needed,
retain useful error/current-state diagnostics, and prove observation cannot
change persistence or acknowledgments. No new durable diagnostic ledger.

## KY1, RT1 and RT2: correctness and resource boundaries

The [key comparator](../../src/partition/split-key-comparator.js) mixes numeric
coercion, locale ordering and raw split comparison on main; persisted boundaries
are TEXT. The initial bounded checks showed inconsistent equivalence/order for
mixed numeric/text keys and different string order between routing and splitting.
Keep A1's canonical comparator and A2's representation work distinct. Exact
integer, parser/bind, storage, schema and migration decisions belong to A2.

At the PR74 anchor, both A1-v12 and A1-v13 reduce to sealed OPEN, while epic/task
pointers disagree. The query owner must reconcile pointers and append the
appropriate successor decision; this report does not mark either terminal.
The review-only A1 PR is not an integration candidate. Keep compatibility
approval fenced on the exact accepted cutover composition.

The [WASI runtime](../../src/runtime/wasi-component-cell-runtime.js) can health-ping
the same worker that is executing a legitimate blocking host call and stop it
after a one-second timeout. A synthetic worker using the production runtime
completed a roughly 2.2-second call without concurrent health and was stopped
at roughly one second with health; its invocation budget was five seconds.
That run used main `ef3c7b1911b72b55da446b31cf914afec42e82af`; the relevant
behavior was source-checked as unchanged on PR115. That is bounded mechanism
evidence, not a complete WASI/public-path reproduction.
The fix must respect busy execution and maintain real deadline/hang detection.
Required controls: supported public-path busy success, concurrent callers,
idle-dead worker, genuinely hung/over-budget invocation and subsequent recovery.
Do not merely increase all timeouts or disable health checks.

Host memory needs measurement before declaring an outage or exploit. The worker
has host-side effect accumulation and cloning outside WASM linear memory; the
parent checks some output sizes only after receipt, and call buffers contribute
additional allocation. Audit pre-retention limits and aggregate admission across
Cells/nodes under the [pilot owner](../../solve/epics/pilot-readiness-and-public-proof.md).
Prove useful progress under pressure, bounded retained work and cancellation
cleanup. Existing transport backpressure is not evidence that all host memory is
bounded, nor is this finding proof that all backpressure is absent.

## WF1-WF6 and DOC1: proof that answers the actual question

The active [Solver store](../../scripts/solve/store.js) judges review freshness
by log ordering. [Commands](../../scripts/solve/commands.js) record verifier and
verdict without a checked content subject; the generic
[test-receipt probe](../../scripts/solve/probes.js) checks IDs and success fields
without verifying the candidate identity. A temporary Git fixture using main
`ef3c7b1911b72b55da446b31cf914afec42e82af` retained an apparently current approval
and passing receipt after a source change. No retained acceptance receipt for
that temporary fixture is part of this change; reproduce and archive it under
WF1 before claiming closure. Matching behavior was source-checked on PR115.
This is a review/probe gap, not evidence that every landing/publisher gate is bypassed.
The scenario harness already has stronger archived evidence and same-SHA checks;
retain them.

Use the open [apparatus epic](../../solve/epics/apparatus-release-consolidation.md).
Its no-new-scripts/workflows rule still holds. Extend existing owners, tests and
receipt machinery. Do not restore the retired Solver. The old
[content-addressed page](solver-content-addressed-fast-path.md) is historical
design, not current v2 enforcement; its status is corrected with this record.

Preserve three distinct identities: candidate plus relevant proof inputs;
individual measurement/environment/scenario; and integrated/published commit.
Equal source does not make separate physical runs interchangeable. Relevant
checker, fixture, lockfile or integration-base changes invalidate evidence.
Precisely declared bookkeeping exclusions must not hide behavior or proof inputs.

The binding repair must reject source changes without a new attempt note,
foreign-candidate receipts, changed witnesses/dependencies, omitted new files,
deletions/mode changes, relevant base changes and candidate mutation during proof.
An unchanged-source rerun remains a separate measurement. Independently inspect
and execute these adversaries; another booleans-only receipt cannot bootstrap
the missing trust boundary. Until repair, the reviewer must independently compare
the actual candidate/input manifest and exact integration SHA in the existing
evidence packet. This is a manual review duty, not claimed automated enforcement.

Behavioral witnesses run as attempts/harnesses. Under R27 a completion probe is
read-only and validates retained evidence; it must not start tests or clusters.
A string-inclusion checker over copied candidate files can establish shape but
cannot prove routing, durability or failure behavior. Reuse the existing runners
and category-complete verification templates. Newly discovered falsifiers within
a sealed promise extend evidence; changing the promise requires supersession.
No arbitrary cap on review rounds may force acceptance.

The [test runner](../../scripts/run-test-files.js) explicitly retains/reports
initial failures but can return success after limited standalone retries.
Preserve diagnostic retries and both contexts. Introduce structured clean-pass,
pass-after-retry, failure and incomplete outcomes prospectively. An unexplained
correctness failure must not become release-clean solely because a rerun passed.
Do not infer an infrastructure defect from a timeout message. The solved
`land-retry-parity` contract remains historical; the new policy needs a successor.

PR CI checks a head; the [publisher](../../scripts/publish-head.js) proves a
particular pushed tree and manages separate corpus work. Consolidate route-
dependent status through those existing owners. Record the actual integrated
candidate, selection/completion status and retained full-corpus obligation.
Cancellation, replacement by a newer head and missing evidence are not passes.
This need not add another full corpus to every small PR. Inspected GitHub
settings did not establish required review/status enforcement; do not claim it
from a workflow filename or a ruleset's name.

Moving future nightly trend writes off main remains a design item. Preserve
historical rows and failed runs, stable identities/digests, consumers and durable
retention before switching. `formation-health-verdicts` is solved and explicitly
specified the present storage path; record a successor policy rather than
silently rewriting its acceptance or stopping the collection.

Current capability JSON/generated prose still overstate the general partition
snapshot path, and their checker can pass from expected strings/document tokens.
This branch qualifies the authored operations guide; it does not claim to repair
the canonical capability authority. DOC1 must update the JSON, producer/checker,
generated page and architecture together, with evidence tied to the selected
runtime. Pending work is labelled pending until the relevant integrated proof.

## CX1-CX3, SC1, OP1-OP2 and AR1: what to simplify and what to preserve

Reduce mutable decision authority and clarify boundary transitions when touching
complex owners. Passing the entire mutable owner as an explicit argument is not
by itself a simplification. Keep existing explicit-context/code-style guidance;
avoid a repository-wide class/mixin rewrite or file-count target.

Do not make file-size gates advisory now. Keep current thresholds and one-way
ratchets. The existing `ratchet-realignment` slot may evaluate a measured bounded
allowance or replacement that improves cohesion, with an explicit policy change
and proof. This report supplies no skip flag or baseline increase.

Separate malformed inputs, coercion/accessors/prototypes and supported same-
process trust from arbitrary hostile host-code execution. A1-v13 expressly
promises post-load intrinsic independence: a narrower future threat model does
not remove that sealed obligation. Use an explicit successor if changing it.

Preserve approved 0.3 features while sequencing their correctness dependencies.
No automatic deletion of global/compound indexes, locking reads or live-query
work is adopted. Any product-scope change must reconcile the canonical
[feature map](agpl-feature-map.md), [roadmap policy](roadmap-policy.md) and
[edition matrix](../../edition-matrix.md). Unresolved roadmap-row/pointer drift
belongs to the query owner, not a competing release program in this branch.

Planned pilot Q12 already owns an executable supported upgrade/recovery envelope;
planned Q11 owns public-path scale/failure evidence. Record version/topology/storage
assumptions and test the supported route before making a readiness/RPO/RTO claim.
Community documentation may explain rebuild/reload limits. Commercial
backup/restore/PITR implementation remains in its existing external home; this
review does not move it into AGPL or add it to 0.3.

Planned pilot Q7 already places authenticated/encrypted node transport in Community
core. Existing trusted-network/loopback limits are documented boundaries, not
newly discovered public exploits. Track admin exposure policy alongside node
trust, without silently enabling external listeners or expanding enterprise
SSO/RBAC/tenancy scope.

Finally, keep [authority and recovery](../../architecture/contracts/authority-and-recovery.md)
as the semantic owner. A historical receipt proves a particular fact; it cannot
grant a new physical action. Pair every fail-closed path with an eventual-progress
case once authority is available. Slow correct recovery is acceptable; a system
that remains safely stuck has not met its recovery contract.

## Activation and closure

The three existing epics carry links to these IDs and staged work slots. The
current FreshMG Quest receives a finding, not a changed seal or a success entry.
New multi-attempt or boundary-changing work gets a bounded Quest only after its
owner has the actual candidate, scoped witness and meaningful red measurement.
Do not create placeholder green/UNKNOWN probes or a new epic for each row.

At each next work selection, the owner checks the linked IDs, records a chosen
bounded unit and leaves the rest staged. Closure records the implementation SHA,
proof-input identity, retained evidence, independent verdict and any remaining
integration gate. Supersede explicitly when a sealed claim changes. This dated
review remains evidence of the decision; subsequent execution status belongs
in the existing epic/Quest records.
