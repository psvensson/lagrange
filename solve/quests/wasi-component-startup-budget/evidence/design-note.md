# Design note: WASI component cell startup budget

Quest `wasi-component-startup-budget` (class product, epic
`pilot-readiness-and-public-proof`). Research and design only. No `src/`
change has been made. Template:
`docs/development/verification-templates/design-note-template.md`.
Measurements: [`startup-phase-timings.json`](startup-phase-timings.json).
Probes: [`probes/`](probes/), run from an untracked `.probe/` directory at the
worktree root against `origin/main` 6d58fdba1.

## Claim, scope and current evidence

**Invariant.** A request or call Cell start under load gets slower, never
broken (R12). Every acquired worker has an owner and a bounded lifetime (R13).
When a start cannot finish, the result is a typed outcome that names the
phase, the budget and the elapsed time (R07, R11).

**Failing witness.** On the 2-core hosted runner (PR #184 gate run
41431327759) eight of the nine 0.5 service tests fail with
`WasiComponentCellError request_cell_start_failed 'Component startup timed
out'` and `wait_bound_spent STARTUP_TIMEOUT_MS boundMs 10000`. The affected
tests are h1-h5 and q2-q4. q5 passed there in 113 s, close to the edge. The lab
hosts show the same failure. It reproduces locally with
`taskset -c 0,1 node scripts/run-classified-test-files.js` on h1, h2, h3 and
q4 at jobs=4. h2, h3 and q4 fail with the same signature. h1 alone on the same
two cores passes in 32.7 s.

**Where the time goes (measured, not inferred).** Between `start` and
`ready`, the cell worker (`src/runtime/wasi-component-cell-worker.js`,
`instantiateComponent`) runs these steps:

| phase | 20 cores, ms from parent start (3 runs) | note |
| --- | --- | --- |
| worker spawn + module load | 47-57 | jco-transpile is imported lazily |
| `transpileBytes` (jco 0.4.2, js-component-bindgen in wasm) | 3400-3600 | **97% of the start** |
| `capComponentCoreMemory` | 3-5 | depends on the per-cell `memory_bytes` |
| `import(data: URL)` of the generated glue | 5-10 | |
| `WebAssembly.compile` of the 12.9 MB core module | 11-15 | lazy Liftoff |
| `instantiate` + export resolution + `ready` | 5-20 | |

- A cold transpile takes 4.0 s. In the same thread it then takes 3.1 s, so
  about 0.9 s is the one-time bindgen compile for each thread. Every cell
  worker is a new thread, so every start pays the cold cost.
- Transpile is a pure function of (component bytes, jco version, `name`
  (world), `instantiation: 'async'`). It does not depend on the cell's
  budgets or capabilities. Only the memory cap after it is per-cell.
- Wall time against CPU time for one transpile:
  - Alone: wall 4.1 s, CPU 4.1 s.
  - Four concurrent on 2 cores: wall 13.4-13.7 s, CPU 5.9-6.0 s.
  - With today's runtime, four processes each starting one cell on 2 cores
    all hit the 10 s bound (4/4 START_FAILED).
- If the transpile is done beforehand, a start costs 104 ms alone. Four
  concurrent starts on 2 cores take 0.33-0.66 s. Eight concurrent starts on
  1 core take 1.9 s.

**Classification of the bound.** `STARTUP_TIMEOUT_MS = 10_000` is labelled
`ends-on: the cell worker posts its ready message`, which describes a liveness
bound. In practice 97% of what it times is CPU work. That work is proportional
to component size and host speed, and it is multiplied by concurrent starts.
So the bound is a **work bound wearing a liveness label**. The liveness part
(spawn, instantiate, ready) has more than 5x headroom even at 8-way contention
on one core.

**What happens at the bound.** `waitForReady` rejects and its `.catch` runs
`_stop`, which runs `worker.terminate()`. The worker is terminated while it is
still transpiling: START_ERR arrives 37-70 ms after the bound and the process
exits. There is no orphan. The typed error is
`request_cell_start_failed 'Component startup timed out'`. It carries no
phase, budget or elapsed fields. `reportWaitBoundSpent` logs `boundMs` and
`elapsedMs`. All work done so far is discarded.

**Callers of START_FAILED.**
- `WasmComponentDriver.#startRequestCell` (`src/runtime/wasm-component-driver.js:434-455`)
  returns `{status: FAILED, error: 'request_cell_start_failed: Component
  startup timed out'}`. Only the code survives, as string concatenation.
- `ServiceRuntimeLifecycle.start` (`service-runtime-lifecycle-operation-methods.js:368-456`)
  throws `LifecycleOrchestrationError`. It journals the operation as FAILED,
  removes the endpoint and projects the replica as `FAILED {error_message}`.
