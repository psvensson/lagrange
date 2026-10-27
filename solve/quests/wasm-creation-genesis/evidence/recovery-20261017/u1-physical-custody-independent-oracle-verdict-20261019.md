# U1 physical custody: independent 14-case oracle verdict

Reviewer: `subagent:/root/f1_independent_review`, 2026-10-19.

## Verdict and binding

**APPROVE the test oracle for preservation and authorized lab execution.**
I found no substantive fixture fault requiring a test repair before the
checkpoint is published. This is independent static oracle review, not a
production-source acceptance or an executed test result. No behavioral test
was run locally.

The reviewed file is
`test/wasm-service/bound-creation-physical-custody.integration.test.js`,
22,311 bytes, 461 lines, SHA256
`fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad`.
It was observed at local HEAD
`9712a8860112deb0baed6d85643904461698b4c2` with a clean working tree. Its
embedding fixture has SHA256
`fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515`.
An independent `node --check` of the test file returned exit 0. The adjacent
`u1-physical-custody-oracle-bindings-20261019.json` records all reviewed source,
fixture and contract file hashes. The author is root; this reviewer did not
write or alter the custody test or its production candidate.

## Contract and fixture engagement

The assertions follow approved U1 v3 sections 7a, 8 and 10, the independently
approved physical-state clarification, and the approved STOPPED-projection
debt clarification. The physical-state proposal still labels itself proposed;
its companion independent design verdict supplies the approval. The test
correctly distinguishes CREATED/STARTING/READY admission from the existing
`.live` resource-custody predicate. It never treats `.live === false`, an
absent services row or a manager memo as physical admission authority.

The embedding constructs actual WasmServiceLifecycle, replica, driver,
runtime, adapter, manager, handler, native raft-rs, data-directory process
owner, SQLite journal/local record, metadata owners, ServicesOwner and
endpoint writer. Its authored seams are explicit: one component SQLite
metadata store, queued loopback transport, virtual time, prerequisite cache
rows for the unrelated services partition, and the particular paused or
failing collaborator under examination. Target services rows, local phases,
metadata close results and original journal states are read from effects of
the real owners. The tests do not author those authority answers.

`publishedWorld` requires all three real native replicas to become held,
forms the native group through the existing fixture, then requires all three
to publish. The projection tests additionally assert the target services row
is active and its original journal is in_progress before withholding the
specific STOPPED effect. This excludes a false positive caused by a group
that never reached publication.

## Case-by-case oracle assessment

| Cases | Real engagement and decisive assertion | Assessment |
| --- | --- | --- |
| 1: physical states | Actual prepare creates a CREATED object; initialize supplies STARTING/READY, start reaches BOOTSTRAPPED_HELD, direct shutdown supplies STOPPING and still-registered STOPPED, lifecycle removal supplies ABSENT, and closed lifetime supplies UNAVAILABLE. | Valid distinction between start admission and retained physical custody, including normal-start reachability. |
| 2: full identity | A valid immutable runtimeRef change leaves the slot token identical; production intent capture validates the changed body. | `TOKEN_ONLY_COMPARISON_ACCEPTED_OTHER_INTENT` is a valid token-only comparison control, not malformed input. Observation is also required to leave unopened storage absent. |
| 3: failed cleanup | Actual exact-handler unregister throws; stop rejects with the named error while the object is CLEANUP_REQUIRED, `.live` is true and its database remains open. | Fenced admission is checked while real cleanup custody remains. Restoring the actual collaborator allows teardown to retry. |
| 4: reentrant shutdown | The actual metadata-release call synchronously invokes shutdown while the admitted by-path retirement waits on a gate. | The shutdown must remain pending until the gate is released; the post-fence exact request cannot reenter metadata. The collaborator does not await shutdown, so the fixture itself introduces no circular wait. |
| 5: coalescing and collision | The actual release seam is entered, twenty equal immutable requests and one valid changed-body request arrive while it is held. | One owner effect, FINAL for equal requests and CONTENT_CONFLICT for changed content directly reject duplicate effects and token-only coalescing. This tests effects, not an allocation count for waiter memory. |
| 6: failed retirement debt | The real local row is ADMITTED; exact-handler failure interrupts an admitted retirement before tombstoning and leaves its database open. | Shutdown retry must write the actual local RETIRED record, close the database and remove the exact object. This catches substitution of an ordinary stop for retained retirement debt. |
| 7: retirement joining an ordinary failed stop | Actual creationReconciliation.shutdown is paused after direct ordinary shutdown set STOPPING. Retirement must reach the real metadata owner and set RELEASING before the ordinary stop encounters exact-handler failure. | The ordinary stop's error, CLEANUP_REQUIRED object, open database and unchanged ADMITTED row establish the cut. A later shutdown retry must preserve the joining retirement's tombstone debt. The test does not manufacture a retirement answer. |
| 8: direct STOPPING admission fence | Actual ordinary shutdown is paused at its reconciliation boundary, and the object is proved absent from lifecycle.retiringReplicas. | A second bound object must be refused while the original database and registration remain held. Once shutdown settles and lifecycle removal completes, explicit recreation must succeed. This excludes a permanently refusing implementation. |
| 9–10: lost history | Initial real retirement acknowledges CLOSED; two actual owner selections discard the old binding history; a real close then returns HISTORY_UNAVAILABLE. | Exact RETIRED storage yields FINAL while preserving `closed: false` and the raw history answer; missing storage remains UNRESOLVED. The missing-storage case is the required adjacent negative control, not a fabricated history response. |
| 11: stale prepared origin | The old resource is really closed and a successor is really selected/prepared. The one declared seam reinstalls the old prepared descriptor while the successor owns physical custody. | Old-context start must fail before the service-keyed start call; the successor object, CREATED state and absent storage remain unchanged. A prepared pointer supplies no physical authority. |
| 12–14: projection debt | Real native publication and physical RETIRED/CLOSED occur; only the exact old STOPPED writer throws, returns retained, or is absent. | The old services row and original journal must remain owed, finality remains FINAL, status is RETIRED_UNPROJECTED and no completion is exposed. Restoring the writer and retrying the same origin must remove that row and complete that journal without creating a generic STOP journal or completing another origin. |

