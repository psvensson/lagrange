# Snapshot receiver admission — measured result and review request

Status: focused behavioral and boundary proof passes. Independent approval,
full static closure, Quest landing, main integration and release remain OPEN.

Source input: `4981aad1ed8eef5784f531a5cccc0b76b477ae01`.
Local measured source: `7d91de9ff1cf8d4a8c24558603b97d75e75db0e3`.
Hosted measured source: `57ea865bff5e66f6c972e745cb36e43a89bf53b2`.
Source/evidence publication: `6f249dcf361944d47dd6a1d01880648097246ab6`.
Run: `38288795997`; artifact: `11764314047`.
Archive SHA256: `10cf44b0b038d1d63bab91c5e82b3430ac4e7ffd02b316cd3dffd1de73e782fb`.
The downloaded archive matches that digest. The bundle and every transfer chunk
were checked before Git import. The hosted merge preserves the two local WIP
commits on this existing review branch, not main or another implementation branch.
The source and test trees match exactly:
- src: `34af50ee2245c8bd99b0f87e484beb6871d11c3c`
- test: `8672c9e4fb158200c69e6b2beec6bc47bab40f32`

## Recovered cleanup work, not a duplicate implementation

The remote input already contains the reconciliation at measured `48f15d95`
and evidence `replica-cleanup-host-custody/evidence/reconciled-38272074554-1`.
Its 66 focused cases pass, with the failed-CREATE service-reference custody and
WASM successor cleanup changes included. This continuation reuses that source;
the older attached cleanup patch was NOT reapplied. This does not turn its
remaining outer-node lifetime limitations or failed wider fixtures into approval.

## Existing receiver is now checked, not just the scrubbed staging copy

Review comment 4247979520 identified that the prior staging helper could mint a
fresh lifecycle row while a rename erased a conflicting or retired receiver.
The new read-only `inspectReplicaLifecycleForSnapshot` remains in the existing
lifecycle owner. It inspects the receiver file before staging, again inside the
existing CREATE commit/swap boundary, and during STAGED restart recovery.

For native FRESH_CREATE, only an absent file, an empty native/lifecycle shell
under existing CREATE authority, or exact ACTIVE/NEVER_OPENED allocation with no
native rows is accepted. Retirement, foreign or conflicting identity, legacy
UNKNOWN, ESTABLISHED history, any surviving native row, unreadability, and pending
WAL/rollback journal bytes refuse. A matching never-opened incarnation is retained
in the imported ESTABLISHED row rather than reminted.

The snapshot interaction helper consumes validated descriptor identity and the
lifecycle result. It is not another lifecycle authority. Final swap and STAGED
recovery both revalidate receiver/staging identity and the existing native image,
original receiver digest, install ID and exact CREATE binding. A WAL-only receiver
change cannot hide behind an unchanged main-file digest. An old unsafe STAGED
marker cannot authorize erasing a retired receiver even if its old digest matches.

Existing CREATE authorization, exact claim/physical-worker serialization, marker
states, private staging and atomic rename remain necessary. No new durable record,
lifecycle database, timeout, general reseed or live-catchup permission is added.
Established receiver history is conservatively refused by this FRESH_CREATE path;
that is not a new repair protocol for live replicas. The closed-handle/sole-worker
contract is a prerequisite, not a claim to fence arbitrary external file writers.
The local check cannot replace external prior-existence after total file loss.

## Exact measurements

The same 72-case native integration source was used in all three arms:
- Original source: 56 pass / 16 assertion failures.
- Corrected source: 72 pass / 0 fail.
- Source-only revert: 56 pass / the same 16 assertion failures.