- Clients that invoke a non-ready cell get the existing typed
  `request_cell_component_unavailable` (`requireInvocationState`).
- There is no retry inside the runtime. Any re-drive comes from a higher
  owner and repeats the full transpile from zero.

**Production consequence today.** Two kinds of host are affected:
- a host where one cold transpile takes more than 10 s wall time (a slow or
  shared vCPU, or a larger component: the artifact admission cap is
  `DEFAULT_MAX_COMPONENT_BYTES = 256 MiB`, about 0.33 s of CPU per MiB here);
- a host that starts several cells at once (rolling restart, recovery, h4's
  re-start path).

On those hosts every start is killed at 10 s and every re-drive repeats
discarded work. Load breaks the start permanently instead of slowing it. That
violates R12, even though the outcome is typed.

**History.**
- `git log -S STARTUP_TIMEOUT_MS -- src/runtime` shows two commits.
  9b430a9a3 (2026-07-23, minimal-deployment request-cell readiness migration)
  introduced the 10 000. 54dd2d7ce (0.2.6) only added the `ends-on` comment
  and `reportWaitBoundSpent`. The value has never changed.
- 2026-08-17, `restore-deterministic-cloud-gate`: the same failure on the
  hosted gate was found and recorded as "a product-behaviour question [that]
  stays untouched". It was resolved through test resource classes:
  `external-toolchain` runs at jobs=1, and `service-cell-worker-modes` and
  `service-cell-bridge-roundtrip` are in that class. The product question was
  never reopened.
- The nine 0.5 test files landed in 2fca51dc9 and are classified `ordinary`
  (jobs=4) in `test/shards/resource-classes.json`, unlike their toolchain
  siblings. That is the **immediate trigger** on the hosted runner. This is
  finding F2 below.
- `census-bounded-waits-2026-10-04.md` lists the wait as `throw_typed, wired`.
  No test witnesses the timeout path: no test uses `workerPath` and no test
  asserts `startup timed out`.
- Nothing caches the transpile. jco is used only in the cell worker. The SEA
  bundle `request-cell-worker.bundle.mjs` keeps jco-transpile external.
- The hardware-relative-convergence-budget epic (Decision, lines 33-38) scales
  only work-bound *test* budgets and leaves `src/` protocol timers alone.

## Options

| | (a) calibrated hardware-relative budget | (b) two-phase: transpile unbounded with progress, only the handshake bounded | (c) derive once, start is instantiate-only | (d) configurable budget |
| --- | --- | --- | --- | --- |
| owner | WasiComponentCellRuntime plus a new host-speed probe owner | WasiComponentCellRuntime and the cell worker protocol | WasiComponentCellRuntime (derivation owner); WasmComponentDriver prepare triggers it | deployment/runtime configuration plus WasiComponentCellRuntime |
| src blast radius | cell runtime, new calibration module, startup probe wiring | cell runtime, cell worker, message vocabulary | cell runtime, cell worker (transpile removed), new derivation module/worker, driver prepare, build-sea.js | cell runtime, config schema, node config plumbing, docs |
| repeated work | every start, restart and replica re-transpiles | same as (a) | once per (digest, toolchain, world) per node | same as (a) |
| behaviour under concurrent starts | still kill-and-redo: the calibration sees host speed, not contention | not killed, but N starts each pay the full CPU and nothing bounds it | single-flight; one derivation lane; starts are about 0.1-2 s | still kill-and-redo once N exceeds the configured headroom |
| typed outcome on a slow host | START_FAILED{budgetMs, elapsedMs, phase} | only the handshake is typed; a slow transpile is an unbounded wait (rejected by the owner rule and R13) | derivation: typed `derivation_failed`/`derivation_exhausted`; start: START_FAILED{phase, budgetMs, elapsedMs} | START_FAILED with the configured budget; operators must guess |
| R12 (load slows, never breaks) | no | partially (no bound) | yes | no |
| test assertions needed on slow hosts | none new; tests pass only if the probe tracks the host | slow-host tests pass but prove nothing about bounds | the startup liveness witness plus single-flight reuse; the 0.5 tests pass unchanged | a test-set config value comes close to a test-only route into production |

**Rejected: the test machine factor.**
- `scaleByMachineFactor` (`scripts/test-machine-factor.js`) is a test-harness
  doctrine for work-bound *test* budgets. The bound here lives in `src/` and
  governs production behaviour.
- Reading `LAGRANGE_TEST_MACHINE_FACTOR` in `src/` would create a test-only
  route into production, which the owner rules forbid.
- The epic explicitly leaves `src/` timers untouched.
- It would also only hide the defect. Production nodes would still
  kill-and-redo starts under the same load.

