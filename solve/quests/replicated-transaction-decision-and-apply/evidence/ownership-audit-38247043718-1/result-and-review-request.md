# Operator ownership audit — measured continuation and review request

Status: snapshot/lifecycle and recursive-freeze source candidates preserved;
WASM lost-history safety refusal is REPRODUCED and NOT FIXED. All seven operator
findings are accounted for, not all resolved. No approving independent Solver
verification, Quest landing, main merge or release is claimed.

Input production head: `d93065458382aad493557f084b5e3afc3f060d1d`.
Measured source candidate: `5833c254edc15dbcfa0b8c1a6da0ae707544ffeb`.
Source/evidence publication: `3ab04d1974e6fefc8fc43661f3cceec9c2ce822f`.
Run: `38247043718`; artifact: `11745863535`.
ZIP SHA256: `c6db9a300c04c5ad404e6cbe83b2597944cb229a70b7b0c61652929fa74d7118`.
The hosted preparation checked seven source/test/checker/registry content hashes
against the local candidate. Different local and hosted Git commits are not
interchangeable. The hosted tracked tree was clean after measurement/publication.

## Every operator finding has a disposition

The canonical continuation record is
`solve/epics/raft-rs-full-cutover/ownership-audit-disposition-20261012.md`.
The original supplied audit is bound by SHA256
`f87be3b226419989bd1a229687a13dc6e6811f155a011382159ef24bb5e0ae15`.
It inspected 62ed226b source and did not claim a new test run. This continuation
keeps its seven numbers and its distinction between safety and maintenance:

1. Legacy/new transaction execution: preserve L6 until admitted old obligations
   are demonstrably settled; explicit producer/consumer removal, not permanent
   coexistence. OPEN migration acceptance.
2. WASM prior-existence: real lost-history failure reproduced below. OPEN safety
   blocker; one authoritative opening contract through the existing owners.
3. Prepared reconstruction and expiry: legacy logic cannot authorize release of
   new participant reservations; retire old map/reconstruction/sweep with TX1.
   OPEN proof/removal obligation, not a second recovery engine.
4. Snapshot/lifecycle: a narrow lifecycle-owned staging operation is implemented
   and exercised, with symbol-limited import enforcement. Independent acceptance
   and complete sealed witnesses remain OPEN.
5. Membership retry bookkeeping: later mechanical consolidation only if distinct
   failure semantics coincide, after FreshMG; no new generic scheduler.
6. Election timing: later snapshot/epoch-consistent validated profile through
   existing derivation, not increased timeouts or another timing algorithm.
7. Startup refusal formatting: later canonical structure with service metadata.
   Separately, the latest cleanup-failure review is a current safety obligation.

Shared-runtime and per-group failures keep different scopes and records. Native
FreshMG evidence, SQL identity/CAS and transport recipient checks remain separate
trust boundaries. The stacked FreshMG PRs are not competing implementation lanes
merely because their changed files overlap. No FreshMG branch is modified here.

## Snapshot/lifecycle source correction

`prepareReplicaLifecycleForSnapshot` is implemented in the existing lifecycle
owner. It returns only an immutable outcome and incarnation, not an owner, runtime,
registry entry, install permission or retirement capability. Matching active
identity reuses its incarnation; conflicting identity, retirement and surviving
native history without lifecycle refuse. Storage errors cannot report success.

The snapshot installer consumes the outcome and refuses before native state
reconstruction when lifecycle preparation is refused. It retains CREATE authority,
validated descriptor, private staging-file custody, marker recovery and atomic
publication. The audit permits only this static named staging import at the
snapshot consumer, never the class, namespace, mixed capabilities, dynamic import,
re-export or another caller. This is static boundary enforcement, not isolation
from arbitrary trusted-host JavaScript.

The bounded snapshot-lifecycle-staging-boundary Quest was scoped and sealed by
the canonical Solver before applying source. Its receipt remains pending/fail;
component results are not fabricated into complete acceptance or independent review.

## Additional unchanged-test defect

The previously hoisted close function exposes a mutable function prototype when
createRaftOperationPort shallow-freezes its public methods. The factory now uses
its existing recursive deepFreeze helper. The original public-value/nested-result
assertion is unchanged: it fails before correction, passes with it, and fails
again on source-only revert. This is separately attributed TX1/runtime work, not
an unreported snapshot protocol change.

## WASM opening-history safety red

The existing native opening test now has an intact-restart control and a lost-
history refusal witness. Both use real WasmServiceReplica, native raft-rs, SQLite
and the real in-process router. They commit a KV write and confirm native committed
progress, then shut the service down. The loss case deletes only that group's
Raft log, hard state, applied state and snapshot rows. It preserves the existing
active lifecycle row byte-for-byte and leaves application data intact.

