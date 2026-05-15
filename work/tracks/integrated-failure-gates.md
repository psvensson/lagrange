# Track: Integrated Failure Gates

## Document Role

This track owns integrated failure-gate proof after focused owner-boundary
tracks have enough closure evidence to combine.

It can contain release-gate, bugfix, stabilization, maintenance, and development
sprints, but it should not become a bucket for unrelated runtime fixes.

## Track Type

`release-gate`

## Release Consumers

- `work/releases/0.1-stabilization.md`

## Proven Pattern

Focused unit and owner-boundary proof is necessary but not sufficient for a
distributed-system release. The release needs named failure gates with executed
artifacts, canonical extractor summaries, and clear migration when a gate finds
a narrower blocker.

## Local Divergence

The current sprint records that the topology failure-gate matrix exists, but no
failure-gate execution artifact is recorded.

The representative `rolling-restart` gate remains red, so integrated release
claims would be premature.

## Target Invariant

Every consuming-release failure gate is either:

```text
green | migrated-to-narrower-owner-boundary | explicitly-out-of-scope
```

No gate is closed by checklist presence alone.

## Gate Or Acceptance Proof

The integrated matrix must cover at least:

1. rolling restart
2. node failure and recovery
3. node rejoin
4. replica movement and handoff
5. publication convergence
6. priority recovery tail behavior
7. distributed transaction retry/recovery

## Current Evidence

Planned. Do not run this track while the current representative topology gate is
still red unless the active package explicitly asks for release-gate evidence.

The current representative artifact
`test-output/reports/topology-ship-gate-final-rolling-restart.report.json`
failed with first frontier `publication_ack_convergence` under
`topology_publication_owner / publication_convergence`.

## Codebase Analysis Notes

The repo already has the core gate framework. This track should reuse the
distributed harness gate engine, topology failure-gate matrix, validation
matrix, failure bundle classification, and canonical extractor scripts. It
should not introduce a second release-gate status system.

Publication evidence replay, active-gate contracts, priority-recovery summary
normalization, and failure-bundle classification are part of the release-gate
surface because they select which runtime owner gets the next package.

## Owner Boundaries

This track is a release-gate wrapper. It should not own runtime behavior.

When a failure appears, migrate to the narrowest runtime owner boundary selected
by canonical evidence.

## Sprint Membership

No sprints are currently attached. Future release-gate or bugfix sprints may
attach here when focused tracks are ready for integration.

## Likely Files

These are context candidates, not write authorization:

- `test/distributed/run.js`
- `test/distributed/config/local.json`
- `test/distributed/scenarios/`
- `test/distributed/scenarios/rolling-restart.js`
- `test/distributed/scenarios/node-failure-rebalance.js`
- `test/distributed/scenarios/node-join-under-load.js`
- `test/distributed/scenarios/partition-kill-heal-under-load.js`
- `test/distributed/scenarios/network-partition-split-brain.js`
- `test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js`
- `test/distributed/scenarios/wasm-service-failover.js`
- `test/distributed/harness/gate-engine.js`
- `test/distributed/harness/topology-failure-gate-matrix.js`
- `test/distributed/harness/validation-matrix.js`
- `test/distributed/harness/failure-bundle.js`
- `test/distributed/harness/failure-bundle-segment-1.js`
- `test/distributed/harness/failure-bundle-segment-2.js`
- `test/distributed/harness/failure-bundle-segment-3.js`
- `test/distributed/harness/failure-bundle-segment-4.js`
- `test/distributed/harness/failure-bundle-segment-5.js`
- `test/distributed/harness/failure-bundle-segment-6.js`
- `test/distributed/harness/failure-bundle-segment-7.js`
- `test/distributed/harness/publication-evidence-contract.js`
- `test/distributed/harness/publication-evidence-replay.js`
- `test/distributed/harness/active-gate-contract.js`
- `test/distributed/harness/active-gate-closure-classification.js`
- `test/distributed/harness/priority-recovery-summary-normalization.js`
- `test/distributed/harness/startup-readiness-evidence.js`
- `scripts/analyze-topology-convergence.js`
- `scripts/analyze-causal-model.js`
- `scripts/analyze-priority-recovery-residuals.js`
- `scripts/work-context.js`
- `src/diagnostics/topology-convergence-graph.js`
- `src/diagnostics/causal-analysis-schema.js`

## Entry Condition

Start this track only after topology, committed side effects, and transaction
recovery have enough focused evidence to justify integrated proof.

## Exit Condition

This track can close when every named gate has an artifact and canonical
extractor summary, or when the remaining gate is migrated to a narrower active
track with owner-boundary proof.

## Next Package

None active. Create packages from this track only when focused tracks are ready
for integration.
