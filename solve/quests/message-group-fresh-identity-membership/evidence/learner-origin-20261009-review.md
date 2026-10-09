# Native committed learner origin — continuation review, 2026-10-09

Status: bounded implementation measured and pushed; author review only.
No independent approval, Solver landing, main merge or full cutover claim.

Base contract: f258bade6dedde2b10b6c73d035f2b942b493b5e.
Source/test/metadata commit: 6255634c71fa6c6c116e8e70252ef11f927f564f.
Red test commit: 34a04e17bdfdfc732b80862d0562f885e31d4fc8.
Evidence-bearing pushed head: 1e4b3a6e07acc68705ec0c3393efc70aaa3bb7de.
The commit containing this review changes no measured runtime or tests.

## Reconciliation, rather than replaying old local packages

The corrected generic retained-log decoder/storage reader is already preserved
on PR110 at 44e968be4e2f2db03b37d8a26470fd0a3b256fee, including canonical
normal-driver evidence and the subsequent diagnostic process-ownership repair.
It is not overwritten here, automatically merged, or installed as a competing
full-log scan in the production recovery loop. PR109's source is untouched.

This branch continues the previously preserved failed native-origin attempt
37892536228 through the existing native/application/peer-registry/checkpoint
owners. It supplies the missing retained origin, rather than creating another
workflow or receipt service. Original failed bytes remain on their handoff ref
and in the new evidence archive.

## What the source now does

The existing permanent peer-identity row retains one nullable
`learner_admission` value. A managed ADD_LEARNER records the canonical original
group, operation, transition, permit sequence, stage and permanent target
identity, together with the actual committed entry index and term. Recording
happens inside the SAME application transaction as ConfState and the durable
applied boundary. A conflicting origin cannot silently replace an existing
one. Ordinary prior mappings acquire no invented historical origin.

The existing READ_COMMITTED_MEMBERSHIP operation has a bounded learner-action
purpose. The actual runtime queues that read with its group work, observes the
applied/committed frontier, and returns frozen historical evidence or a typed
refusal/unresolved result. It does not accept a caller's raw database, accept
PROPOSED as committed, or infer an operation result from learner role alone.
The exact query tuple is compared with the retained tuple. The old action's
historical term remains meaningful after leader or runtime replacement.

The existing replica-image checkpoint owner retains this column while
scrubbing native Raft state and logs. Its version-2 descriptor and payload
must agree on each permanent identity and origin, and the origin must lie
within the checkpoint's applied/configuration frontier. Absent origins are
omitted from the descriptor; SQL null stays an absent database value. This
avoids prohibited JSON nulls without relaxing the canonical serializer.
Explicit descriptor null or a mismatched payload does not become compatibility.
The unreleased version change refuses version-1 replica images on this path.

A decoded-invalid origin is an explicit shared result from the context owner,
not a raw null runtime decision. The schema column name lives with its existing
constant owner. No audit baseline, threshold or accepted checkpoint shape was
silently loosened.

## What this is NOT

Historical evidence does not imply current learner role, live join eligibility,
physical CREATE permission, absence, cancellation, or successor issuance.
There is no repository learner-stamp/phase update or membership-debt driver
activation in this increment. The initial permit is not refreshed or rewritten.
J1 forward recovery after promotion authorization remains binding.

The checkpoint tests exercise real backup/scrubbing and payload/descriptor
validation. They do NOT yet compose this real native-origin history through
fresh target installation and native reopening. The neighboring transfer tests
exercise their existing paths, not a substitute proof that the new origin has
crossed the entire CREATE/install path. Exact-cut installation, process loss,
and the registered response-to-operation-recording chain remain to be proved.

## Failures addressed without weakening tests

The original attempt had five failed subtests. They included fixture
assumptions: same-file reopening was expected to change a physical lifecycle
identity; only one election survivor's clock advanced; and the rollback test
sampled a frontier before the founding no-op settled. The checkpoint failures
exposed the actual source representation issue: absent origins serialized as
null, which the canonical descriptor encoder refuses.

Attempt 37917632948 corrected those issues and passed all but the rollback
continuation. The rollback assertions themselves passed: no origin or learner
ConfState escaped, and durable applied progress stayed unchanged. Its final
recovery loop ticked native Raft without advancing the recovery owner's clock
through the required retry window. That attempt also exposed two raw-null
semantic outcomes and a free-floating schema-column literal. All are retained.

The successful attempt supplies the existing VirtualTimeSource only to that
rollback case, removes the fault, asks the real port for its recovery result,
and advances exactly the returned retryAfterMs when a retry is required.
It then proves resumed application and the original permit's byte identity.
This changes no production timing, retry policy, quorum, budget or election
parameter. Other tests retain their ordinary clock setup.

