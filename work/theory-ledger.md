# Experiment And Theory Ledger

This ledger is an evidence-linked index for current experiments, causal
theories, and superseded hypotheses. It is not an authority over package
status, current-blocker routing, representative artifacts, or runtime behavior.

Packages, generated current-blocker files, and artifacts remain canonical.
Ledger entries help agents find the theory trail before they choose or resume
work.

## Contract

1. Use one `## theory-YYYYMMDD-short-slug` heading per entry.
2. Preserve old entries. When a theory is replaced, mark it `superseded` and
   link the replacing entry instead of rewriting history.
3. Update the ledger only at package closure, representative rerun routing,
   architecture gate decisions, or deliberate seed/backfill packages.
4. Do not invent proof. If evidence is uncertain or stale, use `needs-rerun` or
   `stale` and link the package or artifact that shows the uncertainty.
5. Package evidence remains primary. A ledger entry can summarize or point; it
   cannot close a package, override the current blocker, or promote runtime
   work by itself.

## Status Values

- `active`: the theory is currently guiding work.
- `supported`: linked evidence supports the theory, but the package/artifact
  remains the source of truth.
- `falsified`: linked evidence contradicts the theory.
- `superseded`: a newer linked theory replaces this one.
- `stale`: the theory may still matter, but current evidence is too old or
  incomplete for routing.
- `needs-rerun`: the theory needs fresh proof before it should guide work.

## Required Entry Fields

Each entry must include these labels:

- `Status`
- `Scenario/gate`
- `Owner/boundary`
- `Hypothesis`
- `Probe`
- `Artifact/result`
- `Representative movement`
- `Linked packages`
- `Supersedes`
- `Superseded by`
- `Next implication`

## Entries

## theory-20260522-experiment-theory-memory

- Status: active
- Scenario/gate: none / workflow_tooling
- Owner/boundary: workflow_tooling_owner / experiment_theory_memory
- Hypothesis: a compact advisory theory ledger lets agents find current experiments and superseded theories without replacing package or artifact truth.
- Probe: `npm run work:theory-ledger -- validate`
- Artifact/result: `work/packages/active-20260522-experiment-theory-ledger-foundation.md` - foundation package created the ledger contract and template.
- Representative movement: none
- Linked packages: `work/packages/active-20260522-experiment-theory-ledger-foundation.md`, `work/packages/todo-20260522-experiment-theory-ledger-tooling.md`, `work/packages/todo-20260522-experiment-theory-ledger-tracker-integration.md`, `work/packages/todo-20260522-experiment-theory-ledger-initial-seed.md`
- Supersedes: none
- Superseded by: none
- Next implication: implement tooling, tracker integration, and conservative seed entries before runtime stability work resumes.

## theory-20260522-node-failure-acceptance-hardening

- Status: supported
- Scenario/gate: node-failure-rebalance / scenario_acceptance
- Owner/boundary: distributed_harness_scenario_owner / node_failure_rebalance_acceptance
- Hypothesis: node-failure rebalance must prove acked-write visibility, rebalance closure, owner/fencing diagnostics, and client error classification instead of passing on total operations plus final consistency.
- Probe: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario node-failure-rebalance`
- Artifact/result: `work/packages/done-20260522-node-failure-rebalance-acceptance-hardening.md` - focused package proof passed while representative runner timeouts remained a separate blocker.
- Representative movement: representative-green
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-acceptance-hardening.md`
- Supersedes: none
- Superseded by: none
- Next implication: keep acceptance checks as release-gate guardrails while startup active-gate snapshot coverage remains the next runtime blocker.

## theory-20260522-snapshot-watch-fixture

- Status: superseded
- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: a replayable WebSocket-closed selected-source fixture is sufficient to classify the active-gate snapshot coverage blocker before runtime edits.
- Probe: `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture`
- Artifact/result: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md` - fixture preserved selectedSnapshotReachableBy=admin_ws and alternative witness evidence but left the frontier unchanged.
- Representative movement: same-frontier
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md`
- Supersedes: none
- Superseded by: theory-20260522-snapshot-watch-handoff-contract
- Next implication: fixture evidence is retained, but typed owner handoff contract emission is now the active theory.

## theory-20260522-snapshot-watch-handoff-contract

- Status: active
- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: WebSocket-closed selected snapshot source evidence with admin_ws reachability and an alternative witness remains blocked because startup_active_gate_owner / snapshot_coverage does not emit a typed snapshot/watch owner handoff contract.
- Probe: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`
- Artifact/result: `test-output/report.json` - handoff probe reports handoffContract absent and runtimePromotionAllowed=false while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true.
- Representative movement: pending-before-probe
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md`, `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`
- Supersedes: theory-20260522-snapshot-watch-fixture
- Superseded by: none
- Next implication: resume the paused typed handoff contract runtime package after the ledger sequence closes.
