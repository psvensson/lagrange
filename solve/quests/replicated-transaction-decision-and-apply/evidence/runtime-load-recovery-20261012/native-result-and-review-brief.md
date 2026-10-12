# Native recovery result and independent-review brief — 2026-10-12

Status: FUNCTIONALLY PROVED AT THIS BOUNDARY; NOT LANDED OR MERGE-APPROVED.
Existing timing failure and independent review remain open. This supplements,
never rewrites, the retained workflow summary and first failed attempt.

## Exact inputs and measured results

Run 38229543946, attempt 1, job 114745341309; workflow input
`2eee9d0012b789e659b3b46688131a8f3c0145fa`.
Baseline: `40a548af992f9eb2db3b54220b8c91413f1506c7`.
Measured source candidate: `064365eafc3f340d113af2030903940806fc8462`.
Source/evidence publication tip: `00d391b3dd17f48d8d6ab81528dafa85d23b0009`.
The only production difference from inherited TX1 snapshot
`4151a3ab4cf3859651507d2f575a49754deb8f61` is moving
`runtimeHealth = HEALTHY` after `ensureCore()` in replaceRuntime.
Candidate runtime SHA256:
`6510a4305d6ff45f1223015a2fbb6f1e9a99229428cc55b70538c8d77968619d`.

Baseline and source-only revert: control passes; missing-glue, changed-glue
and repeated-refusal fail at recover-from-other-group with CORE_REFUSED,
invalid handle, phase status. The candidate passes all four cases. All three
existing operation-port files pass their 12 behavioral tests. No native
assertion was changed between baseline, candidate and revert.

Each new case uses two single-voter groups through production operation ports,
real vendored raft-rs WASM and separate SQLite WAL files. The same process
shares the runtime. The trap is injected at the existing native-call boundary,
not naturally induced by peer input. Loading refusal must enter no native
primitive. After restoring exact artifacts, the OTHER group initiates shared
reconstruction; both groups are recreated before the call returns, preserve
their committed data/identities, and commit/read new data exactly once.
This is not RF3, physical multi-host, full SQL-engine, CDC, cold node restart
or release certification.

Permanent raw per-case outputs and source hashes:
`../runtime-load-native-38229543946-1/` at the publication tip.
Complete Action artifact ID 11737069283, including raw TAP and source:
`rs-raft-native-load-recovery-38229543946-1`.
Downloaded ZIP verified SHA256:
`2261de9b97ac0fc3d06d09d709a4037125509ca8e03deb288c6d3482cfe2a2a5`.
The first failed run 38228726123 and its artifact remain retained separately.

## Timing gate: FAILED, not hidden by behavioral success

Raw `existing-tap/test/raft/raft-rs-backend/operation-port-throw-containment.test.js.tap`
records the scheduled-tick F-ah(b) unit at `duration_ms: 2231.949754`.
This exceeds the two-second unit limit. Its unchanged source explicitly sleeps
SCHEDULED_SPAN_MS = 2000 and then the recovery window plus margin. The file's
runner wall time was 3296 ms; do not confuse file time with individual time.
The new native integration file's candidate wall time was 1682 ms.

The workflow's summary.json measured semantic engagement and process exits,
not every individual test duration. Its passed=true and green Actions badge
therefore do NOT constitute the complete repository testing/landing gate.
Timing disposition belongs to the existing test/harness owner; keep this unit
visible and do not silently shorten its witness, reclassify it, raise a bound
or repeat it unchanged hoping for a pass. No other source repair is included.

## Independent review request

Review the measured candidate and full interaction, not only the one-line diff.
Report every finding grouped by the applicable categories below, each with a
source line, exact test or immutable artifact evidence path. Explicitly mark
unsupported claims, scope limits and justified non-applicability. A comment
review or author self-check is not a Solver approving verification. No land,
merge, auto-merge, source rewrite, preserved-ref mutation or release is requested.

The union of existing verification-template checklists is instantiated here:

### Recovery / replay (all five template items)
1. Stale/live state: enumerate writes to core, runtimeHealth, runtimeGeneration,
   group handles, group health, gates and recovery records; show stale work cannot
   overwrite a recreated group or clobber a live independent group.
