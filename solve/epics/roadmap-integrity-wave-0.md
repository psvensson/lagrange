---
id: roadmap-integrity-wave-0
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests:
  - aggregate-duplication-analyzer-runtime-consolidation
  - cli-static-guideline-ratchet-closure-v2
  - cli-static-guideline-ratchet-closure
  - cognitive-complexity-ratchet-closure
  - complexity-ratchet-closure-wave1-v2
  - complexity-ratchet-closure-wave1
  - global-owner-debt-inventory-command-index-projection-refresh
  - global-owner-debt-inventory-tooling-projection-refresh-wave0
  - oci-receipt-ledger-lock-release-diagnostic
  - partition-managed-merge-explicit-state-ratchet
  - priority-recovery-owner-inventory-projection-refresh
  - priority-recovery-owner-inventory-tooling-projection-refresh-wave0-final
  - priority-recovery-owner-inventory-tooling-projection-refresh
  - query-distributed-decision-state-ratchet
  - service-static-ratchet-no-headroom
  - solver-handoff-oracle-artifact-ownership
  - solver-historical-oracle-content-archive
  - solver-ledger-consistency-log-projection
  - solver-operator-park-terminal-evidence-identity
  - solver-portfolio-projected-terminal-state
  - solver-scope-classifier-artifact-token-isolation
  - solver-static-guideline-ratchet-closure
  - tooling-static-cure-hold-ratchet
  - tooling-static-partition-analyzer-ratchet
  - tooling-static-partition-contract-ratchet-v2
  - tooling-static-steering-scenario-ratchet
  - tooling-static-step-voter-ratchet
  - unused-export-static-ratchet-no-headroom
authorizes: []
legacyStatus: active
---

# Epic: Roadmap integrity Wave 0

## Intent

Restore truthful roadmap projection and unblock repository-wide quality gates
before product repair waves begin. Work is split by owner boundary so Solver
projection, consistency, scope classification, and independent hygiene can be
proved and integrated without touching the active OCI or MovieLens product
lanes.

## Workstreams

1. Project Quest outcome from the full event log so rejection or fresh failure
   after a terminal event reopens portfolio, overview, and frontier state.
2. Make ledger consistency project Quest logs and inspect the sealed oracle
   probe instead of ignored `solve/state` files or ID-derived oracle paths.
3. Prevent evidence filenames containing words such as `contract` from
   expanding source-owner scope.
4. Repair independent metadata and static-gate failures by disjoint owner/file
   area, then regenerate derived shards and roadmap surfaces once source and
   Quest reconciliation are complete.

## Integration order

Solver projection precedes Quest reconciliation and roadmap regeneration.
Test-shard regeneration follows all test additions. Static cleanup is merged by
owner/file area, and the aggregate static gate runs only after each focused
ratchet is green.

## Completion

Wave 0 is complete when focused regressions pass, consistency reports no errors
or unexplained warnings, generated surfaces agree with projected Quest state,
and the aggregate static gate is green without raising a baseline.
