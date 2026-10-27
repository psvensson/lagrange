# Independent review: queued generic Cell START during node shutdown

Reviewer: `subagent:/root/lab_recovery`  
Review date: 2026-10-19, source snapshot read at approximately 16:08 UTC  
Verdict: **APPROVE the bounded test-only negative candidate**  
Execution status: **Not executed by this reviewer. No remote mutation performed.**

This approval covers the exact draft below as a first adversarial witness for a generic Component Cell START that its owner has admitted before a Worker exists. It is not approval of a production correction, proof of all shutdown schedules, or acceptance of the native bound-creation U1 lifetime boundary.

## Reviewed inputs and identity

The observed repository HEAD was `19780f8dbd5c71155d4db8a3c6053570f4df7d31`. The hashes below identify the actual files read; this is a review of those file contents rather than an assertion that every workspace item belongs to that HEAD.

| Input | SHA-256 |
| --- | --- |
| Draft `/workspace/scratch/580a63fb23ca/generic-queued-start-shutdown-readiness-draft.js` | `54b6cb22050e6db9e0894549f06362c3d7c303c423eeb4da20e547585852bfdb` |
| Existing `test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js` | `cbcad2aabdf3c71c82aeb2e85baaa6c16fd8294451d85589d7a2979912255611` |
| `u1-generic-queued-start-shutdown-source-proposal-20261019.md` in this evidence directory | `1fc647876c87a1a9dcfd167cd0a7cc7abe1b775a4da39b9bb812ec7449d11f74` |
| `src/node/runtime-service-handler.js` | `f18d08ab364da40004c5c432aa404bca50d991ad565df7b3f79b8c32426d4f07` |
| `src/node/runtime-service-creation-execution.js` | `f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e` |
| `src/node/runtime-service-bound-creation-route.js` | `133b5f1e4068aa1b1352f1c6305dc547bced68ef0d3eaa151e11d50634d5b98f` |
| `src/node/runtime-service-generic-replica.js` | `a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30` |
| `src/service/service-lifecycle-manager.js` | `a4c724584dd066346ad58e9625127adb4728d1877726b59d33208eb23c0b6306` |
| `src/service/adapters/runtime-service-adapter.js` | `a87ab433bd045a4d062f4180cb34422adcce4a456aeb82d671e27d4c63af3821` |
| `src/runtime/wasi-component-cell-runtime.js` | `f8ac02f062cf7a7f5b6e922996b5b38e5a3cfeae4b8a508d6c83c8d2cd37a8a3` |
| `src/runtime/wasm-component-driver.js` | `fa68a54e9b27026683946c35b10b031e3da8012f7e97fee05651b276d41ec3d7` |
| `src/runtime/wasm-component-driver-shutdown-methods.js` | `b1bb74f60d580c8313aab623a29a8d9c6ff98c454107d9a317664b1c2dd5e29b` |
| `src/runtime/service-runtime-lifecycle-operation-methods.js` | `62395c8a3f99b6d75912b823bf1c7e0a01ff2a2a4804fdeb3456864a3b349027` |
| `src/bootstrap/phases/seed-cleanup-handler.js` | `5818ec4714d44209b4c4b0b26a232244345cad4302ba8b4d5f53516ab799ac4f` |

The complete diff against the existing test was inspected. No test or production source was changed during this review.

## Admission and exact scheduling cut

The draft uses the real `RuntimeServiceHandler.handleCreateReplica` ingress. That method captures the request, installs its execution entry and local creating memo, and schedules its continuation with `setImmediate`. The wrapper around `createReplicaAsync` calls the original with the original arguments and returns its original promise. It neither invents an execution entry nor changes an answer.

The fixture is a request Cell definition. `createRouteDecision` routes the unretained request definition to generic creation; `createGenericReplica` then calls the real manager, adapter, runtime lifecycle and driver. `RuntimeServiceAdapter` forwards create to prepare and start to runtime start. The driver calls the actual `WasiComponentCellRuntime.start` method with the pinned component bytes. The test checks the resulting replica-scoped service ID and payload digest, including hashing the supplied bytes.

The microtask cut is supported by the current source:

1. The test has begun awaiting `observed.admitted` before the public handler's `setImmediate` continuation reaches Cell START.
2. Cell `start` calls `scheduleOperation` synchronously. For the asserted empty operation map, the latter builds `Promise.resolve(undefined).catch(...).then(execute).finally(...)`, installs the operation and returns its exact promise.
3. The forwarding `catch` reaction is already queued when the observation wrapper resolves its separate admission promise. The test continuation is then queued behind that forwarding reaction.
4. Running the forwarding reaction queues `execute` behind the already queued test continuation. The test consequently sees the admitted START entry before `_start` constructs the Worker.
5. The test verifies the operation type, exact returned promise identity and zero Cell population. It invokes the real shutdown directly after those checks, with no intervening await or scheduled test callback.