2. Restart versus live recovery: trace shared native trap versus one-group host
   failure and ordinary reopen; explain the discriminators and false positives.
3. Lost enlistment: prove shared groups are not silently omitted; distinguish
   deliberately closed/reseed-held groups from lost registration. The two-group
   fixture must not stand for all branches without an evidence limit.
4. Replay idempotence: follow real durable application/applied-index ownership;
   inspect the before/after rows, no trapped-command row and partial-effect paths.
5. Absence: missing artifacts or unreadable durable rows must never mean recovered,
   complete, fresh storage, or permission to enter a stale handle.

### Admission / holds (all seven items)
1. Compare ensureExecution's precheck state with invokeCore/ensureCore enforcement.
2. Trace typed transient and terminal load/host/core refusals at every consumer.
3. Name existing recovery/timer budgets; this patch introduces or raises none.
4. Inspect HOST_FAILURE reason/failure/detail versus CORE_REFUSED invalid-handle
   shapes, including the repeated-refusal case; no string coercion inference.
5. Show the actual release path after exact artifacts return, initiated by the
   other group's operation, and which caller/runtime can remain held.
6. Verify freshness after each refused load and after reentrant callbacks/awaits.
7. Check diagnostics identify the affected group and shared runtime generation.

### Concurrency / serialization (all five items)
1. Identify synchronous shared-core admission and per-group async queue boundaries;
   do not treat the per-group queue as a global lock.
2. Check every relevant await and native-generation continuation; old Ready work
   must not enter the new core. Include existing Ready-recovery witness results.
3. Verify multiple groups/callers cannot independently reconstruct competing
   runtime instances; state the single-winner mechanism and its scope.
4. Attack timer/listener reentrancy during trap, reload refusal and reconstruction.
5. Verify any serialization/backoff key names the shared resource actually held.

### Harness fidelity (all six items)
1. Baseline/revert must fail on invalid handle at the intended assertion, not an
   import, missing method, setup or timeout. Preserve exact child receipts.
2. Real ports/binding/storage are used; explicitly limit the injected trap,
   marker application callback, singleton topology and in-process peer transport.
3. No source timing constants are compressed; private copies and cold loads count.
   Preserve and disposition the existing 2231.949754 ms unit timing failure.
4. Check handcrafted application rows and genesis/identity fields against the
   production contracts the fixture actually invokes.
5. Exclude vacuous success: two distinct groups/files, real pre-fault rows, exactly
   one trap, zero core calls during refused loads, two recreations, new commits.
6. Bind live observations to this Action candidate/source/test/artifact hashes;
   do not upgrade it to startup, CDC, RF3 or multi-host certification.

### Owner interaction (all ten items)
1. Shared runtime usability is decided by the runtime owner, not diagnostics.
2. Loader owns verified loaded bytes; runtime owns instance/group lifecycle;
   trace the typed outcome crossing the operation-port containment boundary.
3. Prove pinning refuses changed artifacts AND exact-artifact recovery restores
   both groups in the SAME witness. Source-only revert must refute that pair.
4. Old load refusal must not permanently veto new valid artifacts or allow old
   handles; recovery must consume the existing loader, not another local path.
5. Attack repeated requests under missing/changed artifacts: preserve existing
   backpressure/retry windows and identify any shared-load retry amplification.
6. Name which operation/wake re-drives shared recovery once artifacts return.
7. Status, loadedFacts and captured receipts must not become independent grants.
8. Verify candidate/revert treatment hashes and keep expected RED out of positive
   certification counts; unchanged tests and byte-identical private copies.
9. Search all affected callers for alternate loaders, retry loops, raw access or
   fallback success; this patch must not add a second recovery owner.
10. Check impact-contract registration, live endpoints and generated primary/
    subsystem/resource/impact metadata; identify any missing paired witness
    registration rather than assuming refreshed metadata proves full coverage.

Review must also distinguish source-candidate bytes from later evidence-only
commits and consider failed reconstruction after successful loading separately.
No independent verdict has been issued by the author of this brief.
