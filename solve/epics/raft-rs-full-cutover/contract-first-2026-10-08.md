# Contract-first cutover continuation - 2026-10-08

Parent epic: raft-rs-full-cutover. Status: active planning and read-only first
attempt; no cutover certification. This extends the existing epic rather than
creating a competing architecture program.

## Operator decision and execution authority

The user approved the contract-first recommendation and instructed the cloud
agent to persist its guiding principles, adapt/create epics and quests, take
over and start, using GitHub Actions/GCP for distributed runs. This explicitly
supersedes the earlier local-agent-only assignment for this bounded cutover
work. It does not authorize rewriting preserved refs, weakening sealed
acceptance, merging uncertified work, publishing a release, or interference
with local worktrees/lab machines.

Integration owner: this cloud continuation. Work branch:
`integrate/rs-raft-contract-first-20261008`.
Immutable inherited product: `82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af` at
`handoff/rs-raft-salvage-20261008-integrated-composition`.
PR #73 and every salvage ref remain unchanged. PR #74 is the separate 0.3
Queryable Core branch. A1-v13 compatibility approval remains blocked until
an exact final integrated cutover SHA is independently certified.

Guiding authority:
[authority-and-recovery](../../../architecture/contracts/authority-and-recovery.md).

## Work order and Quest ownership

| Order | Quest / existing work | State | Completion and next gate |
| --- | --- | --- | --- |
| C0 | cutover-transition-authority-review | First bounded read-only Quest | Source-bound authority/transition census for FreshMG, workflow progression and snapshot recovery; deterministic discriminators; independent contract review |
| C1 | Existing message-group-fresh-identity-membership | Sealed, incomplete; resume only after C0 resolves its protocol questions | Complete operation admission, committed learner, CREATE, transfer, promotion, handoff, source removal, exact cleanup and restart; retain all sealed receipts |
| C2 | cutover-workflow-transition-authority (planned child) | Not declared or sealed until C0 identifies a reachable defect | Narrow repair at the real durable commit boundary; failed/conflicting/unknown writes and restart cannot upgrade permission or lose obligations; independently prove source-revert red |
| C3 | Existing snapshot/install owners and preserved raft-rs-partition-snapshot-catchup-ownership draft | Classify before adoption | Distinguish intact local reopen, known wipe, receiver-native accepted installation and unavailable evidence; consistent application/Ready durability; no invented second persistence owner |
| C4 | Existing zero-liferaft-active-runtime and full-cutover certification | Blocked on accepted composition | Exact-byte static/ordinary gates, physical multi-host restart and off-seed seed-storage-loss proof, terminal full-cutover oracle |
| C5 | Existing core-architecture-convergence Q0/Q1 onward | Broad behavior changes remain gated | Remeasure after cutover; consolidate only demonstrated duplicate authority |

C1-C3 are dependency-driven, not permission to open three simultaneous
writers. C0 states which correction is a prerequisite for which proof. Only
C0 is newly declared now. Future child records are created against a measured
red discriminator; planned names do not grant source scope. If existing
acceptance must change, append the judgment and supersede explicitly; never
edit an existing sealed statement to fit an implementation.

## C0 - bounded contract and first-divergence census

Allowed scope: steering/architecture detail, this parent plan, one new Quest,
source-bound read-only evidence, deterministic boundary witnesses and Actions
execution. No production changes, generic framework, new runtime root, new
state store, lease or membership abstraction.

For each affected transition produce:
`trigger -> authoritative facts -> permitted action -> actual durable commit
point -> restart/lost-answer behavior -> remaining obligation and release owner`.
Use exact source paths and blob/content hashes, not branch names alone.

### Fresh message-group contract

Read the existing Quest and permit WIP rejection history (`cd366cc0`).
Classify the subjects of every permit and receipt as old source or fresh
target. Review success and failure separately: no admission, unknown proposal
outcome, committed learner, promoted target, and removed source. A target-based
REMOVE/release cannot stand for successful source retirement. After source
removal, failure handling must preserve the replacement/quorum rather than
blindly remove the target.

Preserve normal terminal settlement independently from serialized membership
obligations, storage reservations and physical cleanup. Preserve source-own
applied absence versus leader/quorum absence as distinct sealed facts.
Resolve unsupported states explicitly. The C0 record is a proposed owner
interpretation until independently reviewed; it does not approve WIP permits.

### Workflow authority and restart

Trace ReplicaOperationRepository, OperationWorkflowOwner,
DurableWorkflowCoordinator, steps_history, operation_progress and the actual
persistence callbacks. Identify the database commit, local mirrors, transient
progress and downstream idempotency. Do not call a callback durable merely
because its name says persist.

Initial source questions, not presumed production failures:
- persistOperationWorkflowTransitionToDurableRow checks length but does not
  itself compare history prefix or write SQL; locate where those obligations
  actually live and whether they are fully enforced.
