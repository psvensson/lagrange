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
