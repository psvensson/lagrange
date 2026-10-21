# Independent actual public baseline result review

Date: 2026-10-21. Verifier: `subagent:/root/control_source_review`.

Verdict: **APPROVE classification as an engaged unchanged-source public-frontier RED**, with the explicit retention limits below. The only reported assertion failure is the final future handoff-code expectation after the frozen test's preceding engagement and cleanup assertions. This is useful baseline evidence; it is not evidence that the current authority refusal is unsafe and does not approve production implementation, activation, future handoff completion or any Quest receipt. No tests, source changes, reruns or remote artifact retrieval were performed by this reviewer.

## Exact measurement and identity

Measured checkpoint: `c6ece57ee319ff60b77948226e36643f57c6dc22`, locked adam-laptop, retry0. Its entire `src` and `scripts` trees equal product `393f411ca09449898465cc3cb7320c03fba2aba8`: respectively `ddf32b08e93c0b617f6ec24d0d70596e2888eec5` and `f9a8c3bd375965168152673ec1afe06f53216e5e`.

The packet manifest SHA256 is `bef1c64489b6711b0ac43fe0d2f2542ca5a2a9d84a6640622fafe91424cd02a4`. All ten entries match both byte lengths and SHA256 values. All19 `source-bindings.json` entries and the three `input.json` witness bindings match the measured commit's actual Git blobs and SHA256 bytes. The approved witness hashes remain:

| File | SHA256 |
| --- | --- |
| `test/bootstrap/retained-seed-original-handoff.integration.test.js` | `8647322c9fc96716abccff6bc3d272d55d1caa3770fe8dd711e6cc12470b3ab1` |
| `test/test-helpers/retained-seed-public-observer.js` | `7c8adf440a7c77b5cd79d03146705223e7fdc35ac7bdcbc73061c716fbedda1c` |
| `test/test-helpers/retained-seed-public-child.js` | `cfbbc9022f63e7b46ff3521ecfc49894fed4c2c1a800eabe2950b350c4993b45` |

The prior nine-category code/design review remains unchanged at `../independent-public-witness-review.md`, SHA256 `642d28dc0e24cd18ba4d61d9836384841fedaa17c71c0f2cf72180dd4686bbf1`.

Raw controller lines3 and7 record the exact placement and factor2/retry0. The canonical bootstrap lane advertises jobs2 but selects only this one file. Thermal admission holds at83C and then admits at43C; no bypass or new timing override is recorded. `exit.json` reports exit1, no controller error, 06:39:01.718Z–06:41:02.572Z. The one-row ledger reports attempt1, `retriedOnce=false`, one failed file and51941ms. The node:test case reports50254ms, zero cancellation/skips/todos. The runner's “1 assertion” is a top-level case count, not a claim that only one leaf assertion executed.

## First actual public attempt

The child enters the real public `startLagrangeRuntime` with supplied directory, stable node/listener configuration and no forced seed, fake membership/grant, process-claim reset, bootstrap budget override or substituted constructor/shutdown. The frozen child source and reported initial observation bind this to public ingress, not the earlier lower BootstrapService fixture.

The selected dependent is `artifact_payload_chunks-p1-r1`. Its native origin changes from null to `{originIndex:2,originTerm:1}`, equal to the actual OBSERVED answer. The actual request retains deadline `1792564852532`; the response settles at `1792564824627`,27905ms before that deadline. Public budget is30000ms. The reported initial outer failure projection has elapsed2095ms and remaining27905ms on the original node clock. Therefore this is expressly **not a natural wall-clock thirty-second expiry**.

Only after the actual response/origin observation does the shared handler clock read the issued deadline. The node/native clock objects and real timer delegation remain original. This treatment affects later handler clock reads as well as the selected request; it is not a private per-request clock. It does not grant authority or suppress background traffic.

The retained complete selected object supplies positive native membership/position evidence, the exact release/attempt identity and CLOSED admission at ENABLE settlement. Its selected-attempt records contain three PAUSE deliveries and one ENABLE, with no subsequent OBSERVE_APPLIED_POSITION or RESUME delivery. The original outer answer is `release_fact_unavailable`, missingFact `release_deadline`, phase `observe_applied_position`. Recorded fresh intents retain the same absolute deadline. Actual control release reaches CUT_OVER; earlier NOT_LEADER responses remain visible rather than being edited out.

I independently parsed the complete selected value from the preserved initial diagnostic, stripping the host/TAP prefix and collapsing TAP-doubled backslash pairs once. It exactly equals `selected-release-observation.json.selected`. This is extraction of a fully retained JSON value, not reconstruction of the elided surrounding report.

## Cold restart and first owner refusal

