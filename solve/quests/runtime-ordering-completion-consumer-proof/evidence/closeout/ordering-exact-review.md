# Exact ordering evidence review

Reviewer: subagent:/root/ordering_companion, also the author of the companion precision supplement. This is author-side evidence inspection/extraction, not the final independent content review. It is inspection/extraction of the existing first execution of changed exact-observation bytes, not an independent native rerun. No source or tests changed in this review.

Executed checkpoint: `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4`, locked host `adams-gamla`, exit0, three tests passed, zero failed/cancelled/skipped. Test SHA256 `3dfec10f6c37a2f5b0c58d8c937f1d8c43c695ec7d70a2df0dff3885546c9c54`; fixture SHA256 `ec6f9fa7c763552c958705206576f15dc793f6a6de896869a1b10ee3b2c51d20`. Runtime source remains frozen SHA256 `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f` as recorded by runner (consult request.json for the exact authoritative field).

Raw: `ordering-exact-first/01/raw.tap`, SHA256 `dfbd4df5701087bde076084f2376098435a15683396bc1d1573001a0b87bd182`.
Machine-readable extraction: `ordering-exact-results-summary.json`, SHA256 `60bdc025a9801e133085735289424330bc0631e61062cd5d06ddb3b71013b00a`.
The first limited pass at `6cddf137b85975947d09c0165eeb0e2f4c4bdcda` and `ordering-results-summary.json` remain unchanged, including their rounded-vote limitation.

## Exactness and observer contract

The added observations do not stringify a previously rounded Number. `src/raft/raft-rs-durable-store.js:207-216` calls `.safeIntegers(true)` on each SQLite statement before `.get()` / `.all()`. Hard-state term/vote/commit and entry indices/terms then pass through `fromExactInteger` at74, which returns `String(value)` from the exact integer. The only `Number` conversion in the returned entries is the entry-type enum. The companion at113-122 calls this production reader directly; it does not rederive persisted authority.

The initial exact vote is `7818641245414824798`, matching an exact ConfState voter. The retained original OracleRun vector carries the rounded Number `7818641245414825000`. Both are preserved and distinctly named. Every new hard-state term/vote/commit, applied index and log index/term in all nine runs is a decimal string. Complete exact records before and after requester reconstruction compare equal.

The reader performs SELECTs only. It calls no runtime operation, transport, tick, status or scheduler. Existing passive event hooks record native entry/arguments and the actual invocation Promise observer. Measured intervals have zero native tick calls. Each branch retains the declared one zero-time owned-clock dispatch after the selected caller Promise observer; post-measurement delivery/status/tick/restart are explicitly driving and do not prove autonomous runtime service. Native individual return has no direct observer and is not claimed.

## Observed event order

Each `event` value below is the actual local event ordinal; `core` is the actual native sequence, not inferred from answers. These identifiers are not compared across independent runtime instances.

| Case/order | Vote accepted event | Selected native operation | Caller Promise observer event | Vote native step |
| --- | ---: | --- | ---: | --- |
| D1 late |122|event154/core533 transfer step|173|event183/core542|
| D1 independent O-before-V |174|event150/core1684 transfer step|169|event183/core1693|
| D1 pre-capture |110|no native transfer step|173|event150/core2833|
| D2 late |122|event154/core3712 transfer step|173|event183/core3721|
| D2 independent O-before-V |174|event150/core4863 transfer step|169|event183/core4872|
| D2 pre-capture |110|no native transfer step|173|event150/core6012|
| D3 late |122|event150/core6889 propose|171|event181/core6898|
| D3 independent O-before-V |172|event146/core7799 propose|167|event181/core7808|
| D3 pre-capture |110|event170/core8718 refused propose|175|event150/core8709|

In late runs the selected request starts at event107, returns its Promise at117, waits at held-send event118, accepts the crafted vote at122, and releases the send at123. In pre-capture runs vote acceptance110 precedes selected request111. Full exact crafted message contents and native prefix provenance are retained in raw lines8/10/12 (D1),21/23/25 (D2),34/36/38 (D3). The vote is test-crafted, not core-emitted.

## Comparisons and consequences

For all three cases, independent initial state, prefix bytes and crafted vote bytes agree. Late arrival and separately constructed O-before-V reference agree on complete outbound packets, complete passive end state, complete returned vectors, and complete exact durable records. No terms, IDs, configurations, log positions or effects were normalized away. TAP diagnostic escaping is undone only to parse JSON; raw files remain unchanged.

D1/D2: late/reference return transfer-requested and emit actual TimeoutNow to C. The declared post-driving elects C at term2 and reaches commit/applied6 everywhere. Pre-capture returns respectively no-known-leader/not-leader without native transfer or TimeoutNow; fixed post-driving remains at commit/applied5 with A/B follower term2/no leader and C follower term1/naming A. Therefore the difference is an actual ordering/effect difference, not only receipt wording. All exact configurations remain the same voter set; restart retains exact persisted record.

D3: late/reference return drained after native proposal and retain entry6/term1. Declared later delivery replicates that entry to all replicas, but commit/applied remain5; the proposed application command does not apply. Pre-capture steps the vote before propose, returns the actual dropped-proposal refusal, and has no entry6. This establishes acceptance versus application distinction; it is neither SQL success nor a data-loss claim.

Verdict: ACCEPT these exact-source ordering observations within their declared projection. They support the proposed temporal replacement evidence, but do not enact F1 supersession, waive its frozen candidate failures, certify every consumer, or approve the runtime increment/release protocol. Listener reentry is disabled, the SQLite oracle fixture uses synchronous=OFF, and neither power-loss durability nor a complete future maintenance scheduler is proved.
