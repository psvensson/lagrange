# Snapshot receiver admission — bounded successor interaction

Input: 4981aad1ed8eef5784f531a5cccc0b76b477ae01. Review 4247979520
identified that validating a scrubbed staging file cannot validate the receiver
which the atomic rename will replace. The existing staging Quest is retained.

## Owners, consumed surfaces and transition

`src/raft/snapshot-install.js:519-605` owns CREATE validation and staging;
`:480-504` owns the authorized final swap; `:610-674` owns STAGED resume.
`raft-rs-replica-lifecycle-owner.js:348-360` owns lifecycle preparation,
with exact-incarnation native history already recorded by that owner.
`replica-create-admission-owner.js:335` owns physical-worker commit serialization.
The existing preInstallDigest and staged install-id/CREATE binding remain in use.

Introduce a narrow read-only receiver inspection on the SAME lifecycle owner.
Only a missing file, an empty native/lifecycle shell authorized by CREATE, or an
exact ACTIVE/NEVER_OPENED allocation without native rows can be replaced by this
FRESH_CREATE path. Preserve the latter incarnation in the staged imported row.
Any native row (including another group), retirement, identity conflict, legacy
NULL/UNKNOWN, established history or invalid/unreadable receiver refuses.
A nonempty WAL or rollback journal is not disposable staging and refuses;
absence/unavailability are distinct. No receiver DDL or mutation occurs.
This policy applies only to native FRESH_CREATE, not a new live snapshot/reseed
protocol. Existing general/legacy snapshot behavior remains unchanged.

One snapshot interaction helper consumes the validated descriptor and current
CREATE identity to obtain the lifecycle result. It invokes the same inspection
before staging, synchronously inside the existing CREATE commit boundary before
swap, and before resuming a STAGED marker. It also checks that staged identity,
history state and any retained receiver incarnation still agree. A final swap
contains no intervening await. The existing closed-handle/sole-worker contract
is a prerequisite; arbitrary external writers outside that contract are not
claimed to be fenced by a JavaScript check.

## Failure and replay

Owner outcomes are CORE_OK/fresh-receiver or CORE_REFUSED with named reasons.
Unreadability and pending journals refuse rather than guess empty. Initial refusal
is REJECTED without deleting receiver bytes; commit-time refusal uses existing
CREATE_GENERATION_MISMATCH; STAGED replay stays INSTALL_STATE_CONFLICT and retains
the marker. CREATE/recovery owns reconsideration, with the original claim and
budget. Cleanup/reseed may authorize a new fresh identity only through its
existing owner. No local history fact proves freshness after total file loss.

No cache or new durable record is added. Receiver observations are disposable:
every irreversible use rechecks the existing owners plus original digest.
The imported lifecycle row remains ESTABLISHED. The import audit grants only
named inspection/preparation symbols at their explicit consumers.

## Proof

Extend the existing real 3-replica learner/checkpoint/CREATE integration fixture.
Keep all original tests. Measure receiver refusal, fresh and never-opened positive
controls, actual pre-rename interruption/restart, an old unsafe marker and a
WAL-only change during awaited CREATE admission. Direct staged API tests and
existing runtime/opening/cleanup tests remain regression requirements.
Source-only revert must restore intended receiver assertions with the same tests.
Copilot comments are separate review evidence, not an approving Solver verdict.
The 10x elapsed-case tolerance does not change any semantic deadline.
