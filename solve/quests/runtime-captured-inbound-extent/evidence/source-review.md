# Content-bound source review: finite captured inbound extent

Reviewer: `subagent:/root/snapshot_contract_audit`, 2026-10-15.

APPROVE the exact bounded source below for an immutable non-main review checkpoint and its first candidate native execution. No implementation defect was found in this delta. This is not a claim of passing candidate tests, satisfied static gates, terminal Quest landing, release-protocol approval, successor activation or merge readiness.

The reviewer read source and retained evidence only. No native tests, lab locks or production edits were performed. The report is new review evidence; earlier design and failed native evidence remain unchanged.

## Exact content and scope

- Worktree: `/mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015`.
- Test-only parent: `04391697aeabea5ddd504491321546212b95982e`; earlier source baseline `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`.
- Candidate `src/raft/raft-rs-runtime-owner.js`: SHA256 `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f`; Git blob `d8f86b81e7c3098da01cf558aa37a85334c7ace9`.
- Baseline runtime SHA256: `a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b`; baseline blob `7fefb96f8` as printed by Git's diff.
- Final DESIGN.md SHA256: `1a122e71d184efba30e857d61a1ad0b23f5c06a4c2a85da5aeaf032d1675232f`.
- Boundary test SHA256: `9cb552e83ef5fcdcc1ab0248961b7e2b9f14961542b3c1178fad3a95b8d2c1ff`.
- Companion helper SHA256: `4ac1dce5cc8bb72de533055b03ea892fb212fbd24d16b586edac21243fdc014e`.
- Frozen W07 SHA256: `07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d`; blob `debc16f442ba63b100332d93b285865d36d1c376`.
- Impact registry SHA256: `990de129808dba6556f7cccf428136c2b555725c961852bac49a64b9b4e8e1cd`.

`git diff HEAD --name-only -- src` named only the runtime owner. Its exact diff is 26 added and 14 deleted lines. No production export, timer, queue, persisted record, release/TX command, configuration, timeout or dependency changed. The source was staged but not yet committed when reviewed; this approval binds to the bytes above, not to a future unexamined tree.

## Direct owner closure and resolved mechanisms

`refusedExecution` at runtime:394–405 owns the exact former `invokeCoreAt` predicate and constructs the same HOST_FAILURE/runtime-generation-changed result. `invokeCoreAt` at :407–413 consumes it and retains its native-entry enforcement. `drainInbound` at :1696–1733 consumes the same helper before every mutation, including identity-unrecorded cleanup, and before either empty/exhausted continuation. The helper is private and side-effect-free apart from constructing the existing frozen failure value; it does not mark a current replacement unhealthy.

`perform` at :1736–1755 captures generation and array length synchronously after `ensureExecution` has returned CORE_OK. Neither capture is separated by an await or callback. `remaining` is a private nonnegative array-length count; one successful dequeue decrements it once after either ordinary local refusal or native-step/Ready success. A native non-refusal failure returns without consuming another item. The captured prefix therefore cannot be enlarged by later appends, while a handled refusal cannot truncate the preaccepted prefix.

The existing group array remains authoritative. Its only normal consumer is the serialized drain; ingress appends frozen envelopes. Existing exceptional clears remain the identity-unrecorded defensive cleanup and the terminal reseed owner. No detached array, new queue key or parallel consumer was introduced. `enqueue`/`releaseTurn` retain synchronous FIFO custody across Promise continuations.

Wake code is unchanged. Ingress schedules/coalesces its referenced owned timer. A healthy admitted timer callback retires the timer and enqueues DRAIN; a busy turn does not cancel that queued continuation. Shared replacement retains its existing wake debt, persistence retains its existing bounded poll and expiry behavior, and close cancels the exact acquired timer. There is no unconditional rearm that would bypass recovery or renew a wait budget.

The following actual collaborators were inspected and remain unchanged: operation-port lifecycle/throw containment, timer custody, persistence admission, runtime faults/local-log refusal, exact replica lifecycle, per-peer delivery/refusal observations, Ready/application transaction and durable store. The runtime does not absorb their semantic decisions.

