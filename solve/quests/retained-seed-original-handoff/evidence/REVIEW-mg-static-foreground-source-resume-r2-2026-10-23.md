# Independent bounded source review: resumed static/foreground repair R2

Reviewer: `subagent:/root/composition_review_r2`. Date: 2026-10-23.

Verdict: **APPROVE the exact bounded source and captured-reader differential
for candidate composition and non-main preservation**, conditional on final
impact metadata, applicable composed statics, exact freeze and lab validation.
No additional material source finding arose in this review. This is not
production acceptance, a runtime pass, broad static-debt clearance, native
delivery proof or Quest closure.

## Exact identity

Repository: `/workspace/scratch/0c0362d1530e/lagrange`.
Branch: `work/mg-delivery-resume-r2-20261023`.
Base HEAD: `1e2fcc2da391ab72883132a22fbfbde39b2313f7`.
Author: `subagent:/root/static_foreground_r2`.

| File | SHA256 |
| --- | --- |
| `src/partition/partition-cdc-obligation-delivery.js` | `e75b632711407fe62a0a988db8289f92b92d75c7dcfb48a19725f4bf93b53e5b` |
| `src/transport/message-router-ack-delivery.js` | `cafcf8d5c232b7ef2bde63df07755ca20970a4488f9030bf3228b72b555f65e2` |
| `src/transport/message-router-delivery-lifetime.js` | `4040ac08be6f4dc085f2d5fcab7c9677c9581c7c6eb0f1a4b9ed8f2f95947b4b` |
| `src/topology/cdc-group-propagation-delivery-methods.js` | `c01fd917454bcb9b2e66453c646628cea36f1b22943cedc1feeb65d690ccf4bc` |
| `src/topology/cdc-group-propagation-retry-wait-report.js` | `e40e7b51b0e642035f698c33e08e9738e277a268606ea36e8bf6fabefd47ae93` |
| New `src/topology/cdc-group-propagation-foreground-retry.js` | `664f0d4e8d71eb68f291850c7e808ff7ccd6a42443a2fd3f36653bf2addd6712` |
| Captured-reader `test/message-group/message-group-native-provisional-route.test.js` | `43cd093c6a10a69a49c7795f8a137f481fd1723f47f85b7544c4296312b3b751` |
| Separately reviewed foreground boundary test | `22e431a614636d34a8903b963608ca5245370046668b4825ae9661e1cce5e123` |

Author's persisted commands/results:
`mg-delivery-resume-r2-2026-10-23/static-foreground-receipt.json`, SHA256
`a976ace0dac40616b3fb5609d14904112fca47519321c5170561a63c4c27d086`.
The separate eight-case test review is
`REVIEW-mg-foreground-boundary-resume-r2-2026-10-23.md`.

## Source correspondence

### Obligation lane state and captured diagnostic

The existing retry timer now carries explicit IDLE/ARMED state and its original
clock handle. Duplicate-arm admission uses that state, the callback returns to
IDLE before checking the same lane tenure, and reset clears the stored handle
on the same owner clock. Existing backoff limits, acknowledgement retry and
subsequent obligation drive are unchanged. The diagnostic reads the named
state rather than interpreting a null value as the operation state.

`drivePrecondition` selects the same shutdown, not-leader and no-subscriber
outcomes before constructing the current subscriber list. `driveOneObligation`
selects the same ACK-pressure/pending/ready branches. `deliverObligation`
already rejects stale or uncovered aggregate coverage and can return only
canonical PROVISIONAL or COMMITTED coverage. Returning that explicit state
removes an unreachable false branch and keeps provisional scan release at
delivered=0, with native coverage alone entering the existing ACK path.

The repository reader census found one affected captured obligation-lane
snapshot outside the owner. It now reads `retryTimer.handle !== null`.
Invoking `getCdcObligationDiagnostics` there would call `laneOf` and could reset
tenure during observation; the captured-only read correctly preserves the
witness schedule. Unrelated role-mutation retry timers are unchanged.

### Existing transport refusal and reconnect owners

The delivery-lifetime timer's catch now calls the same idempotent `refuse` owner
already used by `remaining`. Normal expiry remains idempotent; an exception
during timer rearming is also routed into that refusal instead of being silently
lost. Creating clock, local duration budget, parent shortening, signal, disposer
and raw operation ownership are unchanged.

The stale pre-send socket path still closes through `handleConnectionClose`,
attempts actual termination/close, and returns the same typed reconnect refusal.
Its termination exception is reported using the existing
FAILED_TERMINATE_EXISTING router message and target/connection/error context.
No alternate connection repair or successful delivery is introduced.

### One foreground wait decision and bounded scheduling diagnostics

