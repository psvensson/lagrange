# Set B: source-guided preparation for the remaining bracket

Prepared by `subagent:/root`, 2026-10-18. **Read-only source census; no new
execution or endpoint classification.** The measured bracket is still
`9ff61abda9d28dd58b60f71f3890e4fdd5a2845d` GOOD (#191) through
`9b53962f2e7b8402b2a6a02a4a24b45985cd3563` BAD (#192), 35 first-parent
commits. The full #192 first failure must still be retrieved through the
deployed controller before assigning a failure owner.

The accompanying `setB-source-census-20261018.json` records every commit and
changed path, all exact boundary source trees, and the unchanged target/runner
blob identities. The three existing Set B files, package manifest, lockfile,
classified runner and file runner are byte-identical throughout the bracket.
Only two commits in that first-parent interval change production source:

| Boundary | Immediate parent | Production change |
| --- | --- | --- |
| `4aa8780cfec6f2718b86b4d1e27ee9711492be59` | `04391697aeabea5ddd504491321546212b95982e` | Finite inbound runtime capture after execution admission in `raft-rs-runtime-owner.js`. |
| `9b53962f2e7b8402b2a6a02a4a24b45985cd3563` | `26cded6cb74594b8d38bce24e6a862302b605e23` | V1 WASM writer freeze, completion/state/profile and application handling across twelve WASM source paths. |

The source tree at the retained unsubmitted midpoint
`c425ef42e18236ff1187e1112a971588bb02b496` equals the measured GOOD tree
(`7861f8f1473df92ec5e347cd19a087f84e8543fe`). The source tree between the
runtime change and the writer change is
`f19cf60b1bfd2dce2f813c6017af6cc8b249bb0d`. The measured BAD source tree is
`f1f36764125e0cf1fd596b083c492376905ec138`.

This is not an equivalence proof for the whole experiment: classification and
seal inputs, other tests, a fixture helper, a standalone model script and
workflows also changed in the interval. A preparation failure, missing native
prerequisite, different target selection, timeout, or changed failure signature
must not become BAD automatically. Source equality is no substitute for a
valid GOOD endpoint.

## Next measurement recommendation

Once the controller is available and the earlier submission uncertainty is
reconciled under its serialization rules, the lead recommends the exact
immediate parent of the writer change,
`26cded6cb74594b8d38bce24e6a862302b605e23`, as the next source-guided
three-file measurement. This changes only which as-yet-unsubmitted point is
measured next; no measured bracket or historical next-midpoint record is
rewritten. A classified matching GOOD there would put the known BAD at its
immediate child. A matching BAD would direct the next checks toward the
runtime boundary and its parent, with ordinary sequential bracket updates.

Use the identical three Set B target files and the deployed locked Node22
profile. Preserve immutable request identity, source/ref, actual planned and
executed file counts, complete log digest and first failing assertion. If the
first failure changes, classify the signatures separately before narrowing.
Do not reuse the old bisection shell helper's force-push, no-not-ok-is-good,
or SKIP-as-BAD behavior. This recommendation submits no lab request.
