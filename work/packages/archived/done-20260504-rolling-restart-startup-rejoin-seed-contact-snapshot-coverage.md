# Rolling Restart Startup Rejoin Seed Contact Snapshot Coverage

Opened on May 4, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Operation Progress Reentry](./done-20260504-rolling-restart-startup-active-gate-snapshot-coverage-operation-progress-reentry.md)
closed stale publication-membership presentation and the representative path
migrated to startup reachability.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-active-gate-membership-reentry-20260504-codex.report.json`
2. Regenerated failure bundle:
   `test-output/reports/.playback/rolling-restart-active-gate-membership-reentry-20260504-codex/rolling-restart/failure-bundle.json`
3. Result: failed, `0/1` passed after `130.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure class after classifier regeneration: `startup_recovery_blocked`.
6. Root cause class: `startup`.
7. Dominant reason: `BOOTSTRAP_PHASE_INCOMPLETE`.
8. Publication status: `PUBLISHED`.
9. Pending ACK count: `0`.
10. Missing published count: `0`.
11. Active-gate progress: active `3/5`, inactive `2/5`, snapshot coverage
    `2/5`.
12. Active-gate blockers: `inactive_nodes=2` and `snapshot_coverage=2/5`.
13. Terminal raw message reports node
    `8be8d30f-4499-5eed-865c-71b4d529a67a` retrying seed contact after
    `Failed to contact seed node: Request timeout after 30000ms`.
14. Terminal raw message reports node
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` inactive with admin probe
    `ECONNREFUSED` on port `8081`.
15. Priority recovery invariants passed and publication convergence is ready.
16. Closure rerun:
    `test-output/reports/rolling-restart-startup-seed-contact-owner-20260504-codex.report.json`.
17. Closure rerun result: failed, `0/1` passed after `132.7s`.
18. Closure rerun failure bundle:
    `test-output/reports/.playback/rolling-restart-startup-seed-contact-owner-20260504-codex/rolling-restart/failure-bundle.json`.
19. Closure rerun failure class: `topology_unstable`.
20. Closure rerun dominant reason:
    `priority_recovery_actuation_state_action_required`.
21. Closure rerun startup decisions are current `fresh_join` decisions for
    both restarted nodes, with stale pre-decision seed-contact failures
    filtered out.
22. Closure rerun publication convergence remains closed at top level:
    publication pending `false`, pending ACK `0`, missing published `0`.
23. Closure rerun active-gate blockers migrated to `inactive_nodes=2`,
    `snapshot_coverage=2/5`, and
    `priority_recovery_progress_class=eligible_but_no_operation_created`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Determine why the rolling-restart startup path still has two inactive nodes
   after publication convergence closes.
2. Trace durable rejoin seed-contact progress for
   `8be8d30f-4499-5eed-865c-71b4d529a67a` under startup pressure.
3. Trace admin reachability for
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` without treating bootstrap health
   as strict admin readiness.
4. Preserve the closed publication-membership presentation from the previous
   package while identifying the startup owner that now blocks active-gate
   snapshot coverage.

## Out Of Scope

1. Post-active over-target trim until the representative path reaches that
   boundary again.
2. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
3. Harness-only timeout increases or readiness exemptions.
4. Pro or Enterprise behavior.

## Progress Grammar

1. `publication_closed` means publication is `PUBLISHED`, pending ACK count is
   `0`, and missing published count is `0`.
2. `seed_contact_retrying` means a joining or rejoining node is alive but
   cannot complete seed contact within the startup active-gate window.
3. `admin_probe_refused` means bootstrap health may answer, but strict admin
   readiness on port `8081` is not reachable.
4. `snapshot_coverage_open` means the selected active-gate snapshot covers
   fewer than all expected nodes after publication closure.
5. `closed_or_migrated` means the representative path either reaches ACTIVE
   startup convergence or moves to one newly named non-startup owner boundary.

## Residual Closure Inventory

- [x] Direct owner path for seed-contact retry and durable rejoin startup
      authority identified.
- [x] Direct owner path for admin reachability refusal identified.
- [x] Active-gate snapshot coverage continues to report publication closure
      without restoring missing-published debt.
- [x] Failure bundle and triage surfaces report the next owner without
      reclassifying closed publication as publication convergence.
- [x] Focused owner or playback fixture added before runtime changes.
- [x] Representative `rolling-restart --fast-local` rerun recorded after the
      focused proof.

Direct owner path notes:

1. Seed-contact retry owner:
   `src/bootstrap/phases/contact-seed-phase.js` and
   `src/bootstrap/node-joining-service-segment-2.js`.
2. Startup decision surface:
   `src/constants/entrypoint.js` and
   `src/bootstrap/rejoin-hints-constants.js`.
3. The admin refusal was a symptom of startup/active-gate reachability, not
   the final owner after the rerun.
