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
