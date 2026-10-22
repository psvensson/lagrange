---
audience: development
documentClass: evidence
---

# Independent retained-history review history

Reviewer: `/root/opening_review`. Date: 2026-10-22.

This is an append-only record of independent review within the existing
retained-seed-original-handoff Quest. The two entries below preserve the
completed design and baseline-witness verdicts. Later source, exact-commit or
runtime verdicts must be appended with their own inputs and limits. Neither
entry below claims that candidate production source was implemented or tested.

## Entry 1: bounded dependency design — APPROVE

### Inputs and review authority

The source checkpoint independently read was
`1262e9c9b306b7289e9768f6ca8cce8f172594d9`, initially with a clean worktree,
on `work/original-handoff-boundaries-20261021-cloud`.

| Binding | Exact identity |
| --- | --- |
| Checkpoint commit | `1262e9c9b306b7289e9768f6ca8cce8f172594d9` |
| Checkpoint repository tree | `7063c562fa9bcd894abd7b590d3ef0eba21567f0` |
| Checkpoint production `src` tree | `a3e339f8977ed79796579a3f66cec091267343e8` |

The reviewer reread AGENTS.md, docs/steering/rules.md,
docs/steering/router.md, architecture/contracts/authority-and-recovery.md,
CHECKPOINT-startup-lifetime-2026-10-22.md, the approved
pre-source-r1-r2-correction-2026-10-21.md and its independent review. Source
inspection covered the retained preparation, native durable store and restore
path, original identity reservations, participant byte/store/request/apply
owners, native/application transaction boundary and affected existing tests.
No source, test or GitHub mutation and no test execution was made during this
review. Root subsequently authorized only this review artifact for writing.

### Verdict and finite unit

**APPROVE the proposed boundary as a dependency unit:** validate retained native
history and classify participant-origin evidence in their existing semantic
owners, while keeping startup CLASSIFICATION_UNAVAILABLE. Implementing every
SQL/MG effect classifier in the same attempt is not a condition for this
bounded dependency approval. Their unresolved status must remain explicit:
native coherence plus a valid ENABLE is not complete original-history approval.

| Responsibility | Existing owner and required boundary |
| --- | --- |
| Native frontiers and retained entry bytes | RaftRsDurableStore, including required raw row validity and the snapshot/log relationship; exact positions remain decimal strings/BigInt. |
| Origin command identity | partition-participant-transaction-bytes.js, using the canonical producer and its pinned identity. |
| Applied origin observation | partition-participant-transaction-store.js, without DDL, distinguishing absence from unreadable or malformed state. |
| Origin/native correspondence | Read-only interaction of those owners, preserving the applied origin separately from pending/local origin entries; no replay engine or ledger. |
| Mandatory native check | Original preparation, before its application callback and through the existing repeated inspection at the final native admission check. |
| Cold startup permission | Still unavailable until complete application/effect classification, cold membership carriage and autonomous-effect exclusions are ready. |

The current preparation reads a native record without first validating its
history, then delegates to the application callback
(src/raft/raft-rs-original-allocation-preparation.js:91-105,239-267).
An existing-API test can therefore engage the gap by showing malformed native
facts reaching or being accepted by that callback. It need not call a future
missing method or claim public startup reachability.

### Native-history requirements

1. Preserve the valid established zero-progress founder. The current complete
   cold fixture writes the exact founder voter set, bootstrap/admission zero and
   ESTABLISHED history with no hard-state row or log entries
   (test/raft/raft-rs-original-allocation-cold-inspection.test.js:47-59 at the
   checkpoint). Null hard state alone is not a defect in that state.
2. Establish required raw row presence and valid types before normalization.
   The current durable reader substitutes applied/generation zero for a missing
   applied row, and confStateFromRow maps raw auto_leave through
   Number(value) === 1. Thus auto_leave=2 becomes false unless checked before
   that normalization (src/raft/raft-rs-durable-store.js:144-153,207-247).
3. Validate exact applied/commit/last-retained boundaries, effective suffix
   coverage, entry types, terms and payload encoding. Account for snapshot
   boundaries and any overlapping retained log facts. Missing snapshot-covered
   provenance or application/checkpoint binding remains explicitly unavailable;
   the inspector cannot reconstruct it or label it empty.
4. Keep applied, committed-but-unapplied and locally uncommitted ranges
   distinct. There is no commit==applied prerequisite, suffix truncation or
   second replay engine. This is required by the approved R2 correction
   (pre-source-r1-r2-correction-2026-10-21.md:140-179).
5. Check the entire original configuration, not only the local voter or a
   loosely normalized configuration key. The durable peer reservations and
   native roles must bind exactly to the declared cohort, with no duplicate,
   foreign or missing peer, unapproved learner/joint role, autoLeave state, or
   incompatible founder bootstrap/admission provenance.
6. Pending/local configuration entries cannot be accepted solely because the
   currently applied voter set matches. Their existing membership owner must
   interpret them. If that interpretation is outside this unit, retain named
   incomplete classification; do not implement a JavaScript membership replay
   algorithm (src/raft/raft-rs-runtime-owner.js:999-1045;
   vendor/raft-rs-wasm/src/lib.rs:753-790).

### Participant-origin requirements

The existing readPartitionWriteOrigin answers whether an origin has applied
locally. Its null result is selected from origin_index alone, not from the
native committed frontier (partition-participant-transaction-store.js:81-107).
The new observation must check the raw index/term pair and inspect all retained
ranges before it can describe committed or local origin entries.

| Evidence | Required interpretation |
| --- | --- |
| No applied origin and no origin entry in covered history | Origin not established as far as the available history proves. |
| Valid origin at applied < index <= commit, with no applied origin | Committed ENABLE awaiting application, retained for the existing owner to replay. |
| Valid origin at index > commit | Locally retained proposal, never committed or release authority by inspection. |
| Applied origin with exact index/term/partition correspondence | Evidence for that applied origin in this generation, not a classification of unrelated effects. |
| Missing table/row/columns, half-null origin, mismatched position/term or uncovered compacted provenance | Named unavailable or contrary observation, preserving the bytes. |

An applied origin and later pending origin commands may coexist. Do not demand
exactly one origin entry in the complete history: the apply owner records the
first and intentionally treats later valid commands as idempotent. An origin
replay for SQL_TRANSACTIONS may also repair schema enforcement. That DDL remains
the existing apply owner's action and never runs during inspection
(partition-participant-transaction-apply.js:551-579).

Match the origin command to the canonical producer's partition, deterministic
entry ID and exact admitted native generation. The current pinned-origin
predicate is narrow, and recognized type alone is not complete original-effect
classification (partition-participant-transaction-bytes.js:296-309,341-357).
Use the existing strict proposal codec and byte owner; preparation retains
allocation/lifecycle identity binding. Other participant commands, SQL, MG
messages and delivery/ack obligations still need their semantic owners and
cannot acquire HISTORY_ACCEPTED from a valid ENABLE beside them.

### Required completion controls for this dependency unit

- Existing-API baseline: corrupt a specific native frontier or cohort in an
  otherwise valid complete original allocation and require refusal before the
  application callback. Engaged assertion failure on old source is evidence;
  missing API/import/setup failure is not.
- Preserve the established zero-progress founder control and exact cleanup.
- Distinguish valid committed-pending and local-uncommitted suffixes; reject
  malformed gaps/frontiers, contradictory snapshot facts and invalid roles
  without changing retained bytes.
- Produce real pending ENABLE through native Ready persistence with an existing
  application-transaction fault. Observe the null applied origin and exact
  committed-pending command read-only, then restore through the actual
  native/application owner and prove origin position and applied progress
  commit together. The inspector never invokes application
  (raft-rs-application-transaction-owner.js:51-99).
- Cover wrong origin partition/entry ID, mismatched recorded index/term,
  malformed origin rows, legitimate repeats and an uncommitted origin that is
  never upgraded to committed merely by inspection.
- Renew native assessment at the final native cut after a retained record
  changes; preserve prior revocation, durable-right and exact cleanup checks.
- Keep retained public startup at CLASSIFICATION_UNAVAILABLE and fresh/public
  continuation at its existing HOLD. The current cold refusal is in
  seed-original-allocation-startup.js:49-53.

### Scope ceiling

This approval is design-only. It does not approve future source bytes, a runtime
result or a cold opening. SQL/MG canonical effect matching, actual cold-service
durable-record membership, role/helper/resumer exclusions, protected
activation/leader acknowledgment/durable transfer and the composed public
two-start witness remain unfinished. All eight receipts remain unchanged. No
serving, Quest landing, main merge, release, corpus acceptance or inherited
source decision-audit clearance is granted.

## Entry 2: exact baseline witness and plan — APPROVE

### Reviewed inputs and hashing

The baseline witness was reviewed as a working-tree delta from the same source
checkpoint `1262e9c9b306b7289e9768f6ca8cce8f172594d9`, before its preservation
commit or lab measurement. Production source had no diff. The only observed
changes were the witness, Quest log and new plan; this verdict assesses the
witness and plan, not unspecified future log content.

| Reviewed file | Bytes | SHA-256 |
| --- | ---: | --- |
| test/raft/raft-rs-original-allocation-cold-inspection.test.js | 12401 | `a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d` |
| solve/quests/retained-seed-original-handoff/evidence/PLAN-retained-history-2026-10-22.md | 3879 | `bd01431b46c0e71d2727f2cf7b755708120dcd6e19bef5e3974cbcf7a79e2bf2` |