The failure stack identifies the final assertion at `retained-seed-original-handoff.integration.test.js:158`: actual undefined versus expected `HANDOFF_COMPLETE_SERVING_DEFERRED`. Reaching that line in the unchanged sequential test requires first-process engagement/cleanup assertions, first real directory reacquisition, readonly origin comparison, second process completion, distinct PID, second cleanup assertions, second directory reacquisition and unchanged origin. Those assertions have no catch-and-continue path. The reported failure is not a runner timeout or earlier setup assertion.

The final retained diagnostic identifies the actual first captured creation refusal on restart:

- Owner/method: `seedPartitionsPhase.createBootstrapPartitionReplica`.
- Entity: `artifact_payload_chunks-p1-r1`.
- Code: `CREATE_OWNER_DEFERRED`.
- Source stack: `assertBootstrapPartitionStorageAdmission`, `seed-partitions-phase.js:91`, called before native partition construction at line226.
- Actual consumed SERVICES admission: state `readable`, rows `[]`, conflicting false, **empty false**.
- Membership result: seed/FRESH_SEED, no durable membership proof, peer evidence unavailable. This is not entry into a proved seed-restart-v2 path.

The distinction between empty rows and the owner's `empty` permission is material. `assertBootstrapPartitionStorageAdmission` only allows the fresh-empty shortcut when `admission.empty === true`; otherwise it requires a matching restorable row (`seed-partitions-phase.js:79-98`). An already committed local origin does not satisfy that authority question. The observed refusal is consistent with the current fence; the baseline does not authorize using old directories without the prospective grant.

The later public exception is “Partition leaders not established within30000ms: partitions-p1, services-p1, tables-p1, message_groups-p1.” Existing phase orchestration continues to its leadership wait and public startup flattens the failure at `lagrange-runtime-startup.js:473`. This later timeout is not substituted for the earlier creation refusal. The raw restart log reports three created services; that is not proof of successful partition recovery, completed activation or a safe complete handoff.

I independently parsed the complete final first-divergence diagnostic from the controller with the same bounded TAP unescaping and verified equality with `restart-frontier.json.observation`. This establishes the retained owner/error/value correspondence without relying solely on the author's summary.

## Cleanup and retention limits

The full controller stream is preserved at SHA256 `d3fef146187a629b2fe57ccea66ce942a546924e675ddaa4353dc2393e4fb90f`,132971 bytes. That is **not complete child TAP**. The canonical runner explicitly elides369850 bytes at controller line41. Its source (`scripts/run-test-files.js:486-502`) retains head/tail and identifies the full placement-local TAP path. The already removed temporary placement cannot be treated as a retained complete transcript.

The unchanged sequential source establishes that all preceding assertions passed: actual public calls settled without a cleanup AggregateError, observer error lists were empty, each captured native DB was closed before the child received its explicit exit command, and parent readonly origin comparisons passed. This is source-bound assertion evidence. The truncated complete database inventory and second-child report cannot now be independently reconstructed or counted from the retained stream. The review does not invent those values or claim a complete-cohort issuance census.

Likewise the reported `/tmp/retained-seed-public-CkzwCB` path and its child logs/native file are **reported retained locations**, not independently re-read or checksummed artifacts. Process exit is not used as proof of native cleanup: closure was asserted from the pre-exit report. Directory reacquisition is evidence after that process boundary, not independent proof that a lock would have been released while a failed owner remained alive. No swallowed/extra cleanup failure is reported in the retained final node:test result, but no all-resources or arbitrary failed-constructor guarantee follows.

This limitation should remain visible in every downstream handover. The available exact source, complete selected value, final frontier diagnostic and single final failing assertion are sufficient for the narrow engaged-baseline classification. They do not satisfy a claim of complete raw trace custody or a complete prospective positive operation. No rerun or unsupported artifact access is requested by this verdict.

## Scope disposition

The prior review's nine categories remain bounded as measured: real admission and native commit were reached; a cold process re-enters the actual recovery/creation path; original retry/transport/timer owners are not replaced; exact attempt dispatch exclusion is observed; process/native custody checks precede the final expected code. The known first refusal is preserved rather than explained away as a generic timing failure.

No new grant, public admission fence, complete allocation, exact SERVICES/CONFIG handoff, activation, same-live lost-commit resolution or cold mid-handoff HOLD implementation was exercised. The STOPPED-versus-activation obligation and the pre-source mutation, ingress, issuance/abort and lower SQL correspondence requirements remain literal and unresolved. All new Quest receipt rows remain outside this result approval. No U1/TX1/FreshMG, cross-host RF3, corpus, landing, publication or release acceptance follows.
