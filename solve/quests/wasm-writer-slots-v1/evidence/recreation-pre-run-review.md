# Recreation origin counterexample: exact pre-run review

Verdict: APPROVE for one targeted first locked execution as a conditional deterministic application counterexample. No execution was performed by this reviewer. This is not native RF3 evidence, source approval, proof of a reachable automatic recreation workflow, or full protocol approval. Other new tests remain unexecuted.

Reviewed file: `test/wasm-service/wasm-writer-recreation-origin-v1.test.js`.
SHA256: `9edc4b49f2de67da1c3cfce310b171a36e8329437c4c2b189a97db0ac480ec1f`.
Git blob: `d9c116f6493da4a8b6a7c462e3a39ae3cd9f5ca4`.
Both identities independently recomputed. Source remains the frozen WIP application implementation; execution must bind its exact checkpoint too.

## Claim and observations

The test states its premise at lines1-4: a legitimate same-service-ID fresh database exists without a creation-origin guard. It invokes the actual WasmWriterState and SessionKVStore in real SQLite transactions (42-55), supplying application positions explicitly. It does not drive lifecycle, native Raft, networking, consensus position ownership, or a snapshot installer.

At 81-88 the old application is established and closed, its bytes hashed, and a distinct empty application database opened. At 89-94 intended new INIT J is explicitly NOT ordered, while the exact retained original INIT/enrollment/write commands are applied in that order. This is the selected contract counterexample, not evidence that J was already authoritative. At 96 original file bytes must remain unchanged. At 97-104 revival requires BOTH actual accepted RECORDED write outcome and actual KV value; the complete original/new state and each result are printed before OLD_WRITER_REVIVED_AFTER_RECREATION. A setup, missing method, schema, dependency, or other exception is not that semantic failure.

Controls: 110-125 reopen the same original database, compare full metadata/slots/KV before and after exact write replay, and require the original receipt index3 when replay is supplied position4. This is clean same-file restart, not process crash/power-loss proof. At128-145 a different serviceId rejects all three old commands with the actual owner reason and leaves state unchanged. This control shows that service identity already fences the commands; it does not establish a production policy forbidding reuse of the same service identity.

## Harness fidelity: all six items

1. Right reason: original establishment requires three accepted RECORDED results (58-70); fresh preconditions are explicit; named failure requires accepted write plus real KV (97-104). Preserve first raw output. An exception earlier is a setup/input gap.
2. Seam honesty: real storage/application modules, no stub success; supplied positions and fresh-storage premise are explicitly labelled. No lifecycle authorization claim.
3. Time: entirely synchronous SQLite operations; no virtual-time compression, timers, wait budgets or consensus progress. updated_at is observed in the same-file control but is not used to infer ordering.
4. Fields: complete canonical INIT/ENROLL/WRITE at23-34, matching current v1 input contract. Exact same objects/contents enter old and fresh applications. Position/term are explicit component inputs.
5. Nonvacuity: old application must have accepted all three commands; fresh metadata/slots/KV must be empty; revival requires accepted result plus KV. Same-file control compares full snapshots and original receipt. Different-service control requires each of three typed refusals and unchanged state.
6. Live binding: imports actual current state/KV/codec, no test-owned transition implementation. No native/lab result exists yet; exact source checkpoint must accompany run.

## Owner interaction: all ten items

1. Sole semantics owner remains WasmWriterState; test does not decide application results.
2. Boundary is command + explicitly supplied application position into state.apply inside SQLite transaction (47). No fabricated Raft/application adapter guarantee.
3. Paired properties: original bytes preserved while new same-ID state can revive; controls preserve retained-file exact replay and different-service rejection. Execution is pending, not green evidence.
4. Stale/fresh: old INIT before unordered new J is the intentional schedule (89-103). J is only caller intent, not a false authoritative creation proof. A future creation-bound contract needs a new reviewed witness that actually invokes that bound creation seam.
5. Pressure/backoff: not exercised; three finite commands per application, no force/saturation bypass.
6. Wake: N/A, synchronous application-only witness.
7. Projection: meta/slots/KV/hash are observations only; no test mutation of authoritative rows or inferred terminal answer.
8. Treatment: no source mutation or comparator is claimed. Same-file and different-ID controls are labelled distinct premises, not identical-input negatives. Preserve exact file/source identities.
9. Escape hatch: fresh database construction is the declared premise, not deletion of old authority. No direct row update or fake owner result. Original DB remains untouched until cleanup after test.
10. Registry/proof: this is an additional bounded counterexample in the same held writer Quest. Parent owns impact/metadata registration and final exact checkpoint; first execution approval does not waive those publication gates.

## Admission: all seven items

1. Uses actual classify/apply path, not a precheck emulator (47).
2. Typed RECORDED and REFUSED inspected (63-64,97-99,135-137); no transient wait classification claim.
3. No wait/budget changes.
4. Different-service reason read from real owner constant R.INCARNATION; not string-normalized fabricated shape.
5. No hold/release mechanism or recovery progress claimed.
6. Each state.apply evaluates its current actual DB state; fresh versus retained state is explicit.
7. Inputs and diagnostics name actual service/incarnation; new intent is printed with ordered:false (103).

## Transport: all five items

ACK/processing, late replies, router result classification, missing-recipient deadlines and stub fidelity are N/A: no transport instantiated and no delivery/commit claim. Explicit application positions are not represented as a native log or quorum evidence (1-4,92,121).

## Concurrency: all five items

No async gate, post-await TOCTOU, multi-winner claim, timer reentry or distributed lock is implemented/tested. Calls and SQLite transactions are synchronous (42-55,91-94). Locked host execution is an external parent-owned resource requirement. This cannot certify racing admin admissions; it exposes the deterministic outcome for the specified order.

## Recovery: all five items

1. No live state overwritten: original closed file remains byte-identical before fresh result assertion (96).
2. Fresh versus retained is explicit distinct path versus same-file reopen (79-83,112-119), not inferred cache absence.
3. Lost enlistment N/A; writer slots and their exact state are observed, not transaction participants.
4. Exact replay control requires original result and identical durable app observations after supplied later position (117-120). It is not crash recovery or replay of the Raft applied index.
5. No unreadable-state-as-absent inference: missing/malformed source DB errors surface; a newly created distinct empty file is the stated premise.

## Retry: all seven items

No retry registration/firing or backoff loop. Three synchronous applications bound each schedule; stop points are assertions/exceptions; no mutual suppression; finite attempt count; same-file exact replay is the only duplicate-effect control; no counters/reset-on-ACK. Retained old admin/write bytes are reused once for the counterexample, not manufactured new requests.

## Limits and stop rule

A named OLD_WRITER_REVIVED_AFTER_RECREATION failure with the described events establishes the current application accepts old identities under the conditional new-empty-same-ID premise. It does not independently establish deployment authorization/reachability of that premise, native log durability, deletion of old committed data, or wrongdoing by a caller. A passing test or setup failure must be preserved and investigated as such, without revise-until-green. No implementation correction is authorized by this pre-run approval. Whole writer contract remains HOLD pending creation-origin ownership decision.
