# Final-query hold seam: bounded independent readiness reconciliation

Verdict: **APPROVE the narrow extraction/composition design conditionally; exact implementation readiness remains HOLD until reviewed production action and final V4 control freeze.** This is prep for one shared test transport-hold mechanism, not authorization to change query/production/native behavior. No source/test/fixture/metadata/Quest/Git edits or labs/tests/checkers; this new ignored report is the only write.

## Exact read-only evidence

Verified readiness4cb7 (`final-query-implementation-readiness-v1.md`, SHA256 `4cb7a478e4a11ea3ba7d61a243ff12a110664229f6bc69563bf3abd1157445e3`) plus the explicit attribution correction15f1 (`control-batch-v3/final-query-implementation-readiness-v2-correction.md`, SHA256 `15f1caad89d2d439788ebf418b0e485877c11d9673bd54f0401fe0846293386a`). Approved schedule3aa13 and independent reviewabad89 hashes are unchanged: `3aa13f11faff53b3118342d574adc61c7e57b99237bc1daf89da9b80f164d600` / `abad89ac162dce38992a05a632fc56a496eb759b2d364591ed3fda1a6979abb8`. Their full28 admission/concurrency/owner/harness obligations remain binding.

Controls V3 custody manifest SHA256 `3aa69afcc3134abb22a14409da557a7b0fd80fab6bf47b0a7292805b3f0e6804`: all10 archived artifact sizes/hashes match. Independently reconstructed the three frozen test blobs entirely in memory from immutable ad23 baseline plus archived `scoped.diff` SHA256 `c5066c68c3b079e56c6a4340516ed391aaf8ffc6e3d3c18225962005d1454b4b`; all three output byte counts/hashes match the freeze. No mutable V4 test was read or asserted frozen. Relevant protocol blob is `b2e5777ef68f935f3b762b4bbfae233922c00bf7e19f3fa4469b23fd6ff156ca`.

## Truthful two-consumer seam

Frozen protocol1187–1234 is the actual first consumer: its local transport delegate holds the target service's OBSERVE_APPLIED_POSITION call1195–1200, after observing real ENABLE origin1215–1217. It shuts down the actual control service1218, forwards the held delivery, then requires UNAVAILABLE/current_control_owner_fact1220–1222, one observation/one initial successful control release1223–1225, no dependent RESUME1226–1227, unchanged origin/CLOSED1228–1230. It does not control native commit-carrier/membership publication.

Native V10 instead holds Raft commit carriers and actual membership answers; it has no reusable OBS-delivery gate. Correction15f1 is therefore accurate and supersedes only4cb7's false native attribution. The earlier schedule/readiness mentions of a native-owned gate must be read with this recorded correction, not silently satisfied by a different seam.

The second concrete consumer is the approved focused query-preservation witness: hold the natural OBS delivery for the actual SQL_TRANSACTIONS control partition *after* its ENABLE, redeliver the already captured exact terminal PROGRESS payload through the existing settlement owner, then forward the held original delivery and finish the same release. One shared fixture helper can own that hold for these two consumers; no native witness extraction/change is needed.

## Smallest helper contract

Extract only the held-delivery mechanism, not protocol's control-release/RESUME counters or query's ENABLE/RESUME/terminal-settlement observations. Those remain test-local passive observations with their existing sole consumer/owner. Keep one shared helper at the existing release-fixture boundary (or a separately declared small shared test-helper scope if final owners select it); do not create a second release fixture, dispatcher, gate classifier, query-proof builder, or retry driver merely to share code.

The helper owns one exact transport delegate and one first matching OBS delivery. Selection is an internal action/partition/target tuple using the imported canonical action/type, never authority to decide release/census/query validity. It must:

- install before the target attempt, with the initial normal control release already complete for the query case; capture the actual request/address/options/receiver and original delegate once, retain original release/attempt/deadline identity, and hold at most that one exact call;
- pass every nonmatching call straight to the original delegate with original receiver/arguments and exact returned value/Promise/error;
- expose bounded engagement and forward-once custody, invoke the original matching delivery exactly once after release, and retain its actual returned Promise/value/rejection without answer manufacture;
- restore only its exact installed wrapper, never overwrite a replacement; settle/observe every original held request and preserve primary plus independent restoration/shutdown failures before releasing directories;
- add no timer, polling, clock advance, extra INSPECT/status/facts read, application actuation, native publication change or result/classifier logic.

A pre-delivery hold necessarily returns its own owned pending Promise for the matched call: the future original delegate Promise does not exist until forwarding. Do not falsely claim object identity with that future Promise. Once forwarding occurs, adopt and retain that exact original result/error; nonmatching pass-through can and should preserve exact Promise identity. This is the held transport seam, not application ACK authority.

The V3 wrapper is async, delays all matching deliveries, binds the original receiver, and has only `continuation.resolve` in its local finally1231–1233. It is evidence of reuse, **not** an exact copy ready to export: extraction must enforce the one-call bound, ordinary direct pass-through, exact wrapper ownership and full pending-operation/restoration custody. Any primary before normal `await attempt` must still release/observe that accepted attempt before fixture shutdown; resolving a continuation alone does not prove it settled. Retain directory custody when a failed shutdown/restoration leaves ownership uncertain. None of these cleanup observations count as the behavioral query falsifier.

## Query composition and evidence remain unchanged

4cb7's three release-fixture additions remain exactly bridge identity, one service-derived timeSource passed to handlers/control service, and a read-only handle to the already-owned control service. Existing fixture retains one-attempt releaseOnce and all shutdown ownership; no second gateway or query decision. The real routed empty SQL_TRANSACTION_PARTICIPANTS service, actual SQL_TRANSACTIONS control service, actual cache routes, one production SQLQueryEngine/its own gateway and exact engine bridge remain required by3aa13/abad89. No raw seed, in-memory persistence, cache-only emptiness, forced transaction result or local classifier is approved.

Capture the actual terminal `{type, settlement}` command at its direct application seam, then exact redelivery returns the retained original APPLIED/committed/logIndex/term before another proposal. No rebuilt PROGRESS or REPLAYED-label substitution. Hold the actual post-ENABLE OBS without advancing the shared clock inside that held interval, preserve transaction/deadline/row/digest/proof/queue/outcome/cursor/admission identity, then complete full release normally. Equal observed ENABLE/RESUME proof values prove preservation only; exact final source review must separately confirm fresh final cohort/local/proof construction, full classifier, control-owner adjudication and guarded RESUME order.

## Stop boundary and final review

The current V3 seam is historically frozen, while V4 protocol/fixture edits are author-owned and moving. Do not apply its archived hunk over them or infer current line/ownership from V3. The final V4 bytes and independently reviewed source action must exist before the extraction/query implementation is authorized and content-reviewed. Refactor both actual consumers in one declared scope so neither retains a competing local hold, with exact code/fixture/source/metadata fingerprints and canonical final helper cone afterward. Changed release-fixture/transitive helper bytes invalidate any claim of final-head proof from older native/query/control runs.

Readiness is conditional only; runtime engagement and positive source-order/query/native/startup/static/corpus/Quest/main proof remain HOLD. A refusal before real BEGIN/recovery/terminal settlement/post-ENABLE hold is setup evidence, not the intended query-preservation negative; every spent healthy bound stays red. No extra production correction is proposed by this reconciliation.
