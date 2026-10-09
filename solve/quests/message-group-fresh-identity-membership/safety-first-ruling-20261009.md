---
audience: development
documentClass: current
---

# Safety-first recovery ruling - 2026-10-09

Existing Quest: message-group-fresh-identity-membership.
Existing epic: raft-rs-full-cutover.
Source baseline: d3d947f2d98ca9ea03f1cae91403ff551ee4d18d (PR114).
Status: operator-authorized policy judgment; implementation and activation proof
remain open. This is not independent verification or a terminal receipt.

## Authority, goal and scope

The operator's latest instruction prioritizes stability and absence of corruption,
accepts slower edge-case recovery, requires efficiency, and delegates arrangement
of rules within those limits. The cloud integration owner uses that discretion
for the specific contract decision below. The operator did not dictate its exact
mechanism. No permission is inferred to interfere with other worktrees, deploy an
uncertified product, rewrite evidence, merge main, or publish a release.

Engineering objective: no acknowledged-data loss, contradictory committed state,
unauthorized irreversible effects, or silently abandoned admitted obligations
within the explicitly tested fault model. When dependencies or a quorum do not
allow safe progress, bounded waiting/backpressure or a typed unknown/unavailable
result is correct; inventing success or guessing noncommitment is not. State the
fault assumptions and recovery conditions. Do not promise availability through
all partitions or preservation after loss of every durable copy.

Safety is necessary but not enough: under restored authority, storage, quorum
and fair scheduling, admitted work must make progress through its existing owner.
Permanent corruption or inconsistent evidence must be surfaced with an owned
repair path, not hidden behind endless transient retries.

## Explicit, narrow supersession

This ruling supersedes only the demand that expiry or a canonical boot change,
by itself, must prevent an already-submitted update from recording the exact
outcome of an already-issued and actually committed learner action when the
operation-row generation and conditional basis have not changed.

Affected prior requirement: PR113 review 4231684822 as applied to historical
learner-outcome recording; the commit-authority interpretations in
architecture/contracts/message-group-learner-outcome-recording.md and
architecture/contracts/message-group-registered-learner-read.md; and the two
required expiry/boot refusal assertions in the retained local package
lagrange-invocation-authority-prerequisites-20261009.zip.

The package's 2-pass/2-fail authority result remains exactly that result under
its old requirement. Its sources, assertions, raw outcomes, and archive are not
deleted, edited, or relabeled green. Replacement tests must identify this ruling
and prove the new obligations before any driver gate advances.

The FreshMG sealed quest statement, eight required receipts, J1 forward-recovery
choice, and physical two-replacement/seed-loss acceptance remain unchanged. This
is not a blanket waiver of commit-time authority for mutations, permit issuance,
CREATE, promotion, source removal, cleanup, or membership-lane release.

## Historical recording is not future execution permission

A learner-outcome update may linearize after its invoking holder's lease expires,
node boot changes, or local invocation retires, but ONLY when all of the following
remain enforced:

1. The original native action has genuine committed/applied evidence from the
   existing native owner, bound to the same group, operation, transition, permit
   sequence, permanent target identity, and original entry index and term.
   Proposed, role-only, missing, corrupt, or mismatched evidence grants nothing.
2. The write is the existing idempotent, exact operation-row CAS. It matches the
   immutable identity, source generation, original permit, prior phase/stamps,
   holder generation/claim, and ordinary settlement fields. A committed competing
   claim, terminal transition, or incompatible phase change must defeat it.
3. Its write set remains only the existing learner phase, the original permit's
   committed state/proposal index, and historical learner stamp. It neither
   refreshes execution fences nor changes ordinary workflow history, ownership,
   reservation/accounting, outstanding debt, or physical/lifecycle permission.
4. The membership witness is coherent with the historical observation. A real
   joint witness defers recording; historical learner evidence is not a promise
   that the target is still a learner at a later instant.
5. Its return value and any CDC observation can wake reconciliation, but cannot
   directly dispatch a physical operation, select promotion/rollback, release
   obligations, or act as current authority. An obsolete invocation starts no
   additional work. Uncertain submission stays UNKNOWN until exact authoritative
   readback or replay resolves it; cancellation never implies noncommitment.

Admission at invocation and before a NEW submission/retry still uses the current
holder, canonical boot and local owner lifetime. The unpushed invocation-fence
corrections remain required to prevent retired callbacks, handlers or workflow
owners from starting new work. This ruling does not approve that package's source
without its normal-dependency tests and independent review.

The existing operation-row CAS orders a receipt against a competing row update.
Time or a node-row change is not falsely claimed to be atomically ordered with a
write to another Raft group. Do not add nondeterministic wall-clock/cache reads
inside replicated application, or a cross-group transaction solely to suppress
an otherwise valid historical receipt.

## Current effects keep their own authority

Every consumer must treat the learner stamp and phase as historical facts and
scheduling prerequisites, not as execution permission. Audit direct and indirect
readers, including publication/cache reactions, before activating the driver.
An unproven consumer keeps activation blocked.

