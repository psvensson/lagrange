# U1 P-R8: independent bounded supersession and gate-oracle review

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Verdict and scope

**APPROVE the narrow P-R8 oracle supersession:** after an exact bound creation
has completed retirement and its in-process memo is already `REMOVED`, a later
REMOVE may return synchronous `ReplicaOperationResponseStatus.COMPLETED`
without admitting another execution or emitting another
`RUNTIME_SERVICE_REMOVE_COMPLETED` event. Preserve the recorded `NOT_FOUND`
answer after an honest completed host restart has no retained memo or live
services custody for that replica.

**APPROVE the three handler gate-release oracle additions** in the reviewed
working-tree test: release after a superseded queued REMOVE, release after a
superseded awaited STOP settles, and successful independent admission of later
successor cleanup. These are handler-local lifetime and retry witnesses.

These are contract/oracle approvals. They are not production-source acceptance,
a behavioral result, full U1 acceptance, or permission to start U2. Production
source was unchanged from `a55ab41296faf30a4c404c56117eacbaa993c903` during this
review. The reviewer authored no candidate source or tests and executed no
tests. Root authorized writing this new evidence file only. The known early
return before `removeGenericReplica`'s `try/finally` remains a production defect
at the reviewed source; the gate-oracle approval does not approve that defect.

## Actual owners and callers

The decision follows the protocol and its real consumer, rather than using
the revised test as authority.

| Boundary | Source and conclusion |
| --- | --- |
| Handler REMOVE ingress | `src/node/runtime-service-handler.js:479–545` validates the request and target, refuses conflicting execution identities, and routes a named creation through bound removal only while its memo is not `REMOVED`. The already-`REMOVED` case reaches the existing generic admission owner. |
| No new execution for completed local custody | `src/node/runtime-service-generic-replica.js:174–194` checks existing execution custody first. With no busy entry and a `REMOVED` memo, it returns `COMPLETED` before installing an entry or queuing STOP. There is consequently no newly admitted asynchronous execution whose completion event is owed. |
| First bound retirement remains fully gated | `src/node/runtime-service-bound-creation-route.js:478–501,532–608` distinguishes physical finality, original journal disposition, and current memo ownership. A live retirement result is completed only with `FINAL` plus `CREATION_ROW_COMPLETED`; held results retain their obligation. Original terminal-row replay and sealed never-admitted cancellation remain separately classified. |
| Original journal completion | `src/service/service-consensus-bootstrap.js:125–146` awaits the bound stop result, refuses non-final or `RETIRED_UNPROJECTED` results, and only then attempts original-journal completion. `src/service/service-consensus-creation-intent.js:393–415` writes/rereads the exact original operation and confirms its identity and `COMPLETED` state. Physical finality does not substitute for this observation. |
| Completed restart inventory | `src/wasm-service/operation-lifecycle.js:221–225` selects only `PENDING` and `IN_PROGRESS`. `src/service/service-lifecycle-manager.js:532–539` uses that owner query. With the completed row excluded and no memo or recoverable live services row, `runtime-service-handler.js:491–505` returns `NOT_FOUND`. This is the existing recorded completed-restart case, not a general permission to infer physical absence from a missing cache entry. |
| Actual coordinator response consumer | `src/rebalancer/operation-workflow-dispatch-response-reconcile.js:837–850,915–950` passes the real dispatch reply into `_handleDispatchResponse` and routes REMOVE `COMPLETED` and `NOT_FOUND` to `handleStopPhaseSatisfiedResponse`. |
| Precise synchronous-reply semantics | `src/rebalancer/priority-publication-safety-topology.js:42–77` advances or retains `STOPPING`. `priority-publication-safety-shared.js:43–47` contains **only `NOT_FOUND`** in the source-absent response set. Therefore `COMPLETED` does **not** itself complete the coordinator operation: its ordinary REMOVE result is `IN_PROGRESS` at `STOPPING`. `NOT_FOUND` follows the existing direct stop-satisfied completion path. Runtime-service REPLACE additionally retains its active-target terminal-handoff check; partition REPLACE has its separate committed-membership owner. |
| Coordinator continuation without a duplicate event | `src/rebalancer/operation-workflow-recovery-timeout.js:588–592` selects STOPPING reconciliation for REMOVE/REPLACE. `operation-workflow-recovery-observation.js:578–614,653–735` observes the exact target with `allowPartitionNodeFallback:false`, completes on `ABSENT`, defers unavailable evidence, and replays removal while a row remains. `replica-operation-repository-observation-methods.js:455–557` requires a successful authoritative absence observation and refuses a contradicting live cached row. No duplicate executor event is a prerequisite for this path. |
| Level-triggered liveness and durable terminal write | `src/rebalancer/rebalance-coordinator-lifecycle.js:681–699` invokes the existing orphan reconciler from its timeout cadence. `operation-workflow-recovery-timeout.js:410–532` considers locally owned incomplete work under the existing owner lane and bounded actionable/stale predicates. `operation-workflow-transition-persistence.js:385–469` owns the durable terminal transition. This establishes an existing continuation, not an immediate-completion or latency promise for P-R8. |