## Independent baseline evidence inspection

Read `/tmp/lagrange-runtime-correction-20261015/companion-first-baseline/` from test-only parent `04391697...`, locked host `lenovo-laptop`, exit 1. Raw TAP SHA256: `d170d052e70204c0fe0b90d1a406f7623021582343f9cec41d904cd25143ae80`. Plan SHA256: `14edf1ae6ceb73230fdd19be1eb413be3f9a5e102a400927a48c3cf075d24412`.

Whole file is 2 PASS / 2 FAIL. A read-only parser decoded all four event records and four cleanup records and recomputed every recorded native-step message hash. All matched. All four recorded cleanup outcomes were settled with no retained directory. This parser was evidence inspection, not a test rerun.

- Queued capture: two accepted steps at sequences 669/678 precede selected 687; two genuine native replies. Existing-behavior positive control.
- Consumed wake: both accepted occurrences survive, but the late step 1416 precedes selected 1425. The direct order assertion at test:101 fails. This is the intended live-drain semantic RED, not setup failure.
- Pre-dequeue guard: two accepted, one actual step/reply at sequence 2066; the final-announcement trap engages; initial result is typed HOST_FAILURE/runtime-generation-changed; selected never enters. Canonical recovery runs, but the direct second-occurrence assertion at test:230 fails 1 versus 2. This independently confirms the source-traced destructive-dequeue defect under the declared fault seam. It is not a spontaneous observed WASM fault or autonomous recovery proof.
- Reconstruction capture: actual host transaction holds reconstruction; commit/applied begin 3/2, marker replays exactly once and finishes 3/3; step 2926 precedes selected 2935 with real reply/forwarding. Existing-behavior positive control. The early-capture mutation remains required to show test sensitivity.

Candidate native results, frozen-W07 candidate PASS, identical-test source negative, incorrect-capture treatment, nine named owner suites and the final canonical source cone are pending. This report does not convert their plans into results.

## Category-complete source delta review: 43 items

Evidence abbreviations: R = candidate runtime owner; P = `src/raft/raft-rs-operation-port.js`; L = `src/raft/raft-rs-replica-lifecycle-owner.js`; I = `src/raft/raft-rs-inbound-timer-custody.js`; A = `src/raft/raft-rs-persistence-admission.js`; F = `src/raft/raft-rs-runtime-faults.js`; D = `src/raft/raft-rs-peer-delivery.js`; T = frozen new boundary-native test; H = its companion fixture. Earlier complete design audit `design-review.md` SHA256 `53f98f20a17c00d3c7300edd4c9fae2592c3073a361eb853e14491e1a699c7f0` supplies the unchanged baseline mapping. Every disposition below is source/evidence review; candidate native proof remains pending.

