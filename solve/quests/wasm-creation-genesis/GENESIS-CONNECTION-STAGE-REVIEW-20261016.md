# Held bootstrap to deterministic genesis: pre-source author review

Base: 50c64ac476bca16c607d42e8c11d3b8606a01f53 (PR132).
This is a bounded continuation inside the existing R2 creation/genesis Quest.
The operator asks this ChatGPT session to review each stage; this is author
review, not an independent verifier or terminal Solver receipt.

## Decision and connection

ACCEPT for implementation/measurement: repeated start of the same retained
creation through ServiceLifecycleManager -> runtime lifecycle -> WASM driver ->
WasmServiceLifecycle constructs INIT from the already durable common binding.
WasmWriterCompletion remains the sole bounded local interest owner;
WasmWriterState remains sole application/receipt authority; the native operation
port and canonical committed-membership validator remain membership authority.
No caller-supplied initialization bytes, replacement definition, new nonce,
local arbitration, new timer, or second proposal/completion path is introduced.

Before claiming genesis observed, the local applied receipt must match exact
canonical INIT and be covered by the same native group's applied committed
membership. Its complete voter identities must equal the canonical founding
set and its participation gate must be open. A valid receipt is not current
membership, and a membership hint is not an applied receipt. Both are needed.
A stale/refused/unavailable/malformed membership read cannot be hidden behind a
previously green result. All results remain BOOTSTRAPPED_HELD: no metadata grant,
local PUBLISHED record, ACTIVE/endpoint projection, user admission or terminal
creation result is enabled by this increment.

The original held-bootstrap API remains a bootstrap/reentry surface. The first
call may precede election and returns held. An existing lifecycle reentry drives
INIT when the replica leads; followers can observe their applied matching fact.
This stage does not claim an automatic leader-event/reconcile wake, production
selection-request persistence, actual artifact validation, a first-opening gap
repair, semantic retirement, metadata quorum or physical multi-host proof.
Those required connections stay open rather than adding a provisional scheduler.

## Planned witnesses

Use the existing native RF3 fixture, with its explicitly disclosed component
metadata/journal, virtual clock and queued real native transport. No fixture
submits the successful INIT in the new positive: only lifecycle reentry does.
Prove exact original command/receipt/membership, held sinks and fixed identity;
withhold genuine native replies to show submission is not completion; retain
UNKNOWN at the original interest deadline; restore transport and recover the
same initialization. Exercise shutdown while completion is owed, repeated
concurrent delivery, incorrect same-incarnation INIT nonce, unavailable or
incompatible membership and retained file reentry. Read-adapter faults are
not called native joint-transition proofs.

Source-only negative controls must remove one actual command-binding or
membership requirement with unchanged tests. Tests and review are recorded
before production changes. Keep every first failure, distinguish missing
capability from semantic violation, and do not retry tests until green.

## Static and preservation boundary

The reconstructed cloud workspace has source/test trees identical to PR132.
It is not remote Git ancestry and must never be pushed. Publication must use
the actual remote base and verify every changed postimage. Scoped pre-source
complexity/cognitive results are retained externally with this stage evidence.
Global static/corpus and previous analyzer-memory debt remain open; no gate,
limit, timeout, retry, thermal rule or sealed receipt is changed here.

## First measurement and bounded timing correction

The five-case baseline gave five failures: missing production INIT continuation
and an actual same-incarnation/different-nonce INIT accepted by the old root
check. The first candidate gave two pass / three fail. A lossless diagnostic
addition identified GENESIS_APPLICATION_NOT_COVERED rather than a timeout.
Source inspection confirms the existing writer waiter resolves after SQLite
commit, before the runtime owner publishes its next applied/membership
observation. That owner later emits APPLIED_PROGRESS; the older membership
answer cannot cover the new INIT receipt yet. The no-quorum and shutdown
witnesses already passed. An earlier container-level command ceiling interrupted
a run without a result and is not a semantic test failure.

Author review rejects making a stale membership observation sufficient or
adding a hidden tick/drain/polling completion driver. The healthy witness now
explicitly requires GENESIS_HELD/APPLICATION_NOT_COVERED on that first known
schedule and GENESIS_OBSERVED on one explicit normal lifecycle reentry after
the native delivery schedule completes. The final membership/receipt equality,
no-publication, and held-user assertions remain mandatory. This replaces an
unsealed fixture assumption of immediate membership-observation publication;
all earlier test bytes and failures are retained. This stage does not claim
the external APPLIED_PROGRESS-to-reconcile wake is already wired.

## Expanded source review: two engaged defects

The twelve-case extension first gave 10 pass / 2 fail. The new await in START
allowed shutdown to close the actual database/native port while the stale
start still returned BOOTSTRAPPED_HELD. The lifecycle now checks the exact
registered replica and its live initialized state after the awaited genesis
continuation, using the existing STOPPED_DURING_START refusal. The second
fault changed the real retained INIT receipt's accepted outcome to false;
the new continuation incorrectly treated RECORDED as accepted. It now consumes
the writer owner's explicit accepted field before constructing an observation.
Both new assertions remain unchanged in the corrected-source comparison.


## Final fourteen-case extension and structural checks

The held-bootstrap neighbor and first twelve genesis cases remained positive.
A new orderly-reopen case also passed. The new different-cohort fault initially
failed its own valid-stamp precondition: it compared raw peer IDs to the resolved
leader replica ID and removed the leader. The fixture now consumes the stamp's
identity mapping to remove a follower. The valid-stamp assertion and the required
refusal remain unchanged; this was an apparatus defect, not a product refusal
proof. No production source changed for that correction.

Two complexity findings of 13 in the new module were resolved by separating the
pure founding-membership predicate and unresolved-writer-result mapper. The
threshold remains 12. Source semantics and existing witnesses are unchanged.

## Frozen-source review before lab measurement

The final fourteen-case suite passes locally, as does the unchanged sixteen-case
held-bootstrap neighbor. Two source-only controls were exercised with unchanged
final test bytes: removing exact INIT content admission produces RECORDED instead
of REFUSED; removing the native participation-gate predicate produces
GENESIS_OBSERVED instead of GENESIS_HELD. Each has thirteen controls passing and
one intended semantic failure. Both source files were restored byte-for-byte.
These local observations authorize exact-source lab measurement, not whole-stage
or release acceptance. The final test source is distinct from the initial
five-case baseline and includes the disclosed review-driven fixture correction.

Scoped lint, strict new-module/test complexity and cognitive checks, literal,
decision-boundary, deferred-outcome, silent-catch, boundary-mode and runtime
grammar checks pass. The decision audit matches four inherited baseline entries;
the ambient-intrinsics checker governs none of these files and supplies no
additional coverage. Canonical metadata/shard checks describe 2401 tests and the
extended existing interaction remains 66 contracts / 37 coupled pairs. No full
hook, global inventory, impact-cone or corpus success is asserted by this stage.
