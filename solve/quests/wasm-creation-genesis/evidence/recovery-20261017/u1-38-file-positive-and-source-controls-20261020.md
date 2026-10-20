# U1 38-file verification and source-only control checkpoint — 2026-10-20

**Status: finite executed evidence, NOT independent combined U1 acceptance, publication proof, U2 release or main merge.** This checkpoint is on its own evidence branch. The unmodified positive implementation and tests are at `ccdd6938c5e79ff95fbd71a2090ba4c800223266`. No source or test behavior is altered by this report.

## Positive: identical exact source in both lab selections

| Owner selection | Source commit | Original terminal lab result |
| --- | --- | --- |
| **15 U1 focus files** (13 preserved selection + two reconstructed inventory/execution tests) | `ccdd6938` | [#439](https://github.com/psvensson/lagrange-lab/issues/439): **15/15 PASS, 418 runner assertions**, `tv-dator`. |
| **23 compatibility files** | `ccdd6938` | [#440](https://github.com/psvensson/lagrange-lab/issues/440): **23/23 PASS, 958 runner assertions**, `lenovo-laptop`. |

38/38 selected files, 1,376 runner-reported assertions; exact candidate SHA bound by terminal receipts. These two selections are an intentionally finite U1-focused profile, **not** the ordinary expanded change selector's 1,896-file certification. Each lab result is execution evidence, not independent review.

The two newly authored files are:
`test/node/runtime-service-restart-inventory-custody.test.js` (three cases) and
`test/node/runtime-service-remove-execution-custody.test.js` (four cases).
They were **reconstructed** against current owner interfaces, not recovered
byte-identical from the missing local 15-file test-only checkpoint. Their
independent implementation/oracle review remains required.

The first attempted execution was [#437](https://github.com/psvensson/lagrange-lab/issues/437) at `b829570c`, failing three fixture expectations:
two used literal `HANDLER_STOPPED` rather than the existing typed handler
reason `runtime_service_handler_stopped`, and the bound-removal witness used
`ROW_COMPLETED` rather than `CREATION_ROW_COMPLETED`. The corrected
fixture-only commit `ccdd6938` produced [#438](https://github.com/psvensson/lagrange-lab/issues/438):
**2/2 PASS, seven cases**; production sources unchanged during this revision.
This is owner-vocabulary alignment, not relaxation of downstream effect assertions.

## Prior systemic defect: synchronous exact handler retirement

The original fault was reproducible on unchanged production:
[#419](https://github.com/psvensson/lagrange-lab/issues/419) at `54950e99`
failed both the new call-time exact-handler-retirement witness and the
1,884-schedule lifecycle model. Source change
[`a1d3b056`](https://github.com/psvensson/lagrange/commit/a1d3b056d75e85f257646da6388b0c003a45b30b)
invokes exact-handler unregistration synchronously at shutdown, installs
rejection/success settlement handlers immediately, then still joins opening,
reconciliation, tombstone, and database/port closure. Source-only restoration
of late retirement in
[#431](https://github.com/psvensson/lagrange-lab/issues/431)
reproduced the model violations on the final frozen test tree; corrected
lifecycle (with the inherited committed-effects fixture repaired) passed
[#422](https://github.com/psvensson/lagrange-lab/issues/422).

The committed-effects fixture originally used `effects: []`, already
inconsistent at pre-U1 base `381750de` with the real
`raft-rs-application-transaction-owner` producer. Its correction
validates safety-state visibility **after** successful commit, not before.
Premature publication mutation [#432](https://github.com/psvensson/lagrange-lab/issues/432)
fails that assertion; source-only removal of full physical currentness for
services-row marking [#433](https://github.com/psvensson/lagrange-lab/issues/433)
also fails the real-owner witness.

## Six independently targeted existing post-await interaction controls

All six runs use **identical original physical-custody test code** at the
`ccdd6938` positive tree; each changes exactly one production condition
on a separately preserved source branch. The observed RED must be attributed
only to the first substantive failed assertion, never to import/setup errors
or subsequent assertions not reached.

| Negative control | Lab and failure | Discriminating effect |
| --- | --- | --- |
| P0: omit pre-START physical-currentness admission, keep descriptor guard | [#441](https://github.com/psvensson/lagrange-lab/issues/441) expected RED | `OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID`: actual forbidden lifecycle invocation. |
| P1: allow stale STARTING manager projection after READY | [#442](https://github.com/psvensson/lagrange-lab/issues/442) expected RED | Exact successor manager record identity was replaced with original-generation `starting` record. |
| P2: omit driver's PUBLISHED-return currentness guard | [#443](https://github.com/psvensson/lagrange-lab/issues/443) expected RED | `LATE_PUBLISHED_DRIVER_RETURN_MARKED_HELD_SUCCESSOR_RUNNING`. |
| P3: allow stale RUNNING manager projection after PUBLISHED | [#444](https://github.com/psvensson/lagrange-lab/issues/444) expected RED | Exact successor manager record replaced/overwritten on late return. |
| P4: omit post-services-writer currentness check | [#445](https://github.com/psvensson/lagrange-lab/issues/445) expected RED | `LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER`. |
| P5: omit post-endpoint-writer currentness check | [#446](https://github.com/psvensson/lagrange-lab/issues/446) expected RED | `LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK`. |

The P1/P3 mutations explicitly parenthesize the unmodified original
permission expression under their respective `state === STARTING/RUNNING ||`
operator, so they test precisely the omitted guarantee, not a ternary
precedence artifact.

## Added inventory and execution controls, source-only

| Mutated owner | Terminal result | Meaningful failed test assertion |
| --- | --- | --- |
| Failed inventory leaves stale retry task registered | [#447](https://github.com/psvensson/lagrange-lab/issues/447) expected RED | `FAILED_SCAN_MUST_RELEASE_ITS_RETRY_OWNERSHIP`: a rejected scan was reused, preventing re-drive. |
| Remove post-STOP exact-memo currentness check | [#448](https://github.com/psvensson/lagrange-lab/issues/448) expected RED | `LATE_OLD_STOP_SETTLED_SUCCESSOR_MEMO`: old completion overwrote J. |
| Omit generic STOP's finally release | [#449](https://github.com/psvensson/lagrange-lab/issues/449) expected RED | `STALE_QUEUED_REMOVE_DID_NOT_RELEASE_EXECUTION_GATE`, `LATE_RETURN_RETAINED_OLD_EXECUTION_GATE`, `UNRESOLVED_STOP_RETAINED_ITS_OLD_ATTEMPT_GATE`. |

These are **three bounded negative mechanisms**, not complete evidence for
every inventory, retained-debt, crash/restart, asynchronous native cleanup or
observer subclaim from the sealed design. Existing earlier F1 controls retain
their own exact-source approval and claim; do not silently extend their scope.

## Systemic defect archaeology / nonduplicated owners

As documented in `systemic-defect-review-20261019.md`, earlier Lagrange
failures involved conflicting leadership projections, lost recovery wake
paths, unreliable age-based expiry of parked obligations, ambient clocks, and
post-await retained callback ownership. The recurring families here are
**single authoritative identity, durable obligation versus volatile memo,
call-time admission fences, post-await currentness, and explicit retry ownership**.
The real `ServiceLifecycleManager` journal owner detects conflicting
same-operation recovery rows before any `RuntimeServiceHandler` memo
projection; the handler does not add another journal authority.
The resource's existing exact-handler identity owner is reused; the patch
does not add a parallel transport-removal mechanism.

## Closure still open (do not reinterpret red/green as certification)

1. **Canonical generated metadata, normal staged hooks, whole-U1 fast-static** from explicit base `381750de29af647d446b19adedf1da53eb712093` and exact final tested candidate. The remote contents-API commits were not normal locally hook-checked source commits. Classification, impact graph and owner-debt inventories may be stale.
2. **Independent test/oracle and coherent source-delta review** for all changed U1 owners, including the new two reconstructed test files and the unregistration-ordering source change; reconcile nine previously identified post-approval production paths.
3. **Bound remaining controls** from V1–V9 and the original 55-item U1 acceptance checklist: examine any uncovered owner interaction or root-cause family, preserve meaningful source-only mutants, no arbitrary new broadening. Confirm physical / journal / discovery finality and retained debt through failure and restart.
4. **Independent combined acceptance verdict**, exactly bound to one final immutable source/test tree with execution receipts. Only that verdict releases the U2 dependency; it does **not** itself merge the full rs-raft release to main.

This evidence file is additive. It asserts neither an executable certified
release nor any status change in the sealed quest contract.