The original `cb1f0959` explanation must be read with this correction: calling
the stop-phase owner is not equivalent to obtaining a completed coordinator
operation from the `COMPLETED` reply. The current test's assertion message
about a coordinator consuming the reply denotes the intended external
consumer; it is not evidence that this fixture instantiates that consumer.

## Approved addendum text

The following is the precise bounded supersession approved by this review.
It may be appended to the recovery contract without changing the historical
text or failure receipts:

> **P-R8 completed-local-custody response addendum.** The P-R8 in-process
> expectation that every repeated REMOVE emits another
> `RUNTIME_SERVICE_REMOVE_COMPLETED` is superseded only for the already
> `REMOVED` local-memo branch. After the original bound retirement has
> satisfied its existing physical-finality, exact STOPPED-projection and
> confirmed original-journal-completion obligations, an equal-target later
> REMOVE with no conflicting or in-flight execution may return synchronous
> `ReplicaOperationResponseStatus.COMPLETED`. That reply admits no new STOP
> execution and owes no duplicate executor completion event. A terminal CREATE
> redelivery must not reopen that retired custody.
>
> The replica-operation workflow owner consumes this synchronous reply and
> owns subsequent STOPPING reconciliation. `COMPLETED` alone does not complete
> the coordinator operation. Exact source absence is established by its
> existing observation owner before ordinary STOPPING completion; unavailable
> or contradictory evidence retains the existing retry disposition. This
> addendum creates no new timer, workflow owner, or inference from a handler
> memo to durable coordinator completion.
>
> After the completed host restart represented by P-R8, the completed creation
> row remains excluded from unfinished-work inventory. When that restarted
> handler has neither a retained memo nor recoverable live services custody,
> its REMOVE answer remains `NOT_FOUND`, consumed by the existing coordinator
> stop-satisfied path. No new physical effect or executor event is owed for
> that absent-custody reply.
>
> The supersession changes only the response carrier for already completed
> local custody. It does not allow a PENDING, HELD, REMOVING, unprojected, or
> journal-unconfirmed creation to claim completed retirement. It does not
> change terminal-row bound replay, R3-D cancellation handling, admitted
> coordinator-observer settlement, exact-origin matching, successor exclusion,
> or the requirement that the original creation journal completes only after
> its own retirement prerequisites. Existing P-R5/P-R7 and v3 physical-versus-
> journal negative witnesses remain required.

This explicitly supersedes the event-specific reading in
`RECOVERY-DESIGN-20261017.md` P-R8 (`:241`, revised table `:523`) and its
in-process test expectation. It does not replace R1-D's substantive retirement
obligations or the later v3 section 8 completion rules. A different terminal
row routed through the bound owner is outside this already-`REMOVED` shortcut.

## P-R8 execution ceiling

The reviewed P-R8 body is
`test/wasm-service/bound-creation-restart.integration.test.js:359–387`.
It first retires a real published bound creation, observes original journal
completion, redelivers CREATE and checks the permanent terminal answer and
unchanged `REMOVED` memo, checks synchronous repeated REMOVE and no additional
completion event, then restarts the host and checks empty inventory and
`NOT_FOUND`. Its event-count and journal assertions were not deleted by the
supersession; the earlier wait for a second event was replaced by the actual
synchronous result contract.

The embedding's `e.dispatch` invokes `host.handler.handleMessage` directly
(`bound-creation-handler-embedding-fixture.js:308–320`). The emitter collects
outcomes and `e.settle` joins handler work and fixture delivery
(`:322–334`); it does not run a coordinator. The fixture composes the actual
native, lifecycle, metadata and journal owners, but P-R8 alone does not assert
every physical retirement fact at every duplicate step. The existing
`assertRetiredAndCompleted` helper (`restart.integration.test.js:155–161`)
and companion retirement witnesses establish that separate ceiling. This
review does not credit P-R8 alone with detecting arbitrary physical-retirement
defects, nor with proving coordinator scheduling, real network delivery,
process-kill recovery, or production asynchronous projection completion.

## Gate-release oracle ruling

The reviewed handler block is
`test/node/runtime-service-handler.test.js:641–751` including root's new
assertions at `:666–667`, `:711–712` and the new test at `:715–751`.
The already-approved v3 section 6 (`:99–109`) requires each admitted attempt
to settle and release the exact installed entry before queued work resumes.
`runtime-service-creation-execution.js:89–92,108–125` supplies that exact-entry
admission and conditional release owner.

