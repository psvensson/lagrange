# Independent test review: foreground boundary, resumed R2

Reviewer: `subagent:/root/composition_review_r2`. Date: 2026-10-23.

Verdict: **APPROVE the exact test file for candidate composition and measured
lab validation**, conditional on canonical test metadata and the final candidate
freeze. This is a new review of recovered R2 bytes. It does not import approval
from the lost workspace or report a runtime pass. No source behavior, composed
native delivery, Quest acceptance, or landing is approved here.

## Exact identity and review boundary

Repository: `/workspace/scratch/0c0362d1530e/lagrange`.
Branch: `work/mg-delivery-resume-r2-20261023`.
Base HEAD: `1e2fcc2da391ab72883132a22fbfbde39b2313f7`.
Author: `subagent:/root/static_foreground_r2`.

| File | SHA256 |
| --- | --- |
| `test/topology/cdc-group-propagation-foreground-boundary.test.js` | `22e431a614636d34a8903b963608ca5245370046668b4825ae9661e1cce5e123` |
| Existing `test/test-helpers/cdc-topology-progress-fixture.js` | `5df5b96b221c5811167301374e13cb64a35d4a1589e7c49276912e3ae2ceeca9` |
| Existing `test/topology/cdc-group-propagation-service-harness.js` | `93b7d777db6254e0ff37a003169f2dcb8180e883510dd4c272665c5719657883` |

The review reads the entire new test, its actual component fixtures, the common
foreground consumer and helper, durable prepared wave, lifecycle sleep/stop,
and reporting owner. The current delivery owner is also being edited for a
bounded static repair; its final source approval is a separate review.

The source contract and witness plan remain
`CONTRACT-mg-source-occurrence-delivery-2026-10-23.md` and
`PLAN-mg-delivery-witnesses-2026-10-23.md`. The delivery-stop and workspace-
interruption handovers explicitly require these eight actual-helper cases.

## Mechanism engagement and eight cases

`observeRetryDecisions` invokes the actual bound `waitForForegroundRetry`
method. The barrier delays only consumption of its already-computed answer;
it does not fabricate a retry state or replace the helper's sleep. The three
stop tests count exactly one actual helper decision and one recipient call.
Thus a second foreground iteration cannot be hidden by downstream stop behavior.

| Case | Actual premise and distinguishing observation |
| --- | --- |
| Stop after ATTEMPTS_EXHAUSTED | Real helper observes maxAttempts=1; service stops before the consumer receives that answer. Typed stopped failures return without a spent report or background entry. |
| Stop after ADVANCE | The real 50-ms sleep is armed and released by the timer before the decision barrier. Stop then wins at consumption; there is no successor recipient effect. |
| STOPPED followed by restart | Stop releases the actual armed sleep; the helper captures STOPPED. Service is running again before consumption, but the captured stop still ends the original delivery. |
| Ordinary exhaustion | One actual failed delivery reaches ATTEMPTS_EXHAUSTED. Existing background entry/timer are present; the report names the attempt bound, target-failure units and background continuation. |
| Durable exhaustion | Actual source ledger/subscriber/topology owners reach the target and exhaust attempts. The report names source continuation and aggregate-wave units; debt remains owed without a delivered command. |
| 49 ms remaining for 50 ms | The active source invocation's own clock reduces its existing grant to 49 ms. The helper returns INSUFFICIENT_DURATION after a reached target; no sleep/payload retry state survives. |
| 50 ms remaining for 50 ms | Equality exercises the strict remaining-duration comparison, with the same debt, report and no-background checks. |
| 51 ms remaining for 50 ms | Actual helper sleep is armed. No target call or helper decision occurs after 49 ms; at 50 ms exactly one further target call obtains a canonical provisional answer. Actual source drive returns PROVISIONAL while the ledger remains owed and no ACK command is proposed. |

The sufficient-duration test advances both the timer and the source's creating
clock. Remaining time is 51, then 2, then 1 ms. It does not renew the grant or
assume that every failed foreground attempt makes only one target call. It
records the reached-call count before the wait and compares the subsequent
increment. The controlled weak answer is produced by the existing canonical
`buildProvisionalCdcOutcome` fixture, bound to the incoming vector and group.

## Category-complete disposition

| Category | Evidence and bounded disposition |
| --- | --- |
| Scope and authority | Test-only component addition. `topologyProgressFixture` explicitly uses controlled route projections, source recipient answers and target answers. Actual source application/ledger/subscription and topology retry/coverage owners are engaged. No fabricated response is called a native recipient commit, real publication, or ACK application. |
| Owner interaction | Tests consume the existing helper, consumer, lifecycle and reporter; they create no alternate retry or acceptance algorithm. `assertDebtWithoutAck` reads the real obligation ledger and proposer capture. The controlled source/recipient outcomes belong only to the fixture seam. |
| Retry cadence and bounds | Actual helper decisions and actual 50-ms sleep are observed. Attempt exhaustion and positive-but-insufficient duration remain distinct. Strict shorter/equal/larger controls exercise the same existing delay and live grant. Ordinary background continuation and durable source continuation are checked separately. |
| Concurrency, freshness and stop | The barrier is after helper completion and before consumer continuation. Both actual current stop and captured STOPPED survive their respective races. Exactly-one decision/call assertions exclude an extra loop hidden by stop-aware delivery. |
| Admission and transient state | After stop or durable completion/refusal, immediate batch entries/timers, background entries/timers and sleep releases are empty. The ordinary exhaustion control positively requires one existing background entry/timer. This test does not claim queue-capacity or raw native custody proof. |
| Custody and source progress | Durable cases retain one owed obligation, zero delivered obligations, no proposed CDC_DELIVERED and no pending acknowledgement. Canonical provisional completion releases the source scan only. Actual child/native/transport finalizer retention is covered by separate invocation/native witnesses, not inferred from empty topology maps here. |
| Transport and outcome semantics | Ordinary target refusal and durable canonical responses are controlled component inputs. They do not replace the actual retry owner under test. No ACK-only answer is accepted as durable completion; native/real-router receipt correspondence remains separate. |
| Diagnostics | Spent reports are counted and checked for wait name, stop reason, continuation, count unit, attempt/maxAttempts and exact remaining/delay values where applicable. Stop and successful provisional coverage produce no spent report. Recurring scheduling-log throttling itself is a separate source/static repair. |
| Harness fidelity | Target engagement, armed actual sleep, real helper results and exact decision counts exclude vacuous passes. Fixture shortcuts are declared. The deadline ordering is explicit above. The stop barrier is released by both test body and teardown; services stop in teardown. No runtime was executed, so no measured red/green is asserted. |
| Recovery, replay and proof level | Debt retention is measured by assertions in the proposed test, not yet a lab result. It does not close source/native raw cleanup, W7 full composition, W9 large payload/fanout, classification, protected activation, durable transfer, two-start, or the Quest. |
| Registration and exact-source validation | Root owns canonical metadata, impact registration, exact commit and locked-lab packet. Import/setup failures or timeout before the named engagement cuts are non-proofs. Final source extraction or composition must retain these owner bindings and be reviewed on its own exact bytes. |

## Verification performed

I independently ran `node --check` and ordinary scoped ESLint on the new test;
both exited zero. I read the complete test and fixture and checked the recorded
hashes. No local runtime, source edit, metadata regeneration, Quest-log edit,
Git mutation, lab submission or remote action was performed by this reviewer.
Only this new evidence record was written.