- The default operation_progress store is a Map plus event array. Trace its
  reconstruction and authority ceiling instead of adding persistence by default.
- The adapter proceeds after persistOperationProgress without an explicit
  applied check. Use the real store to distinguish a reachable production
  conflict from unsupported direct concurrent use already excluded by owner
  serialization. A boundary witness alone cannot certify a production race.

Required discriminators cover positive progression, refused/conflicting
writes, unknown durable outcome, lost response and restart between mirror and
commit. Discarding volatile state must not widen permissions, resurrect
terminal work, lose obligations or repeat a non-idempotent effect. Scheduling
order and diagnostic counters may differ.

### Snapshot and local restart

Read the preserved catch-up draft at `9554f689` before adopting it. Confirm its
compatibility with the accepted checkpoint/install-generation work already
in the composition. Identify native Ready acceptance, application-image
binding, local term/vote/identity preservation and exact durable completion.
Known destructive loss is not an ordinary lagging member. Intact voters must
cold-restart without requiring a preexisting live leader; temporary inability
to read an authority is not evidence of absence.

### C0 stop / no-go conditions

No source attempt while a load-bearing source/target subject or durable commit
point is UNKNOWN. Independent review is mandatory before treating the contract
as vetted. A direct-boundary result is labeled with that ceiling. Missing
capabilities, prerequisites or test engagement stay visible, never green.

## Candidate disposition, not wholesale merging

| Preserved input | Initial disposition |
| --- | --- |
| 82b54ef9 integrated composition | Immutable starting product; not certified |
| cd366cc0 permit foundation | Rejected/unresolved; source/target and CAS review required |
| c7e701e8 FreshMG old-base WIP | Compare only unique content; do not replay old seal history |
| b1a0b91c failed-create cleanup | Much overlaps integrated code; identify only missing behavior |
| 5f1ad023 router lifetime | Separate bounded transport repair candidate; no blanket adoption |
| 80147cba mutation capability boundary | Red owner-escape evidence; scope genuine mutation boundary vs trusted-host hardening before adoption |
| 9554f689 and snapshot revision trees | Design/witness inputs, not accepted production code |
| be1a5dbd alternate integration | Reconcile by content and provenance, not commit ancestry alone |

## Execution and proof ladder

1. Read current steering, owners, coupled-pair contracts and complete rejection
   history. Record the bounded authority table.
2. Run deterministic real-owner/real-store boundary witnesses. Preserve
   positive controls, raw output, exit status, source hashes and limits.
3. Seal only the first measured-red child through the canonical Solver.
4. Repair the smallest necessary owner interaction; independent category-
   complete review precedes source landing. No self-issued verifier identity.
5. Reconcile accepted bytes into one integration candidate. Run focused,
   applicable static and ordinary/change proofs on those exact bytes.
6. Use GitHub Actions with the existing GCP runner and cloud harness for
   physical distributed runs. Do not use this chat container or local lab
   machines as a substitute for multi-host acceptance.
7. Run the existing two-serial-replacement, distinct-off-seed seed-storage-loss
   witness only when its chain can engage. Prove quorum, election, new
   authoritative SQL commit/read, CDC, cache and routing recovery after restart.
8. Preserve outer failures, classify the first violated owner transition, and
   do not rerun unchanged to fish for engagement. No timeout/baseline weakening.
9. Final handoff binds pushed SHA, clean tree, composition provenance,
   independent reviews, full evidence matrix and frozen invariants.

## GitHub Actions / GCP constraints

Reuse existing keyless runner startup from full-gate.yml and the existing
GCP harness; cloud project `something-2e584`, runner `lagrange-ci-runner`,
zone `europe-north1-a`. Scoped distributed provisioning uses the repository's
cloud action-authority check for that exact project. Each run names candidate
SHA, host/node/storage-root map and isolated run identity. Existing pools and
unrelated stacks are never deleted. Concurrency is bounded, teardown uses the
harness owner and runs on failure as well, and full logs are archived before
cleanup. A GCP runner executing a unit test is not a distributed proof.

Expensive distributed certification is gated on deterministic readiness; no
cluster is started by a Solver probe. The initial Action may collect source
and execute read-only deterministic evidence only. No new cloud project,
static service-account key or provider-specific application API is introduced.

## Non-goals and preserved release promises

No database-engine replacement, external control-plane database, generalized
workflow framework, collapsed generations/leases, or reorganization to hit a
file/class count. No automatic admission of every salvaged branch. No removal
of existing hardened boundaries or sealed tests without explicit judgment.
Preserve agreed 0.3 SQL/transaction/split-merge semantics, including prepared-
transaction correctness. The separate 0.3 path advances only where its actual
dependencies allow; this plan does not trade away product correctness.