Both suppressed stale settlement paths must surrender their own gate when
their attempt ends. Suppressing an obsolete memo/outcome write does not confer
permission to strand the slot. The new successor-cleanup witness provides a
useful behavioral consequence beyond map-size inspection: after the old
queued attempt loses its exact memo, a separately authorized later REMOVE
must be admitted, perform exactly one mocked STOP, and emit only its own
operation's result. This discriminates an execution leak from successful
successor exclusion.

The direct memo replacement and mocked lifecycle/legacy-authorization owner
are explicit consumer seams. They do not establish that production successor
admission can create this interleave, that a physical STOP is incarnation-safe,
or that the real operation repository grants the later request. In the awaited
witness the STOP was deliberately entered; a handler cannot undo its effects
by suppressing a late event. Physical custody remains a separate acceptance
question. The pre-`try` return in current `removeGenericReplica` explains why
the new queued-release oracle should distinguish the needed repair; no test
execution was performed to claim a red or green result here.

## Other revised or added oracles still requiring their bounded ruling

Scope: commits affecting `test/` after `265d1a95c1d6ff731e40459fbca023e226c97807`
through `a55ab41296faf30a4c404c56117eacbaa993c903`. I inspected that path-limited
commit census and the relevant GitHub commit patches, together with the
existing independent-review records. The following have no later explicit
content-bound independent oracle verdict located in that reviewed record.
This is a list of remaining witness-review work, not a rejection of their
semantic expectations and not a new demand for design approval already given
by v3. A supplied later exact-byte verdict can discharge an item.

| Checkpoint and witness change | Remaining ruling and scope |
| --- | --- |
| `cb7aea2e`: P-R11 wake uses the full actually retained token; conflicting inventory observation asserts canonical `.outcome` instead of `.code` | Independently confirm the token is the actual wake-owner prerequisite and the thrown carrier is the inventory owner's canonical corruption result. The same commit's P-R8 monotonic `REMOVED` expectation is covered by this review. |
| `588c3499`: P-R7 STOPPED-but-journal-write-failed case changes from REMOVE_COMPLETED to REMOVE_HELD and asserts zero completed events | v3 section 8 already requires this semantic distinction. The altered fault engagement and assertion implementation still require their exact witness ruling; this P-R8 review does not certify them by association. |
| `588c3499` then `9d658ace`: P-R12 sealed tokenless cancellation memo changes to permanent `FAILED` with no retry flag; terminal CREATE must preserve it; repeated REMOVE still re-reads the original terminal journal and emits completion | Independently check the final tokenless-cancellation versus token-bearing physical-retirement distinction against R3-D/F1. The intermediate `REMOVED` cancellation oracle was replaced and is not approved by this verdict. |
| `4cc155b8`: overlapping startup-inventory witness waits for all real replicas to materialize before formation | Review the bounded physical-materialization prerequisite and the original overlapping-read discriminator. The patch does not enlarge `SETTLE_ROUNDS`, but setup correctness and retained failure sensitivity still need a witness ruling. |
| `f07ed531` and `7bcfa6f2`: opaque falsely bound target rejection; legacy positive/wrong-entity handler witnesses gain explicit original-owner authorization responses; new strict repository-read authorization test | Review these as separate node-consumer and operation-owner witnesses. An injected ADMITTED response is not execution evidence for the strict repository owner. The earlier services-row-only authorization assumption must not be revived. |
| `47798323`: a rejected wrong-entity request leaves no memo and later exact original cleanup succeeds once | Review the positive retry half and exact original-owner request identity. This is distinct from gate release after an already admitted request loses its memo. |
| `f26d25c8`: unavailable original owner leaves retryable custody; a delayed owner reply cannot authorize STOP after a successor memo appears | Independent oracle ruling remains for these pre-admission/authorization-return witnesses. The current review covers the later queued/STOP-return cuts and their gate assertions, not every earlier authorization seam. |

`c3ec5488` is the preserved wrong-entity negative predecessor carried into the
later authorization group. `6d8975a2` and the `a55ab412` post-await test are
covered here only as the reviewed handler-local successor/gate block.
`cb1f0959` is the P-R8 emission supersession approved above. No claim is made
about test revisions at or before the excluded lower endpoint `265d1a95`, or
about a fresh audit of the complete U1 witness matrix.

## Content bindings

SHA256 is over the complete on-disk file bytes at review, unless a bounded
line block is explicitly named. The production files below are the unchanged
`a55ab412` source. The handler test includes root's gate-release additions.
Hashing a file binds context; it does not extend the narrow verdict to every
test or source behavior in that file.

