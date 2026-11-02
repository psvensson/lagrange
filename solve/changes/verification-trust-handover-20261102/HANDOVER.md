# Verification trust: source recovery and certification handover (2026-11-02)

**Status:** durable coordination handover, not a new epic, acceptance authority, source patch, certification or release receipt.
**Owning release sequence:** 0.4.1 for bounded correctness, security and claim integrity; 0.5 for full public user journeys, measured comparisons and pilot acceptance. Preserve one ordered release train.
**Baseline verified at handover:** main e425ef93765d2b749706f18784249149d3b024b1.
**Instruction entrypoint:** [AGENTS.md](../../../AGENTS.md), then [rules.md](../../../docs/steering/rules.md) and [router.md](../../../docs/steering/router.md); consult the relevant owning documents. This handover is a snapshot/index only and never overrides them.

## 1. GitHub preservation inventory (observed on 2026-11-02)

| Surface | Remote ref and observed head | Meaning |
| --- | --- | --- |
| Verification-trust policy | [PR #180](https://github.com/psvensson/lagrange/pull/180), merged as e425ef93765d2b749706f18784249149d3b024b1 | Only R19 in docs/steering/rules.md and verification-trust section in test/guidelines/release-gate.md were updated. No executable negative-control gate was created by this merge. |
| Benchmark evidence/campaign | [work/benchmark-evidence-repair-20261101](https://github.com/psvensson/lagrange/tree/work/benchmark-evidence-repair-20261101), head d5eece77873660943bc40616b83d77b4d0554e89 | Large WIP candidate; do not flatten, replace or assume approved after later commits/merge. |
| Benchmark landing-labeled branch | [land/comparative-benchmark-evidence-repair-20261102](https://github.com/psvensson/lagrange/tree/land/comparative-benchmark-evidence-repair-20261102), head b9d33b1ba29e63fe78e8e061300740cf8bc31ef3 | Branch name is not a landing certificate. Compare its actual ancestry/content before selection. |
| Learner admission | [wip/learner-host-admission-20261101](https://github.com/psvensson/lagrange/tree/wip/learner-host-admission-20261101), head 2baedb0fec1b0a242978dfe9d4d02042ef738f80 | Preserved candidate for committed learner identity/host, not complete fresh-formation acceptance. |
| Formation reproducer | [wip/formation-serve-lane-repro-20261101](https://github.com/psvensson/lagrange/tree/wip/formation-serve-lane-repro-20261101), head 8068c765050853c2254df75524415fae6f37578d | Preserves a real red multi-host formation witness. |
| Earlier local source attempt | fix/verification-trust-20261102 | NOT confirmed on GitHub. Previous assistant reported local management/proof patches and a passing partial review, but neither remote source nor exact-current independent approval is available. Search the original local worktrees, branches, reflogs, stashes and commits before rebuilding. Never claim recovered work exists without inspecting bytes. |

In the WIP benchmark branch, solve/quests/comparative-benchmark-evidence-repair/evidence/receipt.json is still status=fail (eight false receipts). On the learner WIP branch, solve/quests/learner-host-from-committed-admission/evidence/receipt.json remains status=fail (five false receipts). The separate fresh-formation quest receipt is likewise fail. These are NOT excuses to overwrite the records or silently weaken sealed doneWhen. A 2026-11-02 benchmark review approved a bounded delta, but the later campaign/integration candidate must receive its own current evidence/approval; a lab cone also recorded a red test-placement test. Inspect complete records rather than relying on this summary.

## 2. Why this work exists

Distributed lab/GCP tests looked healthy while public-client workload execution failed. The benchmark pipeline could classify expired requests as completed, discard late participant errors, accept health responses instead of SQL work, count semantic proofs without observing them, and publish derived phase/quantile data as measurements. Source-checkout tests of internal convergence helpers and generous wait predicates were then mistaken for proofs of a deployed public data path. The product also had a separate cache/projection-authority failure: CDC-fed system-table views were consulted for serving, admission, routing and provisioning decisions, particularly in fresh 3-/4-node formation. The raft-rs cutover altered lag timing and exposed what tests had absorbed.

Previous diagnosis described thirteen decision consumers and a 750 ms cache-visibility budget, with a fresh 5-node formation only serving after approximately 2 minutes 41 seconds. Treat these as incident-specific observations and investigation targets, not a proven universal duration or an exhaustive census; verify against raw run artifacts and current source.

## 3. Source findings to triage, reproduce, repair

### A. Benchmark/test correctness (P0)

- [real-product-cluster-deployers.js](../../../test/distributed/harness/real-product-cluster-deployers.js): older main contained passed || 33 in semantic proof recording/parsing; DDL result checking and readiness polling could fail to establish the intended precondition yet continue. The WIP branch claims repairs; verify their exact deployed composition and mutation/red-on-revert tests.
- [real-product-workload-drivers.js](../../../test/distributed/harness/real-product-workload-drivers.js): older main fell back to /health when SQL/WebSocket was unavailable; completed counted returned functions rather than successful operations. Its reported fsync, WAN, reducer and 2PC phases included fixed/proportional figures instead of direct instrumentation.
- Scenario A semantics differed across products (a single UPDATE vs an order-inserting transaction). All arms must use one declared business transaction and independent final-state oracle through supported clients. Do not infer equal workload from matching labels.
- Old published benchmark pages and generated tables contained invalid positive numbers. Retain original raw observations and append-only invalidation/supersession records; regenerate claims offline only from admitted raw evidence. Verify the previously reported 262 invalid cells against the actual ledger, rather than copying the number as a fact.
- Per-host container identity must be inspected, not copied from the seed. A named version tag does not prove byte identity. Preserve real terminal response, request deadline, commit-unknown vs failed outcome, eventual reconciliation and every retry as separate facts.
- [scenario-c-rollup-comparator.js](../../../test/distributed/harness/scenario-c-rollup-comparator.js) invokes an in-memory rollup model. Its algorithmic proof cannot certify distributed zero-WAN, throughput, no-downtime or Raft-apply integration. Suppress unsupported Scenario B/C claims; do not invent a substitute implementation merely to satisfy a comparison.

### B. Management and backup/upgrade exposure (P0 security/claim safety)

- [bootstrap-api-server-methods.js](../../../src/bootstrap/bootstrap-api-server-methods.js) registers management facts/operations/status without the adjacent verifyControlPlaneAuth call. The existing fallback authentication logic also permits access when expected credentials are absent. Verify the real deployed exposure, then require an explicit authorized admin identity before any management operation/owner effects, including a missing-credentials negative.
- Its getManagementV1Owner() historically supplied getClusterId() || seedNodeId. No fabricated cluster identity when unavailable; preserve the genuine cluster identity across restore/restart and refuse when unestablished.
- [management-v1-owner.js](../../../src/bootstrap/owners/management-v1-owner.js) historically defaulted health/readiness/capacity and operation admission to success-shaped inputs absent real runtime snapshots.
- [backup-restore-owner.js](../../../src/bootstrap/owners/backup-restore-owner.js) historically defaulted to in-memory storage, synthetic partitions and capabilitySupported=true. [rolling-upgrade-owner.js](../../../src/bootstrap/owners/rolling-upgrade-owner.js) offered optional physical drain/restart callbacks. No real backup/upgrade/decommission operation may report supported or SUCCEEDED absent its actual installed adapters and durable effect proof.
- Scope for 0.4.1 is authenticated/refused/UNSUPPORTED when capability is absent, not implementing full backup/PITR or rolling upgrade. Complete those under their owning versioned milestones. Test public HTTP ingress, unauthorized before construction, restore identity, missing adapters and absence of any effect.

### C. Proof receipts and release gates (P0)

- [scripts/proof-authority.js](../../../scripts/proof-authority.js): buildReceipt() creates a PASSED-shaped receipt, and recordProof() checks commit/ref and producer information but does not itself receive a complete independently verified execution report. First enumerate *all* trusted proof producers, their exact input/output contracts, reused-identity rules and existing tests. A receipt must bind to validated exact-candidate evidence, not only an asserted producer claim. Do not break legitimate receipt paths or retroactively pretend old receipts prove stronger claims.
- Adversarially reject absent/partial report, wrong commit, wrong identity/digest, fabricated pass/zero assertions, skipped or truncated corpus, failed command, missing executable path and incomplete physical work when the claim requires it. Distinguish test-runner failure from product failure and unavailability.
- [scripts/run-test-files.js](../../../scripts/run-test-files.js) has existing TAP completeness/zero-assertion checks, and a retry-failed-once policy under which a file passing its retry can make the aggregate exit green while the original failure remains named. Verify that this *qualified* result cannot be laundered into a clean release claim without the sealed policy's authorization; preserve prior failure/retry records.
- [release workflow](../../../.github/workflows/release.yml) checks durable release-full-v1 proof. Repair the binding between validation and proof production; do not describe this as an absent release gate. Existing main ruleset protection does not by itself guarantee corpus proof before GitHub merge. Follow the existing publisher and post-merge whole-corpus policy where applicable.
- Calibrate the verifier on deliberately broken candidates, not just a mocked evaluator. Red-on-revert must fail at the behavioral assertion for the intended mechanism, not import/setup/missing-method noise.

### D. Committed-state serving authority (P1 product correctness)

- Reuse [learner WIP](https://github.com/psvensson/lagrange/tree/wip/learner-host-admission-20261101) and the existing raft-rs/formation Quests. Verify committed learner host identity recorded at Raft apply; proof and transport resolve committed membership, not CDC address hints. A known recorded before/after reproducer showed learner-address-unresolvable refusals eliminated, but that narrow repair does NOT certify the serve lane.
- Audit each safety/serving decision in the CDC-fed read-model registry, admission trigger, serve eligibility, provisioning cohort, peer/leader address, routing, publication leadership and rebalancer. A projection may request reevaluation but may not independently authorize a durable or safety-sensitive effect. A refusal needs an owned progress/re-drive path after facts become available.
- Specific candidates: [control-plane-publications-leadership.js](../../../src/control-plane/control-plane-publications-leadership.js) cached leadership fallback, [membership-publication-coordinator-reconcile.js](../../../src/control-plane/membership-publication-coordinator-reconcile.js) missing/throwing predicate fail-open, [read-model-contract.js](../../../src/control-plane/read-model-contract.js) cache authority assignments, and [sql-query-engine-provision-target-methods.js](../../../src/query/sql-query-engine-provision-target-methods.js) implicit replica-count fallback. Source presence is a candidate until the real caller and effect are proven.
- Reproduce fresh 3/4/5-node installed public PG-wire user journeys (CREATE, actual replica count and identity, INSERT, independent readback from every node, fault, then useful recovery), using real lab hosts before claiming distributed readiness. No change to timeout budgets merely to get green.

## 4. Ordered implementation and certification plan

1. **Preserve and map exact inputs first.** Read AGENTS, router, active 0.4.1 epics, sealed Quests and evidence. Inspect clean/dirty state, worktrees, local WIP, remote refs, recent candidate diffs, test budgets and reviewers. Record the first failed attempt, do not overwrite history.
2. **Complete immediately unsafe management boundaries.** In one bounded Quest or authorized fix, establish fail-closed admin authentication and no default synthetic capability/success. Run focused real-route tests, missing-identity and restore/restart tests. Obtain independent current-diff review; land and publish separately.
3. **Fix proof admission at its existing producer boundary.** Caller census before edits; define exact report identity and acceptable evidence; test falsifiers; preserve lawful reuse. Independent review and exact-candidate test suite; land and publish separately.
4. **Finish benchmark candidate integration, not a rewrite.** Reconcile current main with work/benchmark-evidence-repair-20261101 and its logs; test deterministic known-bad controls, same-workload semantics, per-host identity, real-product smoke for Lagrange/TiDB/PostgreSQL, offline recomputation and valid/invalid claim rendering. Preserve both red and successful observations. Do not rerun unchanged broad lab runs to fish for a pass. Land only when its sealed receipt and current review pass.
5. **Finish learner admission and follow-on serve/provisioning authority in causal order.** Preserve the narrow learner Quest's own doneWhen. The broader formation Quest remains red until usable user-data journeys pass. Audit all remaining authority consumers; do not merely patch timers or add a fallback.
6. **Reconcile published capability/benchmark claims and release evidence.** Suppress unsupported numeric or availability claims; keep 0.4.1 bounded repairs separate from the 0.5 full measurement/pilot claims. Follow original exact-source lab/GCP evidence requirements for any claimed comparison.

**Completion of a bounded repair is not overall release certification.** Each source unit requires named first divergence, red-on-revert/fault control, focused real-owner tests, affected consumer checks, independent reviewer approval newer than the last code attempt, a sealed probe/receipt and exact-candidate publication. Document-only planning and policy changes run relevant documentation checks, not full system tests. For GitHub merges bypassing the local publisher, run the existing post-merge corpus proof when the runbook requires it.

## 5. Local agent's first commands and operating rules

Use the existing checkout and preserve dirty state. Inspect before any reset, rebase or cherry-pick:

    cd /path/to/lagrange
    git status --short --branch
    git worktree list
    git branch --all --list '*verification*' '*benchmark*' '*learner*' '*formation*'
    git stash list
    git reflog --all -n 30
    git fetch origin
    git rev-parse origin/main
    npm run commands
    node scripts/solve.js board

Then read this handover plus the linked owners; compare candidates against the real current main head. If the earlier local fix/verification-trust-20261102 checkout exists, inspect its diff/status and recover *only* scoped, reviewed changes. If not, reproduce and reimplement; do not claim it is recoverable from GitHub. The source branches from the inventory must remain intact until a reviewed integration supersedes them.

Normal repository workflow: start/continue a bounded Quest, note the attempt and evidence, run its read-only probe, obtain independent verification, land under the Solver, publish exact committed HEAD using existing policy. Never use --no-verify, weaker doneWhen, a synthetic success receipt, a silent ignore/error catch, a competing runtime path, or a direct merge to mask a red gate. The current release train allows independently bounded implementation but one writer per owner interaction and one integration owner.

If the test runner lacks lab access, credentials or a dependency, preserve exact failure and hand over the concrete run invocation/blocker. Do not assert successful physical certification. A real product defect correctly measured by the apparatus is PRODUCT_FAIL, not HARNESS_INVALID. A missing verifier observation is invalid/unmeasured, never pass.

## 6. Final deliverables and reporting contract

Report each unit as implemented / locally tested / independently verified / Quest landed / pushed / merged / post-merge certified, never as a single ambiguous green state. Provide PR URL, exact reviewed source SHA, test command/result, retained negative-control artifact, merge SHA and any applicable corpus/lab/GCP proof receipt. Keep a durable next owner and action for every red or unavailable item.

The immediate goal is to make 0.4.1 incapable of publishing invented success and to prevent unauthorized or synthetic management effects. The longer-term goal is a functioning public-path distributed product; no green harness receipt substitutes for it.

## 7. Links to source authorities

- [Existing testing release policy](../../../test/guidelines/release-gate.md)
- [Harness fidelity verification template](../../../docs/development/verification-templates/harness-fidelity.md)
- [Distributed operational ground truth](../../../test/distributed/operational-ground-truth.md)
- [Authority and recovery contract](../../../architecture/contracts/authority-and-recovery.md)
- [Solver runbook](../../../docs/development/solver-runbook.md)
- [Comparison epic](../../epics/developer-journey-and-measured-comparisons.md)
- [Apparatus/proof epic](../../epics/apparatus-release-consolidation.md)
- [Raft-rs epic](../../epics/raft-rs-full-cutover.md)
- [Topology convergence epic](../../epics/topology-convergence-hardening.md)
- [0.4.1 and 0.5 roadmap](../../../roadmap.md)

This snapshot can be superseded by a new dated handover with verified source refs. Do not edit sealed historical Quest logs or turn this index into a competing active-work ledger.
