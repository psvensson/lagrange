# U1 physical/runtime/manager source review: corrected frozen candidate

Reviewer: `subagent:/root/f1_independent_review`, 2026-10-19.

## Verdict and exact subject

**APPROVE the bounded physical-lifecycle, driver, runtime, manager and original-journal completion source at `ed9c5ccc72873e9fd49b55d0ed523ec281beca5c`. No further source repair is requested in this assigned half. This is a source-review approval; combined U1 acceptance remains pending the other review half and executed evidence, including focused post-await lifetime oracles and frozen-test source-only controls.**

| Binding | Identity |
| --- | --- |
| Local frozen combined commit | `ed9c5ccc72873e9fd49b55d0ed523ec281beca5c` |
| Full Git tree | `17a66242048c7d8d782290c05297703ddafeb457` |
| Production `src` tree | `10a9c9d676d5b71e1b5d522f84882c596440e26a` |
| Complete `test` tree | `b251c60c3aad02069895b82e411fca0b6d9db69a` |
| Prior rejected source retained unchanged | `37d5c9700c88c2079fe4ae2326a5af5322b17a0f` |
| New 40-file source/dependency/oracle binding | `u1-physical-source-bindings-ed9c5ccc-20261019.json` |
| Binding SHA256 | `bb65142f9b34c4ce6ccff4c630d2b2a22ae286d1d9afbd8bfb0a80e951148a79` |

The binding contains exact Git blobs, byte lengths and SHA256 values, with immutable snapshots in `u1-physical-source-ed9c5ccc/`. Its comparison list includes files newly added to this review binding as well as changed files. A separate complete Git source delta confirms that **only three production files changed after the rejected WIP**: the query projection owner, the shared runtime projection handoff and runtime consensus publication. Their frozen bytes exactly match the independently inspected repair. Every other previously bound production file is unchanged.

This report appends a corrected verdict. It does not rewrite `u1-physical-source-review-rejection-37d5c970-20261019.md` (SHA256 `ee323493b0cfa3de7166d556d173d19d96947d16f97f822c6517170c4ee9eb6f`) or its 33-file binding. The prior report's complete source-path census and category-complete findings remain the historical record. Root independently owns handler routing, retained inventory, hydration and the shared execution gate and must consolidate both source reviews at the same final production tree.

The reviewer did not author or edit the candidate production code or the candidate tests. No behavioral test was run locally. The author's reported final static result—21,705 ms over 69 paths/34 JavaScript files, zero new cycles and strict new-module checks—is not represented as an independently executed test by this reviewer. Subsequent independent post-await test authoring is a separate test-only assignment and will itself receive root's independent oracle review.

## Resolution of all four source-review findings

### P1: the actual stopped projection owner no longer discharges journal debt

**Repaired; source and new actual-owner oracle approved.**

The production SQL engine constructs `RuntimeReplicaStateProjectionOwner` and wires its `submit` into the runtime writer. Its stopped answer is `{retained: false, state: 'stopped', ...}` with no queued write. The runtime wrapper may still return the requested STOPPED `stateRow`, so that echoed row cannot override the writer's refusal.

The existing RETAINED/STOPPED vocabulary moves unchanged from `src/query/runtime-replica-state-projection-owner.js` into the existing lightweight `src/runtime/service-runtime-state-projection-handoff.js`. The owner imports that one vocabulary. A shared `isStoppedStateProjection` predicate consumes the owner state; it does not reinterpret outcome names in a private runtime list. `withdrawRetiredConsensus` checks that predicate before accepting a non-retained result and returns `RETIRED_UNPROJECTED` with `PROJECTION_WRITER_STOPPED`. The existing manager debt branch therefore returns before `completeConsensusCreation`.

| Repaired file | SHA256 |
| --- | --- |
| `src/query/runtime-replica-state-projection-owner.js` | `6b04778ccb1225d3e0d42329ac764ceff7623317369c65f0fc92fb6556ba4f4d` |
| `src/runtime/service-runtime-state-projection-handoff.js` | `4f0b1d7dd7b9e6ab68180b984df7920ccb2a854d53bf214b45f252340b585244` |
| `src/runtime/service-runtime-consensus-publication.js` | `82533d9c688f9c306f243f57f1c9ee3c1e14d4f7457c8c2abab13a0c07e496fd` |

The final appended restart witness, “U1 projection debt: the actual stopped projection owner cannot complete an old journal,” first establishes real native publication, the old ACTIVE services row and the original IN_PROGRESS journal. It instantiates and stops the actual production projection owner, then passes its unchanged result through the real runtime/manager retirement. It requires real metadata CLOSED, local RETIRED, exactly one actual stopped receipt and unchanged services/journal rows. The forbidden original-journal mutation assertion precedes carrier-shape assertions, so restoring the defect must fail `STOPPED_OWNER_FORGED_ORIGINAL_JOURNAL_COMPLETION` rather than only a missing vocabulary assertion. The writer is restored in `finally`; an explicit retry through the embedding's real direct writer then completes the same original journal without creating another row.

