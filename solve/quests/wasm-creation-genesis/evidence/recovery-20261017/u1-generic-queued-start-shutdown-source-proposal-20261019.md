# Generic queued START and node shutdown: source finding and proposed witness

Date: 2026-10-19. Author: `subagent:/root/physical_lifecycle_review`.

**Source-only finding and an unimplemented test proposal. No behavioral result,
negative-control result, production fix, or U1 acceptance follows from this
record.** This is separate from the superseded generic REMOVE gate correction
and the five reconstructed bound actual-return oracles.

## Source subject

Observed checkout HEAD: `407fab824339340e1d6b0ac4b8e483f2f7927702`.
Independently read source hashes:

| Path | SHA256 |
| --- | --- |
| `src/runtime/wasi-component-cell-runtime.js` | `f8ac02f062cf7a7f5b6e922996b5b38e5a3cfeae4b8a508d6c83c8d2cd37a8a3` |
| `src/runtime/wasm-component-driver.js` | `fa68a54e9b27026683946c35b10b031e3da8012f7e97fee05651b276d41ec3d7` |
| `src/runtime/wasm-component-driver-shutdown-methods.js` | `b1bb74f60d580c8313aab623a29a8d9c6ff98c454107d9a317664b1c2dd5e29b` |
| `src/runtime/service-runtime-lifecycle-operation-methods.js` | `62395c8a3f99b6d75912b823bf1c7e0a01ff2a2a4804fdeb3456864a3b349027` |
| `src/bootstrap/phases/seed-cleanup-handler.js` | `5818ec4714d44209b4c4b0b26a232244345cad4302ba8b4d5f53516ab799ac4f` |

## Existing ownership and the missing population

The Cell runtime's public `start(cell)` calls its existing per-service
`scheduleOperation` at `wasi-component-cell-runtime.js:182-202`. Admission
synchronously installs an entry in `operations`. Execution then passes through
`Promise.resolve(current?.promise).catch(...).then(execute)`. The actual Worker
and its `cells` entry are created later in `_start` at lines 219-254.

The same owner's `shutdown`, lines 732-735, snapshots only `cells.keys()` and
issues STOP for those keys. It neither closes admission nor includes an
already-admitted START that has not created a cell. Driver shutdown awaits
that sweep and then clears its own keyed maps and sets at
`wasm-component-driver-shutdown-methods.js:28-44`.

The actual seed cleanup method,
`seed-cleanup-handler.js:591-607`, invokes runtime shutdown before it clears
the runtime service handler. A queued START omitted by the physical snapshot
can therefore run while or after the upper teardown completes. No additional
identity registry is needed to observe the omitted operation: the Cell owner
already holds it in `operations`.

This source path is distinct from the native bound creation owner's exact
object retirement and `consensusClosing` fence. It should not be repaired by
making a handler memo a second physical admission authority.

## Proposed composed witness

Use `createProductionPlacementFixture` in
`test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js`:
real handler, manager, adapter, runtime lifecycle, driver and Component Worker.
Reuse the actual `SeedCleanupHandler.shutdownSharedRuntimeDependencies`
method with delegates returning those real owners. The existing readiness
placement case calls `createReplicaAsync` without an admitted execution; its
fixture is useful, but that invocation must not be copied.

1. Enter through `handler.handleCreateReplica`, with catalog entity
   `binding-service-request-cell`, canonical replica
   `binding-service-request-cell-r1`, and a fresh operation ID.
2. Transparently observe the public `cellRuntime.start`: call the original,
   capture its actual returned promise, resolve an observation promise, then
   return the original promise unchanged. Do not change the executor, invent
   a success result, or write a registry.
3. The test is already awaiting that observation. For a fresh key, the real
   scheduler's first promise propagation is queued before the observation,
   while its subsequent execution is queued after the test continuation.
   Check the seam explicitly: START is registered under the expected key and
   `instanceCount` is zero. A missed seam is a setup failure, not evidence of
   a passing regression.
4. Invoke the real seed cleanup immediately from that continuation. Observe
   the original manager START promise without replacing its behavior and
   await both it and cleanup. Permit an interrupted START to be refused or
   drained; successful completed shutdown must leave no physical Worker.
5. Assert zero actual instances, no outstanding Cell operation, no late
   driver running/context custody, a closed handler and no late CREATE_ACTIVE
   outcome. A positive using the same fixture, bytes and public CREATE without
   shutdown must reach one real Worker. Always join and clean up through the
   real owners in `finally`.

The exact physical key is `binding-service-request-cell-r1` throughout this
path: `genericCreateHandle` assigns camel-case `serviceId: replicaId`, the
fixture catalog row has snake-case `service_id`, and the runtime/driver prefer
the camel-case field. This does not infer a bound creation's physical service
key from its canonical replica ID.

## Why the physical oracle is necessary

The predicted failure is an actual Cell entry/Worker surviving the completed
empty snapshot, while driver shutdown has already erased `_prepared` and
`_requestCells`. Runtime health can then report unprepared or unhealthy despite
the physical leak. Conversely, request-cell START can repopulate `_running`
and `_replicaContexts` after its await (`wasm-component-driver.js:434-445`).

A later production SQL/projection failure does not by itself prove recovery:
runtime START's catch calls `driver.stop` at
`service-runtime-lifecycle-operation-methods.js:428`, but generic driver STOP
calls the Cell owner only when `_requestCells` still contains the key
(`wasm-component-driver.js:568-570`). That map was cleared by shutdown. This
causal claim requires the composed witness; a reported FAILED status is not
a substitute for its physical resource assertion.

The proposal establishes one generic owner-admission/shutdown interval. It
does not establish a distributed same-key replacement interleaving, separate
machine metadata consensus, abrupt-process recovery, or activation A5's
supersession of an asynchronous write still pending inside its owner.