Hashing method: SHA-256 of each file's complete raw byte sequence, without text
normalization, using Python hashlib.sha256(Path(path).read_bytes()).hexdigest().
The same lengths and hashes were rechecked before writing this record. Git
object identities in Entry 1 were resolved from the explicit checkpoint, not
from a moving branch name.

The reviewer also loaded the original test with git show at the checkpoint.
After removing exactly the two newly added import lines, the complete original
file is an exact byte prefix of the revised test. Thus existing test bodies are
unchanged, while the current complete-file identity above includes both imports
and the appended witness. No unchanged complete-file/prefix hash is invented.

### Witness verdict and oracle

**APPROVE for preservation and lab measurement; no material correction is
required.** This is a witness/plan verdict, not a runtime result.

The twelve negative cases call existing preparation.inspect after complete
original issuance. They mutate only native record tables and preserve the
declaration, lifecycle identity, ESTABLISHED opening history, peer reservations
and all publication rights as UNUSED. The typed oracle requires REASON.HISTORY,
zero application callbacks and no preparation handles remaining.

The twelve storage corruptions are: applied beyond commit; commit beyond the
retained log; a history hole; decreasing terms; a retained term beyond hard
state; missing applied row; invalid raw auto_leave; foreign voter; duplicate
voter; unknown native entry type; malformed base64 payload; and undecodable
proposal bytes. The witness labels them deliberately corrupted storage, not
native-produced histories or reachable public startup behavior.

The paired valid control has applied=1, commit=2 and retained last index=3.
It requires all three entries to remain visible after inspection. Together
with the unchanged established zero-progress control, this rejects a repair
that demands commit==applied or removes the locally uncommitted suffix.

**Expected baseline caveat:** the missing-applied-row case should already pass
on the old source. Its hard state and entries are absent, so existing
hasDurableRecordIn returns false and preparation raises HISTORY before the
callback. The other eleven corruptions appear to reach the permissive callback
and should fail by Missing expected exception. These are source-derived
expectations, not measured counts. Preserve the actual lab result and do not
describe all twelve as newly failing. A setup/import/timeout failure is not
the engaged baseline described here.

### Plan disposition and remaining controls

The plan preserves the Entry 1 boundary: read-only native and participant-origin
classification; no progress equality or truncation; no absence inference from
a null applied origin; legitimate origin repeats; real pending ENABLE through
native Ready plus application-transaction fault/reconstruction; and no full
SQL/MG classifier claim. Startup CLASSIFICATION_UNAVAILABLE remains explicit.

The baseline may be preserved and measured on unchanged production source.
Keep its reviewed test bytes unchanged for the candidate, append the necessary
candidate controls, and independently review exact source and results before
claiming this dependency complete. Candidate controls must cover exact large
positions, malformed raw rows, snapshot/unclassified history, origin
disagreement/repeats, read-only custody, real pending replay and final-cut
renewal as described above. An ordinary RF3 command-history fixture does not
prove original-allocation public recovery.

Retain each failure and exact revision; scope closure and exact-candidate
metadata/static evidence remain required. An unrelated or test-only pass cannot
clear the separately recorded inherited source decision-audit refusal. Nothing
in this entry changes the eight receipt terms or grants serving/publication.

No tests were run, source/test files changed or GitHub operations performed by
the reviewer. This record alone was written under root's artifact ownership
assignment; it was not staged or committed by the reviewer.

## Entry 3: exact baseline result attribution — CONFIRMED RED

### Exact source and witness binding

The independently reviewed baseline is the preserved test-only commit
`79fa766ed290c5545cf4017ee589b86e440e0e47`, repository tree
`4e72b0d43a3d0d2bb328e7bca7156e1b7afe0b55`. Its production src tree is
`a3e339f8977ed79796579a3f66cec091267343e8`, exactly the same as the starting
checkpoint 1262e9c9. The committed test remains 12,401 bytes with SHA-256
`a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d`;
the committed plan remains 3,879 bytes with SHA-256
`bd01431b46c0e71d2727f2cf7b755708120dcd6e19bef5e3974cbcf7a79e2bf2`.
These identities were checked from the explicit Git commit, independently of
root's concurrently changing candidate worktree. They are the exact Entry 2
inputs. No candidate source approval is supplied by this entry.

### Receipts and retained original bytes

The reviewer independently fetched the GitHub issue comments for #814, #815
and #816 through the read-only connector and inspected their terminal receipts.

