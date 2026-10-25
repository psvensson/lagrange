# Committed composition — independent applicability addendum

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25.

**The existing bounded source approvals still apply to the preserved composition.**

- Normally committed local source: `f30060e714d080ba438f5657b8d15f4bb992b107`.
- Published preservation commit: `13cdfe4ef1b620037c0c5f326dd6ff0193f0a70d`.
- Exact common Git tree: `5659709d5010bdfa26a3dc545ef948772d8daa51`.
- Parent: `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`.

Independently rehashed every one of the 156 JavaScript paths in the prior preservation addendum against the actual local committed blobs, including required absence for deleted paths. Every path matches the approved bytes. A fresh name-only comparison of the committed source with the parent has zero changed JavaScript paths outside that binding. Current working copies of those paths also match.

Independently read the remote Git commit object through GitHub's read API. Its tree and parent exactly match the local committed tree and parent; the different commit IDs reflect commit metadata rather than different source. This establishes applicability to the remote preserved source without rerunning or broadening source review.

The original ADMIN R1 finding and corrected R2 verdict, metric applicability, native fixture review, and narrow comment-only preservation addendum remain separate retained records. This addendum does not alter any runtime result or acceptance limit. No runtime suite, analyzer, normal hook, canonical startup controller, main merge or release was executed by this reviewer for this check.

The integration working tree had subsequent epic/evidence documentation additions at inspection; none changes a reviewed JavaScript path or the fixed committed tree named above. Detailed hashes and the remote object observation are in `committed-composition-applicability.json`.