**Client-side precompile (c as "compile at deployment on the client") is
rejected.** The transpile output includes JavaScript glue that runs in the
cell worker next to the host imports. Accepting it from a deployer would
place deployer-authored JS outside the WASM sandbox. The derived artifact must
be produced on the node, by the pinned toolchain, from the admitted component
bytes.

## Recommendation: (c) node-side, content-addressed, single-flight derivation; start is instantiate-only under the existing fixed liveness bound

1. **Owner.** WasiComponentCellRuntime owns one derivation method,
   `deriveComponent(cell)`, implemented in a new
   `src/runtime/wasi-component-derivation.js` and run in a dedicated
   derivation worker so the 3-4 s of synchronous wasm never blocks the parent
   event loop.
   - **Key:** sha256(component bytes), jco-transpile version, world `name`,
     and `instantiation`. Every input of the pure function is in the key, so
     a stale cache entry is impossible by construction.
   - **Value:** the transpiled files (glue JS plus core modules).
   - **Single-flight per key.** At most one derivation runs node-wide. A
     queue in front of it is the backpressure; there is no shortcut.
2. **Triggers (one algorithm, two triggers).**
   - `WasmComponentDriver.#prepareRequestCell` calls `deriveComponent` after
     `bindRequestCellArtifact`. A derivation failure is then a typed
     PREPARE FAILED, before any lifecycle start.
   - `_start` awaits the same memo, so direct runtime users (h1-h5 tests)
     share the path.
3. **Start.** The cell worker receives the derived files through workerData
   and no longer imports jco. It runs the memory cap, the glue import, the core
   compile, instantiate, and posts `ready`.
   - `STARTUP_TIMEOUT_MS` stays a fixed 10 s and is now truthfully a liveness
     bound. The measured worst case is 1.9 s at 8-way contention on one core.
   - The bound starts when the cell worker is spawned, after derivation has
     resolved.
   - On expiry: terminate the worker, then reject
     `request_cell_start_failed {phase: 'instantiate'|'ready', budgetMs,
     elapsedMs}`. The worker posts a `phase` message before instantiate so the
     parent knows the last phase reached.
4. **Derivation bound (R13).** The derivation is not killed on wall time,
   because wall time measures contention, not progress. It is bounded by four
   things:
   - **Size:** the existing `DEFAULT_MAX_COMPONENT_BYTES` at artifact
     admission.
   - **Concurrency:** one lane per node.
   - **CPU-time ceiling:** measured with `worker.cpuUsage()`, the facility the
     runtime already uses for `cpu_time_ms`. It is proportional to component
     bytes: `DERIVATION_CPU_MS_PER_MIB` plus a fixed bindgen-init allowance.
     The measured cost is 0.33 s CPU/MiB alone and 0.48 s/MiB under 4x
     contention. Proposed value: 2 s/MiB plus 5 s, which is about 6x this host.
     It is a runaway guard on a pure function, not a performance budget.
     Exceeding it gives the typed
     `request_cell_component_derivation_exhausted {cpuBudgetMs, cpuMs,
     componentBytes}`.
   - **Owner cancellation:** when the prepared cell is superseded (digest
     change), unprepared, or the runtime shuts down.
   - A transpile error gives the typed
     `request_cell_component_derivation_failed {cause}`. It is deterministic
     for the key, so the failure is memoized until eviction.
   - While a derivation is queued or running, invocations get the existing
     `request_cell_component_unavailable`. Slow hosts become slower to ready;
     they are never broken.
5. **Cached view (template item 3).**
   - Authority: the admitted component bytes.
   - Invalidation: none is needed, because the key is complete.
   - Eviction: by reference count over prepared and started serviceIds, and
     on `shutdown()`.
   - Memory: about the component size (13 MB here) for each distinct
     artifact on a node.
   - A stale read cannot happen because a different byte digest is a
     different key. A node restart re-derives once.
6. **Identity.** The cache key is the content digest. `payloadDigest` from the
   artifact binding remains the deployment identity. The memo never decides
   anything semantic; it only removes repeated computation.

**Blast radius.**
- `src/runtime/wasi-component-cell-runtime.js` (derive memo, phased typed
  START_FAILED, workerData)
- `src/runtime/wasi-component-cell-worker.js` (remove `transpileBytes`, accept
  derived files, post phase)
- new `src/runtime/wasi-component-derivation.js` and a derivation worker entry
- `src/runtime/wasm-component-driver.js` (`#prepareRequestCell` triggers
  derivation)
- `scripts/build-sea.js` (bundle the derivation worker, jco external)
- `dependency-cruiser.config.cjs` and `knip.json` if they enumerate worker
  entries
- the request-cell runtime contract doc that names startup failure codes

