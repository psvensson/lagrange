# Single-pass publication evidence

Proposal on rule-set revision 5 and source
`566d87b3be615344bbc5548d818e3b01578cc698`. The independent four-cut composition
review applies to that source only. This Quest is unsealed; no receipt is
invented to make its absent evidence measure red.

## Existing interaction and correction

The ordinary entry points remain Solver land, the pre-push hook, the exact-HEAD
publisher and the existing CI gate. Their execution owner is
`scripts/run-test-files.js`; classified placement consumes its verdict stream
through `scripts/lab/probe.js`. Structured runner sections flow through
`scripts/test-execution-report.js` to `scripts/proof-authority.js`. The latter's
`corpus-full-v1` and `release-full-v1` contracts already refuse retries.

One scheduled file executes once. Its first failure, zero-assertion outcome or
missing result remains unsuccessful even if a later line is green. Initial
placement may distribute a plan, but an assigned shard is never rerun on another
host or controller. Missing source, base, discovery, capacity or completed
execution is explicit unavailability. Retained stderr and stdout describe the
original host; they cannot manufacture a completed file or native receipt.

Remove the runner's retry branch, placement's retry-marker promotion and
reassignment, and all current producer knobs in pre-push, detached corpus,
Solver land and workflows. Keep per-file/lane bounds and host lock, thermal,
process-group cleanup and cancellation obligations. CI must resolve its actual
base, including an explicit manual-dispatch base, and refuse an absent or
unreachable base instead of substituting `HEAD^`. No hosted/lab route is changed
without established trusted execution capability.

The publisher keeps every exact-head corpus record and original diagnostics.
Another publish does not cancel an older immutable source's running proof.
An existing same-head record or partial evidence blocks automatic restart;
reporting never prunes old evidence. A repaired source SHA owns a fresh attempt.
Separate explicit diagnostic measurements remain separate evidence. Repeated
gate failures retain distinct diagnostic directories at the same existing
owner, preserving the original bytes.

## Complete transition

1. **Trigger and producer:** an ordinary check, land or publish supplies the
   existing runner's file list and source identity. The publisher's exact gate
   still uses the pushed head and actual remote base.
2. **Authoritative facts:** exact SHA/tree and clean checkout, canonical scope,
   original child exits, positive assertions, complete runner sections and
   the strict registered proof contract. A later pass supplies no authority
   over an earlier failure.
3. **Shape and identity:** retain the existing runner verdict grammar and
   `lagrange-test-execution-report/v1` history. Remove the unused qualified
   acceptance branch while continuing to reject historical retry evidence.
4. **Ordering:** assign once; retain start before execution and end after
   settlement; aggregate the worst observed file outcome independent of order.
5. **Unavailable versus absent:** a missing source/base/host/result cannot
   invoke a quieter local execution or become green. A malformed retained
   corpus record is an explicit evidence error, not permission to overwrite it.
6. **Durable points:** the existing original artifact/state write retains
   evidence; only validated native proof recording can create its immutable
   proof ref. A mailbox completion is neither point.
7. **Obligations:** an older corpus process retains its own source obligation;
   a newer publication neither cancels it nor claims its proof. Incomplete
   execution remains owed, with its original record and owning integration
   action visible.
8. **Cleanup:** keep existing bounded child/remote process cleanup and host
   locks. Remove automatic supersession and evidence deletion, not cleanup of
   resources actually owned by an ended run.

## Historical and external precedent

`3827c9d3f5d34313663f09a9763eabc833bff804` corrected a verifier-rejected proof
aggregation attempt: later clean results had erased retry and zero-assertion
evidence. Reuse its worst-verdict policy throughout this interaction. The
sealed `land-retry-parity` and `local-corpus-canary` Quests proved older active
semantics. The user's current no-fallback direction supersedes those semantics;
their records remain unchanged and do not claim this new behavior.

[Bazel's test-run policy](https://bazel.build/docs/user-manual#flaky_test_attempts)
distinguishes eventual flaky success from a clean pass; that distinction
supports retaining attempt evidence. Its permissive flaky acceptance is not
adopted: Lagrange's registered proof contracts remain stricter.
[GitHub's runner guidance](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
and [token scope](https://docs.github.com/en/actions/concepts/security/github_token)
support keeping a trusted private executor and cross-repository delivery
authority explicit. They do not establish an installed capability here.

## Proof preparation and ceiling

The original-compatible root is
`test/scripts/publication-single-pass.test.js`, using the existing placement
fixture and production assignment/settlement methods plus a real CLI child.
Freeze its exact bytes and the fixture with unchanged source first. Its
fail-once child, failed/partial host streams, unavailability and evidence-custody
controls must fail through the named causal assertions on the original.

After independent candidate review, the sole coordinator runs those same
controls and the existing runner, placement/split/discovery, local-corpus,
publisher/workspace-link, Solver land, acceptance-summary and native-proof
regressions on the immutable candidate. Complete native-proof falsifiers retain
wrong-head, missing-root, skipped/zero-assertion, truncated, failed-command,
retry and disallowed-reuse rejection. Positive clean execution must still work.
The canonical selector owes the whole corpus for these runner/hook/placement
changes; its triggers and acceptance thresholds are unchanged. Regenerate
combined metadata on the lab and prove the final exact candidate.

The installed lab contract permits arbitrary source commands but does not
establish repository-write credentials, native artifact export/proof custody
or a GitHub check bridge. Those remain delivery capability findings. This
repair neither creates a new publisher nor supplies formation/schema-admission
or release acceptance.
