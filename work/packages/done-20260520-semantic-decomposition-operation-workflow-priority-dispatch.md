# Semantic Decomposition Operation Workflow Priority Dispatch

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "experiment",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "architecture_owner",
  "boundary": "semantic_decomposition_operation_workflow_priority_dispatch",
  "dominantReason": "ordinal_stage_files_obscure_semantic_owner_boundaries",
  "currentState": "The named stage/segment files are now compatibility wrappers; owned logic lives in semantic operation workflow recovery reconcile and priority recovery dispatch snapshot modules.",
  "nextAction": "Delete the compatibility wrappers in a later package after import consumers move to semantic module paths.",
  "proof": [
    "node --check src/rebalancer/operation-workflow-recovery-reconcile.js",
    "node --check src/rebalancer/operation-workflow-recovery-reconcile-shared.js",
    "node --check src/control-plane/priority-recovery-dispatch-snapshot.js",
    "npm test -- test/scripts/check-operation-progress-authority.test.js",
    "npm test -- test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js",
    "npm run audit:operation-progress-authority",
    "npm run work:validate -- --closure work/packages/done-20260520-semantic-decomposition-operation-workflow-priority-dispatch.md"
  ],
  "writeScope": [
    "work/packages/done-20260520-semantic-decomposition-operation-workflow-priority-dispatch.md",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/operation-workflow-recovery-reconcile-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-7.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/control-plane/priority-recovery-dispatch-snapshot.js",
    "src/control-plane/priority-recovery-snapshot.js",
    "src/control-plane/priority-recovery-snapshot-stage-4.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "test/scripts/check-operation-progress-authority.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260520-semantic-decomposition-operation-workflow-priority-dispatch.md",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/operation-workflow-recovery-reconcile-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-7.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/control-plane/priority-recovery-dispatch-snapshot.js",
    "src/control-plane/priority-recovery-snapshot.js",
    "src/control-plane/priority-recovery-snapshot-stage-4.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "test/scripts/check-operation-progress-authority.test.js"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "public imports break",
      "semantic modules require behavior changes",
      "owner-map successor rows conflict with module names"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 says the bug surface is structural and the named stage files can be reduced to compatibility wrappers; H2 says public imports require owned logic to stay in ordinal files; H3 says semantic extraction changes runtime behavior.",
    "hypothesisDiscriminator": "H1 predicts wrappers plus semantic imports pass import checks and owner audit; H2 predicts public import tests fail; H3 predicts focused owner tests or node --check fail after extraction.",
    "expectedMetric": "named files contain wrapper exports only while semantic modules parse and owner audit passes",
    "inheritsFrom": "architecture/current-owner-maps.md",
    "timebox": "24h",
    "mergeRequirement": "semantic modules parse, wrappers contain no owned logic, and operation-progress authority audit passes",
    "killRule": "stop and restore owned logic to the previous package if public imports break"
  },
  "validationTier": "single-owner",
  "observablePrediction": {
    "metric": "owned logic in named ordinal files",
    "predicted": "named stage/segment examples are compatibility wrappers with no owned function/class/const declarations",
    "observed": "named stage/segment examples are compatibility wrappers with no owned function/class/const declarations",
    "accuracy": "matched",
    "evidence": "npm test -- test/scripts/check-operation-progress-authority.test.js",
    "metricDelta": 0
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-architecture-contract",
    "nextOwner": "architecture_owner",
    "nextBoundary": "semantic_wrapper_deletion",
    "evidence": "npm run audit:operation-progress-authority"
  }
}
-->

## Why

This package turns the semantic decomposition policy into code shape for the
three named files. The compatibility paths stay available, but the owned logic
moves to semantic module names.

## Execution Evidence

- [x] implementation: status: validated; evidence: `node --check src/rebalancer/operation-workflow-recovery-reconcile.js`, `node --check src/rebalancer/operation-workflow-recovery-reconcile-shared.js`, `node --check src/control-plane/priority-recovery-dispatch-snapshot.js`, `npm test -- test/scripts/check-operation-progress-authority.test.js`, `npm test -- test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`, `npm run audit:operation-progress-authority`, and `npm run work:validate -- --closure work/packages/done-20260520-semantic-decomposition-operation-workflow-priority-dispatch.md`; parent validation: yes; next: keep wrappers until import consumers are migrated.