The foreground loop remains in the existing delivery owner, including its
post-await check of both captured STOPPED and current stopped state. Only the
wait/attempt/stop helper is extracted into a 31-line explicit-owner function;
the existing service method delegates to it. The algorithm still checks stop
before attempt exhaustion, calls the wave's same duration predicate, computes
the same delay, waits through the same wave/lifecycle primitive, rechecks stop,
and advances the same failed-target view. There is one decision implementation,
not a second retry loop. The existing actual-helper tests still bind through
the same service method. The touched delivery module is now 789 lines.

Both foreground and background scheduling notices use the existing reporter
module. A WeakMap retains at most one existing `LogThrottle` per live service;
that throttle sees one fixed message key, so changing targets cannot grow its
map. The first/periodic notice includes suppressed count and uses console-only
logging, preventing the notice from creating another logs-table CDC wave.
The same service clock supplies the throttle. Existing spent-bound reports,
their stop/continuation vocabulary, and delivery retry effects are unchanged.

## Category-complete bounded disposition

| Category | Concrete disposition |
| --- | --- |
| Scope / ownership | Five identified source repairs plus the narrow helper extraction and one captured reader. Semantic ownership remains in the obligation lane, transport lifetime/reconnect, common retry and existing report owners. No new source receipt, topology authority, recovery policy or public response grammar is introduced. |
| Owner interaction / authority | Canonical aggregate coverage still decides whether the obligation is committed, provisional or uncovered. Named drive state and diagnostic state do not grant ACK, readiness or publication authority. The extracted helper consumes the existing prepared-wave seam. |
| Admission / pressure | Existing timer coalescing and ACK-pressure/pending order remain. No queue, payload cap, retry count or deadline is enlarged. The separate public receiver admission defect C1 is not repaired or accepted by these edits. |
| Retry / cadence / stops | Backoff calculations and callback owners are unchanged. Foreground/current stop checks remain at both helper and consumer. Ordinary background continuation and durable source continuation remain distinct. Scheduling-log suppression affects observation only. |
| Concurrency / freshness | Retry callback clears its own named state before same-lane currentness checks. Reset clears the captured handle and retires the same active invocation. Extracted helper preserves the await/current-stop ordering. No timer or detached successor worker is added. |
| Transport / outcomes | ACK pre-send still rejects with its typed connection signal. Lifetime error handling invokes the same refusal. ACK-versus-native completion and canonical CDC wrappers are unchanged; C2 transport normalization remains a separate uncorrected defect at this review. |
| Custody / cleanup | Existing raw-child/native/router custody is untouched. Named timer handle supports exact cancellation. The captured reader avoids a mutating diagnostic call. No public timeout is relabeled as cancellation of underlying work. |
| Diagnostics / bounded state | Recurring scheduling logs have one bounded bucket per service and console-only output; spent reports remain truthful. Stale socket failure uses existing diagnostic vocabulary. No target-keyed unbounded map or logging-generated CDC retry is added. |
| Recovery / formation | Provisional coverage still discards optimization state while source ledger debt remains. Actual ACK apply, retained-history recovery, native formation and activation behavior are outside this differential. |
| Harness fidelity | The exact eight-case foreground test is separately reviewed, with real helper/stop/sleep and declared controlled recipient answers. The snapshot change preserves its old observation point. No runtime was executed, so neither tests nor unchanged assertions supply measured proof here. |
| Static debt / integration | The narrow extraction leaves the inherited loop in its existing owner and does not move/raise baselines. The author receipt records zero new findings, with three inherited decision and one inherited hot-diagnostic findings. Final global/impact/metadata gates remain root-owned. |
| Evidence / acceptance limits | Exact hashes identify the reviewed revision. The lost R1 workspace supplies no current approval. C1/C2 measured predecessors, corrected source review, final exact-SHA lab proof, W7/W9, classification, protected activation, durable transfer and two-start remain separate obligations. |

## Verification performed

I independently checked syntax for all eight source/test files and ran normal
scoped ESLint; all exited zero. I read the complete changed boundaries and
their consumers, verified every listed live hash and the persisted receipt,
and independently confirmed the four named audit baseline files have no diff
from HEAD. The author's receipt preserves exact commands and JSON outputs for
decision, silent-catch, hot-path diagnostic and literal audits. Those are scoped
static results with inherited debt, not global clearance. An optional ad hoc
cognitive-complexity invocation could not load its plugin; no result from that
attempt is claimed.

No runtime, source/test edit, metadata/Quest-log edit, Git mutation, lab action,
merge or publication was performed by this reviewer. Only this review record
was written. Final composed acceptance remains pending.