This is an observation of a real admitted continuation, not a pause inserted into the production owner. If the scheduler no longer supplies this cut, `QUEUED_CELL_START_SEAM_NOT_REACHED` or `CELL_WORKER_ALREADY_EXISTS_AT_ADMISSION_SEAM` will reject the setup. Such a future failure would require reviewing the changed scheduler before interpreting it as the resource-lifetime defect.

## Real teardown, positive control and cleanup

`placementSeedShutdown` invokes the actual `SeedCleanupHandler.shutdownSharedRuntimeDependencies`. That implementation awaits runtime lifecycle shutdown, then closes the handler, then clears the remaining shared dependencies and invokes its own SQL cleanup method. The fixture supplies no RPC, control-plane service instances or SQL engine, so their no-op delegates describe absent resources. The real runtime/driver/Cell shutdown chain remains present.

The open-lifetime phase is a substantive positive control. It requires the same public CREATE and bytes to produce a live real Worker, one captured Worker reference, healthy runtime, ACTIVE local memo and CREATE_ACTIVE outcome under the exact operation ID. It then runs the same shutdown and checks the captured Worker's terminated state. A fixture that simply prevents all creation cannot satisfy this phase.

The adversarial phase joins both the original CREATE execution and the original real shutdown, and requires shutdown to have fulfilled. Its first behavioral oracle is zero `cellRuntime.instanceCount`, followed by an empty operation population, absent driver registrations, termination of captured Workers, and closed handler state without outcomes emitted after handler closure. Driver bookkeeping alone is therefore insufficient to satisfy this witness.

Current Cell `shutdown` snapshots only `cells.keys()`. At the tested cut this population is empty even though `operations` already owns the START. The queued `_start` can subsequently construct and register its real Worker. Source inspection therefore predicts the first new behavioral failure to be `NODE_SHUTDOWN_RETURNED_WITH_ADMITTED_CELL_START_ESCAPED`, if the positive phase and admitted START otherwise complete. This is a prediction, not a measured failure or assertion count. A future execution report must retain the first actual failure and must not claim that later assertions ran after an early throw.

The `finally` block restores the observation wrappers, closes the handler, joins the original promises and only then invokes the owner's second shutdown sweep. This keeps cleanup from repairing the subject before the assertions. In the presently identified missing-snapshot schedule, the second sweep can reclaim the escaped Worker after its original START has settled. The runtime's existing 10-second startup wait and the test's 30-second enclosing timeout provide bounds; this source review does not establish actual execution duration.

## Existing placement assertions and public ingress correction

Both previous direct calls to `createReplicaAsync` are replaced by `runAdmittedPlacement`. The existing route refuses work without its current canonical execution entry; using public ingress is consistent with that contract. The helper asserts INITIATED and joins the original execution observed from the public path. It reports `PLACEMENT_SETTLED_BEFORE_PUBLIC_CELL_START` if an early settlement never reaches Cell START.

All old placement outcome, local state, replica count, manager running-state, duplicate reply and explicit stop assertions remain unchanged in the diff. The added `t.after` owner cleanup does not run before those assertions. This correction does not manufacture success or relax the existing outcome expectations.

## Boundaries of this approval

- Worker references are sampled from `cells` when the original START promise settles. The positive phase captures its actual live Worker, and the identified missing-snapshot defect leaves the escaped Worker available for capture. This is not a complete census of hypothetical Workers that a different faulty implementation might remove from the map before START settles without terminating them.
- The final resource assertions occur after both original CREATE and shutdown settle. They catch the current persistent escape and late driver republication. They do not independently prove resource absence at the exact instant shutdown resolves if a different implementation permits a transient escape and cleans it up later. Stronger return-time claims would need another observation cut.
- The fixture exercises the generic request Cell path and its Component Worker owner. It does not carry a consensus creation origin/token, use the native bound physical owner, prove a distributed replacement schedule, or demonstrate the bound retirement/directory join. The draft labels that separation correctly.
- A passing execution of this one oracle would establish this bounded schedule on its immutable tested candidate. Broader shutdown acceptance still requires the appropriate additional schedules and independent production review.

No revision is required before publishing this exact test-only negative candidate and seeking its first execution result, provided the above scope remains attached to subsequent claims. The adjacent generic shutdown finding does not automatically reopen or close the distinct native bound U1 acceptance cell.
