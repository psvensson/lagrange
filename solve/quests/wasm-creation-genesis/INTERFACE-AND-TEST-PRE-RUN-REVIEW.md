# Independent interface and first-test review

Reviewer: subagent:/root/completion_consumers, 2026-10-16. No tests executed or source/test bytes edited.

## Startup custody test

**APPROVE for first locked execution and the scoped R2 custody correction.** Exact file `test/entrypoint/startup-failed-cleanup-process-custody.test.js`, SHA256 `be58a8d6f5c9df3f1c101a64b50c282818f38990b29aba78102af2333e2baf92`.

The test composes the actual acquisition ledger and process-directory lock with a real SQLite resource and child process. It verifies real contention before actuation, injects a specific ordinary-cleanup failure, verifies later ordinary cleanup still runs, and checks actual lock acquisition afterward. The predecessor ignores the optional guarded-release argument, so the intended failure is `STARTUP_RELEASED_PROCESS_CUSTODY_AFTER_FAILED_CLEANUP`, not a missing export. The paired healthy case releases both resource and lock. Second unwind must not repeat a possibly effectful cleanup. Results are emitted before the semantic assertion. This is component evidence only, not successor startup or RF3.

Implementation caution: withholding the release callback must retain a strong reference to the held owner until safe release/process death. The existing ledger pops callbacks and marks itself released; the failed startup returns no runtime wrapper (`lagrange-runtime-startup.js:685–693,778–792`). Dropping the sole held-owner reference is not proof of custody until process death. R2 requires ownership retention in the existing owner, not another lock authority. The test retains its fixture owner and therefore does not by itself cover that production reference-lifetime obligation.

## Metadata interfaces and initial CAS test bytes

Reviewed `proposed-interfaces.md` SHA256 `071fe7b5a04d91c60f1d66cfc36aec4583c6ad5a8749a01e22fc234fff65ffa0`. Its named selection/resource boundaries are compatible with R2: canonical K, original winner versus loser result, exact slot token, no per-request catalog row, separate current permission, trusted lifecycle-only closure, and explicit component read adapter.

Initial test SHA256 `0e6695973bff27da2d769420fa111fbef83263ffcb79c0fdab195a79b3d92b43`; fixture SHA256 `3b346d471b06067779838b7e557811dbdaf19146bac37adeb6b4333d8411449b`. **REVISE those initial bytes before execution:** the two lost-response tests accept an initial UNKNOWN and then replay, but do not establish that the first mutation actually applied before replay. They could pass if replay performs the first mutation. Add explicit recorded SQL-applied/reply-loss actuation and inspect selected/slot durable state at the pre-replay cut. Subsequent approval must bind the corrected hashes.

Other reviewed controls have useful nonvacuous mechanisms: distinct owner/gateway instances race on one SQLite row; the cross-slot loser must exhibit a zero-change guarded UPDATE; 20 selection generations exercise the 16-result frontier; slot closure/reuse preserves old-token exclusion; predecessor resource barriers prevent successor grant. Catalog snapshot equality detects accidental creation-history allocation. Their scope remains SQLite owner/gateway/CDC composition, not QueryEngine/RF3, process recovery or lifecycle cleanup.

Historical classification must precede fresh creation-lineage admission checks where applicable: the test intentionally changes `safetyIntervalMs` for an already decided losing/winning K. Those bytes are not a valid new revision configuration. They test original conflict/content-conflict classification, not permission to create with an altered immutable definition.

## Phased lifecycle interaction requiring exact propagation

The proposed descriptor fields `consensusBinding` / `consensusResourceToken` and actual `ServiceDefinitionsOwner` dependency are consistent with R2. Bootstrap transport/INIT must remain distinct from protected serving. A retained original grant recovery is distinct from new CREATE; semantic stop followed by re-create is not its proof.

There is a concrete current consumer interaction to implement, not merely a new result label:

- `WasmComponentDriver.#projectConsensusStartResult` (`wasm-component-driver.js:527–543`) maps `started:false` to FAILED today.
- `ServiceRuntimeLifecycle.assertDriverStartSucceeded` (`service-runtime-lifecycle-operation-methods.js:45–55`) rejects only FAILED; its caller otherwise writes endpoints, ACTIVE and COMPLETED (`340–391`). Merely returning a new HELD status here would falsely complete.
- `service-lifecycle-operations.applyReplicaOperationSteps` (`285–295`) moves to RUNNING after any returned adapter result, and its caller completes the journal.
- `RuntimeServiceHandler.createReplicaAsync` (`396–415`) marks local ACTIVE and emits CREATE_ACTIVE after awaited start without inspecting a held result.

