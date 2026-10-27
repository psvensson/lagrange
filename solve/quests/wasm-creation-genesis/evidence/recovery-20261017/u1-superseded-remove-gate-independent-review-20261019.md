# U1 superseded generic REMOVE: independent contract and oracle review

Date: 2026-10-19. Reviewer: `subagent:/root/physical_lifecycle_review`.

## Verdict and exact subject

**APPROVE the narrow contract interpretation and the test oracle below.** This
is not implementation acceptance, an executed test result, general U1 approval,
or approval to merge. The production correction had not been applied when this
record was written. Its implementation and exact-candidate execution remain to
be verified.

Source base: `a55ab41296faf30a4c404c56117eacbaa993c903`.

The reviewer independently recomputed these SHA256 values after the root
agent's whitespace-only correction to the existing legacy-authorization test:

| Path | SHA256 |
| --- | --- |
| `src/node/runtime-service-generic-replica.js` | `775850400bb74828f338cc97c9a316d72d7078e13b916a5e1d2fa373d7fa0a77` |
| `test/node/runtime-service-handler.test.js` | `e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3` |

The first file is unchanged production source. The second is the reviewed
test-only candidate: two additional gate-release assertions, one subsequent
cleanup positive, and indentation of an existing test. Earlier assertions and
the labelled lifetime-witness qualifications remain intact.

## Owner question and causal failure

The handler owns an admitted canonical execution in `inProgressOperations`.
Its local replica memo is a distinct, replaceable routing projection. Losing
that memo disallows an obsolete STOP or publication; it does not transfer or
discharge the admitted execution's scheduling custody.

At the source base, `removeGenericReplica` in
`src/node/runtime-service-generic-replica.js:109-113` checks
`currentRemovalMemo` before entering `try/finally`. An admitted REMOVE stores
its exact `admittedMemo` and queues execution at lines 186-191. If the memo is
replaced before that callback executes, the execution entry still belongs to
the old REMOVE, but the check returns false. Returning at line 112 bypasses
`releaseExecution` at line 170. Later work remains busy for that canonical
replica even though the obsolete execution has finished without effects.

This is the systematic resource-lifetime error exposed by the existing
labelled queue witness: effect fencing and execution settlement must both
hold. An obsolete operation must neither affect a successor nor retain the
successor's scheduling slot indefinitely.

## Approved correction boundary

Move only the initial `currentRemovalMemo(handler, entry)` check inside the
existing `try/finally`. Preserve the remaining pre-STOP, post-STOP and
failure-publication memo checks. Reuse the existing `releaseExecution`
implementation without modification.

`src/node/runtime-service-creation-execution.js:121-125` already verifies the
exact installed entry, removes only that entry and asks the existing restart
plan owner to resume work. A replaced execution or stopped handler fails its
currentness check; an old continuation cannot delete a new execution.

This applies U1 v3 section 6 and addendum D3.6's exact settlement requirement.
It adds no durable authority, identity map, observer, retry loop or timeout.
It does not establish that a handler memo is physical-generation authority.

## Approved oracle

The reviewed test candidate extends the existing witnesses with:

1. `SUPERSEDED_QUEUED_REMOVE_RETAINED_EXECUTION_GATE`: after the existing
   post-admission/pre-STOP replacement cut, the successor memo remains intact,
   STOP has not been invoked, and the old execution gate is empty.
2. `SUPERSEDED_SETTLED_REMOVE_RETAINED_EXECUTION_GATE`: after the existing
   late-STOP completion cut, the old result has neither overwritten the
   successor nor emitted an outcome, and its execution gate is empty.
3. `admits successor cleanup after a superseded queued REMOVE releases its
   gate`: after an obsolete queued REMOVE has produced zero STOP calls and
   zero outcomes, a subsequent legitimate REMOVE enters through
   `handleRemoveReplica`, receives INITIATED, executes exactly one STOP, emits
   exactly one result under `successor-remove`, reaches REMOVED and leaves an
   empty gate.

The third witness uses the production generic memo shape without a creation
`operationId`; otherwise `namesCreation` could send the follow-up through the
bound retirement route and measure the wrong mechanism. Both lifecycle and
legacy authority are explicit component stubs. The direct memo replacement
is a labelled scheduling cut, not proof of a currently reachable distributed
production REPLACE interleaving. No physical-generation claim follows from
these tests.

On unchanged production source, source analysis predicts two new behavioral
failures: the queued gate-size assertion and successor cleanup admission.
The late-STOP gate assertion should already pass because that early return
is inside `try/finally`. These predictions must be checked against retained
runner output; they are not reported as executed evidence here. Acceptance
requires the unchanged-source negative and corrected-source positive to
reach these named assertions, not merely exit with different statuses.

## Sibling and checklist review