| Input | SHA256 |
| --- | --- |
| `RECOVERY-DESIGN-20261017.md` | `179efd62c174146fd34c29cd78e5f4b304b346aea67dd841ba5076e8fc069183` |
| `u1-inventory-continuation-contract-v3.md` | `6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048` |
| `u1-inventory-continuation-contract-v3-addendum.md` | `401f90a5f09a3056573ee1d8ab8b57cee6135c721355295e0e1506ceb93303ae` |
| `src/node/runtime-service-handler.js` | `f18d08ab364da40004c5c432aa404bca50d991ad565df7b3f79b8c32426d4f07` |
| `src/node/runtime-service-generic-replica.js` | `775850400bb74828f338cc97c9a316d72d7078e13b916a5e1d2fa373d7fa0a77` |
| `src/node/runtime-service-creation-execution.js` | `f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e` |
| `src/node/runtime-service-bound-creation-route.js` | `133b5f1e4068aa1b1352f1c6305dc547bced68ef0d3eaa151e11d50634d5b98f` |
| `src/service/service-consensus-bootstrap.js` | `1b60a815cb70106d797a9b4e6e5b9767ce59ecbfbe5fc316e8504c98fd2008cd` |
| `src/service/service-consensus-creation-intent.js` | `19f996fc5c079db1a01096ad4d657a1ee8c4d53db1c63bcd6ffb75e18db4ed3d` |
| `src/service/service-lifecycle-manager.js` | `a4c724584dd066346ad58e9625127adb4728d1877726b59d33208eb23c0b6306` |
| `src/service/service-lifecycle-recovery.js` | `0583978e87c2108de121a295157489e97731dea0308a69ad52993a82ee8d655b` |
| `src/wasm-service/operation-lifecycle.js` | `d5135aa12006dd254cf614eff542891bf8be03fc6737e819d1036092ce9e37c9` |
| `src/node/runtime-service-restart-inventory.js` | `44dcac34efec16d4991b6433e1fb8a807f86a4201f41568c894d55c688197e20` |
| `src/rebalancer/operation-workflow-dispatch-response-reconcile.js` | `dbed631a189fdd7cad624b69de6c252fa8bfedecc9efef8a66ed00572c911a9d` |
| `src/rebalancer/priority-publication-safety-topology.js` | `a9aa6bb129d6f0816f75e2cb86cc2ff940bd0891133b27445a957dabe66c2765` |
| `src/rebalancer/priority-publication-safety-shared.js` | `e15f06bc6281396461fa9cbe3341040a86a3f8a5889e2dcdd0031c2aeb91d163` |
| `src/rebalancer/operation-workflow-recovery-observation.js` | `873b6090fb908b75a36ce0afe06f698c18ebe5e11be6bd74ec0cceb33229ff1c` |
| `src/rebalancer/replica-operation-repository-observation-methods.js` | `a9bb0a65d3033bae278949303ea940c84328d677cd91ab65124c68ae9c88904e` |
| `src/rebalancer/operation-workflow-recovery-timeout.js` | `87d897f6941d0352e2f75e29e9c4504bc7310fa9050055437a6c936d1a862cc1` |
| `src/rebalancer/rebalance-coordinator-lifecycle.js` | `847be9164a707bb4c99590e5c9fc874345581ae1056cce6ee353abd6bb17b095` |
| `src/rebalancer/operation-workflow-transition-persistence.js` | `8556662062220af0cf356f483201ca16b0fae59344e48fcdc754dc44b7cab628` |
| `test/wasm-service/bound-creation-restart.integration.test.js` | `197cf1610af6b779dfed1edb60c86faa31b882b47967b4b493a5963e29c1f945` |
| `test/wasm-service/bound-creation-handler-embedding-fixture.js` | `fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515` |
| `test/node/runtime-service-handler.test.js` | `e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3` |
| `test/control-plane/replica-dispatch-reservation-identity.test.js` (pending-review context only) | `237a4dcdaab017ba0a450e61de24472c84c8cbff054a23b834921f855c82cb21` |
| P-R8 block, restart test lines 359–388 including final blank line, 1,985 bytes | `1ae984c3e540870a9b58da946c409a5caf3b7cd586159e7e1d887eab59d5afa7` |
| Handler successor/gate block, lines 641–751, 6,291 bytes | `1f6bba0e6e443935070fcef9150fd80baa80aadfda9ea01f3d19e5749dacbcae` |

Contract filenames in this table are under the quest and this evidence
directory respectively. The complete source and test paths are repository
relative. Earlier review receipts, measured red/green lab results and sealed
contract versions remain historical evidence; this file rewrites none of them.
