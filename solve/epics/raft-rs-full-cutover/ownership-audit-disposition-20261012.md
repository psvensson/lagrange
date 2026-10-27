---
audience: development
documentClass: planning
---

# Ownership audit: complete disposition, not merge approval

Operator input: source audit of `62ed226b6bd007d522738879c36b3daf155aa2bf`, supplied
as Pasted markdown(20261012-112429).md, SHA256
`f87be3b226419989bd1a229687a13dc6e6811f155a011382159ef24bb5e0ae15`.
The original file remains in the conversation and local evidence package. It was
a source audit, not a test run. This disposition preserves all seven findings,
their order, priorities and explicit non-consolidations. It does not supersede
sealed TX1 acceptance or claim implementation of every finding.

Rechecked input: PR117 at `d93065458382aad493557f084b5e3afc3f060d1d`.
The local reconstructed workspace has exactly that complete production tree,
`f8811d2f569120d275b9a903fdec0ac47c3e4586`; its whole Git commit is different.
All work remains on the existing resume/rs-raft-runtime-recovery-20261012 branch.
No competing implementation or FreshMG stack branch is created.

## 1. Two transaction execution models

Owner: replicated-transaction-decision-and-apply and its existing release/cutover
interaction. Status: OPEN migration acceptance, not permission to delete legacy
execution now. Legacy local COMMIT/marker/CDC and replicated participant PREPARE,
row and decision processing still coexist behind L6. Preserve that fence.

Required proof: establish a genuinely admitted legacy session; preserve or settle
all its committed/unknown obligations through its existing owner; refuse new-
protocol admission while the legacy reservation remains; after cutover, show that
only durable participant rows authorize new preparation, decision and recovery.
A fixture that ignores a refused legacy BEGIN does not establish the precondition.

Explicit cutover deletion deliverable: inventory and retire legacy BEGIN/COMMIT/
ROLLBACK, local preparedTransactions, reconstruction, expiry, CDC, session and
error-handling producers AND consumers after migration proof. Name every caller,
committed-log replay consumer, remaining obligation and retained outcome. Keep
historical decoding needed to settle retained records without allowing fresh
legacy execution. Successful coexistence is not the permanent target design.

## 2. WASM prior-existence

Owner: opening admission across existing lifecycle, runtime and host/service
adapters. Status: REPRODUCED PRE-MERGE SAFETY BLOCKER; not fixed here.

Two new tests use real WasmServiceReplica, native raft-rs and SQLite. Both commit
a KV write and close normally, retaining application data and the active receiver
lifecycle row. The intact restart control passes. Deleting only the group's
native log/hard/applied/snapshot rows causes the current WASM path to open fresh
genesis rather than refuse lost history. The new test remains a normal failing
safety assertion, not an expected-pass negative or a source-level hypothesis.

Required repair: one authoritative opening-admission contract, consumed by all
three service kinds, including the existing host prior-existence and deferred
identity-record fields. No second lifecycle database. Distinguish NEVER_OPENED,
established native history, and unavailable/unknown history through existing
owners. A surviving lifecycle row alone is insufficient: refused constructors
can create that row without participating, and their legitimate retry must still
work. Missing Raft history is likewise not proof of a fresh store.

Required positive/refusal witnesses: fresh opening; intact restart; surviving
lifecycle with missing history; partial/unreadable history; refused never-opened
constructor followed by ordinary retry; stale or failed identity-record promise;
restart after recorded reseed; host-confirmed prior identity with complete local
file loss. No vote, campaign, proposal or new genesis before admission. Do not
claim full-file-loss proof from the survivor-row case. Any new durable fact must
remain in the existing lifecycle owner, ordered with native-history commit and
covered at its crash boundaries. Independent review is required before landing.

## 3. Prepared reconstruction and timeout models

Owner: the same TX1 migration as finding 1. Status: OPEN proof/removal obligation,
not another transaction engine or independent migration Quest.

Keep legacy reconstructPreparedState and expiration explicitly old-protocol-
scoped until their removal is proven. New durable participant rows alone own new
PREPARE/decision/recovery. PREPARED is not an ordinary session timeout. Expiry,
rollback, lost BEGIN answers and restart of legacy machinery must not clear,
admit over or declare completion for a new participant reservation. Preserve
in-flight PREPARE, bound decisions and outstanding obligations across split/merge.