The nine 0.5 tests and their receipts (for example
`pinned-toolchain-hono-component`) are unchanged. They assert behaviour, not
startup internals, and keep passing. h4's re-start path gets faster, and its
recovery assertions are untouched.

## Red tests (written first, before any src change)

1. **Slow-startup liveness witness (deterministic).**
   - A fixture cell worker (`test/fixtures/...`, passed through the existing
     `workerPath` option) posts `phase: instantiate` and never posts `ready`.
   - Run in a child `node` process with a 30 s kill.
   - Assert that `runtime.start` rejects with `WasiComponentCellError`
     `request_cell_start_failed`, `phase: 'instantiate'`, `budgetMs: 10000`,
     `elapsedMs >= 10000`, and that `instanceCount === 0`.
   - Assert that the child exits by itself with code 0. A live worker would
     keep the event loop alive, so a clean exit proves no orphaned worker.
   - It is red today because the error has no phase, budgetMs or elapsedMs.
2. **Derivation single-flight and reuse.**
   - Start the same component under two serviceIds concurrently, then stop
     and restart one.
   - Assert derivation count 1 through the runtime telemetry
     (`getRuntimePressureTelemetry` gains `derivations: {completed, inFlight,
     cached}`).
   - Red today: every start transpiles.
3. **Typed derivation failure at prepare.**
   - Use invalid component bytes through the driver.
   - Assert that prepare returns FAILED with
     `request_cell_component_derivation_failed` and that no cell worker is
     spawned.
   - Red today: it surfaces only at start, as START_FAILED.
4. **Derivation ceiling decision.** A pure unit test of the
   ceiling function (bytes and cpuMs give ok or exhausted), plus a wiring test
   that the derivation worker is terminated on cancellation (superseded
   digest).
5. **Positive path on this machine.** h1-h5 and q2-q5 pass through
   `node scripts/run-classified-test-files.js`.
6. **Physical contention receipt.** h1, h2, h3 and q4 at jobs=4 under
   `taskset -c 0,1` pass. This is red today: 3/4 fail with
   `STARTUP_TIMEOUT_MS`.

## Findings routed elsewhere (R17)

- **F1: q10 (`postgres-compatibility-certification-matrix`, same epic) is a
  client-environment dependence, not a product refusal.**
  - The refusals "multiple statements in one query are not supported" and
    "OFFSET without LIMIT is unsupported" in the hosted log are *expected*
    negative controls (asserted 0A000 and XX000) and are only logged noise.
  - The failing assertion is at
    `test/query/q10-postgres-compatibility-certification-matrix.test.js:1254`.
    It is a `deepStrictEqual` between the live generated matrix and the
    committed `docs/postgres-compatibility-matrix.json`.
  - The committed matrix pins `driverVersions.psql: "14.24"` (this
    controller's psql). The hosted runner's psql is `16.15`, so
    `driverVersions` and `matrixDigest` differ.
  - Owner: the q10 quest / postgres-compatibility-matrix owner
    (`src/query/pg/postgres-compatibility-matrix.js` and its test). Not in this
    quest's scope.
- **F2: the nine 0.5 service test files are classified `ordinary` (jobs=4).**
  Their WASI-toolchain siblings are `external-toolchain` (jobs=1) under the
  2026-08-17 resource-class repair. Reclassifying them would probably green
  the hosted gate without a `src/` change: h1 alone on 2 pinned cores passes
  in 32.7 s. It would leave the R12 product defect in place. Owner: test
  resource classification (deterministic-cloud-gate epic). After this quest,
  receipt 6 shows whether `ordinary` is still honest.

## Evidence and closure

- **Safety:** unchanged. The derived files are produced on the node from the
  admitted bytes by the pinned toolchain, and capabilities and budgets are
  enforced in the cell worker as today.
- **Progress:** the derivation completes once per key under the CPU ceiling.
  Starts then complete within about 2 s at 8-way contention on one core.
- **Resources:**
  - one derivation worker at a time;
  - cached files bounded by the number of distinct prepared artifacts;
  - every cell worker terminated on bound expiry (witness 1).
- **Evidence classes:** witnesses 1-4 are deterministic; 5 is native; 6 is
  physical contention on this host. The hosted gate re-run is the
  publication-time confirmation.
- **Templates:** concurrency-serialization (single-flight memo), sweep-timer
  (the liveness bound), owner-interaction (driver prepare and runtime start),
  harness-fidelity (fixture worker via the production `workerPath` option).

**Open parameter for the lead:** `DERIVATION_CPU_MS_PER_MIB`. The proposed
value is 2000 ms plus 5000 ms fixed. The alternative is a
size-only bound with no CPU ceiling, with lifetime bounded purely by owner
cancellation.
