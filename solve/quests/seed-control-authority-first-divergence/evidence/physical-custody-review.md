# Package B read-only source review

Reviewer: `subagent:/root/physical_custody_review`. Inspected diagnostic HEAD:
`650970eede9b941597067ca77efcc1c6bc1bbeea`. Production source is identical to
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`. No tests or source changes performed
by this review. This is related evidence, not expansion of this diagnostic seal.

## Established source exclusions

- `src/wasm-service/wasm-service-lifecycle.js:634-646` snapshots exact active and
  retiring objects before its first await. `:655-666` retains each object before
  shutdown; successful settlement releases custody, and active-slot deletion
  compares exact object identity.
- `src/wasm-service/wasm-service-replica-lifecycle.js:326-357` enters STOPPING
  synchronously and captures handler/intent. `:260-298` retires that handler
  before asynchronous joins; failure becomes CLEANUP_REQUIRED at `:303`.
- `src/wasm-service/wasm-service-consensus-port.js:229-266` captures exact port,
  DB and KV before close. Failed close retains remaining references for retry.
- `src/wasm-service/wasm-service-lifecycle.js:233-246` permits the established
  single generic STOPPING successor, refuses further accumulation and failed
  cleanup. Bound creation has additional retirement fences.
- `src/node/runtime-service-creation-execution.js:108-118,139-149` refuses
  conflicting same-replica execution within one live handler. Ordinary competing
  CREATE cannot simply overtake a pending REMOVE through that gate.

## Unproven complete interaction

The handler memo fence at `src/node/runtime-service-generic-replica.js:125-131`
precedes manager journal awaits (`src/service/service-lifecycle-operations.js:
365-381`) and runtime journal awaits
(`src/runtime/service-runtime-lifecycle-operation-methods.js:496-520`).
For generic/unbound STOP, the driver captures a lifecycle owner, not the physical replica;
request-Cell stop may await before physical selection at
`src/runtime/wasm-component-driver.js:568-574`.

Creation-bound STOP routes through retireBoundReplica earlier at
`src/runtime/wasm-component-driver.js:564-566`.

Generic driver service-keyed map clearing follows at `:585-589`; runtime endpoint
removal and STOPPED projection follow at `service-runtime-lifecycle-operation-methods.js:
529-533`. These layers do not consume the handler memo guard. Protection after
physical capture is established by source; end-to-end exclusion before capture
and during later publication remains unproven. Legitimate successor admission
through another ingress or owner lifetime still needs a production witness.

## Next bounded witness

Compose the real handler, manager, runtime, driver and WASM lifecycle. Suspend
an existing journal/driver boundary before physical selection, then attempt
successor admission through existing owners. An enforced refusal must retain
subsequent valid progress. An admitted successor must survive old STOP, endpoint
removal and state publication. Direct map replacement alone is only a labelled
boundary discriminator, not production reachability.

Existing witness inputs, not rerun by this review:
- `test/node/runtime-service-remove-execution-custody.test.js:73-150`
- `test/wasm-service/wasm-service-lifecycle.test.js:590-614`
- `test/node/replica-runtime-cleanup-custody.integration.test.js:134-176`

A separately routed request-Cell obligation remains:
`src/runtime/wasi-component-cell-runtime.js:737-750` deletes the cell entry
before awaiting worker termination; `:190-200` clears operation custody in
finally. Native SQLite witnesses do not establish rejected-termination custody
there. This is an unverified boundary, not a proven leak or permission to expand U1.

Safety, recovery progress and physical certification remain unaccepted.