The intact service reopen restores data and incarnation. The loss case incorrectly
opens fresh genesis instead of refusing before native entry. It fails the intended
assertion: 'surviving lifecycle history must not be reopened as fresh genesis'.
This is an ordinary failing safety test in the branch, not a skipped test, an
expected-success negative or a claim that the defect was fixed.

This is a same-process service reopen on a surviving database, NOT cold-process,
whole-file-loss or physical multi-host proof. A lifecycle row alone is not a safe
repair predicate: a refused constructor can create one before participating, and
its ordinary retry must remain valid. The repair must distinguish never-opened,
established and unknown/unavailable history through the existing lifecycle/native
commit and host-admission owners, with crash-order and failed-opening controls.
Do not add a second lifecycle database or infer authority from application rows.

## Hosted measurements

| Test set | Cases | Behavioral result |
| --- | ---: | --- |
| New lifecycle/staging and import-boundary tests | 14 | 14 pass |
| Existing native snapshot/learner authorization tests | 54 | 54 pass |
| Existing operation-port boundary tests | 7 | 7 behavioral passes; timing failure below |
| Prior recovery/lifecycle/participation regression set, 15 files | 70 | 70 pass |
| Opening/refusal set including intact/lost-history cases | 12 | 11 pass, 1 genuine safety failure |

Total: 157 cases, 156 behavioral passes and one failed WASM safety assertion;
zero skipped, todo or cancelled cases. This total is NOT complete acceptance.

Actual operation-boundary audit: PASS with an empty violation list. Restoring only
the old snapshot consumer, while keeping the new checker, restores the original
lifecycle-owner-import-bypass. Restoring only the old public factory restores the
unchanged recursive-freeze failure. Both candidates are restored after controls.
Focused ESLint, changed-production literal audit and impact registry pass; the
registry reports 61 contracts and 32 coupled pairs. Generated metadata is produced
by the existing generator.

Still failed:
- The unchanged whole-source operation-boundary unit takes 5380.348862 ms, above
  the 2000 ms limit. Its seven behavioral passes do not waive that limit. All
  other cases in these hosted sets satisfy their existing class duration bars.
  Optimize the actual audit/test boundary without shrinking its audited domain,
  reclassifying the unit or increasing the threshold.
- Full guideline execution still stops at 311 above-baseline literal violations,
  with 1267 matched inherited entries. Later chained checks are not claimed green.
- git diff --check reports three single-space blank context lines INSIDE retained
  unified-diff artifacts: opening-observation.patch:34 and snapshot-source.patch:
  25,64 in evidence/ownership-audit-20261012. These are patch representation
  failures, not newly measured production trailing whitespace. They remain red;
  no executed artifact is silently rewritten and no whitespace gate is waived.

## Legacy proof limitations, retained separately

Local fixture work is not part of the hosted 157-case result. Participant staging
reported 16/20 passing with four failures; the combined legacy-session run was
interrupted externally and is retained as incomplete. At least an opposite L6
fixture ignores a refused legacy BEGIN, so it never establishes the legacy session
its assertions assume. Direct local fixture diagnostics at Node 22.16.0 observed
participant_transaction_legacy_session_fenced with generation origin, and
participant_transaction_cutover_paused without it; both left no SQLite/open
transaction. This diagnoses setup, not proof of migration or permission to bypass
the fence. Other failed transaction cases still require investigation. Neither
transaction production path was changed in this continuation.

## Latest independent review and requested next verdict

Review 5490008451 on d9306545 (comments 4247435390, 4247435452, 4247435487) finds
that cleanup failure can replace the primary typed startup refusal and lose its
consensus answer/deadline. This is OPEN safety work, not optional formatting.
Preserve primary and secondary failures plus every outstanding resource release
through the existing lifecycle owner. Never swallow cleanup failure or report a
connection released merely because initialization failed.

Review the current snapshot staging and canonical freeze changes, all seven
operator dispositions and exact raw results. Attack all applicable recovery-
replay, admission-gating, concurrency-serialization, owner-interaction and harness-
fidelity items. In particular verify full-installer refusal consumption, staging
write/cleanup failure, existing CREATE and marker guards, retired/conflicting
identity, exact retry incarnation, the symbol-limited static boundary, and nested
public-value immutability. The new direct API tests and existing positive native
snapshot suite do not independently certify every rejected-install/IO permutation.

The next safety implementation is the reproduced WASM opening-history interaction,
with failed-never-opened retry and intact-history controls, and the typed-refusal/
cleanup interaction. Legacy migration needs genuine admission preconditions and
an explicit old-producer/consumer retirement map. Then satisfy all static/duration
checks and independent verification before integrated startup/restart, full fresh
message-group replacement, seed-storage-loss and physical multi-host certification.
Maintenance findings 5-7 stay ordered after safety as the supplied audit recommends.
No direct subagent or independent approving Solver verdict is claimed here.
