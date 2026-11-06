# Bulk readiness domain: independent implementation review

Reviewer: `subagent:/root/independent_review`, 2026-11-06, rule-set revision 5. Base: `04459151a2813fe24e0cc99e2d3eda431f8902a7`.

**APPROVE the bounded WIP implementation content.** The three paths in `bulk-implementation-content.json`, SHA-256 `0a346fe6107fb774c27298fc419a5e45641ef1145dc909d12cb6ff814b9c5464`, match the inspected working bytes. This does not approve Quest closure, a full affected caller cone, E8/E9, publication or any of the separate planning-cost, self-runtime grace or cleanup-token repairs. Exact committed applicability and frozen proof remain required; the sealed receipt is still fail/four false.

The only production change removes the unconditional `service.nodeId` entry from `collectPublishedRequiredNodeIds` in `control-plane-readiness-service-node-methods.js`. The remaining shared collector still combines the existing published active IDs and explicit `requiredNodeIds` with node rows, service rows, current endpoint rows and retained readiness snapshots, deduplicates and sorts them. Both synchronous and asynchronous bulk readers use this collector. The authoritative async enumeration and its supplied bulk rows are unchanged. The sync cache/stored-snapshot checks and fresh `buildNodeReadinessSyncCurrent` fallback are unchanged. No new include-self mode, alternate authority reader, liveness grant, parser, timer or threshold was introduced.

The new test constructs a separate real readiness owner for each bulk entrypoint. With empty node/service evidence, an observer identifier alone yields an empty domain. The existing explicit required-node option then includes that same missing observer with `clusterMemberHealthy: false`; a later unqualified bulk read retains the resulting negative observation through the existing snapshot domain. This is a discriminating sequence: a filter that removed every unknown node would fail the required-node case, while preserving the old implicit append would fail the initial empty case. The test uses actual owner methods and shuts down its planning owner.

Existing tests are not weakened. The same file retains authoritative refresh/read-count assertions, authoritative-only node enumeration with no ordinary-cache fallback, retained/service-visible node handling after node-row deletion, current self-row behavior and the sync fresh-evaluation guarantee. The unchanged diagnostic file retains both bulk entrypoints' published and explicitly required missing-row population, with explicit unhealthy assertions for missing published/required nodes. Those cases distinguish complete negative reporting from merely reducing the number of entries. The new tests are added to the existing readiness contract/coupled witness list; no existing witness is removed.

Retained evidence inspected:

| Artifact | Result / applicability | SHA-256 |
| --- | --- | --- |
| `bulk-before.log` | Original one-file witness fails, 65 reported assertions. The failures expose the extra observer entry and additional authoritative reads; this is one failed file, not a claim of one failing assertion. | `61c083d30f01aea61e70cab10fe53eb4a874fcd7bcfe61aba60d1eea619cb7b5` |
| `bulk-domain-after.log` | Two focused files pass, 163 reported assertions: 74 bulk/snapshot plus 89 diagnostic assertions. | `a09a69e24c8bdb33cbfaa840177cda48b272b06e126d8a94500a692db016bae4` |
| `bulk-static.log` | Terminal all 33 audits pass; no baseline increase. | `166ffdb911d9e60c6cda2c239ab993813b2f5ac6b4d6dd553e83a0d8a031398e` |

The test evidence uses controlled row/authority boundaries. It is not a physical formation or full admin-constructor proof. Excluding an entirely unobserved, unrequested observer cannot establish the separate missing-both-rows runtime-grace contract. The previously traced formation planning rig already contains its observer in the node domain, so this one-line correction is not evidence that the extra 100 heavy builds are repaired. Those pending mechanisms remain explicitly separate, and the fresh-evaluation block implicated by the diagnostic remains intact.

No material correctness or scope gap was found in this bounded interaction. No tracked edits, tests, broad checks or lab jobs were performed by this reviewer. Review identities are retained in `independent-bulk-review-inputs.json`.
