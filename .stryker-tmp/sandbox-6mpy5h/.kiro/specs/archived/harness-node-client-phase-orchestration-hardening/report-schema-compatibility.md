# Report Schema Compatibility Notes

## Scope

This document records additive report fields introduced by harness node-client/
phase-orchestrator hardening and the compatibility behavior expected by report
readers.

## Additive Fields

`postgres-baseline-comparison` now emits additional fields under
`scenario.details.details`:

- `phaseTimeline`: ordered phase execution timeline (`phase`, `status`,
  `durationMs`, timestamps, warnings, errors).
- `phaseArtifacts`: per-phase artifact payload map keyed by phase id.
- `phaseReasonSummary`: dominant warning/error reasons across phases.
- `phaseDecisions`: structured policy + reasons per phase.
- `phaseEvents`: start/end phase events from `PhaseOrchestrator`.
- `channelMetrics`: `NodeClient` counters by channel.
- `verification.coverage`: snapshot coverage metrics.
- `verification.mismatches`: machine-readable mismatch payloads.
- `verification.evidenceWarnings`: evidence shortfall warnings.
- `verification.verificationNodeIds`: included verify-node set.
- `verification.verificationExcludedNodeIds`: excluded verify-node set.

All existing fields remain unchanged and continue to be populated.

## Reader Compatibility Shim

Report readers now accept both benchmark detail envelopes:

1. Legacy/nested: `scenario.details.details.{benchmark,baseline,comparison,...}`
2. Flat/compatibility: `scenario.details.{benchmark,baseline,comparison,...}`

The shim is implemented in
`test/distributed/harness/report-writer.js` via `resolveBenchmarkDetails()`.

## Deprecation Notes

- Preferred producer shape remains nested (`scenario.details.details`) because
  distributed runner wraps scenario payloads under `details`.
- Flat detail payload support is compatibility-only and should not be used as
  the primary emission shape for new scenario code.
- No removal date is set yet; removal requires explicit migration of any tools
  that still emit/consume flat benchmark details.