This precisely implements the stopped-owner addendum. It introduces no queue, APPLIED receipt consumer, implicit retry or alternative projection execution path.

### P2: the existing interaction registry now describes the corrected unit

**Repaired; item 10 alignment approved for this scope.**

`test/shards/impact-contracts.json`, SHA256 `f1898994f6391d04b7b939f7b5d881b8a57d1f77153862bef84a7bc66cbd2aff`, updates the existing `service-consensus-retained-native-bootstrap` and `runtime-service-bound-creation-route` contracts and their coupled pairs. Descriptions now name full retained origins, physical CURRENT, exact admitted retirement tasks, history-plus-tombstone FINAL, and separate STOPPED/journal debt. They explicitly leave production asynchronous receipt continuation with activation A5.

The owner lists include the new origin, canonical state-record and physical custody helpers, the query/runtime handoff and root's new handler helpers. Both native physical and restart files appear in contract tests and coupled witness lists; the runtime and handler consumer witnesses remain registered. The new physical file and restart file have primary subsystem classification `wasm-toolchain`; runtime publication is `services-runtime`; bound-route consumer tests are `bootstrap-membership`. The generated classification/seal files are included in the frozen binding. This amends the existing named interaction rather than adding competing authority.

### P3: direct STOPPING is fenced without blocking replaceable CREATED objects

**The repair already present in the rejected WIP is unchanged and approved.**

`wasm-service-lifecycle.js` reuses the exact CURRENT origin, rejects direct current STOPPING and admitted same-service retirement tasks, and retains the existing live/retiring-object guards. It does not apply a blanket “anything other than STOPPED” veto. A different never-opened CREATED object remains replaceable. The physical observation table also makes exact CREATED startable, alongside STARTING and READY, while CLEANUP_REQUIRED/STOPPING/registered STOPPED remain unavailable.

The native direct-STOPPING test has both halves: refusal while the real ordinary stop is suspended and recreation after that exact stop settles. The separate currentness test exercises CREATED, a real STARTING transition, READY, direct STOPPING, registered STOPPED, removal and lifetime closure. Their behavioral execution is still a gate; the source proof does not substitute for it.

### P4: active/still-retiring same-operation content conflicts cannot reach file effects

**The repair already present in the rejected WIP is unchanged; new direct oracle approved.**

Before admitting a new retirement task, `requireRetirementOrigin` examines actual active and still-retiring objects. A matching original operation ID must match the captured complete intent and token. An altered valid runtimeRef with the same active token therefore refuses CONTENT_CONFLICT before task installation, metadata release or by-path tombstoning. Existing in-flight same-operation comparison remains before task coalescing. Legitimate older different-operation by-path retirement remains available.

The appended restart witness, “U1 retirement identity: changed full body with the active token has no owner or file effect,” uses an actual initialized native object and a valid changed immutable descriptor. It requires `releaseInstanceResource` invocation count zero before checking the refusal carrier, then verifies the same object, unchanged lifecycle state, open database, local record, journal and resource phase. Removing only the active-origin admission check must fail `CHANGED_BODY_ENTERED_RESOURCE_RELEASE_BEFORE_ORIGIN_CHECK`. The real release method is restored in `finally`; fixture cleanup owns the actual resource.

The approved internal manager path consumes a retained creation handle. A fabricated direct manager handle can attempt exact endpoint withdrawal before the physical admission guard refuses its changed full origin. The normal handler ingress reads and validates the original immutable journal/request. Root explicitly confirmed that endpoint-before-retirement ordering remains approved and that no new runtime preflight protocol or journal read is authorized. This ceiling is retained; the direct physical oracle does not claim to prove a different upper-boundary contract.

## Preserved source guarantees and complete review categories

The rejected report enumerates every result and map-write path in this half. Rebinding its unchanged production files preserves that review. The repair delta was checked against all nine applicable categories, with the following final dispositions.

