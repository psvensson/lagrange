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
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "owned files expand outside diagnostics artifact schema surfaces",
      "migration requires runtime active-gate behavior changes",
      "representative proof reveals a new owner boundary instead of schema aliases"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md"
}
-->

## Why

`activeGateBestProgress`, `activeGateNoProgress`, and
`activeGateBlockerHistory` are no longer allowed as silent transitional
vocabulary, but they remain part of the current failure-bundle/report artifact
schema. Removing them inside the final deletion slice would change external
artifact contracts and break diagnostics readers without a scoped schema-owner
migration.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`
for the remaining active-gate diagnostics artifact schema aliases. This is a
Phase `0.1` internal-coherence cleanup within the AGPL repository.

## In Scope

1. Define the canonical active-gate diagnostics artifact shape.
2. Migrate failure-bundle, analyzer, and topology-convergence consumers from
   the old report aliases to that shape.
3. Add structural guards that reject the old aliases after migration.
4. Preserve owner-boundary evidence and representative report readability.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: `src/diagnostics/topology-convergence-graph.js`, `scripts/analyze-topology-convergence.js`, `test/distributed/harness/active-gate-contract.js`, `test/distributed/harness/failure-bundle-segment-4.js`, `test/distributed/harness/__tests__/failure-bundle*.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/scripts/analyze-topology-convergence.test.js`, this package file.
- Forbidden files: `src/control-plane/`, `src/rebalancer/`, runtime active-gate owner behavior, unrelated sprint/package files.
- Frozen decisions: this package only renames/removes active-gate report schema aliases; it must not change active-gate semantics or owner-witness classification.
- Escalation triggers: owned files expand outside diagnostics artifact schema surfaces; migration requires runtime active-gate behavior changes; representative proof reveals a new owner boundary instead of schema aliases.
- Focused proof: `rg "activeGateBestProgress|activeGateNoProgress|activeGateBlockerHistory" src/diagnostics scripts test/distributed/harness test/diagnostics test/scripts`; `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js`

## Out Of Scope

1. New active-gate behavior.
2. Reclassification of owner witnesses from raw report fields.
3. Harness timeout or report relabeling changes.