## Cleanup, scheduling and negative-control suitability

The paused release and reconciliation seams are released in `finally` and
admitted work is joined after release. In particular, the duplicate/collision
test releases the gate before waiting for the answers, so a faulty second
metadata invocation can fail the direct call-count assertion without being
held forever by the test. The ordinary-stop failure test captures the expected
shutdown rejection as a value, preventing that intentional failure from
becoming an unrelated unhandled rejection. The direct-STOPPING test releases
and joins the original stop even when its expected admission refusal fails.
The exact-handler faults and STOPPED writer are restored before cleanup.

The embedding's teardown waits for lifecycle shutdown before releasing its
data-directory process owner and retains failed cleanup evidence instead of
silently discarding it. Teardown covers an initialize still in flight or a
successor CREATED by a faulty start/recreation implementation. A spy on
service-keyed start is local to the disposable host and does not affect
shutdown.

No fixture-induced circular wait is present for the intended controls:
late retirement registration, duplicated owner release, changed-body
coalescing, loss of retirement intent, use of `.live` for STOPPING admission,
history-as-CLOSED or missing-as-RETIRED inference, stale physical-currentness
omission, and premature journal completion after a withheld STOPPED effect.
This static verdict does not promise termination for every arbitrary
production mutant. The `entered` promises deliberately require the real
collaborator boundary to be reached; a mutant that never reaches that boundary
must be classified as admission/setup failure or bounded runner failure, not
as the required direct behavioral counterexample. A mutant that deadlocks
inside production after the released seam likewise needs the lab's normal
bounded execution evidence. No local timeout is added to guess finality.

## Evidence limits and remaining gates

The first three cases call the new observation method through a literal
interface assertion. On unchanged source that lacks that method, their
`PHYSICAL_OWNER_CURRENTNESS_OBSERVATION_MISSING` failures establish only the
interface prerequisite. They do not prove the requested CURRENT/UNAVAILABLE
state distinctions until the method exists and those exact assertions
execute. Missing new result fields in other red cases similarly do not by
themselves establish the deeper race assertion.

The remaining cases have concrete old-source effects to expose independently:
unjoined by-path retirement, multiple metadata releases, lost tombstone debt,
replacement of a directly stopping object, false history finality, stale
service-keyed start, and journal completion while the services effect remains
owed. Expected red classifications must use the actual direct assertion and
setup evidence, not merely nonzero exit status.

This file is complementary physical/process-custody evidence. It does not
replace the v3 complete inventory, routing, handler-gate, manager projection,
stale return and endpoint ownership matrix. The three-host embedding is one
process with component SQLite metadata and queued loopback transport; it is
not multi-host native metadata consensus, abrupt process death, pre-INIT WAL
recovery, or a real data-directory handoff race. Those evidence populations
retain their separate gates.

No behavior was executed or production source approved by this oracle review.
Corrected-source green execution and the necessary source-only negative
controls with frozen tests remain required before the corresponding U1
implementation claims can close.
