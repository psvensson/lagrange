# Final content-bound cross-review

Reviewer: subagent `/root/completion_consumers`. This is one final read-only cross-review of the resulting evidence and claims. No native execution, source/test edits, changed thresholds or retries were performed for this review. The reviewer authored the partition/transfer controls and independently reviewed the ordering/WASM/MG bytes before execution; this is not presented as independent authorship review of the consumer tests themselves (the separate ordering agent supplied that review).

Reviewed report: `REVIEW-REPORT.txt`, SHA256 `22bd5ba7a8bf9bebb6f9e5f5b763fa4027a19c996116925963a992d7415f91e4`.
Frozen second test checkpoint: `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4`.

## Verdict

**ACCEPT the report for non-main evidence preservation with its explicit gaps. HOLD F1 temporal supersession, whole runtime increment approval, and the complete release protocol.** No material claim correction is required in these report bytes. This approval does not approve implementation, merge, activation, sealing, or a revised MG attempt.

## Exact identity and results verification

I recomputed all ten SHA256 identities in `final-test-identities-5a3cdc7.json` from Git objects at the frozen second checkpoint and checked all ten Git blob IDs; all match. I recomputed the seven raw TAP SHA256 values and parsed pass/fail totals; every row matches `whole-file-results.json`. The first-results report remains the detailed independent review of ordering3/3, partition2/2 and the same-host WASM pair each1/2. The additional observed results are:

| Run | Exact checkpoint | Whole-file result | Raw TAP SHA256 |
| --- | --- | --- | --- |
| ordering-exact-first | 5a3cdc71 | 3 pass, 0 fail, exit0 | dfbd4df5701087bde076084f2376098435a15683396bc1d1573001a0b87bd182 |
| transfers-first | 5a3cdc71 | 3 pass, 0 fail, exit0 | 59b41398b70a941b98492bcbbdee1b0b19f0deb923bda11735544fee2b98af2c |
| message-group-first | 5a3cdc71 | 0 pass, 1 fail, exit1 | f82369643142af3679151d9ed5cedcc405e4b5a1b620925727e148eb982d3def |

I compared the frozen second checkpoint against the base publication: no production `src/` file differs. Runtime, WASM, source CDC owners and the frozen W07/F1 files also match `4aa8780c…` byte-for-byte, and the source-identity manifest hashes match. The original W07 blob remains `debc16f442ba63b100332d93b285865d36d1c376`. The predecessor treatment changes one production runtime-owner file plus two generated metadata files; the report correctly avoids claiming a literal one-file commit. Historical 155/155 versus152/155 F1 and wider-cone96failed/7incomplete findings are retained, not relabelled by these new passes.

## Exact ordering and observer fidelity

I checked `ordering-exact-results-summary.json`, its author-side review, raw diagnostic line hashes for all nine executions, and the actual production read implementation. `RaftRsDurableStore.readDurableRecordIn` applies statement-local `safeIntegers(true)` **before** `.get()`/`.all()` (source207–216), then `fromExactInteger` converts exact SQLite integers to decimal strings (source74). It does not stringify an already rounded Number or alter connection-wide settings. The companion113–122 invokes this SELECT-only production reader. The report's exactness statement is sound; the original rounded observer remains separately preserved.

All nine initial exact votes are `7818641245414824798`, matching a native voter. All three independent late/reference complete comparisons pass, and all nine requester restart exact records match their pre-restart records. The reported event order is consistent with raw observations. D1/D2 TimeoutNow/election and D3 uncommitted index6 are material consequences of their declared order; the report retains those differences. No native tick occurs in the measured interval; the declared zero-time dispatch and later actively driven convergence remain explicit. No power-loss or passive native-return proof is claimed. Listener reentry and delayed receipt-after-demotion remain outside these schedules. This is credible replacement evidence, not an enacted F1 contract amendment.

## Transfer consumer scope

The raw transfer diagnostics and final test bytes support the report's narrow claims. The actual REPLACE safety evaluator and dispatch composition records an accepted transfer attempt while the current witness keeps safety deferred, then returns SAFE after real target leadership. The intent is in-memory, and no source removal or durable terminal workflow completion is observed. The D2 test exercises actual placement-cure decisions and native handlers/ports; its cache projections and stabilization premise remain test-owned, not production CDC provenance. It moves from CENSUS_UNSTABLE through DISPATCH_HANDOFF to a subsequent SPREAD_SATISFIED observation; RF1 and no-known-leader refusals remain distinct.

The participant test demonstrates CLOSED across acceptance, then later real release reopening. It does not execute servedLegacy=true reopenCohort. The connection owner defaults **unstamped** history to servedLegacy=true, but its open hook stamps actual initialized connections clean; no current writer records true. The report correctly treats fabricating old history as inadmissible proof and leaves historical-cutover coverage open. None of these focused greens certifies full REPLACE removal, placement publication or all release admission paths.

## MG first failure and review qualification

The first failing assertion is `exact actual recipient proposal is retained`, 0 versus1 at test146. Raw diagnostics contain one source subscriber-entry event, no successful propagation return, no held recipient traffic, no recipient proposal beyond noop1, and no recipient application row. Source leader commit/applied5 contains the SQL row and a durable delivered=false obligation. Its lane is held_by_subscriber with retry armed and explicit flush EMPTY. The intended custody assertion, loss, suffix replacement and replay stages were never reached.

I checked the direct fixture INSERT at129–133, generator340–368, write builder243–249, and production insertData214–238/proposeWrite416–430. The hybrid fixture entry lacks structured data and owner-created timestamp. The generator only parses SQL/params for QUERY, explaining the observed event with only updated_at_hlc empty. The exact downstream exception was not retained, so the missing-primary-key throw remains source-consistent inference. The report correctly distinguishes this from an observed error stack or semantic custody RED.

My pre-run review approved executing these exact MG bytes after correcting the unsafe setup predicate and loss schedule; it did not catch this producer-entry composition defect. That is a test-fidelity miss, not evidence that downstream custody is safe or unsafe. Preserve this first failure and do not convert the unrealized suffix/replay assertions into measured coverage. The independent report honestly reports the gap, source-retention cut and unproved correlation questions, with no retry-until-green request.

## Ownership and stop boundary

Harness/transport/recovery claims are bounded to observed native events and durable facts; ACK is not application, retained source data is not an answered replay, and absent recipient proposals prove no successful custody handoff here. Concurrency and retry observations do not establish continuous-ingress service or general crash safety. Existing runtime/application/result owners retain their authority; no test projection is promoted to a second authority. Capacity, TX1, activation, provenance, discharge, snapshots and deadlines remain separate held dependencies.

The WASM same-input premature STRONG response remains the demonstrated inherited consumer defect, with healthy control and identical-byte predecessor attribution. The proposed later completion-owner packet is appropriately separate from a generic runtime wait or another drain-loop patch. Its identity/recovery details still require content-bound approval.

Archive, upload/download and final remote-head claims are deferred to their publication receipts; this reviewer did not download an archive or certify a not-yet-published evidence head. Shared ownership observations, lock receipts and commit/static qualifications are preserved as separate evidence, not inferred from these tests. Stop after the authorized non-force preservation publication with F1 supersession and full release HOLD intact.
