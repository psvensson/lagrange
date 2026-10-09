# Recovered learner outcome recording — 2026-10-09

Status: bounded source increment measured and published; author review only.
No independent approval, Solver landing, main merge or cutover certification.

Product base: 16bcff35bc44d2c6c6151cfb29d35fa7a4b4325a (PR111's canonical
origin-install/reopen evidence). Contract parent:
c3176777cc91c4ff8c7c7381db1c6c8368d93ae0.
New-test red: a050e4b2442bb8df46e3de0ed5e0e67c696733df.
Measured source/test/metadata: 292a2c6579542536d993eff8b876a34ec4783a80.
Evidence-bearing pushed commit: 53fcbd49bd3049242fbf5af807005574df142e9b.
This written review adds no runtime changes to those measured bytes.

## Implemented existing-owner interaction

`answerCommittedLearnerAction` returns its existing historical receipt together
with the existing WITNESS committed-membership shape from the SAME queued native
status/application observation. It is not a later second status read, a new
stamp representation or a bootstrap/CREATE grant. The exact historical origin
still survives newer native terms without refreshing the old execution permit.

`ReplicaOperationRepository.recordMessageGroupLearnerOutcome(request, read)`
uses the existing membership-authorization owner and row predicate. The host
supplies a native read capability; the method derives the group and six-field
original action from the immutable identity and issued permit. It does not
accept a payload receipt or boolean validator as that capability. Arbitrary
malicious host injection remains outside this contract; the future registered
route must supply the real capability, not turn wire input into host authority.

The recorder validates exact historical origin and the same-observation
membership witness, including original term, source voter, fresh target learner,
permanent identity and applied/configuration boundary. After asynchronous native
and boot observations it uses a fresh authoritative operation row as its CAS
basis. The current claim must match exactly and remain locally live.

ONE existing-row UPDATE changes only membership phase, permit state/proposal
index, and learner stamp. Original permit sequence and execution fences do not
change. The condition includes immutable operation/source/target/group identity,
source-generation claim, current holder, prior permit/phase/all membership
stamps, and ordinary status/workflow step/completion time.

Ordinary failure can leave an admitted membership obligation and still record
its already-committed outcome. Successful or inconsistent ordinary terminal
states do not accept this new recording transition. Membership debt remains
UNKNOWN and its lane retained; ordinary workflow, reservations, voter/removal
stamps and physical CREATE permissions are not advanced.

Unknown write answers are resolved through authoritative row readback. Missing
readback remains UNKNOWN. Exact recorded replay makes no SQL update and no
native read/proposal. A renewed holder can recover the original action without
changing its original permit. This does not yet prove cross-node holder takeover.

## Completed measurement and fault controls

Actions 37943949068, GitHub-hosted Ubuntu/Node22, normal locked better-sqlite3,
existing LAGRANGE_LANE_JOBS_CAP=1. This is not GCP/physical-cluster acceptance.

| Group | Reported assertions | Whole-file milliseconds |
| --- | ---: | --- |
| Native consumer and recording integration | 51 | 3926, limit 30000 |
| Branch authorization | 90 | 652, limit 2000 |
| Membership operation lane | 8 | 573, limit 2000 |
| Workflow persistence | 24 | 693, limit 2000 |
| Reservation restart | 39 | 647, limit 2000 |
| SQL/Raft -> CDC -> SystemTableCache | 3 | 10991, limit 30000 |
| Committed-membership reader | 5 | 443, limit 2000 |
| Existing checkpoint transfer | 64 | 480, limit 2000 |

Total: 284 reported assertions in eight canonical files; unchanged budgets.
The native integration obtains actual native evidence and uses real file-backed
operation SQL. The cache test deliberately supplies native evidence to isolate
the real SQL/Raft/CDC mutation path. These two proof surfaces are not represented
as one complete distributed end-to-end operation.

Original runtime plus new tests preserves 37 earlier reported cases and fails
13 new cases at the absent-repository-method boundary (plus their parent).
This is a missing-capability red, not thirteen existing corruption defects.

The 13 new cases cover issued/proposed without applied evidence; exact recording
and no-write replay; native and operation-database reopening before recording;
new native leader with old origin; wrong action/incoherent observation; holder
renewal during read; failed versus successful ordinary settlement; holder renewal
inside the actual CAS path; lost committed answer; unavailable readback followed
by exact recovery; failed precommit write; and historical ADD after actual REMOVE.

