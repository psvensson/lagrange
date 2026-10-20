---
audience: development
documentClass: evidence
---

# Seed release failure custody

Candidate: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.
Status: bounded implementation design; native discriminator pending.
This is a child of the existing cutover epic. It preserves the earlier
witness-only and diagnostic seals.

## Complete operation and consumed surfaces

1. `BootstrapService.bootstrap` runs the actual startup workflow
   (`src/bootstrap/bootstrap-service-seed-workflow.js:509`).
2. Registration checkpoint acquisition and participant release currently run
   before registration enters `executePhase`
   (`bootstrap-service-seed-workflow.js:405-416`). The existing original-entry
   trace therefore reports failure phase `partitions`.
3. The registered ENABLE route applies the immutable participant origin in
   the native application transaction. The actual reply is observed before
   forcing the existing handler clock to the original attempt deadline.
   Applied-position observation then refuses before dispatch
   (`src/node/participant-release-client.js:77-94`).
4. Failure cleanup uses the bootstrap phase to choose reverse cleanup
   (`src/bootstrap/phases/seed-cleanup-handler.js:39-45,124-177`).
   Registration cleanup shuts down the handler and its recovery queue.
   The proposed repair places acquisition/release in that existing phase.
5. The handler retains failed native shutdown objects in
   `pendingRuntimeShutdowns`
   (`src/node/replica-runtime-cleanup-custody.js:106-164`).
   Partition shutdown retains a database whose real close throws and
   clears its rejected promise for retry
   (`src/partition/partition-service-lifecycle-methods.js:79-83,224-228`).
6. Bootstrap shutdown currently caches a rejected promise forever
   (`src/bootstrap/bootstrap-service-runtime-methods.js:387-426`).
   The repair follows the same existing retry rule: concurrent callers join
   the in-flight cleanup; rejection releases only that attempt's promise;
   exact native resources remain with their current owners.
7. The test preserves the directory, reads the origin independently after
   successful close, and consumes the current startup readers. Retained
   pre-registration state has native history but may have no SERVICES rows.
   `src/bootstrap/rejoin-hints-durable-evidence.js:176-179,319-324`
   marks its admission nonempty; `seed-partitions-phase.js:85-98`
   requires an exact restorable row and refuses `CREATE_OWNER_DEFERRED`.
   That is a protected authority boundary, not permission to reopen.

## Typed failure edges and remaining ownership

| Edge | Outcome and owner |
| --- | --- |
| Original request deadline spent after commit | Existing `release_fact_unavailable`, missing `release_deadline`, phase `observe_applied_position`; committed origin stays in native storage. |
| Native close throws | Existing cleanup error; handler retains exact object/DB and retries shutdown. Bootstrap must not report successful shutdown. |
| Concurrent shutdown | Join one current shutdown promise. |
| Rejected shutdown followed by retry | Re-enter the same cleanup owner; do not cache failure as permanent completion. |
| Retained store lacks placement identity | Existing `CREATE_OWNER_DEFERRED`; current startup storage/creation owner retains the admission decision. |
| Unreadable/conflicting retained identity | Existing fail-closed startup reader; no fresh grant. |

The ordinary startup failure and native cleanup failure remain separate.
The failed bootstrap attempt does not become successful when cleanup succeeds.
Automatic restart needs a separately reviewed placement-authority handoff if
no current producer supplies the required identity. It cannot borrow the
component retained-origin witness's result.

## Cached views and identity

`BootstrapService.phase` is lifecycle routing, never release authority.
The proposed change aligns it with acquired resources. The checkpoint store
remains progress only. Handler registries and pending shutdown sets retain
exact objects, not identifiers resolving to a successor. A retry clears only
the rejected bootstrap attempt's promise; no origin, native history,
generation, membership, placement or admission fact changes.

The witness binds node/partition/replica, actual database object and path,
committed origin index/term, current release ID/deadline and exact source
commit. It must prove engagement before checking any failure. It supplies its
own directory and calls production shutdown directly; the original helper's
owned-directory deletion and swallowed shutdown exceptions are not evidence.

## Measurement and review

Review every item in the nine named verification templates, with source/test
or immutable run references and all findings reported in each round. The
transport treatment delivers the original request exactly once and changes
only scheduling/clock after the native answer. The actual control release
must have succeeded, the dependent origin must be real, final RESUME must
not have run, and failed close must concern that exact database.

Measure baseline red before production edits. Keep a green same-source
positive and separate source-only controls for phase routing and rejected
promise retry; import, setup, timeout-before-engagement or missing assertion
does not qualify. Check existing cleanup/workflow/release regressions on the
composed candidate. All runner deadlines, product budgets, baselines and
historical receipts remain unchanged.

## Independent design corrections, 2026-10-20

The first independent review required the complete cleanup boundary rather
than a phase-label-only repair. The implementation must also:

- Return a frozen cleanup observation from existing
  `SeedCleanupHandler.cleanupFailedBootstrap`: `outcome` uses the existing
  `CLEANUP_RESULT.SUCCESS` or `ERROR`, and `stepResults` preserves every
  attempted step. Carry it alongside the unchanged primary failure in the
  bootstrap result and failure event. The nonthrowing failed-cleanup API
  remains nonthrowing; logs are not its only failure observation.
- Reuse one private service-map release mechanism inside the existing
  handler. A close failure retains the exact object in `partitionServices`
  or `messageGroupServices`. A successful awaited release removes an entry
  only if its value still equals that object. Failed cleanup marks the step
  ERROR and continues remaining steps. Graceful shutdown rejects with
  retained cleanup errors, permitting same-owner retry. Reset replica arrays
  only after their owning map has been emptied by successful releases.
- Invoke existing `shutdownSqlQueryEngine` before clearing the CDC reference
  in registration cleanup. Its existing markShuttingDown and awaited query
  engine shutdown retain references on failure.
- Preserve message-group handler retirement ordering after successful native
  shutdown, with exact object identity; do not treat a cleared map or phase
  STOPPED as retirement permission.

Moving work inside `executePhase` also moves it under the existing class-A
scheduler and phase events. This is an intentional lifecycle boundary change,
not timing equivalence. The focused plan test measures scheduler admission,
acquisition, release settlement and metadata publication order; the native
witness measures the actual failure/cleanup sequence.

Only failure-result/event consumers receive the new cleanup observation.
Startup still observes `success: false`; the observation grants no retry,
reopen, release or placement permission.

## Exact SQL reference discharge

Independent physical-owner review found three references to the acquired SQL
engine: bootstrap, CDC and `SeedRuntimeBridgeOwner`'s acquisition cache.
Cleanup delegates omit the setter currently requested by
`shutdownSqlQueryEngine`; merely adding a plain setter would still leave the
bridge returning the stopped engine.

After the existing helper successfully awaits shutdown, an exact-engine
release delegate must clear bootstrap and bridge references only when each
still equals the captured engine. CDC retains its existing exact comparison.
The bridge's release method discharges its own cache; it does not run a second
shutdown algorithm. Rejection retains all references for same-owner retry.
The focused SQL witness checks both rejection/retry and a replacement
installed while old shutdown is pending.