The applicable concurrency, admission, fixture-fidelity and owner-interaction
templates were read. This review is bounded to the contract/oracle; execution
items remain pending rather than being marked passed from source inspection.

| Concern | Source or oracle finding |
| --- | --- |
| Synchronous admission and key scope | `installExecution` at `runtime-service-creation-execution.js:108-118` gates the canonical replica and request identity synchronously. This change does not alter admission or its key. |
| Await and queued reentrancy | Existing `currentRemovalMemo` checks remain before physical STOP and after its settlement. The new assertion measures the queue cut; the existing late-settlement witness measures the await cut. |
| Hold release and retry | The same `releaseExecution` owns release and restart-plan wake. The successor-cleanup positive demonstrates ordinary ingress can be admitted after release. No new wait, budget or request-sized state is added. |
| Refusal and reason shape | No request classification, response shape, error vocabulary or coordinator outcome is changed. Superseded work remains silent. |
| Generic CREATE sibling | Its pre-try check at `runtime-service-generic-replica.js:40` requires current execution and exact params. A mismatched internal call must not release another valid execution. No equivalent current-entry/memo-mismatch leak was found. |
| Bound CREATE sibling | `runtime-service-bound-creation-route.js:266-295` returns before/after await only when the execution is not current; otherwise the existing finally releases it. |
| Bound REMOVE sibling | `runtime-service-bound-creation-route.js:611-635` uses exact-entry settlement, and its queued error handler releases the entry on settlement failure. No equivalent current-entry/memo-mismatch exit was found. |
| Paired invariant | The successor-cleanup witness checks zero obsolete effects and subsequent admitted cleanup in one deterministic ordering. Adding only a no-STOP assertion would miss the stranded gate. |
| Time and field fidelity | The test uses existing immediate-turn flushing, without changing production budgets. Explicit generic fields avoid accidental bound-route selection. |
| Non-vacuity and negative controls | First REMOVE must be INITIATED. The positive must later observe one STOP and one successor request result. Named behavioral negatives and corrected-source execution remain required. |
| Projection authority and escape hatches | The proposal adds no raw owner reads or replacement decision path. It releases the admitted execution even though the local projection has changed; it does not turn the projection into durable authority. |
| Registry and wider proof | The existing runtime-service bound-creation interaction remains the containing U1 contract. This approval does not waive generated metadata, static checks, independent implementation review, or the exact combined suite. |

## Broader source findings, not covered by this approval

The existing physical WASM owner already snapshots STOP targets before await
(`wasm-service-lifecycle.js:634-641`), keeps exact replica cleanup custody and
conditionally deletes only its own registry entry (`:655-665`). The replica
captures its original transport handler and one settlement before asynchronous
retirement (`wasm-service-replica-lifecycle.js:319-350`), then retires that exact
handler (`:272-288`). Existing physical lifecycle tests cover a legal generic
successor during the old STOP (`wasm-service-lifecycle.test.js:566-613`) and
successor port/diagnostic ownership (`:651-721`). These tests were inspected,
not rerun for this review.

Upper generic paths have a distinct apparent lifetime gap: the WASM driver
deletes service-keyed bookkeeping after the physical STOP await
(`wasm-component-driver.js:568-589`); the runtime then removes the endpoint and
projects STOPPED by service ID
(`service-runtime-lifecycle-operation-methods.js:520-533`, failure path
`:549-552`); manager generic state is likewise keyed rather than
incarnation-qualified (`service-lifecycle-operations.js:292-299`,
`service-lifecycle-state-record.js:11-13`). Native JS has the same post-await
bookkeeping pattern (`native-js-driver.js:289-298`). This requires a composed
owner-ingress witness before implementation judgment.

The reachability ceiling matters. The current handler gate excludes a second
ordinary CREATE for the same canonical replica while REMOVE is admitted.
Production startup reconciler actual-state readers enumerate message groups
and partitions, not runtime services (`seed-infrastructure-phase.js:343-365`,
`node-joining-replica-descriptor-coordination.js:169-192`). No production caller
of `RuntimeServiceHandler.registerExistingReplica` was found. Generic and
bound descriptors do not necessarily share the same physical service key.
Equal canonical replica IDs alone therefore do not prove a physical collision.

A separate generic shutdown observation also needs a composed witness:
runtime shutdown does not close a pending generic operation scope
(`service-runtime-lifecycle-operation-methods.js:114-139`), seed cleanup sweeps
drivers before closing the handler (`seed-cleanup-handler.js:591-605`), and
`consensusClosing` is checked for bound creations only
(`wasm-service-lifecycle.js:223-225`). This record does not claim that scenario
was executed or authorize a broader change under the narrow gate correction.

The reviewer made no production or test edits, commits, test runs, lab
submissions or GitHub comments. This new evidence record is the only edit.