Current fixture execution is not migration proof. The participant staging file
reports 16/20 passing with four failures; the legacy-session file has failures
and the combined outer run was interrupted. At least the opposite-direction L6
case ignores beginTransaction's result; that method now applies the legacy fence
itself. Refused setup does not demonstrate overlapping reservations. Retain reds;
repair genuine admission preconditions without restoring a legacy bypass or
weakening the safety assertion. Other failing cases still require diagnosis.

## 4. Snapshot installation and lifecycle authority

Owners: existing snapshot installer and replica lifecycle owner. Bounded Quest:
snapshot-lifecycle-staging-boundary. Status: IMPLEMENTED CANDIDATE FOR REVIEW;
full gates and independent approval remain open.

The new narrow prepareReplicaLifecycleForSnapshot operation returns only an
immutable receiver-local result. The existing lifecycle owner retains identity,
incarnation, row creation and refusal. No class instance, live runtime, registry
entry or retirement capability crosses the seam. Matching ACTIVE retry preserves
incarnation; conflicting/retired identities and native history without a lifecycle
row refuse. The snapshot caller must consume refusal rather than proceed.

Snapshot installation retains CREATE authority, descriptor validation, private
staging custody, native reconstruction, durable markers and atomic publication.
The boundary audit permits exactly the static named staging symbol at the
snapshot consumer, not a file-wide lifecycle allowlist. Class, mixed, namespace,
dynamic, re-export and unrelated-caller imports remain rejected. Source-only
revert restores the original audit violation. Real native snapshot authorization
regressions remain required with the new lifecycle and import-boundary tests.

## 5. Parallel membership retry bookkeeping

Owners: existing group membership admission and partition retirement. Status:
DEFERRED MAINTENANCE after FreshMG completion, not a merge-blocking refactor or
proof of competing membership authority.

Inventory ADMISSIONS_IN_FLIGHT/ADMISSIONS_DEFERRED and RETIREMENTS_DEFERRED by
command, identity, uncertain/terminal result, wake and release lifetime. Extract
only a small typed mechanical helper where failure semantics actually coincide.
Keep current leader checks, CAS settlement, operation identity and retry-after
with existing owners. Do not add a generic scheduler or second completion path.

## 6. Election-derived timing

Owners: existing timing/configuration derivation and transfer administration.
Status: DEFERRED MAINTENANCE. Existing common helpers mean repeated calculation
is not already a demonstrated competing algorithm.

A canonical timing profile or validated calculation interface must identify the
membership/configuration snapshot. Prove equal-epoch startup and transfer use the
same profile and handle a stale profile explicitly after membership/configuration
changes. Do not increase timeouts, renew caller budgets or combine independent
shared-runtime and per-group failure clocks.

## 7. Startup refusal construction

Owners: canonical operation-port failure vocabulary and service lifecycle.
Status: shared-format consolidation DEFERRED; preserve exact consensus answers
and original remaining retry deadlines now. A later shared structure retains
code, phase, consensus, remaining budget and service-kind identity metadata.
Ordinary errors must not be reclassified. No new startup or cleanup coordinator.

Separate NEW independent-review blocker: PR117 review 5490008451 at d9306545
(comments 4247435390, 4247435452, 4247435487) identifies cleanup failures hiding
the typed refusal. This is safety work, not optional formatting. Preserve the
primary refusal AND secondary cleanup failure; retain every unfinished resource
release with the existing lifecycle owner. Fault-inject teardown of every
acquired resource and prove exact eventual cleanup and deadline fidelity. Do
not catch-and-ignore cleanup or falsely report a released connection. Still OPEN.

## Deliberate non-consolidations

FreshMG PRs #109-#115 are a stacked implementation sequence. Shared touched files
alone are not competing authority; none of those branches is changed here.

Shared WASM runtime replacement and per-group recovery have different failure
scopes, clocks and obligations. Preserve the existing replacement barrier and
separate records. Native committed membership evidence, SQL identity/CAS and
current transport-recipient checks protect distinct trust boundaries. None is
collapsed into one all-powerful coordinator.

## Additional unchanged-test finding