4. The migrated owner is priority recovery actuation for
   `eligible_but_no_operation_created` under active-gate snapshot coverage.

## Static Drift Ledger

Preflight:

- [x] Select file-scoped guardrails after identifying the seed-contact or
      admin-reachability owner files.
  - `node --check test/distributed/harness/failure-bundle-segment-1.js`:
    pass.
  - `node --check test/distributed/harness/failure-bundle-segment-5.js`:
    pass.
  - `node --check test/distributed/harness/failure-bundle-segment-6.js`:
    pass.
  - `node --check test/distributed/harness/publication-evidence-contract.js`:
    pass.
  - `node --check test/distributed/harness/__tests__/failure-bundle.test.js`:
    pass.
  - Literal guardrail touched-file baseline:
    `434` inherited file-scoped findings after initial constant extraction.
  - Decision-boundary touched-file baseline:
    `3` inherited findings in `resolveReadinessFailureGuidance`,
    `resolveFailureClassificationGuidance`, and
    `buildFailureClassification`.
  - Runtime grammar touched-file baseline: `0`.

Closure:

- [x] Same guardrails rerun after implementation.
  - `node --check test/distributed/harness/failure-bundle-segment-1.js`:
    pass.
  - `node --check test/distributed/harness/failure-bundle-segment-5.js`:
    pass.
  - `node --check test/distributed/harness/failure-bundle-segment-6.js`:
    pass.
  - `node --check test/distributed/harness/publication-evidence-contract.js`:
    pass.
  - `node --check test/distributed/harness/__tests__/failure-bundle.test.js`:
    pass.
  - `node --test test/distributed/harness/__tests__/failure-bundle.test.js`:
    `70` passed.
  - `node scripts/check-guideline-literals.js
    test/distributed/harness/failure-bundle-segment-1.js
    test/distributed/harness/failure-bundle-segment-5.js
    test/distributed/harness/failure-bundle-segment-6.js
    test/distributed/harness/publication-evidence-contract.js
    test/distributed/harness/__tests__/failure-bundle.test.js`:
    `429` inherited file-scoped findings.
  - `node scripts/check-guideline-decision-boundaries.js
    test/distributed/harness/failure-bundle-segment-1.js
    test/distributed/harness/failure-bundle-segment-5.js
    test/distributed/harness/publication-evidence-contract.js`:
    `3` inherited findings.
  - `node scripts/check-runtime-grammar-contracts.js
    test/distributed/harness/failure-bundle-segment-1.js
    test/distributed/harness/failure-bundle-segment-5.js
    test/distributed/harness/failure-bundle-segment-6.js
    test/distributed/harness/publication-evidence-contract.js`: `0`.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation was introduced.
- [x] Any inherited out-of-scope violation has a linked follow-on package or
      recorded exclusion.

Inherited decision-boundary findings remain outside this package:
`resolveReadinessFailureGuidance`, `resolveFailureClassificationGuidance`, and
`buildFailureClassification`. Literal findings are inherited touched-file debt
in split harness segments; the package reduced the touched-file count from the
recorded `434` preflight to `429`.

## Implementation Tasks

- [x] Inspect playback logs and snapshots for both inactive nodes and identify
      the first owner decision that stopped startup progress.
- [x] Add the smallest fixture for the selected seed-contact or admin
      reachability owner boundary.
- [x] Fix the owner path or split a sharper package if the two inactive nodes
      have different owners.
- [x] Rerun focused tests, static guardrails, and the representative scenario.

## Validation

1. Focused startup seed-contact or admin-reachability owner test.
   - `keeps final explicit-seed startup decision and seed-contact retry
     evidence`: passed.
   - `ignores stale seed-contact retry artifacts before the current startup
     decision`: passed.
2. Focused failure-bundle playback test if the owner surface changes
   diagnostics.
   - `classifies startup playback active-gate no-progress witness as CL-006
     and preserves admission state`: passed.
   - `classifies startup playback active-gate timeout witness with explicit
     readiness delay metadata`: passed.
3. Static guardrails for touched files.
   - Recorded in the static drift ledger.
4. One representative `rolling-restart --fast-local` rerun.
   - `node test/distributed/run.js --config test/distributed/config/local.json
     --scenario rolling-restart --fast-local --output
     test-output/reports/rolling-restart-startup-seed-contact-owner-20260504-codex.report.json
     --verbose`: failed after `132.7s`, migrated to
     `priority_recovery_actuation_state_action_required`.

## Done When

1. Startup active-gate snapshot coverage no longer stalls on unnamed inactive
   node reachability after publication closure.
2. The representative path either reaches ACTIVE startup convergence or
   migrates to one newly named owner boundary with this startup reachability
   blocker closed.

Done on May 4, 2026 by migration. The startup seed-contact owner is now named
and filtered from stale reused logs; the representative path moved to priority
recovery actuation under topology, tracked by the follow-on package.