| Category | Final source assessment and evidence limits |
| --- | --- |
| Owner interaction | APPROVE. Physical custody alone supplies CURRENT and admitted-task ownership; retirement alone supplies FINAL; the original journal CAS/reread supplies completion. The shared projection handoff now consumes the real stopped-owner refusal. Full manager-map and direct-retirement caller censuses remain unchanged. The two named registry pairs, owners, witnesses and primary classifications align with the new unit. |
| Admission/gating | APPROVE. Full origin is captured before effects; task admission and bound physical replacement consult actual objects. CREATED is startable, direct STOPPING is held, and active same-ID changed content is rejected before release. Driver pre-start and post-return guards, runtime projection guards and manager record writes ask immediate CURRENT. No fake/current memo or token-only authority is added. Executed post-await oracle coverage is still missing at this freeze. |
| Concurrency/serialization | APPROVE. The physical task entry is visible before any collaborator invocation, identical calls share it and settled work removes only its own entry. Shutdown closes admission synchronously, snapshots admitted tasks plus exact active/retiring objects, and joins cleanup before releasing its lifetime. A RETIRE_RESOURCE join retains debt before returning an ordinary STOPPING settlement. No new timer, lock or retry loop was added. |
| Recovery/replay | APPROVE in this half. Terminal local tombstones and authoritative original journal CAS make retries idempotent. CLOSED is factual acknowledgment; RETIRED plus HISTORY_UNAVAILABLE is separately represented physical FINAL with closed false. Missing storage plus unavailable history remains unresolved. Failed ordinary-stop retirement debt survives to shutdown retry. Canonical manager and driver projections cannot borrow old origin ownership. Root owns inventory application and handler gate sequencing. |
| Transport/delivery | No new transport classifier or routing algorithm in this half. Creation wakes remain enqueue-only hints with explicit delivery outcomes, never authority for finality. Metadata throws/unknown replies remain unresolved. Exact endpoint-before-stop ordering stays intact. Actual cross-node delivery and transport timing are outside the C6 fixture's proof. |
| Harness fidelity | APPROVE the already reviewed 14-case native physical file and the two new actual-owner/component restart witnesses for preservation and execution. Their gates restore collaborators and join admitted work; setup, missing-interface or timeout failures cannot count as behavioral mutation evidence. The first three historical missing-method failures remain interface prerequisites only. The stale pre-start oracle does not prove an already admitted post-await continuation; independent new tests are now assigned for that gap. |
| Formation circularity | No new formation dependency or consistency bypass. Physical cleanup waits for the release attempt to settle, not for guessed success; unavailable metadata keeps debt. Actual founding/native grant algorithms and their budgets are unchanged. Production journal availability, metadata consensus and A5 receipt liveness are not closed by these component tests. |
| Retry loops | No new attempt counter, timer or self-retry. Equal physical work coalesces until settlement; deletion then allows an explicit exact retry. Physical nonfinality, unprojected STOPPED and journal-completion uncertainty return to their existing debt owner. Root reviews startup, observer and wake re-entry bounds. The known real RETAINED-to-APPLIED continuation remains A5. |
| Sweep/timer | No added sweep, timer or timing-based finality. Existing time ownership supplies tombstone timestamps. Lifecycle closing fences new physical admission and later canonical projection; successful joined shutdown owns release. No process-crash equivalence is asserted. |

The complete final restart file has SHA256 `b3ca1df74d97b89badb59fd73247a0a0d445295406d1820c59908e440a3dbfae`. The independent 14-case physical file remains SHA256 `fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad`. Root's two real-handler observer-ID consumer cases were separately checked for a genuinely ACTIVE generic target, one occupied observer, no foreign mutation or outcome and eventual original settlement. Their scripted RETIRED seam is expressly consumer evidence, not a native physical claim.

## Remaining gates and ceilings

1. Root must complete and consolidate the handler/inventory/hydration/gate half against this same production tree. This report is not a full-U1 verdict by itself.
2. The frozen corrected source needs focused positive lab execution and source-only negative controls with unchanged test bytes. Older F1 positive/control evidence cannot certify newly changed U1 interactions.
3. The current physical test proves stale admission before service-keyed start. It does not yet suspend an actual PUBLISHED driver return, an actual manager confirmation return or an actual services/endpoint completion across old retirement and successor ownership. That is an explicit oracle/execution gap, not a newly observed source defect. Root assigned a separate test-only follow-up with independent review before mutation or execution. Removing only a post-await guard is not creditable as measured coverage until its exact oracle exists and fails for the intended effect.
4. Runtime post-await checks prevent later writes and later steps after a fresh physical observation. They do not cancel a projection already admitted to another asynchronous owner. The production projection owner returns RETAINED before its APPLIED event and has no completion consumer in this unit. Activation A5 owns that live continuation and superseded in-flight projection lifetime. The direct C6 writer has a completed-write contract and must not be cited as A5 proof.
5. This review grants no source landing, merge, release, U2, activation, distributed metadata, cross-node wake or abrupt-process recovery approval. Publication of an identical immutable WIP tree preserves evidence; it does not satisfy those gates.

The positive source verdict supersedes the source rejection for the exact corrected bytes only. The original rejected checkpoint, findings, controls and reports remain append-only.
