# Native events to held creation reconciliation: exact-tip home-lab acceptance

This is the local Claude session's staged author review under the operator's
explicit instruction (17 October 2026: "verify the private lab's live policy
and run the retained 21-file selection against the exact current branch tip;
use staged self-review, preserve first failures"). It is not independent
verification, terminal Quest landing, serving activation, a main merge or
release approval. The Quest `wasm-creation-genesis` stays open with its
receipts unchanged.

Verdict: ACCEPT the event-to-reconciliation stage's exact-tip home-lab
measurement. The stage now has the physical-lab result the 17 October handover
named as its immediate open item. Serving, publication, retirement and every
wider rs-raft hold remain HELD.

## Exact measured source

Branch: `work/rs-raft-event-reconciliation-20261016` (draft PR #134 onto
`work/rs-raft-genesis-observation-20261016`, PR #133 at
`6ba84863490bff9a43874a03f69ad2afff4b5898`).
Tip measured: `35d533b6bdab8df4c36b7b96c18230a180d60e85` (the retained source
commit `e221c8c63ae2baea9614c52db04b05336745f35f` plus two evidence-only
commits; `src` subtree `4d41f37c628ccdcf518989496b21a25908e6245c`, `test`
subtree `4f4b38381e1f20c2d6c311b5a7d7c695c4c8d28d`, both unchanged since
`e221c8c63`). The earlier carrier head
`8ebaea78789fefd737419fdf2f8ee96117e5afd4` and the earlier lane
`work/rs-raft-creation-reconciliation-20261016` (`0d761411c`) differ from this
tip in source and tests; their lab results (#95-#98) do not stand for it.

No source or test byte was changed for this acceptance. The worktree
`/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
was created at the tip with the main checkout's `node_modules`, `data/examples`
and `data/partitions` linked and the import graph regenerated.

## Live lab policy, read before use

`~/.local/bin/lagrange-lab status` (v0.1.1 launcher, bridge reports version
0.1.4): not paused; authorization mode `trusted-repository` for
`psvensson/lagrange`, `until_revoked=true`, `expires_at=null`, source
requirement "exact SHA at a named refs/heads/ branch tip"; 30 journaled jobs,
all COMPLETE, none UNCERTAIN; user service active since 2026-10-16 17:30 local.
A fresh nonexecuting ping (private lab #99, request
`5aeeb9ef6ea04205a6230a788af6e33f`, request SHA256
`60b3aab51cf5713c987cec2f61c5718d0f38ccca9f9eac6b5c2959fe7cf679b6`) answered
COMPLETE at 2026-10-17T06:48:50Z with `executed_source=false`,
`uncertain_execution=false`, `paused=false` and allowed hosts tv-dator,
lenovo-laptop, adam-laptop, adams-gamla. The standing repository trust was
consumed; no per-commit grant, lease or token was requested.

`node scripts/lab.js fleet` from the tip worktree reported tv-dator,
lenovo-laptop, adam-laptop and adams-gamla ready and free against this
checkout's lockfile (`better-sqlite3` 11.10.0), carinas-windows unreachable
(ssh timeout), controller free. Both jobs were submitted as `test-files`
requests naming the exact tip and `refs/heads/work/rs-raft-event-reconciliation-20261016`,
through the bridge's existing classified placement, machine locks, thermal
checks and disabled retries. No shell payload, raw ssh runner or controller
fallback was used.

## Completed source-bound physical-lab measurements

| Private lab job | Host | Files | Result |
| --- | --- | ---: | --- |
| #100 `c11d9f02fbff4150b1f87d244f086f99` | lenovo-laptop (factor 2.3, lanecap 7) | 11 | exit 0, PASS, 229 reported assertions |
| #101 `7b9526dfd6614d3e83e4f6a7d523a0ea` | tv-dator (factor 1.5, lanecap 11) | 10 | exit 0, PASS, 504 reported assertions |

Total: 21 distinct files, 21 passing, 0 failing, 733 reported assertions. This
equals the handover's retained cloud-container count (733) exactly, so no
file reported a different assertion total on physical hosts. Both executors
recorded `placement-head=35d533b6bdab8df4c36b7b96c18230a180d60e85`.

Job #100 placed six files on the ordinary lane (jobs=4), one on bootstrap and
four on exclusive (jobs=1). The new mechanism file ran first: 8 assertions in
708 ms. The new native event file ran on the exclusive lane: 4 assertions in
4051 ms; its neighbours genesis 9619 ms, retained bootstrap 4808 ms, recovery
2363 ms. Thermal readings 48-54 C CPU, NVMe unmeasured on that host. Job #101
placed all ten files on the ordinary lane (jobs=4): WASM lifecycle 2233 ms,
native completion 1565 ms, reconcile queue 179 assertions in 655 ms. Thermal
57 C CPU, 46 C NVMe. These are reported observations, not a performance claim.

Request SHA256 (recomputed locally from the submitted bodies as sorted-key
compact JSON and matched against the bridge's posted digests): #100
`b661e6750732329453cad1aaae096d26dce87ddd70d8ecf4fa6f24a6017e88ee`, #101
`fed28cdd91c05ca47c6053219ece3524cd49454c88228620b28c35f88ffa765d`.
Raw logs: #100 2655 bytes
`89e7747c86268a791b641a76231f526b372401991e3c38ba9878478df619d7cc`, #101 1969
bytes `3d62702af781f61093e846cfaceca393327f75d7d5d0a4e0a8078b3383e178b3`.
Both logs were rehashed locally from the bridge's run directories and match
the digests the bridge posted. The complete request, result, authorization,
execution, placement and executor-log records of both jobs and the ping are
retained byte-for-byte under
`evidence/event-reconciliation-20261016/lab-acceptance-20261017/` with
`LAB-RESULTS.json` and `SHA256SUMS`. No behavioural test was retried; there
was no first failure to preserve.

## Static checks at the tip

`node scripts/check-fast-static.js --base 6ba84863490bff9a43874a03f69ad2afff4b5898`
(the stage's own changed-path range): ok in 22.6 s.

`node scripts/check-guideline-decision-boundaries.js` (whole tree): exit 1,
44 violations beyond the matched 753-entry inherited baseline, spread over the
integrated stack (transaction recovery, partition CDC, raft runtime owner and
others). The lane's new adapter has none. The four in
`src/wasm-service/wasm-service-replica-lifecycle.js` are `openReplica` line 80
(six independent `if` statements assign `replica.lifecycleState`, R07),
`replica.startupFailure = null` at lines 119 and 205, and
`let activityFailure = null` at line 238. All four pre-date this stage: its
diff of that file adds `creationReconciliation?.bind()`, the shutdown join in
`retireReplica` and `closeAdmission()`, none of which is a new state
assignment. They are recorded here as a finding for the next stage, which
changes exactly these functions (see below), rather than patched now.

The complete precommit, global inventory/duplication/analyzer-memory gates,
the full impact cone and the corpus were not run for this acceptance and
remain open, as the handover left them.

## Staged author review of the implemented connection

Read in full: `wasm-creation-reconciliation.js`, `wasm-creation-genesis.js`,
`wasm-creation-opening.js`, `wasm-service-lifecycle.js`,
`wasm-service-replica-lifecycle.js`, `wasm-service-replica.js`,
`wasm-service-consensus-port.js`, `wasm-writer-state.js`,
`wasm-writer-completion.js`, the `ServiceDefinitionsOwner` instance state
machine, the creation-intent producer, the bootstrap descriptor owners, the
driver and runtime bootstrap branches, both new test files and the shared
native fixture, against CONTRACT-R2 and HANDOFF-INTERFACES.

- Ownership check. Both explicit START and native wakes enter one keyed
  `OwnerKeyReconcileQueue` continuation; `current()` compares the exact
  registered replica, port object, creation object, READY state and closing
  flag before and after the only await (`writerCompletion.submit`). Event
  payloads are never read. The queue reason for native wakes is the raw
  `RAFT_EVENT` name rather than a `RECONCILE_REASON` member; diagnostic only,
  recorded as an R06 nit for the next stage, not a correctness defect.
- Shutdown join. `closeAdmission()` precedes `stopActivity()` so a callback
  that passed `current()` before the fence cannot start new work, and the
  writer abort settles any in-flight `submit`; `submit` itself refuses once
  `lifecycleState` left READY. `awaitCurrentWorkIdle()` therefore cannot wait
  on anything the shutdown has not already released; `queue.shutdown()` runs
  only after that join. A failed unsubscribe retains its callback and the
  original error surfaces to the lifecycle's cleanup failure; the latched
  settlement defect the cloud review found is fixed and witnessed.
- Fixture discipline. The historical manual-reentry files are byte-unchanged;
  the shared fixture delays event enqueues for pre-INIT fault schedules through
  a fixture-side queue wrapper, and the new positive opts into ordinary delivery
  without it. No production flag was added. Preserve this distinction.
- Evidence ceiling unchanged. Native RF3 on one host, component SQLite
  metadata/journal adapters, queued loopback transport, virtual setup clock and
  a guest collaborator. Not physical multi-host consensus, replicated metadata,
  native SIGKILL or power-loss recovery.

## Findings for the next stage (recorded, not absorbed)

1. The receiver-local record `_wasm_creation_local` is written once with
   `phase: ADMITTED`, and a retained reopen requires byte-equality with that
   ADMITTED encoding (`openWasmCreationRecords`). A durable PUBLISHED grant or
   RETIRED mark cannot be stored there without making that record a named
   state machine owned by `wasm-creation-opening.js`, with the reopen check
   comparing identity fields and admitting each named phase.
2. The services-row publication helpers (`queueRoleUpdate`,
   `queueLeaderNodeUpdate`, their flushes) and `onBecameLeader` are disabled
   for bound replicas by `consensusCreation !== null` guards; serving must go
   through those same owners with the already instance-qualified physical
   replica identity, never a second publication path (R11).
3. `heldCreationRefusal()` is the single user-admission gate and it keys on
   creation presence alone; publication must replace its predicate with the
   durable local grant state, keeping one owner for serving admission.
4. `ServiceRuntimeLifecycle.stop` throws `CONSENSUS_SERVING_NOT_IMPLEMENTED`
   for bound definitions and `ServiceLifecycleManager.createReplica` refuses
   bound descriptors; retirement must flow manager -> adapter -> runtime stop
   -> driver stop -> `WasmServiceLifecycle.stopReplica` with RETIRED durable
   before the metadata CLOSED CAS, through those existing owners.
5. `WasmComponentDriver.#projectConsensusStartResult` and
   `confirmConsensusBootstrapResult` accept only HELD; a PUBLISHED serving
   result needs its own explicit branch in every consumer named by
   HANDOFF-INTERFACES, never a widened "non-failed" acceptance.
6. `architecture/current-owner-maps.md` has no row for the service-instance
   selection/resource authority or the bound WASM creation lifecycle; the
   owner entry is owed before this lane can land (R24).

## Holds

No main merge, tag, package release, serving activation or terminal Quest
closure follows from this record. Shared staged work, other agents'
worktrees, the lab controller policy, W07/F1, control-release, TX1 and
FreshMG lanes were not touched. The two jobs were the only lab jobs this
session submitted; no job was left running or UNCERTAIN.