The prior hoisted close function exposes a mutable function prototype because
createRaftOperationPort shallow-freezes methods. The existing public-value freeze
assertion fails on the input. Reusing canonical deepFreeze fixes that assertion;
source-only revert restores the same failure. This is a separate runtime/TX1
WIP correction, not a hidden snapshot protocol change.

## Merge order and evidence ceiling

First repair/prove the reproduced WASM opening-history and startup-cleanup
interactions, retaining positive ordinary-retry controls. Independently review
the snapshot staging and recursive-freeze candidates. Prove legacy/new fences on
genuinely admitted states, settle migration obligations and execute the explicit
legacy producer/consumer removal map. Satisfy static gates without increasing
baselines; 311 previous literal failures and later unexecuted chained checks
remain open. The local whole-source boundary unit took over two seconds, despite
seven behavioral passes; retain that timing failure and measure hosting separately.

Then exact integrated startup/restart, complete fresh message-group replacements,
seed-storage-loss recovery and physical multi-host certification. Maintenance
portions of findings 5-7 follow safety. A disposition is not a closed defect.
No direct subagent, approving Solver verification, Quest land, main merge or
release is claimed by this checkpoint.

## Measured continuation and timing supersession — 2026-10-12

This addendum updates the initial dispositions above without rewriting their
historical evidence. Current source candidate:
`ff177c43c60556d6f65d09f7d610fe555fa1a1f3`; source/evidence publication:
`7036fb1bd03144837e00ec040c6ba6ae903bfe42`; run `38253337720`.
The owning unit is `replica-opening-history`, sealed through the canonical Solver.
Its result is retained at
`solve/quests/replica-opening-history/evidence/native-38253337720-1/result-and-review-request.md`.

Finding 2 now has a MEASURED SOURCE CORRECTION, pending independent acceptance.
The existing lifecycle row records NEVER_OPENED versus ESTABLISHED for the exact
incarnation; legacy NULL remains UNKNOWN. Native bootstrap and establishment
commit atomically before participation. Missing established/unknown history
refuses, while a never-opened failed constructor can retry. All service kinds
consume the same private lifecycle/runtime interaction. The old WASM loss test
passes; all 28 native cases pass versus 13 pass / 15 failures on baseline and
source-only revert, with unchanged tests. Sixteen new cases include actual
separate-process restart, process-kill boundaries, transactional rollback,
unknown legacy state and host/deferred-identity controls. Whole-file loss without
an external host fact and power-loss certification are NOT claimed. This is not
complete closure of every acceptance item listed under finding 2.

Finding 4 remains OPEN for receiver validation: review 5490741740/comment
4247979520 observes that lifecycle validation of checkpoint-derived staging does
not bind the existing receiver file before rename. Conflicting/retired or
lifecycle-less surviving receiver history must not be erased. The narrow staging
API remains; marking imported staging ESTABLISHED does not resolve that separate
snapshot admission/swap problem. Finding 7's cleanup-error masking also remains
OPEN. Findings 1/3 keep genuine-admission, legacy isolation and explicit deletion
proof obligations. Deferred maintenance and deliberate non-consolidations remain.

The user explicitly authorized up to 10x hardware-sensitive elapsed test-case
cost. `test-timing-ruling-20261012.md` and `test/guidelines/harness.md` now hold the
2/30-second targets and 20/300-second tolerance ceilings. Earlier raw timing reds
are retained, but the 5380 ms boundary case is no longer a current blocker under
this ruling. The current boundary case is 8892.961534 ms (4.446480767x target),
within tolerance. Protocol/election/lease/seed/caller/retry deadlines and assertion
or runner kill bounds are unchanged.

The current wider measurement is 172 cases: 166 pass / 6 failures, zero skipped,
todo or cancelled. All six are the existing partition-unreadable-durable-record
fixture, which also fails all six baseline setup-write assertions. They are not
storage-fault coverage or waived inherited failures. Actual boundary, focused
lint, changed literals, impact and new-delta whitespace checks pass; the full
literal gate still reports 311 above-baseline violations and later chained checks
remain unproved. Prior retained-patch whitespace disposition remains separate.
The new Quest's full receipt remains FAIL; allRunGatesPassed and mergeReady remain
false. Next: owned startup cleanup, receiver binding, real admission prerequisites
for failed partition/TX1 fixtures, independent review, then integrated certification.