Reopening tests now assert the old database actually closed and the database
connection and port were replaced, while physical lifecycle identity remained.
A separate actual core trap verifies runtime generation changes. Election
recovery advances both surviving native clocks and accepts only the actual
surviving leader, without requiring a preferred winner.

## Exact canonical measurements

Actions run 37918656129 used Node 22 and the normal locked better-sqlite3
dependencies on GitHub-hosted Ubuntu, with the existing one-worker cap.
It was NOT a GCP or physical distributed run.

| File/group | Reported assertions | Whole-file ms | Limit ms |
| --- | ---: | ---: | ---: |
| Native learner consumer including new origin cases | 33 | 2585 | 30000 |
| Membership branch authorization | 90 | 651 | 2000 |
| Membership operation lane | 8 | 526 | 2000 |
| Workflow progress persistence | 24 | 670 | 2000 |
| Reservation file-backed restart | 39 | 623 | 2000 |
| Committed-membership read | 5 | 440 | 2000 |
| Replica-image checkpoint transfer | 64 | 488 | 2000 |

Seven files / 263 reported assertions pass their unchanged individual budgets.
The original runtime with the new tests is red; that is missing-capability
proof, not a claim that every red subtest was an independent production bug.

Two source mutations are bound to actual failing TAP subtest blocks and their
ERR_ASSERTION/message, not a passing title elsewhere in stdout:
- Removing committed-origin recording fails the exact post-apply receipt
  assertion in the initially-uncommitted-action case.
- Removing descriptor/payload origin equality fails the digest-matched but
  origin-erased payload assertion.
No cancellation or skipped test earns mutation credit. Both source mutations
were restored before publication. Exact final tracked/untracked status was
empty; normal non-force push checked both expected-old and final remote SHA.

Strict test cyclomatic/cognitive metrics, scoped source metrics, lint and
producer-generated metadata/shard checks passed. The twelve-source scope has
zero cyclomatic/cognitive violations before and after. Semantic decision,
runtime grammar and literal reports have zero new violations; this run asserts
the JSON counts, rather than trusting their command exit codes alone.
This is not the uninterrupted full-static or complete changed-path corpus gate.

## Archive integrity

Downloaded Actions artifact 11610482806:
`ff384eda35b9902c4363f7192b7459bc4538116e5bff6e9c527de56b7a8c599c`.
All 145 named member-manifest entries were independently rehashed after download.
The archived prior attempt 37917632948 matches
`25bcb1bc4c9b0ff3910ea5b2c5d6928b4c8677719b45212a1bca10ac2b690270`
and includes the original failed attempt 37892536228.

Canonical Solver asset:
`message-group-fresh-identity-membership--learner-origin-37918656129-1.zip`
SHA256: `69af953358e148082453e25e3dd0d8595434139e66f464c6f0c7c4e69f1948fe`.
Its successful upload is recorded in learner-origin-37918656129.json.
This review rehashed the distinct Actions ZIP; it does not claim a separate
download of the canonical release asset.

The overall workflow intentionally retains a RED complete-cutover verdict.
Its measurement, mutation and publication steps succeeded; that does not
resolve the independent reviews, old full-lab failure or other release gates.

## Adversarial review and immediate next gate

Preserve this existing-owner design. Do not replace exact origin with a role
sample, infer negative proof from missing origin, or promote a generic retained-
log diagnostic into another production recovery algorithm. No activation or
main integration is approved by this author review.

Independent review should cover atomic application/rollback, conflicting
origins, index/term canonicalization, queued read freshness, group/action
binding, legacy schema handling, checkpoint version/payload consistency and
proof fidelity. Particular remaining tests are corrupt retained origin,
repeated managed application, later removal followed by historical observation,
real checkpoint install/native reopen, and commit-before-operation-receipt
process loss. Broader touched-owner/metadata gate coverage remains required.

Next bounded source work: couple the retained positive origin to the existing
repository's exact conditional learner-stamp update, with current-holder,
original-action and terminal-debt checks. Pair that with real checkpoint
install/reopen and wrong-action/obsolete-descriptor controls before enabling
CREATE. Missing origin stays unresolved; successor attempts require their own
ordered fencing/noncommitment decision. Do not change the sealed sequence-1
contract merely to force retry after a leader change.

Original full lab remains FAIL (941 selected / 918 process passes / 23 failures).
The restart-duration and global-currentness findings, actual membership/CREATE
chain, snapshot catch-up, physical two-replacement off-seed/seed-loss proof,
exact-main full proof, and A1-v13 final compatibility gate remain open.
User permission for merge commits does not waive any of those gates.
