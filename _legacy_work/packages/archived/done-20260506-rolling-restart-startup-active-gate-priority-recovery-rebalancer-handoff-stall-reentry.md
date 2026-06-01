# Rolling Restart Startup Active Gate Priority Recovery Rebalancer Handoff Stall Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z/rolling-restart/",
  "owner": "Startup active-gate priority-recovery rebalancer handoff stall and stale no-progress retention",
  "boundary": "Startup active-gate / priority-recovery rebalancer-handoff stall retention",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The retained terminal serial-wait carrier seam is closed. The representative rerun no longer exposes epoch-4 priority-recovery handoff debt: priority recovery is closure-satisfied under epoch 3 steady_published recovery, while the live blocker migrates earlier into startup join readiness. Two joiners remain stuck in INIT/contacting_seed with BOOTSTRAP_PHASE_INCOMPLETE, SQL_ENGINE_UNAVAILABLE, LEADER_METADATA_INCOMPLETE, BOOTSTRAP_NOT_READY, and PRIORITY_CONTROL_PLANE_RECOVERY_PENDING, and the selected stale-usable snapshot on node 11601... reports only 2/5 observed nodes.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md to separate seed-contact/runtime stall from stale selected-snapshot coverage debt and repair only the selected startup owner path.",
  "proof": [
    "Focused retained terminal serial-wait carrier regression",
    "Affected priority-recovery snapshot proof",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment](./done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Join Contacting Seed Bootstrap Readiness Reentry](./active-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md).

## Closure Summary

1. Added a focused regression proving tracked priority-recovery snapshots must
   keep terminal removed serial-wait carriers subordinate to the source
   workflow when retained coordinator state still advertises serial-wait
   ownership.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so retained operation-backed snapshots with empty blocker reasons but live
   serial-wait carrier metadata are rebuilt through the canonical synthetic
   serial-wait path instead of falling through to rebalancer handoff.
3. Focused snapshot proof, failure-bundle proof, and touched-file guardrails
   passed.
4. The representative rerun
   `rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z`
   closed the epoch-4 rebalancer-handoff seam and exposed an earlier startup
   join boundary around `contacting_seed` bootstrap readiness and stale
   selected-snapshot coverage.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z/rolling-restart/`.
3. Result: failed after `132.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification now reports root cause class `startup`, failure
   class `startup_recovery_blocked`, and dominant reason
   `BOOTSTRAP_PHASE_INCOMPLETE`.
6. Publication convergence reaches epoch `3`, status `PUBLISHED`, pending ACK
   count `0`, missing published count `0`, and recovery protocol state
   `steady_published`.
7. Current startup active-gate progress stalls at active `2/5`, snapshot
   coverage `2/5`, selected snapshot node `11601...`, and blocker signature
   `inactive_nodes=3|snapshot_coverage=2/5`.
8. Current canonical priority-recovery evidence no longer contains unresolved
   rebalancer-handoff debt. The retained witnesses now show:
   - `sql_transaction_participants-p1`:
     `spread_satisfied_in_flight` under
     `operation_workflow_owner / workflow_timeout`
   - `sql_transactions-p1`:
     `spread_satisfied_in_flight` under
     `operation_workflow_owner / workflow_progress`
9. Two joiners,
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`,
   remain stuck in bootstrap phase `INIT` with reasons
   `BOOTSTRAP_PHASE_INCOMPLETE`, `SQL_ENGINE_UNAVAILABLE`,
   `LEADER_METADATA_INCOMPLETE`, `BOOTSTRAP_NOT_READY`, and
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
10. The selected stale-usable snapshot on node `11601...` reports only two
    observed nodes, reason codes
    `cache_stale_watermark|discovery_node_coverage_gap|stale_replica_operations_in_flight`,
    and selected missing published nodes
    `11601...|35a891...|8be8...|ebc4...`.
11. Seed `7493...` also contributes a readiness-probe timeout fallback at the
    terminal barrier, but the new representative owner is earlier than the
    closed priority-recovery handoff seam.

## Residual Closure Inventory

- [x] Extract the `204812Z` current-versus-retained priority-recovery fixture.
- [x] Decide the owner boundary: rebalancer handoff, stale selected-snapshot
      retention, or startup transport/query pressure.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on startup join/contacting-seed blocker into a new
      active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, or runtime-grammar
      violation remains.
- [x] Follow-on runtime migration is split into the successor package above.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js`
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
5. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z.report.json --fast-local --verbose`
