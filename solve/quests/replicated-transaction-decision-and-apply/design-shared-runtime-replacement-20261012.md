# Shared raft-rs replacement interaction — 2026-10-12

Status: WIP candidate design, not independent approval or Quest landing.
Input: PR117 head 9529902fd39be90db5f3ba6725de8bc7145df279. User agreed to continue the complete shared-replacement and retry correction. The current review-only base and all preservation references remain unchanged.

## Consumed owners

`src/raft/raft-rs-runtime-owner.js` (blob 568bf6453cde9a620c6df8e386922fba0d593724): ensureCore/invokeCore at 305–376; openGroupInCurrentRuntime at 450–491; replacement at 521–581; group recovery/queue at 583–763; observations at 1097–1207; command dispatch and constructor at 1473–1720. `src/raft/raft-rs-binding-owner.js` remains the loaded-artifact authority, unchanged. `src/raft/raft-rs-runtime-tuning.js` supplies the existing election-derived retry duration. `src/raft/raft-rs-runtime-faults.js` already owns enterReseedHold/recordReseedHold, now consumed for a missing/incompatible record during live replacement. `src/raft/raft-rs-participation-gate.js` still owns persisted participation facts and identity-record acknowledgement. `test/shards/impact-contracts.json` owns the runtime/application interaction and witness selection.

## Facts and lifetimes

- Runtime state: HEALTHY, UNHEALTHY, REPLACING, solely written by the runtime owner. REPLACING fences all external reads, commands, deliveries and new native openings, including synchronous callbacks. Only the replacement driver may create/free native handles during that phase.
- Loaded artifact identity: existing private binding owner; neither retries nor files changed on disk may relabel the running code.
- Runtime generation: existing successful-instantiation counter. Discarding a core invalidates every handle and cached usable observation before any external callback. A second trap invalidates partially recreated handles too.
- Per-group state: existing usability, exact lifecycle identity, gate, durable record and recovery record. Unreadable/busy storage or a native creation refusal holds that group, not unrelated groups. Proven missing/incompatible durable history routes to the existing durable reseed owner, never fresh genesis.
- Pending resumption: one volatile generation on each recreated group, consumed once through its existing queue. It represents replay/resumption still owed, not a second reconstruction algorithm. The shared driver must not wait for another group's pending Ready while holding its barrier. Old work keeps its original generation fence.
- Shared retry record: one captured clock and election-derived duration plus attempt count, failure and due instant. Later callers cannot switch clocks, shorten the bound, or extend the deadline. Failure starts the next window; callers inside it only consume the typed outcome. Success or final close releases the record.
- Close during replacement: closes that exact registered group immediately for callers; the existing runtime registry retains its native-free obligation until the driver frees the newly created handle or discards the failed instance. Closing the final group cannot retain a dead trigger's retry record indefinitely.

## Transition and typed edges

UNHEALTHY -> REPLACING -> HEALTHY only after every registered group is recreated, held or closed. Loader failure or native trap returns a shared HOST_FAILURE/recoveryRequired outcome under `runtime-replacement`, leaves the runtime UNHEALTHY and retains one due instant. A reentrant request receives HOST_FAILURE/runtime-replacement-in-progress and does not enter native code. A per-group create refusal becomes the existing recoverable group failure; no later group retains an old handle. Missing history retains the existing reseed-required refusal and durable fence.

HEALTHY does not mean every group serves: a group waiting for its old queue or for durable recovery stays explicitly held. Only its own queued continuation can finish its resumption. No retry changes a logical replica, durable history, build identity or caller deadline. New opening during an unhealthy/replacing runtime is a typed refusal, not admitted work or permission to run a competing replacement.

## Cached-view and uncertainty audit

Discard statusObservation with every discarded handle. Reads check shared replacement/unhealthy state before busy-queue cached snapshots. A stale Ready cannot apply to a new runtime or a closed group. A missing read is not evidence of absent history. A source or fixture test passing is not an approving review. The prior one-line proof, initial review and native failure traces stay byte-for-byte retained.

## Witnesses and falsifiers

Keep the original two-group control, missing-glue, changed-glue and repeated-refusal tests; advance the existing virtual clock by the owner-advertised remaining retry delay before expecting recovery. This explicitly adapts the earlier immediate-retry positive case to the new shared-backoff contract, not the safety assertions or thresholds.

Keep the three reviewer regressions unchanged: partial restoration, callback reentry and 25 calls at one instant. Extend them with a trap during reconstruction, a callback closing a newly reconstructed group, callers whose clocks have different epochs, and final-close/new-opening recovery. Every positive must retain committed SQLite data, exclude the trapped proposal and commit subsequent data. Run the same tests on baseline, candidate and source-only revert; preserve assertion failures, not just exit statuses.

Run existing operation-port, trap/restore, lifecycle, restart and participation tests, with skips and test-runner failures remaining red. Retain static-audit output separately. The scheduled-tick test keeps its full simulated 2000 ms and the unchanged two-second wall-clock bar.

## Limits and independent review gate

These witnesses use real raft-rs WASM and SQLite with injected native-call/store failure boundaries; they are single-process fixtures, not physical RF3/multi-host certification or a full SQL/CDC startup oracle. The changes remain WIP until category-complete independent review covers recovery-replay, admission-gating, concurrency-serialization, owner-interaction and harness-fidelity. Pay particular attention to resumption rejection/partial progress, constructor refusals before native entry, closure during reporter callbacks, busy old Ready continuations, lost-history recovery, and preservation of group-local retry bounds. Any unmeasured case stays an explicit gap. No source approval is manufactured from a Copilot comment or this design note.