All three have native test SHA256
`b212ad9139fa03cd3ad698d2a1e853eb9e5e2cfb46a2548c16c18cb530e54444`.
Negative arms reached ERR_ASSERTION, not import/setup failures; names and counts
match. Existing real learner, checkpoint and CREATE fixtures are used. Cases cover
retired/conflicting/foreign/unknown/established receiver history, contradictory
never-opened/native state, unreadable files, absence and fresh shells, retained
incarnation, WAL-only changes across awaited admission, interrupted pre-rename
recovery, unsafe historical markers, staged incarnation/retirement changes and
orphan journals. Interruption is an injected pre-rename exception, not SIGKILL or
power-loss certification.

The 21 staging/API/import tests pass, making 93 focused cases. The seven new
import-boundary cases are candidate boundary tests, not old-source defect claims.
The audit permits only the named inspection symbol at the snapshot interaction
helper and the existing preparation symbol at the installer; class, mixed,
namespace, dynamic, re-export and unrelated-caller access remain rejected.

Ten additional selected files pass: snapshot transition/restart, checkpoint image
transfer, fresh learner snapshots, native opening history, opening refusal,
startup cleanup, host cleanup custody, shared runtime replacement and durable sync.
Three of those are legacy TAP assertion files; their leaf totals must not be added
to Node case totals. Raw results and file selection are retained. The six known
partition-unreadable failures and the existing replica-handler failure are NOT in
this green subset, NOT repaired and NOT waived by these measurements.

Focused ESLint, changed-production literal checks, impact registry, actual operation
boundary and incremental whitespace pass. Registry: 62 contracts / 33 coupled pairs.
Maximum hosted focused integration case: 3441.697051 ms; staging case: 13.046667 ms.
All measured Node cases meet the operator's 10x elapsed tolerance. Three legacy TAP
files have no parsed Node duration; no per-case timing claim is made for them.
No semantic, election, lease, retry or caller deadline was increased.

The full guideline command remains RED: 311 new literal violations, 1266 inherited
matches. Later chained checks are not claimed green. The current incremental
whitespace pass does not resolve historical retained-patch formatting findings.
`focusedProofPassed=true`, `allRunGatesPassed=false`, `mergeReady=false`.
The workflow intentionally retains that overall failure. Quest receipts remain
unapproved; test summaries are not fabricated into independent Solver verification.

## Local apparatus limitations retained separately

The local package retains the first draft baseline, which included two positive
assertions against a nonexistent record.groupId and an insufficient WAL mutation
setup. Those fixture issues were corrected BEFORE production changes. The final
three-arm measurement uses identical final tests and is the proof cited here.
Three manual transfer attempts returned unexpected blob hashes; those blobs were
rejected and never referenced by an execution or source tree. Correct chunks and
the whole bundle matched the prerecorded hashes. No transport repair, source
rewrite or test weakening occurs during the hosted execution.

## Independent review requested

Read the current Quest design, source trees, baseline/candidate/source-revert
records and exact raw artifact. Review recovery-replay, admission-gating,
concurrency-serialization, owner-interaction and harness-fidelity. Attack every
path into normal swap and STAGED resume; lifecycle/native contradictions and
multiple rows; read/close errors; WAL/rollback journals; exact incarnation custody;
current CREATE/marker binding; staged-image tampering; failed publication; and the
scope distinction between FRESH_CREATE and live catchup/reseed. Verify that the
same lifecycle owner, rather than copied decision logic, grants the receiver fact.

The new matrix is in-process native three-replica fixture evidence. It is not
physical multi-host certification, arbitrary-writer isolation, all storage-fault
permutations, full SQL/CDC startup, transaction migration or whole-release proof.
A separate Copilot source review is requested; no directly launched subagent or
approving Solver verdict is represented here.

The seven-finding ownership disposition remains binding. Findings 1/3 still need
genuinely admitted legacy/new transaction witnesses and explicit old producer /
consumer retirement. Opening-history and cleanup candidates retain their review
and coverage obligations. Timing/profile/retry/formatting-only maintenance remains
deferred. Complete required static checks, real partition/TX1 admission, independent
acceptance, exact integrated startup/restart, complete FreshMG replacements,
seed-storage-loss and physical lab proof remain ahead of main merge.
