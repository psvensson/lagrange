# Original-cohort issuance: serialization and resource custody feasibility

Read-only source assessment, 2026-10-21. Runtime inspected: `393f411ca09449898465cc3cb7320c03fba2aba8`. Input: `solve/quests/seed-release-failure-custody/evidence/retained-partial-seed-original-handoff-contract-draft-2026-10-21.md`, SHA256 `8be35255d43d3319ef6e002216c46fbe146973842bf7206a0b5a14728857d3b9`. This is additive design evidence for the author of `retained-seed-original-handoff`, not an implementation approval, changed seal, native witness or new authority. All source references are repository-relative and name the inspected runtime.

## Existing exclusion is per runtime object, not per cohort

`src/raft/raft-rs-replica-lifecycle-owner.js:98-108` keeps DB, state, retiring and active-count fields on each owner instance. `execute` (240-258) counts outstanding operations; it is not a mutex. `retire` (269-294) synchronously raises that instance's retiring flag, waits its active count, rechecks state and commits retirement. Separate owners/connections do not share this exclusion. `holdForReseed` (304-313) and retirement commit (323-336) remain terminal durable constraints; an allocation declaration cannot override them.

The runtime registry is a WeakMap (54), with exact registration/unregistration at 473-486. `retireReplicaLifecycle` (503-518) needs the registered exact runtime and reports NOT_MANAGED for an absent target. A never-opened metadata handle therefore has no retirement capability through this API. That is useful only after proving no competing ingress can open it; it is not a general authorization to prepare by name.

There is no existing whole-cohort PREPARING/member-readback/ISSUED API. The required interaction belongs to the existing lifecycle owner plus startup acquisition/cleanup owners. Reusing per-object active counts would leave the cross-owner gap intact.

## Reusable durability and missing interaction

`src/raft/raft-rs-durable-store.js:174-205` implements synchronous `commitDurably`: FULL durability is raised before the transaction, nested transactions are rejected and the pragma is restored afterward. It is a per-connection commit, not a cross-DB transaction. Lifecycle construction (lifecycle owner 115-169) creates/migrates and inserts/stamps rows; this is not a reviewed durable cohort issuance primitive and must not manufacture an original grant in a legacy row.

`openingHistory` (194-209) and `recordOpeningHistory` (218-234) bind exact incarnation and lifecycle state. Their loss/retirement fences remain authoritative. `prepareReplicaLifecycleForSnapshot` (360-375) deliberately records imported ESTABLISHED history and returns no runtime retirement capability; it cannot be reused to claim fresh genesis.

`src/raft/raft-rs-operation-port.js:180-225` performs peer/bootstrap setup, constructs the lifecycle owner at 207-209, and immediately constructs the native dispatcher at 225. It is not a metadata-only preparation API. A new bounded lifecycle operation must separate exact metadata preparation from native entry explicitly; merely invoking this port early violates the proposed pre-native boundary.

A feasible implementation shape is one synchronous, no-await, no-reentrant-callback preparation operation under acquired directory custody: prepare exact members, durably record PREPARING/member bindings, read back the complete immutable declaration, then durably ISSUE the anchor. Ordinary JavaScript abort/shutdown callbacks cannot interleave inside that synchronous section. This is neither cross-DB atomicity nor protection against a second noncooperating issuer. It requires proof that no native runtime is constructed/registered before issuance, no competing issuer/opening route is admitted, and no arbitrary callback/log hook reenters the section. Every later native admission must check the same live attempt/brand after intervening awaits. Abort/shutdown must invalidate that brand synchronously before cleanup. If preparation itself awaits, startup/cleanup must explicitly join its pending work before closing resources or releasing custody.

These are concrete requirements for the author's bounded implementation design, not a proposal for a separate controller, workflow engine or metadata store. Exact readback and a cached active owner are insufficient to protect a later asynchronous opening from retirement.

## Startup and cleanup do not yet own unopened preparation resources

`src/lagrange-runtime-startup.js:715-719` acquires directory custody and registers exclusive cleanup before the join decision (739-745). Public startup also acquires the process runtime claim and startup ledger (771-785). `awaitStartupAcquisition` (85-87) waits and then checks abort; it does not cancel or join a pending acquisition by itself.

`src/bootstrap/bootstrap-service-runtime-methods.js:389-435` sets `isShuttingDown` (395), yields (415), then cleans (423). Its rejected shutdown promise is cleared to permit retry (431-434); it does not generally join an executing bootstrap phase. The seed workflow's scheduler enqueue (src/bootstrap/bootstrap-service-seed-workflow.js:552-555) is not shared shutdown serialization.

`src/bootstrap/phases/seed-cleanup-handler.js:512-558` closes handlers and existing service maps. The captured map-entry helper (608-634) retains exact failed objects and deletes only if the map still contains the same object. No existing collection there owns metadata handles acquired before native service construction.

`src/entrypoint-startup-acquisition-ledger.js:12-25,45-51` pops callbacks, attempts cleanup and remembers the first error; unwind marks the ledger released and is explicitly not a retry API. Exclusive cleanup executes only after ordinary cleanup succeeds. `runStartupWithCleanup` (57-73) preserves the primary error or aggregates primary and cleanup errors. `src/storage/data-directory-process-owner.js:4-7,32-59` strongly retains its lock DB, but that alone does not retain other metadata DB objects.

Each preparation handle must enter a strongly retained resource-only collection owned by the existing lifecycle/preparation owner before subsequent throwing work. Failed closes must keep the exact handle reachable and prevent exclusive release. The collection is resource custody, not allocation authority. A local finally or reliance on GC is insufficient. `src/storage/sqlite-store.js:123-143` catches close failure and clears its DB reference/marks closed; it is not suitable as proof of retained failed-close custody. This observation does not authorize an unrelated store redesign.

The proposed public result remains typed rejection, not a new public recovery handle. Since the public acquisition ledger has no second unwind, any claimed retry after failed metadata cleanup needs a real retained owner path. Otherwise the honest boundary is retained resources until process termination; keeping the directory lock is not proof the other DBs closed.

## Required transition effects and retained obligations

| Boundary | Required fail-closed effect |
| --- | --- |
| Failure before ISSUE | PREPARING or partial member rows confer no native admission; never erase them into a virgin-store inference. |
| Uncertain member/ISSUE commit | Read the exact durable owner; no live native grant while commit state is unresolved. |
| ISSUE followed by abort before first native admission | Revoke the live brand; durable issuance cannot be undone into fresh permission. |
| Cold ISSUE plus NEVER_OPENED or only partly ESTABLISHED cohort | Explicit HOLD/lost-progress obligation in this first unit; no automatic cold genesis claim. |
| Member retirement, replacement or lost opening history | Exact-cohort admission fails; cached declaration cannot bypass the current lifecycle fence. |
| Metadata close failure | Retain exact handles and primary plus cleanup errors; no complete handoff result or exclusive custody release. |

The author's eventual binary witnesses must engage zero native entries before completed issuance, exact member/incarnation identities, abort/shutdown around the boundary, thrown-after-commit readback, and exact failed-close custody. Literal `seed-restart-v2` serving obligations remain unchanged: the proposed complete bounded operation is nonserving original handoff, with serving progress and the named cold issued-before-first-admission crash window still unresolved. The authority-and-recovery contract continues to prohibit deriving permission from cache, absence, files, or a workflow checkpoint.