The principal selected explicit `BOOTSTRAPPED_HELD` propagation through all these existing consumers, retaining the original operation/B/token and using the existing reconcile continuation. Before implementation, its exact phase addendum must specify that no endpoint, ACTIVE, RUNNING or COMPLETED is emitted for bootstrap; publication/resume must consume the original token and actual matching applied INIT. Returning a held object only at the driver is insufficient. Fixture calls to the real publication owner are useful narrower evidence, but cannot replace the full continuation/consumer witness.

## Applicable checklist coverage

All seven templates read for R2 remain applicable. Item-level disposition for these proposed tests/interfaces:

- Owner interaction 1–2: sole metadata owner and existing lifecycle actuation; 3–4: paired contention/healthy and stale-token/current-token controls; 5–6: bounded ring/slots and required later last-CLOSED wake, not established by this component; 7: row observations not serving authority; 8: optional guard preserves predecessor callability; 9: direct component closure explicitly does not certify local retirement; 10: exact registration and native consumers remain final-source requirements.
- Admission 1–2: actual SQL predicate and named outcomes; 3–4: no raised budget or invented transport result; 5: predecessor-close barrier component only; 6: real row at mutation; 7: original K/token retained. Phased held classification must propagate at all four consumers.
- Concurrency 1–3: two independent owners and real SQLite conditional writes, not local-gate proof; 4: no new timer; 5: cross-slot target equality and actual process-directory lock scope. Startup strong-reference custody remains a source obligation.
- Recovery 1–2: reconstructed owner is not process restart; retained-permission native recovery remains separate; 3: resource row cannot be erased by empty local registry; 4: ring/ordinal replay controls; 5: absent caller reply does not prove absent mutation—the initial lost-response tests need correction.
- Retry 1: no new retry mechanism proven; 2–3: fixed finite experiments and exact stops; 4–5: no busy repair loop introduced; 6: repeated unwind does not repeat effects, exact token replay is checked; 7: reply-loss cut must precede replay before it can prove reset/idempotence semantics.
- Transport 1–2: reply suppression is explicit actuation, not committed-delivery proof; 3–4: no native message-route classification or missing-recipient proof claimed; 5: SQL adapter honestly replaces authoritative reads only, mutation owner/gateway/CDC remain production.
- Harness 1: intended acquisition assertion versus missing symbols; 2: real owner composition with declared component seams; 3: ordinary executor bound, no changed timers/manual rescue; 4: exact request/token fields; 5: initial contention and zero-change SQL checks prevent trivial passes, lost-response vacuity requires fix; 6: no native integrated claim from these components.

No broad contract reopening, production execution, merge or release approval is implied. Corrected CAS bytes and exact native fixture/phase addendum require their content-bound review before use.

## Stop-time review disposition

User STOP received; no further investigation, source/test edits or execution.

- **APPROVED:** `HANDOFF-INTERFACES.md` SHA256 `73ce46f2cb6828d5a07fa5e7811152929314de9be97f777af2b1d62524470cea`. The exact revision selects ServiceLifecycleManager's single CREATE origin/admission row, keeps it IN_PROGRESS through prepare/bootstrap, and resumes that row for START/publication. Lower runtime layers consume the explicit operation context without independent authoritative journaling. All four consumers explicitly preserve BOOTSTRAPPED_HELD. Source implementation and native proof remain absent.
- **Corrected CAS content inspected; no execution:** author-reported final test SHA256 `4d9e4904b472429b5359adcb22353392855c1d6a461b6b1924b4c28ea92054cd`, fixture `7a3b69a318e90a09c9d65b95a50956992422ec3e4abb8a6bb54c1d5c7c956a59`. The inspected changes record actual applied lost replies before the injected throw and assert durable selection/reservation at the pre-replay cut. They address the identified vacuity. The reviewer did not perform a final hash recomputation after those edits before STOP; exact-final-byte execution approval remains pending preservation/hash confirmation. No missing-symbol execution is authorized.
- **Native draft REVISE/unexecuted:** fixture SHA256 independently observed `0ca22fc4d2f3def38ce87445d61eb4213f0a66498c83744d6d88526bece4ffcb`; test `8cd62bd27739803eb264188f9baa8ac2f8265ba03ce8d82e0028ee3795154590`. It composes the real manager/adapter/runtime/driver/lifecycle with component metadata and actual RF3, checks single-row journal custody and negative bootstrap publication, and explicitly limits positive evidence to local grant. Its `initializeAndPublish` requires successful ENROLL before publication; correct it to matching INIT → real publication grant → ENROLL so bootstrap does not need new user admission. This correction was not applied before STOP. The unconditional throwing non-ACTIVE projection sink also needs explicit qualification: current runtime treats non-ACTIVE projection errors as best effort, so it is not presently established as a setup failure, but it cannot certify actual projection success. No full consumer/endpoint/ACTIVE, recovery or snapshot claim is warranted.

The exact startup custody test approval above stands. R2 contract approval stands. New creation tests have not run and no production implementation has been approved or reviewed by this verifier.