Three isolated source mutations run with the normal driver and all 51 integration
case identities retained. Each has one failing leaf plus its parent, with zero
cancellations/skips/todos:
- Remove original-action equality: the wrong-action case fails its explicit
  refusal assertion.
- Remove only the new writer's exact-holder SQL predicate/parameter: the delayed
  writer changes a successor's stamp and the no-overwrite assertion fails.
- Turn unavailable authoritative readback into RECORDED: the unknown-readback
  assertion fails. A lost reply cannot be converted into success by assumption.

The mutation apparatus reuses the PR110 owned POSIX process-group execution
helper and Node per-test reporter at exact commit 44e968be4e2f2db03b37d8a26470fd0a3b256fee.
Actual failing test identity, ERR_ASSERTION and message are checked. All source
bytes are restored after each mutation; final 51-case positives pass again.

## Static results, failed attempts and integrity

Changed tests pass strict cyclomatic/cognitive metrics. Source has no new
violating function: the two inherited cyclomatic findings remain
selectMessageGroupMembershipBranch=39 and buildControlPlaneFailurePayload=20.
Cognitive findings are zero. Scoped lint, explicit decision/grammar/literal JSON
counts and regenerated metadata/shards pass. This is NOT a full static/corpus/
change-cone or global file-size result.

Runs 37942096243 and 37943410091 stopped on overlong lines before new-source
behavior tests; run 37942867748 measured the missing-writer red then failed the
static checks. They are nested intact in the final archive. Corrections wrap
lines, keep original-origin matching and final-row completion in private helpers
of the SAME owner, and name the existing settlement SQL strings. No semantic
rule, timeout, baseline or test assertion was weakened. The cache fixture uses
the existing canonical stamp serializer instead of fixture insertion order.

The encoded text carrier needed four exact transcription corrections; complete
decompressed source and test patch SHA256 values were verified before applying
any bytes. Original carrier text and corrections remain in the evidence. This
is transport correction, not source behavior changed to hide a test failure.

Actions artifact 11622753238, downloaded archive SHA256:
247ef4b56d34aa3278abdf1085f63db6e38780a7d115ba0a3cec76b7e0218d7d.
All 159 manifest entries were independently rehashed and matched.
Canonical Solver evidence SHA256:
03e81a143ed679e24f7a6e3839e295d9253b4169c3074843abf62a676bc3f41a.
Exact source, clean measured checkout and expected-old-head/non-force remote
publication were checked. Main, PR73, PR109/110/111 and salvage refs unchanged.

## Adversarial proof limits and immediate next work

This is historical fact recording, not globally simultaneous metadata authority.
The row CAS does not revoke a durably issued action across independent groups.
A configuration may advance after observation; the next native action/current
CREATE must re-enter its existing fences. RECORDED is no physical dispatch grant.

The restart case closes/reopens real native and operation databases within one
process. It is NOT the required SIGKILL cut between membership commit and
operation recording. A separate real process-loss/holder takeover witness and
independent review remain necessary before route activation.

The native callback is host-composed. Before wiring the real driver, bind it to
the existing registered transport/recipient owner, not caller-supplied evidence.
The current tests neither run the full OperationWorkflowOwner debt driver nor
prove two successive replacements. Current CREATE still requires its existing
leader read/descriptor, exact-generation admission and sole-worker claim.

Immediate next bounded work: process-loss recovery at the native-commit/operation-
recording cut, then connect the existing driver to this recorder and current
CREATE without using the fixture's manual SENDING transition. Add cross-node
holder takeover and delayed terminal-CAS competitors to that owner-path proof.
Historical ADD after removal must never revive old CREATE.

Ordered successor attempts remain separately blocked: absence of origin is not
proof of noncommitment. Require definitive predecessor fencing plus authoritative
noncommitment before any new attempt; never refresh an issued permit in place.
J1 forward recovery after promotion authorization remains binding.

Original full lab FAIL (941 selected/918 process passes/23 failures), duration
debt, broader currentness/review questions, full change-impact/static gates and
physical replacement/restart/off-seed seed-storage-loss acceptance remain open.
The Action's final red step explicitly distinguishes them from this passing
component. No independent approval, Quest closure, main merge or A1-v13 final
compatibility approval is issued here.
