# Spec-Led Runtime Modularization Active Gate Report Schema Alias Deletion

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json",
  "playback": "none",
  "owner": "diagnostics_artifact_schema_owner",
  "boundary": "active_gate_report_schema_alias_deletion",
  "dominantReason": "active_gate_report_aliases_remain_external_artifact_contract",
  "currentState": "The final legacy deletion slice removed legacy helper entrypoints and stability-gate aliases, but report artifacts still expose activeGateBestProgress, activeGateNoProgress, and activeGateBlockerHistory as external diagnostics schema fields consumed by failure-bundle and topology-convergence readers.",
  "nextAction": "Define the successor active-gate diagnostics schema owner, migrate consumers from the camel-case report aliases to the canonical owner-bound activeGate shape, and add schema guards that reject the old report aliases after migration.",
  "proof": [
    "rg checks for activeGateBestProgress, activeGateNoProgress, and activeGateBlockerHistory before and after migration",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js",
    "Touched-file static guardrails selected by diagnostics_artifact_schema_owner",
    "Representative rolling-restart report preserves canonical owner-boundary evidence without old active-gate report aliases"
  ],
  "touchedFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/distributed/harness/active-gate-contract.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle*.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md"
  ],
  "predecessor": "work/packages/active-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md"
}
-->

## Why

`activeGateBestProgress`, `activeGateNoProgress`, and
`activeGateBlockerHistory` are no longer allowed as silent transitional
vocabulary, but they remain part of the current failure-bundle/report artifact
schema. Removing them inside the final deletion slice would change external
artifact contracts and break diagnostics readers without a scoped schema-owner
migration.

## Scope

1. Define the canonical active-gate diagnostics artifact shape.
2. Migrate failure-bundle, analyzer, and topology-convergence consumers from
   the old report aliases to that shape.
3. Add structural guards that reject the old aliases after migration.
4. Preserve owner-boundary evidence and representative report readability.

## Out Of Scope

1. New active-gate behavior.
2. Reclassification of owner witnesses from raw report fields.
3. Harness timeout or report relabeling changes.
