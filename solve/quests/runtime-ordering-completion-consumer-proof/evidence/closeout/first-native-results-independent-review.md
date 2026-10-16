# Independent review of first native results

Reviewer: subagent `/root/completion_consumers`. Read-only inspection of exact committed source/test identities, requests, summaries and raw TAP. No native tests were rerun by this reviewer. This report concerns the first checkpoint only; later exact-integer ordering, corrected transfer and MG results require a separate addendum.

## Identities and recorded execution

Candidate test checkpoint: `6cddf137b85975947d09c0165eeb0e2f4c4bdcda`, retaining frozen production source `4aa8780cfec6f2718b86b4d1e27ee9711492be59`.
Source-only predecessor treatment: `d2c7c600a09cfa371d54c5c9efda6e80438bbb98`.
The pair differs in exactly one production file, `src/raft/raft-rs-runtime-owner.js`, plus regenerated `solve/changes/global-owner-debt-inventory/inventory.json` and `test/shards/impact-graph-seal.json`. It is therefore not literally a one-file Git diff. WASM test and fixture Git blobs are identical across treatments: `32bc78324927187134ea2e2e59de63467dbebed9` and `c15b2ca4b10c7a27988d11ae2eae3c974690313b`.

| Evidence directory | Host | Tests pass/fail | Exit | Raw TAP SHA256 |
| --- | --- | --- | --- | --- |
| ordering-first | adams-gamla | 3/0 | 0 | 079dbc50d81786e9b772f9ba1088e1d50f77df7dfc6cea9935ec49cf9eb04272 |
| partition-first | adam-laptop | 2/0 | 0 | 8b56337683b40e54201451362c0fb76fea9c217cf3200270d28268d17f4075ad |
| wasm-candidate-first | lenovo-laptop | 1/1 | 1 | 05823694c5eca5824cfd04a33e9da339e938b26f8bb3374aeab986db8637cd7a |
| wasm-predecessor-first | lenovo-laptop | 1/1 | 1 | 70fcc1ed6870db67eceae6e001ded18bf6ed1b62b5a9c16cbce644ad3d823311 |

All recorded files have zero cancelled/skipped/todo tests and no unrun files. Request records specify retry 0. WASM comparisons use the same locked host, Node v22.23.2 path, wrapper, test and fixture bytes. These are focused same-host comparisons, not physical cross-host certification. Raw files are `<directory>/01/raw.tap`; request/summary files remain beside them.

## Ordering observations

The three companion cells preserve complete returned vectors before assertions. Their independent operation-before-vote-processing references agree with the candidate late-input vectors. Pre-capture input retains vote-before-operation behavior. Actual measured event ordinals below come from event records, not from answer inference. O means native selected-operation entry, V native vote processing, R caller Promise observer settlement.

| Cell | Candidate late input | Independent after-input reference | Pre-capture input |
| --- | --- | --- | --- |
| D1 named transfer | O154, R173, V183 | O150, R169, V183 | V150, R173; transfer refused before native transfer entry |
| D2 most-caught-up transfer | O154, R173, V183 | O150, R169, V183 | V150, R173; transfer refused before native transfer entry |
| D3 ordinary proposal | O150, R171, V181 | O146, R167, V181 | V150, O170, R175; native proposal dropped |

Late/reference transfer answers are CORE_OK transfer-requested; pre-capture D1 is no-known-leader and D2 not-leader. Late/reference D3 is CORE_OK drained; pre-capture D3 is CORE_REFUSED `propose: raft: proposal dropped`. Full vectors, rather than just these answers, are retained in the TAP.

These chosen schedules deliver the observed receipt before V processing. They do not prove the separate case where a historical receipt reaches the caller after a role transition. The higher-term vote is explicitly test-crafted. Reentry is disabled for this companion and is not an implicit replacement of the old F1 listener axis. The observation hook records native entry and caller settlement, not a separate native-return event. Setup/convergence/restart driving is outside the measured interval.

The original Oracle SQL vectors convert integer fields through Number; their rounded large vote identities limit exact-integer claims. A separately reviewed exact durable-record supplement exists for the next checkpoint; do not retrospectively credit this first run with those new bytes. The old F1 152/155 candidate regression remains unchanged and unwaived.

## Partition completion and custody

Both native controls passed through actual PartitionService owners. Before quorum, the real proposal is index 5, term 1; leader committed/applied position remains 4; caller is pending, exact outcome UNSETTLED, and application rows empty. Healing produces the committed/applied result at index 5. Same-identity replay returns the retained result and one application effect.

The second control shuts down the actual leader after possible proposal. The caller receives `partition_write_outcome_unknown`, reason shutdown, with original entry identity `runtime-consumer-unknown-custody`. The surviving real quorum subsequently applies the original entry. Same-identity replay reports index 5/term 1 and one row, without another log occurrence. This supports the existing partition consumer's acceptance/completion distinction on these schedules; it does not cover query routing, client ingress or full TX1.

## WASM premature strong-write response

Both exact source treatments fail the named `STRONG_WRITE_SUCCESS_BEFORE_COMMIT` assertion and pass the healthy control. Before healing, the actual STRONG write caller has already fulfilled `{accepted:true, async:false}`. Its exact proposal is durable at index 2, term 1, while all three replicas remain committed/applied at 1 with no KV value. Two actual non-reject follower APPEND_RESPONSE packets for index 2 remain withheld. Healing produces commit/application at 2 and `value-withheld` on all replicas. The healthy run reaches 2 with `value-healthy`.

This is a semantic premature-response failure against the documented strong-write completion contract, not a setup/import/timeout failure and not evidence of data loss. Both treatments execute identical test SHA256 `591dd4c77abedd4685cfcdcc563cf2bd04bdd578c73daf8ab8c14d256d14e45f` and fixture SHA256 `3a949083e132ac9eba399d82c1df90aba09bda321a959e04a3bdb41623feba34`.

I independently recursively compared all three JSON diagnostic cuts parsed directly from each raw TAP. There are exactly 165 unequal leaf fields, all native-event `/sequence` fields. No answer, message, durable position, KV, clock schedule or other leaf differs. The complete raw cuts remain unequal and preserved; no terms, configuration, positions or effects were normalized. These ordinal differences do not change the same-input experimental attribution: the premature response is inherited on this schedule, with no additional W07 behavioral difference observed here. This is not all-schedule equivalence.

The measured interval uses deliberate real-envelope delivery and fixed microtask turns, with zero clock advancement; durable/KV observations do not poll runtime status or rescue progress. Native internally owned status entries are not evidence of observer polling. This exercises actual WasmServiceReplica handle/write routing, not compiled guest execution or timer callback custody.

## Verdict and next boundary

ACCEPT the narrow ordering companion evidence and the two partition completion/custody controls. REJECT the WASM strong-write completion behavior demonstrated on both source treatments; correction belongs to the existing WASM application/result consumer, not a generic commit wait inside the serialized operation-port turn.

HOLD adoption of the proposed temporal F1 supersession and HOLD whole-increment readiness. The independent operation-order vectors support the proposed receipt interpretation but do not amend F1 themselves. Transfer consumer results, exact integer supplement and MG custody evidence are not part of these first results. The legacy participant cutover servedLegacy branch, full durable REPLACE removal workflow, placement publication provenance and delayed receipt-after-demotion schedules remain explicitly distinct limitations. An inherited consumer defect is not proof that finite capture is unsafe; equally, focused ordering greens are not consumer completion certification.

No new source correction or test weakening is approved by this report. The original F1/W07, historical seals, 96 failed / 7 incomplete wider-cone classifications and complete release HOLD boundary remain intact.
