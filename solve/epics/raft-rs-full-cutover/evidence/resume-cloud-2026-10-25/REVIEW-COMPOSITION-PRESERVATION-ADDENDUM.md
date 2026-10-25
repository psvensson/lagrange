# Composition preservation addendum

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25. Read-only source review; no runtime or native acceptance executed.

**APPROVE these narrow composition/documentation differences at the bindings in `preservation-addendum-source-binding.json`.** The earlier R1 rejection and R2 source approval remain unchanged. This addendum extends source applicability only; official execution, static gates and exact-candidate final acceptance remain open.

## Independently verified source

| Surface | Binding/result |
| --- | --- |
| ADMIN R2 | All 129 frozen changed/deleted JavaScript files still match manifest SHA256 `f65d4035b2725b87e2a919ab9830b91da634f4e5fac4d6b3a79679ce5ee3f613`, on disk and in the staged index. |
| Native fixture repair | All seven JavaScript files exactly match approved incoming `a781064f8382eef7b6f016b52262513d8c87d978`, on disk and in the index. This carries the prior source review; it does not supply native test results. |
| Metric provenance repair | Eighteen of nineteen JavaScript files exactly match approved incoming `0e6923bb82fb83db3015b51e7f48ae1336d5f581`. The remaining file differs only by the two integration-history comment lines described below. All nineteen disk files match the index. |
| CDC documentation | `src/cache/cdc-table-policy.js` differs from integration base `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7` only in one JSDoc paragraph. Its reviewed SHA256 is `5d35cbbc9af28dacf72986dc00068da93dba72b40a486a1523599daaeaa891a3`. At inspection it was the only reviewed file not yet staged. |
| Coverage | The union of these bindings covers every changed JavaScript file under src/test/scripts relative to integration base; zero unbound paths were found. |

In `scripts/check-cognitive-complexity.js`, the incoming and composed files become byte-identical after removing exactly the two existing integration-history comment lines immediately before `const BASELINE_COUNT = 150`. The numeric baseline and every executable byte remain identical. No ratchet increase, changed measurement, additional reporting path or compatibility behavior is introduced. The exact difference is retained in `preservation-metric-comments.patch`.

The CDC JSDoc removes the stale statement that raw client UPDATE bypass remains until write admission lands. Its replacement describes the now-composed `sql-statement-ingress` refusal at engine and routed-partition admission for client INSERT/UPDATE/DELETE, while keeping the recording rule independent of stored policy JSON. That description agrees with the R2 source trace. Exact replacement of the old comment yields the current file; imports, guard implementation and runtime bytes are unchanged. The complete diff is `preservation-cdc-comments.patch`.

## Applicability and next step

The approved combined metric source still includes the corrected effective-home provenance and its reviewed actual-producer discriminator. The native fixture source remains the sole-envelope repair previously independently reviewed. The current ADMIN preservation adds no new semantic conflict to either unit. This does not claim their official suites have executed on the composition, or that source-byte identity alone proves runtime evidence reuse.

Stage the reviewed CDC comment bytes and retain this binding when creating the normal preservation commit. Regenerated inventories/receipts must come from their existing owners. The prior focused composition selection and separate canonical fresh-seed receipt remain applicable requirements; any source changes made by hooks or later conflict resolution require their ordinary applicability check. No additional test was run for the comment-only differences.