- [Runtime #814](https://github.com/psvensson/lagrange-lab/issues/814#issuecomment-6343537626):
  request `55ca35b4c74141e3bdda7e826695a684`, exact source 79fa766e, tv-dator,
  COMPLETE/FAIL, exit 1, finished at 2026-10-22T14:42:29.228Z. One test file
  selected; the driver's completed_test_files field is null, so this review
  does not substitute a fabricated completed-file count. The complete TAP
  output proves both parent test bodies and all their selected subtests reached
  terminal results. Execution, thermal and container scopes are closed.
- [Read-only export #815](https://github.com/psvensson/lagrange-lab/issues/815#issuecomment-6343611355):
  request `e3ea6889bbb24e3a9dd5c3293499b71e`, COMPLETE/PASS, exit 0, tv-dator,
  finished at 2026-10-22T14:46:01.527Z; execution, thermal and container scopes
  are closed. Source is null because this command only reads the already closed
  #814 executor log. The reviewer decoded its submitted payload, verified
  SHA-256 `474e43ef57a95a4738449be8afff3952ba9ad7310e3d9c15f0e15b0903088f31`
  against the terminal receipt, and confirmed that the command verifies and
  exports the original retained file without rerunning tests or editing source.
- [Evidence #816](https://github.com/psvensson/lagrange-lab/issues/816#issuecomment-6343637060):
  request `b163ead8499d4704a85e60bd58cc12ce`, COMPLETE; returns the full
  3,085-byte export-controller output at offset zero, SHA-256
  `3712ab0d1f4f97037f5627c1bc8fe15ef751a1b32d951dd3dbde1e4307cf3cf4`.
  This evidence-read operation does not start another native test scope.

The reviewer independently decoded #816's zlib/base64 envelope in memory and
compared the result byte-for-byte with
RUNTIME-retained-baseline-79fa766e-2026-10-22.txt. Both are exactly 19,425 bytes,
SHA-256 `7b62dbbf0a0a45c26244eb281da920f5dcbfe233d3204bd1eeaa0c17b942a2e4`,
matching #814's untruncated worker-log receipt. The export envelope names the
same original logical request and source commit. The 8,204-byte #814 controller
tail, with SHA-256
`7c56c105eba9fa3128d54666f70950a6d754d944c793fcad2c7bd289b73db4b8`, is a
different artifact and is not mislabeled as the complete worker log.

### Attribution and verdict

**CONFIRMED: this is an engaged native-preparation boundary RED on unchanged
production source.** The complete original log and terminal runner counters
agree: 24 tests, 12 pass, 12 fail, zero cancelled/skipped/todo.

Eleven leaf failures are ERR_ASSERTION at the unchanged assert.throws oracle,
each reporting Missing expected exception: invalid native history cannot reach
the application owner. They are the applied-beyond-commit, commit-beyond-log,
history-hole, regressing-term, term-beyond-hard-state, invalid-auto-leave,
foreign-voter, duplicate-voter, unknown-entry-type, malformed-base64 and
undecodable-proposal cases. Their parent contributes the twelfth runner failure
as subtestsFailed / ERR_TEST_FAILURE, reporting 11 subtests failed. That parent
is not a twelfth independent defective storage fact.

All nine original leaf cases passed, as did their parent. The missing-applied-row
negative passed, exactly as Entry 2 predicted from the existing record-presence
check. The coherent applied=1/commit=2/last=3 control also passed. Thus the
baseline contains twelve passing runner results: ten in the original parent
and two additional leaf controls.

The eleven primary failures are neither setup/import/missing-method errors nor
timeouts. Inspection returns without the required refusal, engaging the existing
API gap. The later applicationCalls==0 and empty-resource assertions inside
those failing test bodies are not reached after assert.throws fails; do not
claim the baseline separately measured those later assertions. They remain
part of the frozen candidate witness and must execute on the repair.

This result proves the bounded storage/preparation acceptance gap and the
continued positive controls. It does not prove a naturally produced malformed
native record, participant-origin classification, real pending ENABLE replay,
public cold startup reachability or a repaired candidate. No counts from older
runs are added. Earlier failed evidence and the Entry 1/2 limits remain intact.
All eight handoff receipts remain unchanged; startup's current refusal is not
discharged. Candidate source, affected-neighborhood runtime and applicable
metadata/static review remain outstanding.

The reviewer ran no tests, changed no source or witness and made no GitHub
mutation. Only this review entry was appended. The previous 15,118 bytes remain
unchanged, with SHA-256
`35b3b87ab3e56df4989e8a6566c0200b311158cba10c2c8288c27e7937106030`.

## Entry 4: bounded candidate source and witness review — APPROVE

### Verdict, inputs and evidence ceiling

**APPROVE the bounded source interaction and the submitted witness design.**
No material source or witness blocker remains in this category-complete pass.
This is an independent review of uncommitted candidate bytes against
`79fa766ed290c5545cf4017ee589b86e440e0e47`; it is not a passing runtime result,
metadata result, full static clearance, merge approval or completion of original
startup. The exact candidate commit and its executed results must be bound in
later entries. The review includes the latest nativeProgressOf extraction,
exclusive entry/origin decisions and integration cleanup ordering, not an older
intermediate source snapshot.

The seven production files, five relevant witness files and two contract files
are bound below. The frozen cold-inspection witness is byte-identical to the
approved, measured 79fa766e baseline. The startup implementation and operation
port are unchanged by this candidate. The existing 35,941-byte startup witness
remains SHA-256
`2421740ecafb0c9dcb457be3e1ef8286321645a426d23f7814d2d9a91d1e086f`.
The eight-receipt artifact evidence/receipt.json remains byte-identical to the
baseline: 1,951 bytes, SHA-256
`4f0068b3d61f7c78af5f5ee4b62c2ddd1c713898a06de56cb5ca29a2438f3e93`.
Earlier bounded opening/startup approvals therefore remain intact at their
previous evidence ceilings.

The applicable categories are admission/gating, recovery/replay, concurrency
of observation and final admission, registered owner interaction, and harness
fidelity. Numeric/representation attacks relevant to stored bytes are included.
No production retry, timer, transport, dispatch, public admission or formation
algorithm changes here; their applicable interaction risks are considered below
without inventing a new liveness or public-startup claim.

### Exact reviewed content binding

Hashing method: read each named file as raw bytes, without newline or encoding
normalization, and calculate SHA-256. For each manifest, sort the repository
relative paths lexicographically and concatenate one UTF-8 line per file in the
exact form `sha256`, two ASCII spaces, `relative/path`, LF. Include the final LF
and hash the resulting manifest bytes. File lengths below are raw byte counts.
This is a content manifest, not a claim that the current worktree already has
an immutable candidate commit.

| Manifest | Files | Manifest bytes | SHA-256 |
| --- | ---: | ---: | --- |
| Production | 7 | 804 | `388cde621adf7d476ac55d38cf7e7b28babe7ac747b361925105a59b1c7778b8` |
| Witnesses | 5 | 641 | `750518c8874d44f34f50fabd8707eefc5a601a56d049a524e2647e39d9f73f12` |
| Contracts | 2 | 200 | `1ae7e55d128800671f822acde46e4ecd2793a43ce00aba54e9642f9f593a5468` |
| All reviewed content | 14 | 1,645 | `1779af01d1910bc34d49a6a707846e23128be9b26dd686adf3fb62a75c8163e3` |

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| src/partition/partition-participant-transaction-bytes.js | 15,916 | `d8a2e7fe4cb2fc0270a0062884a96c51151aff43fbacc46a14c4d8325dbe71ac` |
| src/partition/partition-participant-transaction-constants.js | 20,981 | `82f20011f2416f5443d7d08d7dba0f7e453c297ce37424d4057f46ca895d6c2e` |
| src/partition/partition-participant-transaction-store.js | 16,143 | `f83517a0b3b21dce8e6d4eae91a0b0ad6e6bc1e0c7fbdf1b9372486c02a42667` |
| src/raft/raft-rs-durable-store-constants.js | 14,702 | `739792daf022d4727e682801bdc2feb029cb488698944dcae6db6193083838d6` |
| src/raft/raft-rs-durable-store.js | 29,463 | `fd4a3ffac15c397f95d5c90cecdd58e835b7f4d69ea5d6b524698e4774f262ec` |
| src/raft/raft-rs-original-allocation-preparation.js | 20,457 | `6ba9a0b9300a1ce4d488a1b892b1aa165c06fce1b4e90f77f7b6e1b5c83f3a38` |
| src/raft/raft-rs-retained-history.js | 6,983 | `804406684ae2fadb004d85862c169e1e181ca2d699573e6b7f939b6d86c1fd81` |
| test/partition/participant-origin-retained-history.integration.test.js | 14,980 | `65ca59a1719825bafaae66765e37dcd47a04ff4b9fc5fc27108375487ece8776` |
| test/partition/participant-origin-retained-history.test.js | 10,259 | `b0888f487ee0fb69dcb5e002d234c76f29bf8515cab0b6a0ea0af780c59e4cae` |
| test/raft/raft-rs-backend/durable-store-committed-entries.test.js | 14,638 | `21337c4c724f0798cb1c7b4f62c619780ad43bcc724a94bf811cd18a1cd53c3a` |
| test/raft/raft-rs-original-allocation-cold-inspection.test.js | 12,401 | `a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d` |
| test/raft/raft-rs-original-opening-authority.test.js | 13,714 | `660ac71b284f9e56036f7f3b90aeb992c6a3eb8ea54ae3e1e5c8bd8f6a1de695` |
| architecture/runtime-contracts.md | 21,238 | `d8145c9861bd2d875cca698bbec65f4afe9ae0a2874fbddd946b9ca2366ed909` |
| test/shards/impact-contracts.json | 163,536 | `f1f0f71beef049df2b7559bf30710a61b61faf08f1719c0419da3bba7d0bc263` |

### Admission, native frontiers and representation attacks

The durable store remains the native record owner. Its new observation reads
the required raw rows before the existing record normalizer can erase invalid
representations: exact integers, required applied-row presence, entry type and
auto_leave are checked first. The pure helper rejects fractional/negative or
out-of-range native numbers, malformed configuration arrays, duplicate or
noncanonical peer identifiers, noncanonical base64 and undecodable NORMAL
payloads. SQL/schema observation failures preserve their cause as unavailable;
malformed readable history is invalid. Evidence: durable-store.js:207,
durable-store.js:261 and retained-history.js:28, :61, :76, :86, :96;
durable-store-committed-entries.test.js:289 and :302.

The native frontier decision preserves applied <= committed <= last, contiguous
effective suffixes, nondecreasing terms bounded by hard state, and the snapshot
boundary's index/term correspondence. It does not impose committed == applied.
A zero-progress founder with no hard-state row remains legal. Snapshot overlap
is retained rather than deleted; missing compacted provenance is named
SNAPSHOT_PREFIX. Exact decimal positions remain independent of Number precision.
Evidence: retained-history.js:112, :117, :132, :148, :157;
durable-store-committed-entries.test.js:202, :219, :232, :319; frozen
cold-inspection.test.js:272. The above-Number-precision fixture is a stored-byte
classification witness, not a claim that native code produced that snapshot.

Original preparation consumes this same owner before invoking the application
callback and again at the final opening cut. It separately owns exact original
cohort identity: the full role-aware founder configuration must match the
declaration's derived peer identities, and bootstrap/admission/membership
generation stay at the original zero boundary. Opaque configuration commands
and positive-index snapshot prefixes remain CLASSIFICATION_UNAVAILABLE even
when the current voter list looks correct. No generic native observation is
reinterpreted as original allocation authority. Evidence:
original-allocation-preparation.js:94, :260, :375; the late mutation treatments
at original-opening-authority.test.js:224.

Precheck and final enforcement use inspectColdMember, not separate local
predicates. Constructor-time mutations are tested after the first opening
check: impossible commit, retained configuration command, and uncovered
snapshot must refuse before actual core entry or another application callback.
Each treatment has a distinct already-inspected attempt and member capability;
the fixture asserts the getter ran, native entry stayed empty, and custody
settled. Evidence: original-opening-authority.test.js:244–275. These candidate
assertions are reviewed but have not yet been measured.

All new admission refusals retain the existing original typed HOLD contract;
the participant observations have explicit named states and reasons. No new
wait or larger budget is introduced. There is deliberately no runtime switch
that releases the startup classification hold in this unit: the missing full
application/membership/effect owners must be implemented before that boundary
can become available. SeedOriginalAllocationStartup still throws
CLASSIFICATION_UNAVAILABLE at seed-original-allocation-startup.js:53.
Re-reading changed facts can change an observation, but it cannot turn this
partial observation into startup permission.

The hostile-input surface here is persisted SQLite primitives plus the existing
JSON codec's owned records. Tests cover invalid exact numeric/byte forms before
coercion, immutable returned nested records, extra origin fields and wrong
identity. This approval does not add a promise of resistance to arbitrary
trusted-host mutation of JavaScript intrinsics or substitution of the database
implementation. Existing original-opening callback/reentrancy authority stays
under its existing owner and final guard.

### Participant origin, recovery and immutable correspondence

The participant byte owner defines the canonical retained GENERATION_ORIGIN
shape by comparison with its existing producer, using the retained timestamp
and proposer stamp rather than today's clock. Exact partition/id and producer
fields are required; extra SQL/transaction/effect fields cannot masquerade as
origin. Ordinary pinned-command admission and committed apply are unchanged.
This canonical command check is not a new claim of complete original-allocation
or proposer authorization. Evidence: participant-transaction-bytes.js:354 and
participant-origin-retained-history.test.js:117.

The participant store owns correspondence of that command with the generation
row. A null origin is PRE_ORIGIN only when no applied origin command exists;
the same null projection can accompany real LOCAL_PENDING or COMMITTED_PENDING
work. A nonnull origin must match the first applied command's exact index and
term. Legitimate repeats do not replace the first origin or reset the current
generation. Half-null/malformed rows and mismatched positions are contrary;
unreadable/missing required state stays unavailable. Evidence:
participant-transaction-store.js:120–173 and
participant-origin-retained-history.test.js:59, :86, :139, :159, :173.

Unknown SQL, participant PREPARE and MG commands remain explicit
unclassifiedEntries in the result, including when the origin state is APPLIED.
No result supplies HISTORY_ACCEPTED or a generic safe-history boolean. Snapshot
coverage cannot manufacture an origin proof from the visible suffix. Evidence:
participant-transaction-store.js:127, :154;
participant-origin-retained-history.test.js:104 and :188. Generation is reported
from the authoritative row; correspondence of every generation-changing
application effect remains a later owner responsibility.

This unit introduces no replay writer, new in-memory recovered registry,
rollback mechanism or second ledger. Observation never replaces live state,
applies retained commands or repairs schema. Existing origin application remains
first-write/idempotent under recordPartitionWriteOrigin at
participant-transaction-store.js:210. The real-service witnesses exercise its
existing replay path without changing it: one original retained origin is
applied after reconstruction, and a second ENABLE reports alreadyEnabled
without manufacturing a replacement command. Those results still require the
candidate lab run.

### Read snapshots, freshness and ownership

RaftRsDurableStore.readRetainedHistoryIn owns one synchronous SQLite read
snapshot. Participant observation encloses both the native read and generation
row in one owned read transaction, while refusing an already-open caller
transaction without settling or writing it. No await, timer, side-effect claim
or cross-driver dispatch is added to either observer. This avoids combining
native and participant facts from different database snapshots and avoids
certifying caller-owned tentative writes as settled origin state. Evidence:
durable-store.js:621; participant-transaction-store.js:185;
participant-origin-retained-history.test.js:188. Existing final opening
validation rejects a writable connection with an open transaction and re-reads
after the application callback before native effect admission
(original-allocation-preparation.js:394–418).

The observation returns owned, deeply frozen records rather than cached
approval. There is no retained global classification cache, new claim registry,
single-flight key or new lock to become stale. Every observation and every final
opening check re-enters its canonical owner. No concurrency/locking mechanism
is claimed merely because a read is synchronous; the existing preparation
capability and final-effect guards continue to own actual authority.

The two coupled interactions are explicit: native store evidence -> original
preparation admission, and native store evidence -> participant-owned origin
correspondence. The helper is pure within the native store boundary, not a new
semantic owner or planner. Manual import review found no back edge from native
storage/helper to participant/bootstrap; the new byte-owner HLC dependency is
pure. Evidence: source imports in the seven-file manifest;
architecture/runtime-contracts.md:51; impact-contracts.json:1283, :2650, :2676.
Generated dependency metadata has not yet been used as a passing gate for this
candidate and must be regenerated by the normal owning hook.

Both sides of each interaction are attacked in paired witnesses: corrupted
native facts must be excluded before application assessment while coherent
pending suffixes survive; origin row absence must coexist with real retained
pending work while an applied origin must match its exact first position. The
frozen baseline's eleven engaged failures make the old native-preparation
shortcut observable. Source inspection and reviewed witnesses establish the
candidate design; runtime green on the same candidate remains outstanding.

Fresh authoritative reads after native commit and replay are the release path
for changed observation states. The RF3 witness progresses LOCAL_PENDING ->
COMMITTED_PENDING -> APPLIED through the actual native commit carrier and
existing recovery cadence; no observer polling changes authority. No new retry
loop, urgency/force escape, retry budget or backpressure bypass is introduced.
Diagnostics and helper results remain evidence, not replacement opening policy.
The complete SQL/MG and public-startup consumer is explicitly absent, so this
review does not pretend to verify its future release path under pressure.

### Harness fidelity and completion controls

The old baseline remains an engaged acceptance-gap RED, as Entry 3 records:
eleven Missing expected exception leaf failures, one failed parent, with the
missing-applied-row negative and coherent pending-history control already
passing. The baseline's later callback/custody assertions were unreachable in
those eleven bodies and must execute on the repair. No witness deletion,
expectation relaxation or baseline replacement is part of this candidate.

The appended storage and participant unit witnesses intentionally construct
specific rows through existing store/schema owners and corrupt selected raw
facts. They prove observation semantics and no-write behavior, not natural
production of corrupt logs. Serialization equality, no added schema and settled
read transactions are asserted, including refusal paths. Native no-ops,
configuration bytes, JSON null, wrong native group, malformed participant row,
canonical command identity, repeated origins and unknown application effects
have separate assertions; an empty fixture cannot satisfy the positive pending
controls vacuously.

The new RF1 integration uses an actual PartitionService, ENABLE producer,
native persistence and committed application callback. Its finite callback
fault must be reached before inspection. It captures the original command,
index and term; verifies committed-but-unapplied state through a readonly
connection; closes the real service; checks DB closure, refused old operation
port and removed transport handler; and observes the same retained prefix after
reconstruction. Additional native election no-op suffixes are allowed while
the exact original prefix and one origin command remain required. Evidence:
participant-origin-retained-history.integration.test.js:71, :130–200. This is
real native recovery proof design, not the composed original two-start proof.

The RF3 integration uses the existing real admitted-group fixture. All three
replicas must first share settled native frontiers, term and configuration. It
holds only actual current-term APPEND/HEARTBEAT commit carriers addressed to the
chosen follower and exact native group/peer pair, forwarding all other traffic.
It requires both actual leader ENABLE success and actual follower persistence
at the same index/term before asserting LOCAL_PENDING. The captured carrier's
commit must cover that origin. Forwarding that exact carrier under a reached
application fault produces COMMITTED_PENDING with unchanged log bytes; clearing
the fault and restoring transport then permits normal replay. Evidence:
integration.test.js:110, :203–292. The transport return is a delivery-level
acknowledgment, not a fabricated Raft quorum acknowledgment. Ordinary group
formation is fixture setup and is not evidence of original 141-member startup.

Timing remains bounded by the 10-second group and 30-second test budgets;
20-millisecond heartbeat and 150–300-millisecond election settings preserve
heartbeat-before-election ordering. No production timeout is widened. Setup,
fault engagement, persisted pending state and replay each have observable
assertions; timeout/import/setup failures will not count as the claimed proof.
The latest closeServices reports any shutdown rejection before joining pending
ENABLE settlements and removes the directory only after successful closure.
Evidence: integration.test.js:32–36, :120–127. A failed close retains its
directory rather than hiding resource debt behind an unresolved proposal.

The proposed fourteen-file affected-neighborhood batch is appropriate for this
bounded checkpoint: the six observation/opening/startup-HOLD files plus
participant apply/staging/decision/unreadable-state and native Ready/recovery/
restart/persistence-admission neighbors. It is not selector-wide, corpus-wide
or full-public-startup certification. Actual selected/completed file counts,
runner counts, cancellations, skips and physical scope closure must come from
the exact candidate's terminal receipts and retained logs.

### Static attribution and remaining scope

The separately retained STATIC-retained-inherited-byte-decisions-2026-10-22.json
records three old raw_null_empty_state_outcome findings in canonicalDecisionRecord
and buildDecisionRecord, with identical implicated function bytes at 79fa766e
and the candidate. Their line displacement from new imports is not a new
semantic defect, and this approval does not waive or clear the inherited RED.
The source decision-audit refusal recorded by the preceding startup work also
is not discharged by this review. Any normal-hook or scoped scanner success
must retain its exact base, checked scope and inherited exclusions rather than
be described as whole-source clearance.

Required next evidence is the preserved exact candidate, normal metadata/static
results and affected-neighborhood runtime, with original failures retained and
successful assertions individually reachable. This review does not demand
complete SQL/MG retained-effect classification, cold membership/checkpoint
interpretation, protected leader acknowledgment, publication transfer, public
admission fencing or composed original two-start completion within this
dependency unit. Those remain unfinished obligations before startup's hold can
be removed. No handoff receipt changes and nothing is approved for main here.

Only this review record was appended by the reviewer. No tests were run, source
or witness edited, GitHub object mutated, or commit made by the reviewer. The
preceding 20,837 bytes remain unchanged with SHA-256
`2a5aee949356359a3fec3d308bca3d29ff38ad6b712aef0124ca8a927ae2b3e9`.

## Entry 5: exact preserved candidate and normal-hook provenance — BOUND

### Approved bytes bound to the preserved commit

The Entry 4 source and witness approval is now bound to
[cb822d6fcf8c7b78b34a718772d06488490bc0da](https://github.com/psvensson/lagrange/commit/cb822d6fcf8c7b78b34a718772d06488490bc0da).
The reviewer independently read the local Git objects and the live GitHub
Git-commit and branch-ref API resources. They agree on the following identities:

| Object | Identity |
| --- | --- |
| Commit | `cb822d6fcf8c7b78b34a718772d06488490bc0da` |
| Sole parent | `79fa766ed290c5545cf4017ee589b86e440e0e47` |
| Repository tree | `3b3a2471e9670fac863b2a380a998c2dc2cf1c29` |
| Production src tree | `d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba` |
| Test tree | `fc2296064ae7a02826a8c249054dab01a98f473e` |
| Remote branch at this review | `work/original-handoff-boundaries-20261021-cloud` -> `cb822d6fcf8c7b78b34a718772d06488490bc0da` |

Remote observations were made through read-only requests to
`/repos/psvensson/lagrange/git/commits/cb822d6fcf8c7b78b34a718772d06488490bc0da`
and `/repos/psvensson/lagrange/git/ref/heads/work/original-handoff-boundaries-20261021-cloud`.
The remote commit carries the same tree and parent as the local object. This
binding does not rely on the older locally cached origin branch ref.

Using Entry 4's hashing method on bytes obtained from explicit `git show
cb822d6f:<path>` objects, the reviewer independently reproduced all four
manifests:

| Scope | SHA-256 |
| --- | --- |
| Seven production files | `388cde621adf7d476ac55d38cf7e7b28babe7ac747b361925105a59b1c7778b8` |
| Five witness files | `750518c8874d44f34f50fabd8707eefc5a601a56d049a524e2647e39d9f73f12` |
| Two contract files | `1ae7e55d128800671f822acde46e4ecd2793a43ce00aba54e9642f9f593a5468` |
| All fourteen reviewed files | `1779af01d1910bc34d49a6a707846e23128be9b26dd686adf3fb62a75c8163e3` |

Every reviewed file also equals the aligned worktree byte-for-byte. The entire
production delta from 79fa766e consists of the seven approved files; no extra
runtime change was introduced during metadata generation or preservation.
The frozen cold witness, startup witness and eight-receipt artifact retain
their prior identities. The committed review artifact contains Entries 1–4
exactly: 40,966 bytes, SHA-256
`edf038254892dee77b9e4b2c4d538c934cd11573eaa788103960b168349d5d34`.
Consequently the source approval remains applicable without reopening
unaffected earlier reviews.

### Normal-hook refusal and generated metadata

The reviewer read the complete preserved normal-hook output and checked its
relevant behavior against the unchanged hook source. The normal attempt ended
with exit 1 and exactly one counted staged-check refusal: decision boundaries
in the participant byte owner, with three raw_null_empty_state_outcome
findings. The log explicitly says the scanner matched zero findings from its
ratchet baseline; the historical attribution is a separate baseline/candidate
comparison, not an assertion that the hook waived them.

The reported preparation complexity of 28 remains report-only in this hook:
the existing scoped-complexity branch documents that behavior and does not
increment the staged failure counter. Inventory refresh also reports aggregate
complexity/duplication debt while refreshing its reports. Those outputs must
not be described as whole-source static clearance. The log records normal
inventory and test-metadata generation after the decision refusal, then the
single-failure summary. Evidence: STATIC-retained-candidate-precommit-2026-10-22.txt,
especially lines 37–57, and the unchanged hook's staged decision check and
report-only scoped-complexity branch.

The retained audit outputs separately report current curated shards and
2,440 classified test files (2,114 unit, 109 integration, 210 bootstrap,
three convergence-probe and four packaging), plus passing resource/subsystem
classification. The impact registry reports PASS for 69 contracts and 42
coupled pairs. These are metadata counts, not executed tests. The committed
generated deltas add the two new participant witnesses to their appropriate
classes and refresh the source/graph seals and observation census. No runtime
was inferred from those artifacts.

The committed provenance artifacts were independently hashed:

| Artifact under evidence/ | Bytes | SHA-256 |
| --- | ---: | --- |
| STATIC-retained-candidate-precommit-2026-10-22.txt | 3,949 | `f9f388827caf408602a7b362d4c3c830fe2f88b4665e79d19e4b3d0c477615fe` |
| STATIC-retained-candidate-shards-2026-10-22.txt | 647 | `7176d3c9b031ca4941e8804c53a0f3ade506e1c1faf797f19a81a37850e527c5` |
| STATIC-retained-candidate-impact-2026-10-22.txt | 327 | `8104c024419459aba496888decbf0ea9bc52c8562f4718d613012461f0254c44` |
| STATIC-retained-inherited-byte-decisions-2026-10-22.json | 4,115 | `b4415a3252c71520087c3a9ba700f4ab33bfda64aa5c0101004bdca6c7d79be3` |

The reviewer independently extracted each complete implicated top-level
function, including its final LF, from both exact Git revisions. Both pairs
are byte-identical and reproduce the prior attribution hashes:

| Function | Bytes | SHA-256 |
| --- | ---: | --- |
| canonicalDecisionRecord | 897 | `abb0471716aba613b0d5014b1bfb0ccd4b2ecbde024558ca96f47f7d439e65a3` |
| buildDecisionRecord | 556 | `bbaf027e46d9951f38bbf8adbcf0b8190913d0635365bb86a5a826ad363c808c` |

Thus the normal hook is still RED, with the three findings correctly
attributed to unchanged inherited function bodies. This entry neither fixes
nor waives them and does not change any scanner baseline, selector, gate or
hook. No local test rerun was performed by this reviewer.

### Preservation scope and next evidence

The documented route in solver-runbook.md:143–168 permits committed WIP
preservation on a non-main branch and reserves LAGRANGE_SKIP_PRECOMMIT for
that purpose; it explicitly does not confer Quest-land, merge, release or
publication approval. This candidate's commit message and retained attempt
record preserve the actual normal-hook refusal and pending lab status. The
remote preservation is consistent with that bounded route. It is not a green
gate result and supplies no authority to land source on the shared branch.

The parent reports runtime #820 and metadata/fast-static #821 submitted on
this exact commit. Their results are not reviewed or counted here. The next
result review requires their exact terminal receipts and retained output,
including selected/completed files, runner totals, relevant assertion outcomes
and physical scope closure. The baseline #814 RED remains unchanged; no earlier
passing tests are added to a future candidate total. All Entry 4 limits,
startup's CLASSIFICATION_UNAVAILABLE hold and all eight receipt terms remain
unchanged.

Only this append-only record was changed by the reviewer. No source, witness,
Git object or GitHub object was mutated, and no runtime/static command was
rerun. The previous 40,966 bytes remain unchanged with SHA-256
`edf038254892dee77b9e4b2c4d538c934cd11573eaa788103960b168349d5d34`.

## Entry 6: local static evidence and unobserved lab intake — LIMITED ACCEPTANCE

### Disposition

**ACCEPT the recorded local fast-static PASS at its stated scope and the
corrected submission/blocker attribution. No candidate runtime verdict is
issued.** Entry 4's bounded source/witness approval and Entry 5's exact commit
binding remain unchanged. Neither this local result nor the missing lab
acknowledgments clears the normal-hook decision-boundary RED, advances a
handoff receipt or proves execution of the submitted candidate tests.

The reviewer read CHECKPOINT-retained-history-2026-10-22.md, the local static
measurement and complete emitted log, the preserved candidate request, and the
format-correction record. Root accepted the review's wording refinement to
"While lab intake remained unobserved"; the checkpoint now distinguishes lack
of observation from a diagnosed controller outage. Source, test and contract
bytes remain frozen at cb822d6f.

### Exact local static result and its limits

The isolated checkout at `/tmp/lagrange-retained-candidate-cb822d6f` was inspected
read-only. Its HEAD is `cb822d6fcf8c7b78b34a718772d06488490bc0da`, repository
tree `3b3a2471e9670fac863b2a380a998c2dc2cf1c29`, src tree
`d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba`, and test tree
`fc2296064ae7a02826a8c249054dab01a98f473e`. Git status is clean there. The
dependency symlink resolves to the declared existing installation at
`/workspace/scratch/fb19a647cca6/lagrange/node_modules`; no fresh local npm ci
result is claimed.

The retained measurement names the exact invocation:

```text
NODE_OPTIONS=--max-old-space-size=6144 node scripts/check-fast-static.js --base 1262e9c9b306b7289e9768f6ca8cce8f172594d9 --explain
```

It records exit 0, Node v24.19.0, npm 11.9.0, 20,901 milliseconds, and no runtime
test execution. The complete emitted output names the explicit committed base,
31 changed paths and 12 JavaScript paths. The reviewer independently recomputed
those path counts from the exact Git range; this is not a zero-file or
worktree-only pass. The raw original local log is byte-identical to the retained
628-byte artifact, SHA-256
`cbae8b28e6df2663c3052aacc2628fefbe05b26d9f1ddeffaeb92124fa985c7c`.

All fourteen emitted check results are ok: dependency boundaries, shard
classification, scoped metrics, ESLint over twelve changed JavaScript files,
runtime grammar, document ASCII, metadata gateway, impact contracts, roadmap
authority, document audience, current capabilities, closure ledger, CLI docs
and service portability claims. The reviewer inspected the unchanged
scripts/check-fast-static.js allowlist and result/exit-code implementation;
it matches that output and does not include the source decision-boundary
scanner. Its success therefore coexists with the separately retained normal
precommit refusal. Whole-corpus ratchets and runtime application behavior are
outside this result. The reviewer did not rerun the static command.

### Submission correction independently checked

The reviewer directly fetched the live #820 and #821 issue bodies and #821's
existing comment 6344551273. Both bodies and the comment parse as complete raw
JSON. Their decoded objects are identical to the intended runtime request,
static envelope and static part retained in
REQUEST-retained-candidate-cb822d6f-2026-10-22.json. The request identities,
exact source/ref, selections, expiry and intended static commands have not
changed:

| Request | Identity | Source and intended work |
| --- | --- | --- |
| [#820](https://github.com/psvensson/lagrange-lab/issues/820) | `1c795ef8bfa44d4ba1a835ba150467bd` | cb822d6f; fourteen named runtime files; requested host tv-dator |
| [#821](https://github.com/psvensson/lagrange-lab/issues/821) | `48e77e2c48ca4c90a242a431bbc91d35` | cb822d6f; declared npm ci, shard audit, explicit-1262e9c9-base fast-static and tracked-tree check |

Both retain expiry `2026-10-22T17:28:18.350Z`. The static part's base64 bytes
decode to exactly 1,115 bytes, SHA-256
`af86457b7316bd121fe60248c689533cf510cef44b5dee1e44e8ed85fac84261`.
The envelope, packet and part digests agree, and the decoded intent equals the
retained intended object. This is payload integrity and submission-shape
verification, not evidence of controller admission or workload execution.

The reviewer also read the immutable declared controller/protocol revision
`439961a1580b5f6c444542c5a5cd69d7c0757850` directly. In
current_protocol.py:58–63 and :110–115, the issue body is parsed directly with
json.loads; Markdown fences are not stripped. recover_intent at :173 and
:197–203 parses each comment body the same way and ignores unparsable part
comments. In current_controller.py:294–298, validation precedes assignment of
the request id; the exception handler at :338–340 can post a refusal only after
that id exists. Thus the initial fenced issue bodies could leave no refusal
comment. The root's retained account of that initial submission mistake is
consistent with the named parser source. GitHub's current readback proves the
correction, not the historical body bytes before the in-place edit or the
currently running controller process's state.

This is correctly recorded as a submission error, separate from any candidate
test outcome. Correcting the same request and part objects avoids manufacturing
a duplicate execution request or changing the test treatment.

### What the operational evidence establishes

At the independent readback immediately before 2026-10-22 15:42:00 UTC, #820
had zero comments and #821 had exactly one comment: the corrected payload part,
not a controller receipt. The earlier raw-JSON nonexecuting
[ping #819](https://github.com/psvensson/lagrange-lab/issues/819), request
`a58d9a51d4ae4aa4b07d8be3315c1822`, also had zero comments. None of these reads
supplies an admission, assigned host, execution start or terminal result.

The reviewer directly read the
[operator record](https://github.com/psvensson/lagrange-lab/issues/657#issuecomment-6344538276).
It identifies the missing observation as the controller account's actual
lagrange-lab-bridge.service status and recent user journal, and reports no
connected direct controller shell. It does not diagnose service failure,
rate exhaustion, worker capacity or another cause. The separately corrected
submission format explains why the original candidate bodies were inadmissible;
it does not establish why the corrected bodies or earlier plain-JSON ping
still lack acknowledgment.

Consequently the accurate current blocker is **unobserved lab intake and
execution**, not a candidate runtime failure and not a proven empty queue or
stopped controller. Candidate execution, thermal and container scopes remain
unobserved; none is claimed closed. Earlier baseline/export closure receipts
still apply only to their own already completed work. The local static result
is not relabeled as lab #821 and does not replace the pending native runtime.

Root retains ownership of the existing #820/#821 identities. The checkpoint's
next step is appropriately to recover/observe the existing controller path and
inspect these requests, including expiry and any retained execution state,
before issuing any successor. This review authorizes no controller restart,
reinstall, credential change, duplicate request or additional execution. No
such action was performed by the reviewer.

### Reviewed record binding and preservation

The following local evidence bytes were independently hashed after the
checkpoint wording correction:

| Artifact under evidence/ | Bytes | SHA-256 |
| --- | ---: | --- |
| MEASUREMENT-retained-cb822d6f-local-static-2026-10-22.json | 2,152 | `7f81cfe9b0b32b1d959e756bfc100455ddf7779995afc8b2ba856a797ddfc6ce` |
| STATIC-retained-cb822d6f-local-fast-static-2026-10-22.txt | 628 | `cbae8b28e6df2663c3052aacc2628fefbe05b26d9f1ddeffaeb92124fa985c7c` |
| REQUEST-retained-format-correction-2026-10-22.json | 3,031 | `be9367fcbe8fccd395f22971ea270f531282a5bbff7d5638db7fdb0d36be790c` |
| REQUEST-retained-candidate-cb822d6f-2026-10-22.json | 16,087 | `a2354d25b26fb939134687e889e71f8ec72c2dcdc74aff010c9e2c26909fba09` |
| CHECKPOINT-retained-history-2026-10-22.md | 10,798 | `af4a8a5f4ea6a5a496b1acbcf0258bc535864b1c57afb084e7845a2f0b24751c` |

Preserving these additional proof records on a separate evidence branch keeps
the requested candidate ref at cb822d6f. It does not create a new tested source
revision or a passing runtime checkpoint. All prior scope limits, baseline RED
evidence, the normal-hook RED and the eight unchanged handoff receipts remain
in force.

Only this review artifact was appended by the reviewer. Read-only source,
Git-object, log and GitHub mailbox observations were used; no runtime or static
gate was rerun, no source/test file changed and no GitHub mutation made. The
preceding 48,036 bytes remain unchanged with SHA-256
`11c897c9171a7ef3a633d10a7ff6d7c5d4624afa76be0bee35839d2a42c21517`.

## Entry 7: terminal lab evidence and RF3 diagnostic successor - RUNTIME RED; DIAGNOSTIC APPROVE

### Disposition and reviewed scope

**ACCEPT #821's exact-candidate metadata/fast-static PASS at its stated scope;
CONFIRM #820 as a setup failure without an assertion verdict; CONFIRM #835 as
a runtime RED; APPROVE the diagnostic-only witness successor and its attempt
plan.** There is no root-cause verdict for the RF3 failure and no passing
candidate runtime checkpoint. The independent bounded production-source
approval in Entry 4 remains valid; this result limits what its witnesses have
measured, rather than converting that approval into a complete-unit pass.

All three completed jobs name
`cb822d6fcf8c7b78b34a718772d06488490bc0da`. The reviewer directly inspected
their terminal receipts and evidence receipts, then independently checked the
retained measurement records and complete log bytes. Local proof-branch HEAD
at this review is `3a08f9421a116fc4ef0632eddf8a0b0e81201976`. Its src tree and
the candidate src tree both equal
`d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba`; the working production tree has no
diff from cb822d6f. Among test files, the only current diff from cb822d6f is the
diagnostic change reviewed below. The runtime and impact contracts remain
byte-identical to the Entry 4/5 approvals. No production repair is proposed by
this entry.

### Original runtime request #820: setup failure, no assertion result

[Runtime #820's terminal receipt](https://github.com/psvensson/lagrange-lab/issues/820#issuecomment-6345913972)
records request `1c795ef8bfa44d4ba1a835ba150467bd`, actual host
`lenovo-laptop`, COMPLETE/FAIL with SETUP_FAILED and exit 1, finished at
`2026-10-22T16:32:57.850Z`. The worker reports zero completed test files.
Execution, thermal and container scopes are closed.

The complete emitted failure is npm ci's
`Cannot read property '@bytecodealliance/jco-transpile' of undefined`.
It contains no Node-version observation and no TAP execution. Neither a
specific Node version nor the precise npm failure cause is proved by this
log. This is retained as an execution-setup failure, not a negative result
against the candidate's application assertions.

[Evidence #830](https://github.com/psvensson/lagrange-lab/issues/830#issuecomment-6346056053)
returned the complete 312-byte controller text at offset zero. Its hash is
`4f246d622df9b87a9158db9a28fee1f8801e2a08caf47461ff930e840c55e185`.
Removing the one exact `[lenovo-laptop] ` controller prefix and its one added
trailing LF reconstructs the complete 295-byte worker log, SHA-256
`96820439ebe295e9f6370ba018866c78ad74a0c704c47d02108fc85efb8cb3bb`.
Both hashes, lengths and the exported text agree with the local retained file
and terminal receipt; worker log_truncated is false.

### Original static request #821: bounded PASS

[Static #821's terminal receipt](https://github.com/psvensson/lagrange-lab/issues/821#issuecomment-6345926592)
records request `48e77e2c48ca4c90a242a431bbc91d35`, actual host `tv-dator`,
COMPLETE/PASS with exit 0, finished at `2026-10-22T16:33:36.117Z`. All three
physical scopes are closed. This is the actual previously pending lab request;
Entry 6's local static run is retained as a separate earlier observation.

The complete log reports successful npm ci and current shard classifications
for 2,440 files: 2,114 unit, 109 integration, 210 bootstrap, three convergence
probe and four packaging. Fast-static uses the explicit committed base
`1262e9c9b306b7289e9768f6ca8cce8f172594d9`, with 31 changed paths and 12 changed
JavaScript paths. All fourteen emitted checks are ok. The final explicit
statuses are metadata_exit 0, fast_static_exit 0 and tracked_tree_exit 0.

[Evidence #833](https://github.com/psvensson/lagrange-lab/issues/833#issuecomment-6346097342)
returned the entire 2,129-byte controller text at offset zero, SHA-256
`a4574f437191305b534ca957f3f9aa8d3daf88fa99a0f3a332e790433f1dff7b`.
The same prefix/single-LF reconstruction yields the entire 2,117-byte worker
log, SHA-256
`b6a90e6fa45db9b3fe9dbde5a3d836f619f4101824f46f90beee8afe149132c2`.
All lengths, hashes and exported bytes agree; worker log_truncated is false.

This PASS does not run or clear the three inherited decision-boundary findings
retained with the normal precommit refusal. It is not a corpus, publication,
complete cutover or handoff-receipt gate result. No baseline or gate was
weakened by recording it.

### Successor runtime #835: actual RF3 setup assertion failure

The preserved fresh request uses the already reviewed explicit existing
Node v22.23.2 PATH in setup and execution and invokes `npm run test:file --`
through the project runner. It retains the exact cb822d6f source, the same
fourteen selected files and the 1,800-second request budget. The HOME variable
is not changed. The complete runtime log observes Node v22.23.2 and npm
10.9.8, successful npm ci, and the actual classified project-runner invocation.
That successful treatment does not retrospectively identify #820's cause.

[Runtime #835's terminal receipt](https://github.com/psvensson/lagrange-lab/issues/835#issuecomment-6346232201)
records request `9f75118f612940b9b0eaa10445939cd9`, actual host `tv-dator`,
COMPLETE/FAIL with exit 1, finished at `2026-10-22T16:49:49.253Z`. Its
execution, thermal and container scopes are closed.

The complete project-runner output has a verdict for each of the fourteen
requested files:

| Lane | Files passed / files reported | Runner-reported assertions |
| --- | ---: | ---: |
| ordinary | 12 / 12 | 198 |
| bootstrap | 1 / 1 | 21 |
| exclusive | 0 / 1 | 2 |

Thus the emitted file results establish thirteen passing files and one failing
file. The arithmetic total of the three runner-reported assertion counts is
221; it is not the terminal receipt's generic counter. That receipt reports
completed_test_files as null and contains the last failed file's two-test
counter: one pass, one fail, zero cancellations, skips and todos. Those values
must not be presented as the whole batch's counters or a fourteen-file pass.

The frozen original-allocation-cold-inspection file passes with 24 reported
assertions, alongside the participant-origin unit file with 35, native
durable-store file with 33, original-opening-authority file with 24, the
unchanged startup HOLD file with 21, and the selected neighboring runtime
files. The baseline #814's eleven Missing expected exception leaves remain
retained as historical failure evidence; their unchanged candidate file now
has a passing file result. This is component progress within a red batch.

The exclusive integration output individually records RF1's real committed
ENABLE, cold inspection and replay case as ok. RF3 fails with ERR_ASSERTION,
expected true and actual false, at integration-test line 212:
`setup: all three replicas share one settled native frontier, term and configuration`.
Its case duration is 10,156.912566 milliseconds, consistent with exhausting
the existing ten-second predicate polling budget. This is a test assertion
failure, not a runner timeout, cancellation, missing method or npm setup
failure. The RF3 ENABLE proposal, commit-carrier interception and release,
and locally-uncommitted/committed-pending/replayed origin assertions all occur
later and were not reached. They are neither proved nor falsified by #835.

[Evidence #837](https://github.com/psvensson/lagrange-lab/issues/837#issuecomment-6346256889)
returned the entire 5,100-byte controller text at offset zero, SHA-256
`0db40ccf7bbbd64545704a82d589c59545ed6a0127a15ee00c05a245e8fa0fb1`.
Removing the exact `[tv-dator] ` prefix and one controller-added trailing LF
yields the complete 5,088-byte worker log, SHA-256
`26766783b2b83777b64a6044de65f51c8fd50782fa6675036524ab16f6bc184b`.
The reviewer independently verified each equality against the receipt and
retained file; worker log_truncated is false. All full-log and raw-receipt
evidence remains preserved.

### Causal review: established owner mismatch, failed-run cause unobserved

The reviewer traced the actual admitted-group fixture, founding stamp, native
opening and persistence path, retained-history reader, and participant-origin
reader. At cb822d6f, `settledGroup` at integration-test lines 110-117 requires
each replica to be PRE_ORIGIN; applied, commit and last indexes must all equal
the first replica's applied index; all hard-state terms must match; and raw
ConfState objects must pass isDeepStrictEqual.

The conjecture that configuration entries alone cause an UNAVAILABLE origin
observation is contradicted by the owner implementation. In
partition-participant-transaction-store.js:127-135, those entries are retained
in unclassifiedEntries. In :155-173, incomplete snapshot coverage produces
UNAVAILABLE, but complete coverage still reaches originStateOf. Presence of
unclassified configuration entries does not by itself block PRE_ORIGIN.

A separate, source-proven witness mismatch exists: raw ConfState array order
is not canonical configuration identity. The existing
raft-rs-conf-state-key.js:4-12 compares the four role sets separately and also
includes autoLeave. Its production consumers already use that authority.
The native binding's conf_state_to_json at
vendor/raft-rs-wasm/src/lib.rs:1070-1085 preserves the incoming vector order.
Requiring isDeepStrictEqual therefore imposes a representation-order
constraint that the semantic configuration owner does not impose.

However, #835 contains no per-replica values. It does not establish whether
order, membership content, frontier/term progress, coverage, or origin state
caused the failed conjunction in that run. The canonical-comparator finding
must not be relabeled as its measured root cause. A passing unmodified rerun
would likewise not identify the earlier cause. The next attempt appropriately
gathers the missing observations without changing the acceptance predicate.

### Exact diagnostic-only diff and plan approval

The reviewer independently compared the working integration file against its
cb822d6f Git blob. Its only changes are: adding an optional observation
argument to settledGroup; assigning its existing, already-read views to that
observation; passing a local holder to the initial RF3 poll and formatting
those retained values into the assertion message. No new database read, wait,
timeout, retry, native fault, transport behavior, production byte, RF1 body or
later RF3 assertion is introduced or changed.

The formatted observations identify each replica and include applied/commit/
last indexes, raw hard state, raw ConfState, native coverage, origin state,
origin reason/coverage and available origin error code/message. They are the
views captured by the actual last predicate evaluation, not a separate
post-timeout reread. The original isDeepStrictEqual comparator remains in
place. Message formatting adds no state-changing action.

Exact text reconstruction from the old file using just these diagnostic
replacements produces the current file byte-for-byte. In particular, the
411-byte predicate substring beginning `const first = views[0].native;` and
ending with its conditional return remains identical, SHA-256
`ee66713ca21d883be740894ff5fc3998f54e425d76a920b8c7a991de2c3a3953`.
The original 14,980-byte integration file remains in cb822d6f with SHA-256
`65ca59a1719825bafaae66765e37dcd47a04ff4b9fc5fc27108375487ece8776`.
The reviewed diagnostic file is 15,611 bytes, SHA-256
`46b553c0c016456a14a845868ae622358a6b662745dc3619ddc5634ff6252ea0`,
Git blob `f20f4fc235a1ee7637285f3c80d4efe286b49deb`.

**APPROVE** ATTEMPT-retained-rf3-diagnostic-2026-10-22.md and this exact
witness delta for the bounded diagnostic measurement of the existing two-case
integration file. The plan correctly requires attribution from observed
values and independent review before any correction, followed by the complete
fourteen-file neighborhood and applicable exact-candidate static checks on a
corrected revision. The diagnostic result alone is not a passing full-batch
checkpoint, a source repair, an RF3 cause determination, or an acceptance-seal
change. No diagnostic run or diagnostic commit exists as an observation of
this review entry; final commit/result binding must be recorded separately.

### Exact retained artifact binding

Hashes below are SHA-256 over raw file bytes, without newline or encoding
normalization. Git blob identity was independently obtained with git
hash-object, without writing the object. Log evidence comparison uses the
UTF-8 bytes of the complete exported text and the exact prefix/single-LF
reconstruction described above.

| Artifact under evidence/ | Bytes | SHA-256 |
| --- | ---: | --- |
| MEASUREMENT-retained-cb822d6f-original-lab-2026-10-22.json | 13,488 | `dcf7c0d8fa686c070f92c7a58b9b12cb9deee698daff9a676e01566a02a4bcf0` |
| RUNTIME-retained-cb822d6f-setup-failure-2026-10-22.txt | 312 | `4f246d622df9b87a9158db9a28fee1f8801e2a08caf47461ff930e840c55e185` |
| STATIC-retained-cb822d6f-lab-2026-10-22.txt | 2,129 | `a4574f437191305b534ca957f3f9aa8d3daf88fa99a0f3a332e790433f1dff7b` |
| REQUEST-retained-cb822d6f-runtime-successor-2026-10-22.json | 7,197 | `f824c09dde5f957d37a1994e62134096c10789787fc588411cb95f91703ac026` |
| MEASUREMENT-retained-cb822d6f-runtime-failure-2026-10-22.json | 20,828 | `6f3ebae60a98ab65bca166ad2925e7932afffe031e808711dc570e104cb2b31c` |
| RUNTIME-retained-cb822d6f-candidate-failure-2026-10-22.txt | 5,100 | `0db40ccf7bbbd64545704a82d589c59545ed6a0127a15ee00c05a245e8fa0fb1` |
| ATTEMPT-retained-rf3-diagnostic-2026-10-22.md | 2,766 | `55e28de017d659d1463241eb65fb6ae4a2c65bbcdbcab6b37a953497913eaa02` |

The frozen malformed-history witness remains exactly 12,401 bytes, SHA-256
`a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d`.
All prior source-manifest bindings, startup CLASSIFICATION_UNAVAILABLE and
CONTINUATION_UNAVAILABLE ceilings, original baseline failures, independent
reviews, normal source decision-audit refusal and eight unchanged handoff
receipts remain preserved. No public startup, serving, durable transfer,
publication or main-merge approval follows.

Only this append-only review artifact was changed by the reviewer. No
source/test/contract file, Git object, GitHub object or lab request was
mutated, and no runtime or static gate was executed by the reviewer. The
preceding 56,987 bytes are unchanged with SHA-256
`acede71deb8b5671375a92e7e7dfbf4db8a21f7dab38f9afd5501533719dd608`.

## Entry 8: measured RF3 oracle defect and canonical identity correction - APPROVE; runtime remains RED

### Disposition and exact diagnostic source

**CONFIRM the ordered-configuration comparison as the sole false conjunct in
#842's captured last predicate evaluation; APPROVE the bounded witness
correction and its attempt note.** No production correction or complete
runtime pass is claimed. This finding directly attributes the observed
diagnostic evaluation. The earlier #835 run did not capture its values and
remains separate historical evidence; its exact false conjunct is not
retrospectively proved by this later run.

The diagnostic ran exact commit
`164479277f58f6075e0c6bfd214ba3d2654da3db`, repository tree
`4042eab2ecff6e922af97ad5f9c415efa07c0051`. The reviewer independently read
that commit's integration-test blob: it is exactly the Entry 7 approved
15,611-byte diagnostic witness, SHA-256
`46b553c0c016456a14a845868ae622358a6b662745dc3619ddc5634ff6252ea0`,
Git blob `f20f4fc235a1ee7637285f3c80d4efe286b49deb`. The diagnostic src tree
remains `d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba`, identical to cb822d6f.
The current production worktree also has no diff from cb822d6f. The prior
production review is preserved without repeating or widening it here.

### Terminal result and independent complete-log binding

The reviewer directly fetched
[#842's terminal receipt](https://github.com/psvensson/lagrange-lab/issues/842#issuecomment-6346735121)
and [#848's evidence receipt](https://github.com/psvensson/lagrange-lab/issues/848#issuecomment-6346763568).
Their complete decoded objects equal the corresponding retained measurement
objects. The local raw log equals the independently fetched evidence text
byte-for-byte.

Request `f50591d655414733be82f4c4903dc287` completed on `tv-dator` at
`2026-10-22T17:14:45.361Z`, outcome FAIL and exit 1, naming the exact diagnostic
source above. The worker reports one selected file, two tests, one pass, one
failure, and zero cancellations, skips or todos. Its completed_test_files
field is null; the emitted runner output supplies the single failing file
verdict. Execution, thermal and container scopes are all closed.

The complete output observes Node v22.23.2 and npm 10.9.8, successful npm ci,
and the project `npm run test:file --` invocation of only the existing
two-case integration file. It records the normal thermal hold before test
execution and then an allowed temperature; it does not show a test timeout
or thermal abort. RF1 passes. RF3 fails its initial settled-state assertion
at test line 214 with ERR_ASSERTION, expected true and actual false, before
ENABLE, commit-carrier interception, or any RF3 origin transition is reached.

The controller log is exactly 4,148 bytes, SHA-256
`8629963aae172e2b2e822cfc4d908f7c996307453bd3cc4daae66281c689df38`.
Evidence #848 returns all 4,148 bytes at offset zero with the same chunk hash.
The reviewer independently removed the exact `[tv-dator] ` controller prefix
and its single added trailing LF, recovering the complete 4,136-byte worker
log, SHA-256
`9c026fea331428be27d1c0c794b23fbd2de172032f4a8436e7dc2ea8a5e27cda`.
Both hashes and lengths match the terminal receipt; log_truncated is false.
No runtime command was rerun during this verification.

### What the captured predicate values establish

The reviewer parsed the JSON views directly from the raw failure message and
independently evaluated every original conjunct using those values. The
result equals the retained measurement's lastPredicateViews and
lastPredicateChecks. The diagnostic stores the actual views before evaluating
the unchanged predicate, so this is the final evaluated sample rather than
a later database observation.

| Replica | Applied / commit / last | Term | Origin state | Coverage | Ordered ConfState equal to r1 | Canonical role identity equal to r1 |
| --- | --- | --- | --- | --- | --- | --- |
| r1 | 3 / 3 / 3 | 1 | pre-origin | complete | true | true |
| r2 | 3 / 3 / 3 | 1 | pre-origin | complete | true | true |
| r3 | 3 / 3 / 3 | 1 | pre-origin | complete | false | true |

The native and origin coverage fields both read complete. For r1 and r2,
voters are ordered as
`[4026241048186186741, 625587603728697910, 8106538631273010085]`.
For r3 they are ordered as
`[625587603728697910, 4026241048186186741, 8106538631273010085]`.
These identifiers are exact decimal strings in the raw log. Learners,
outgoing voters and next learners are empty on every replica; autoLeave is
false on every replica. Only the first two voter positions differ. Hard-state
vote values need not be equal and are not a conjunct of the original setup
predicate; hard-state terms are equal as required.

Thus the observation is not an origin-state, snapshot-coverage, frontier,
term or membership-role mismatch. The ordered ConfState test is the sole
false conjunct in the captured evaluation. This is a measured witness
identity defect at that boundary. It does not demonstrate a retained-origin
production defect, and the untouched RF3 transition assertions remain
unmeasured. The sample does not provide an observation history for every
earlier poll or values for #835.

### Exact correction and oracle-strength review

The complete working correction removes the unused node:util
isDeepStrictEqual import, imports the existing raftRsConfStateKey owner, and
replaces only the configuration conjunct with equality of the two canonical
keys. The reviewer reconstructed the current file from the exact 16447927
blob using those three text replacements; the result matches the current
file byte-for-byte. No other integration-test bytes changed.

The existing owner at src/raft/raft-rs-conf-state-key.js:4-12 preserves the
distinction among voters, outgoing voters, learners and next learners and
includes autoLeave. It makes array order irrelevant without merging roles,
discarding members or consulting cache projections. The native history
reader still validates the configuration before this comparison; the witness
does not substitute canonical equality for that validation or rewrite any
persisted data. No new configuration implementation or fallback is added.

Every origin, applied/commit/last frontier and term conjunct remains exact.
The diagnostic capture/message, entire RF1 case, all RF3 code after the setup
check, finite deadlines, fault and carrier controls, and actual native
history/replay assertions remain unchanged. The admitted-group fixture and
production source are unchanged. This is a correction to the witness's use
of existing configuration authority, not a relaxation of the requirement for
one settled native configuration and frontier.

**APPROVE** this exact 15,673-byte corrected witness, SHA-256
`667cca126f8a6d36fea0b9aadc7a529740e67f1e6b6db025f2b185ad190403ca`,
Git blob `232d8daccc3e00a04b6dba8594bccb8fc64a1993`, and
ATTEMPT-retained-rf3-configuration-identity-2026-10-22.md. The attempt correctly
requires the original fourteen-file runtime selection and applicable
metadata/fast-static checks against one frozen corrected revision. The RF3
locally-uncommitted, committed-pending and normal replay observations must
actually engage and pass. No corrected-source commit or corrected runtime
result is asserted by this entry; those require their own later binding.

### Reviewed artifact bindings and preserved limits

The following SHA-256 values were independently computed over complete raw
bytes without normalization. Git blob identities use git hash-object without
writing an object. The source comparison and exact-diff reconstruction were
read-only; no application runtime or test was executed locally.

| Artifact under evidence/ | Bytes | SHA-256 |
| --- | ---: | --- |
| REQUEST-retained-rf3-diagnostic-16447927-2026-10-22.json | 4,621 | `63f588645974486ad5497d170eeb3051d2162653d97061e10ecb34e7e1498faf` |
| RUNTIME-retained-rf3-diagnostic-16447927-2026-10-22.txt | 4,148 | `8629963aae172e2b2e822cfc4d908f7c996307453bd3cc4daae66281c689df38` |
| MEASUREMENT-retained-rf3-diagnostic-16447927-2026-10-22.json | 16,840 | `2a15e8987af8294df17866e4cdd3482b5a796f59ff3e909aa5cfdb2d79709839` |
| ATTEMPT-retained-rf3-configuration-identity-2026-10-22.md | 2,555 | `11c27093c034dd2f218d220980163900c2498f608b69d8fc827c441116a3d004` |

#835 and #842 remain RED with their complete logs preserved. #820 remains a
separate setup failure, and #821 remains a bounded static PASS on cb822d6f;
it is not a static receipt for the corrected witness revision. Results from
these revisions are not pooled into a new test total. The inherited source
decision-audit refusal, all eight handoff receipts and the unavailable startup
ceiling remain unchanged. This review grants no public startup, serving,
transfer, publication, main merge or complete-cutover acceptance.

Only this append-only review artifact was changed by the reviewer. No
production/test/contract bytes, Git objects, GitHub objects or lab requests
were mutated by the reviewer. The preceding 71,426 bytes remain unchanged
with SHA-256
`5cf01392c0d21adc863463918eb03b466b289210a9d0b3a479eabe370e8479ab`.