| Category/item | Exact source/evidence and disposition |
| --- | --- |
| Concurrency 1: synchronous gate | R:966–991 installs the group tail before work; P:299–320 and L:240–255 retain lifecycle admission. The delta adds no async admission oracle. |
| Concurrency 2: await TOCTOU | R:1697 checks after each Ready continuation before dequeue; R:1745–1753 captures only after ensure success. Native entry still checks at R:407. T:166–195 and :198–237 distinguish the two cuts. |
| Concurrency 3: single winner | R:1831–1832 schedules through the same enqueue owner; remaining is local to one admitted turn. T selected-entry counts exclude duplicate execution. No new durable claim is introduced. |
| Concurrency 4: timer reentry | R:1808–1836 transfers callback into enqueue; T:84–89 observes one callback/request while the active Ready has stepped only h1. No recursive direct service is added. |
| Concurrency 5: correct key | R exact dispatcher group owns inbound/tail; unique group.key and replica lifecycle remain unchanged. No name-level/global mutex replaces exact runtime ownership. |
| Recovery 1: no stale clobber | R:1696–1709 preserves unconsumed array bytes on refusal; existing shared invalidation does not replace that array. T:198–237's baseline 1-versus-2 RED binds this defect. |
| Recovery 2: live/restart distinction | R:925–940 preserves reseed, shared runtime, pending resumption and group recovery branches. The new guard does not perform reconstruction. |
| Recovery 3: lost enlistment | No TX/query enrollment is touched. T:222–223 and H:171–178 count accepted occurrences positively; zero queue size is not treated as durable settlement. |
| Recovery 4: replay/rollback | Ready/application ownership is untouched. T:120–195 shows commit>applied after actual rollback, then exact one marker effect and aligned progress. Candidate execution still pending. |
| Recovery 5: absence proves nothing | R:195–207 still distinguishes unreadable progress; the delta never reads storage or invents absence. Negative selected-entry checks are paired with positive admission/fault/recovery observations. |
| Transport 1: ACK vs processing | R:1991–1994 only acknowledges queue acceptance. H:171–178 separately demands actual step and native reply; no received ACK is promoted to application success. |
| Transport 2: late completion | R:1731–1733 and existing finishReady retain generation checks after sends. T:73–103 holds a genuine send and requires retained service after release. |
| Transport 3: result classification | R:394–413 exactly preserves HOST_FAILURE shape; R:1714–1733 preserves per-envelope CORE_REFUSED handling. D:44–99 unchanged; no new transport result vocabulary. |
| Transport 4: bounded delivery | No new wait is added. An arbitrary unresolved send Promise remains outside finite-count proof; the existing transport owner controls live delivery bounds. T/H release their declared sends in cleanup. |
| Transport 5: seam fidelity | H genuine sendFor/native packets and T real SQLite/fault seams remain unchanged from reviewed bytes. No fabricated authoritative success or new router implementation. |
| Timer 1: clock/custody | I:7–51 retains exact acquisition clock and referenced accepted-work timer. This intentional contract supersedes generic unref guidance. |
| Timer 2: role/authority | R DRAIN continuation returns its existing non-tick result; no campaign/role manipulation is added. Explicit T recovery tick belongs only to its marked recovery phase. |
| Timer 3: crash equivalence | No new cache/dedup or durable-state mutation. Existing reconstruction scope remains; T trap proves actual native generation change, not process-restart or snapshot equivalence. |
| Timer 4: detection windows | R:1788–1805 and A:45–65 retain existing intervals/deadlines. No completion hook renews expiry. Permanent unavailability remains outside successful service claims. |
| Timer 5: starvation | Finite captured extent prevents later arrivals extending this one turn, R:1749–1753/:1706. T:73–103 pairs selected service and remainder preservation. Unbounded initial backlog/whole-system liveness is not claimed. |
| Harness 1: right RED | Retained baseline TAP asserts ordering and 1-versus-2 loss after engaged native schedules; imports/setup are successful. Source and mutation controls remain separately required. |
| Harness 2: honest binding | R existing native observer/fault seam, H:73–87 genuine output and T:150–158/:201–210 named faults. No source hook or successful response mock was added. |
| Harness 3: time | T:60/:84 zero-delay owned wake, :161 existing persistence poll; H setup uses existing fixture bounds. No candidate timeout change. |
| Harness 4: complete fields | H hashes full captured envelope and native message; parsed baseline hashes match. T:180–185 records exact outcome, positions and marker count before assertion. |
| Harness 5: nonvacuity | Two preaccepted inputs, explicit no-native-propose before cut, real send gates, accepted/step/reply counts and actual reconstruction exclude zero-work success. Candidate and mutation evidence pending. |
| Harness 6: live observable | Baseline contains actual native entry sequence/generation and replies; future candidate must preserve the exact test bytes. Native fixture proof is not deployed release-protocol proof. |
| Owner 1: sole decision owner | R alone chooses captured extent and consumption; P/L admit lifecycle, I owns timer record, native core owns Raft results. No equivalent verdict added elsewhere. |
| Owner 2: typed boundary | Private refusedExecution shares the exact existing typed refusal; no alias/option bag/interface expansion. Existing CORE_REFUSED versus HOST_FAILURE consequences remain distinct. |
| Owner 3: paired invariants | T:51–71 requires whole captured prefix before command; T:73–103 requires later input after command and eventual real reply; T:198–237 pairs failure with custody. Baseline failures retained; candidate proof pending. |
| Owner 4: stale then fresh | T:217–237 refuses old selected invocation and requires later h2 on a newer generation without retrying selected. R guard returns failure without poisoning that newer runtime. |
| Owner 5: pressure/backoff | No wake/timer/recovery changes; R:925–940 and :1788–1836 preserve all existing deferrals. Remaining count is not a capacity-credit scheme. |
| Owner 6: wake/release path | Existing ingress timer transfers to queued DRAIN; T:84–103 forbids any further external rescue after send release. Shared-runtime resumption remains R:635–670. |
| Owner 7: projections | statusObservation/SHAPED_STATUS and peer diagnostics are untouched; captured length is disposable turn scheduling state, never permission or durable completion. |
| Owner 8: faithful negatives | Exact test/helper hashes and first baseline source identity are retained. Future source-only and wrong-capture treatments must alter code, preserve inputs and reach semantic assertions. |
| Owner 9: no escape hatch | Diff touches only the original runtime owner, with one private helper and no imports/exports. No alternate queue, force flag, local raw-read or recovery loop. |
| Owner 10: contract/registry/proof | DESIGN's exact hash matches behavior. Registry lifecycle description now states admitted finite capture/pre-dequeue guard; the new test is in both existing lifecycle and application contracts. It is not falsely labeled a new coupledPairs witness. Source cone remains required. |
| Admission 1: same fact | Both pre-dequeue and native-entry enforcement call refusedExecution; exact predicate is identical to baseline invokeCoreAt. No duplicated interpretation. |
| Admission 2: transient vs hard | Existing HOST_FAILURE/generation-changed remains retryable/recoveryRequired; per-envelope refusal remains separately consumed. R:394–413/:1723–1729. |
| Admission 3: existing budget | No new waiting code or values; persistence/recovery budgets untouched. Native acceptance does not establish a total queue bound. |
| Admission 4: reason shape | Same hostFailure constructor and constants; caller receives existing object, not Boolean or re-stringified reason. R:398–402. |
| Admission 5: progress event | Host admission returns through ensureExecution; ordinary consumed wake through existing enqueue; shared debt through current-generation resumption. T:73–103 and :166–195 observe actual release. |
| Admission 6: freshness | Generation, closed, handle and health read synchronously before each dequeue/continuation; capture occurs after recovery await. Count intentionally freezes extent but never freezes execution eligibility. |
| Admission 7: honest identity | Existing group/replica/peer reports unchanged; T/H bind actual group and peer messages, SHA256 bytes and native generation. No invented request/release identity. |

## Remaining qualification and stop point

No blocking source defect found. Source review approves measurement and review preservation, not a finished repair claim. The complete required candidate evidence remains pending and must bind to the final immutable source SHA and unchanged test bytes. Recheck this approval if any runtime/test/helper/contract semantics change.

Inspected root-produced scoped output reports lint/literals/grammar clear, inherited two cyclomatic and one cognitive findings, and the same two unbaselined decision-boundary findings. This reviewer did not rerun static checks. The ordinary commit hook may therefore remain red on inherited decision findings; the explicitly documented WIP preservation route cannot be represented as a green gate or terminal landing. No ratchet increase or unrelated extraction is approved.

The correction does not bound initial queue size, total accepted messages, an unresolved send duration, general fairness, owed-tick/lane service, runtime M/H accounting, release commands, TX1 admission binding, settlement, retention or snapshot recovery. It preserves the broader release successor as unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, PR #122 and bde70cec rejected. No snapshot investigation or parallel owner path was opened.