CREATE must use the existing leader-produced join descriptor, exact target/group
and physical generation, supported install/open path, terminal-state ordering,
and sole-worker CREATE admission. A saved receipt or old descriptor cannot by
itself authorize a target removed by later membership progress. Its actual effect
boundary must demonstrate how incompatible progress and stale requests are
ordered; another earlier metadata read is not an ordering proof.

Promotion still needs the existing native owner's current leader/configuration
and real catch-up proof in its proposal turn. Source retirement, source-own
applied absence, quorum absence, exact-generation cleanup, and reservation release
keep their existing separate authorities. No historical phase substitutes for
any of them. After promotion authorization, J1 forward recovery remains binding.

Holder takeover and an unknown action outcome are not successor-action grants.
A successor action needs both definitive predecessor fencing and authoritative
noncommitment, ordered against delayed predecessor execution. If that outcome
cannot be established, preserve the obligation and reconcile; never refresh an
old permit in place or infer absence from a timeout or missing retained log.

## Replacement proof obligations

Use real owners and normal locked dependencies; isolate each evidence scope.
Required schedules for this revised recording boundary:

| Schedule | Required observation |
| --- | --- |
| Unopposed exact native receipt | Only the declared receipt fields commit; no new proposal or physical effect |
| Lease/boot changes after submission, operation row unchanged | A late receipt is permitted; its exactness, unchanged debt/history, caller uncertainty and zero subsequent obsolete-invocation effects are checked |
| Successor claim or incompatible terminal/phase update wins first | Old CAS loses without overwriting the winner; eligible successor can recover |
| Receipt wins before successor claim | Successor rereads/retries safely and does not repropose or rewrite the original action |
| Lost SQL reply, SIGKILL, reconstructed owner | Recover the exact result with no duplicate irreversible effect; retain debt |
| Wrong, corrupted, unapplied or snapshot-unproven evidence | No recording or permission; transient and permanent classifications stay distinct |
| ADD recorded, target later removed or generation replaced | Old receipt/descriptor cannot create, promote, stop, or delete the incompatible target/source |
| Retired callback, socket, handler or owner; held post-delivery/retry work | No new submission or effect after invalidation; in-flight outcomes remain honest |

Mutation controls must fail the named assertion, not merely any test. Include
wrong-action binding, claim-CAS loss, an extra effect/write outside the allowed
write set, and attempts to use historical evidence as current CREATE/cleanup
permission. Keep positive recovery controls so permanent refusal cannot pass as
safe completion. Fault-case waits and performance measurements are separate.

## Finite continuation in the existing Quest

First preserve and canonically verify the invocation-fence package on an isolated
branch after checking live ancestry. Keep its old-policy failed evidence. Adapt
its two obsolete acceptance assertions explicitly to the table above; do not
remove the schedules or weaken unrelated checks. Reconcile the specific recording
and registered-read contract wording with this ruling in the same measured source
increment. No duplicate epic, state store or verification framework is required.

Then connect the existing OperationWorkflowOwner's ordinary reentry and discovery
to the registered read/recorder. Reconstruct the original action from durable
state, including after a committed permit, and avoid recursively acquiring the
same retained lane. Current CREATE may activate only after its real owner-path
negative and positive proofs above. Do not use fixture-driven SENDING or hand-edited
operation rows as proof that the production driver works.

Proceed through promotion, handoff, removal and cleanup using the same owner chain.
Use the established Actions/GCP or locked-lab harness for physical runs; hosted
component tests remain component evidence. Finish with the existing two serial
off-seed replacements, restart, seed-storage loss and new SQL/CDC/routing recovery.
Resolve inherited corpus failures by cause, not by counting old failures as exempt.

## Performance and process discipline

Keep the healthy path lean: reuse existing observations where the contract allows,
avoid extra durable round trips that do not buy safety, batch only with unchanged
ordering/durability, and apply bounded backpressure rather than spin or drop work.
Recovery may be slower, but queues, retry memory and retained resources stay bounded.

A file duration, helper count, review cadence or particular mechanism is not itself
a correctness invariant. The operator delegates justified adjustments to their
owners. Record old/new criteria, measurements and semantic coverage. Never split
or rename a test merely to hide cost, remove a fault case to get green, weaken sync
or quorum, or infer a source guarantee from a faster run. No numerical budget or
classification is changed by this documentation commit.

Review source changes independently under the existing process; close finite
findings and move to a complete operation rather than collecting indefinitely
more green primitives. Keep safety, recovery-progress, and performance verdicts
separate, and bind each to measured bytes. An unresolved release requirement does
not make a successful component test a full-release result, or vice versa.

## Present status

This record is a design judgment, not evidence that the current driver satisfies
it. The source audit so far is bounded and does not certify every consumer. No
runtime/test change, main merge, safety approval or driver/CREATE activation is
performed by the ruling. The original full-lab failure, numerical timing debt,
physical acceptance, independent review and exact-main/A1-v13 gates remain open.
