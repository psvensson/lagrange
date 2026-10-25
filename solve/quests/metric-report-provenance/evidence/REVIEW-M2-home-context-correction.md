# Independent M2 correction review

**Verdict: APPROVE the bounded M2 correction at the source hashes below.** No additional defect or required improvement was found in this two-file correction.

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25.

Candidate working tree: `/workspace/scratch/285a938494ce/metric-home-repair`, branch `work/cloud-metric-home-context-20261025`, based on `5485381b70d7c963f30e1468c5e8ca17d156f569`. There was no new commit at review time. Approval can be bound to a later normal commit only if these source bytes remain exact:

| Path | SHA256 |
| --- | --- |
| `scripts/metric-report-inputs.js` | `ff23a957d07acb6d960fa866210c69b20f06c5b20ac81f5b58e50305eb817080` |
| `test/scripts/metric-cycle-resolution.test.js` | `a03a97773f407075aab534c899b3fc2e6299070cb930ab283ec965a4cde7042c` |

`m2-correction-before.json` and `m2-correction-after.json` independently confirm that the two hashes were unchanged throughout review. No author source or test file was edited by the reviewer. The preceding rejection of exact `5485381` remains preserved in `REVIEW-5485381-home-context.md` and its original experiment artifacts.

## Correction and causal scope

The shared `captureMetricInputs` owner now records `homeDirectory: homedir()` from `node:os` in runtime provenance. This binds the effective home-directory input that the actual installed resolver uses. It handles the platform's own home selection rather than substituting raw Linux HOME as a cross-platform semantic value. Old reports lack the new input member and fail the existing exact input comparison, so no schema compatibility fallback or forced-refresh exception is needed.

The correction does not add a resolver, alter analyzer traversal, change a metric threshold, weaken a gate, or make cache freshness a caller-local decision. Existing observed-path facts still validate content, absence, kind and realpath changes; the new value supplies the previously missing context that chooses the search paths.

The permanent regression exercises real canonical producer and shared-reader paths in child processes. It checks initial zero-cycle measurement, unchanged-context reuse, changed-context rejection, readback byte/inode preservation, actual one-cycle measurement under the alternate context, new-context reuse, reverse-context rejection, and invariant file contents. Both home directories and both alternate dependencies exist before measurement. The fixture does not patch the resolver or report owner and cannot pass from an unresolved target alone because the second producer must produce the real cycle and ratchet exit 1.

## Cached resolver initialization

I specifically checked the effective-home versus cached-resolver question in the supported dedicated producer path.

`check-circular-dependencies.js` first loads local provenance/adapter modules and Node built-ins. Before `beginMetricMeasurement`, the input owner does filesystem hashing and uses `createRequire` for resolution paths; it does not execute the installed analyzer. The actual `resolve` module is loaded later by `installResolutionObserver`, within `analyzeMetricCycles`. The producer path contains no write to HOME, USERPROFILE, or another home selector between capture and analyzer initialization. Beginning and finishing measurement both capture the effective home. Under the declared quiescent-input, one-measurement-process contract, the sealed home and the resolver's captured home therefore agree.

An arbitrary preload or hostile in-process component that loads a resolver and then mutates and restores process state is outside the existing stated contract. No reachable repository path requiring that wider claim was found, and no additional framework or defense is requested for it.

## Independent measured verification

The reviewer used a separate external script against the exact author working bytes:

```sh
node metric-review-evidence/metric-home-context-correction-review.mjs /workspace/scratch/285a938494ce/metric-review-evidence/home-context-correction-r1
```

This is the same tiny static-analyzer investigation as the original negative, extended with independent reuse, reverse-context, and report-identity checks. It does not run Lagrange, a native test, a distributed scenario, or a broad repository analysis.

**All twelve checks passed:**

| Check | Result |
| --- | --- |
| Initial canonical producer measures zero cycles, exit 0 | PASS |
| Repeated unchanged-context reads reuse that report | PASS |
| Sealed home equals the child's effective home | PASS |
| Changed home rejects the previous seal | PASS |
| Reader leaves report bytes and inode unchanged | PASS |
| Actual second-context producer measures one cycle, exit 1 | PASS |
| Second context reuses its new report | PASS |
| Returning to the first context rejects the second report | PASS |
| Source and dependency bytes remain unchanged | PASS |
| The two contexts now have different input seals | PASS |
| First manifest includes the actual first-home content read | PASS |
| Second manifest includes the actual second-home content read | PASS |

`home-context-correction-r1/result.json` contains the complete outcomes and source binding. Adjacent files preserve both sealed reports and all seven child command/context/stdout/stderr/status records. Both producers and all readers completed normally; every signal value is null. Only this experiment's two allocated fixture roots were removed after synchronous child completion. No owned process or pending cleanup remains.

## Checklist and evidence applicability

The M2 failure items in the prior owner/admission checklist now pass for this cause: the shared reader rejects a changed semantic resolution context, canonical measurement restores useful current evidence, and unchanged-context reuse remains available. The actual paired witness measures freshness and reuse in one experiment. It also preserves the unchanged producer's zero-cycle ratchet behavior.

The test-fidelity questions pass by actual producer/reader engagement, observed dependency reads, invariant source bytes, nonzero fresh cycle, exact source binding, and separately preserved prior negative. There are no new retries, waiting budgets, resource owners, transport states or distributed effects to review. Static source inspection confirms the correction leaves the original adapter and its cleanup/refusal paths unchanged.

This review approves the **bounded correction**; it does not relabel the author's earlier 7-file/186-assertion result as an independent rerun, certify the whole integration, close the Quest, or establish publication/release acceptance. The new committed regression and any affected applicable gates remain with the existing lab/verification owner. Reuse earlier evidence where its existing provenance owner establishes applicability; this review does not impose an unrelated broad rerun or additional approval stage.
