# Contract Title

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "lowercase-dash-contract-id",
  "status": "active",
  "owners": [
    {
      "owner": "semantic_owner",
      "boundary": "owner_boundary"
    }
  ],
  "failureClasses": [
    "named failure class this contract makes impossible, detectable, or bounded"
  ],
  "stateVariables": [
    "stateVariableName"
  ],
  "safetyInvariants": [
    {
      "id": "safety-invariant-id",
      "statement": "concrete safety property"
    }
  ],
  "livenessExpectations": [
    {
      "id": "liveness-expectation-id",
      "statement": "concrete progress property"
    }
  ],
  "systemTheory": {
    "problemStatement": "durable whole-system problem this record reasons about",
    "phaseChain": [
      "ordered phases of the whole-system theory"
    ],
    "ownerBoundaryMap": [
      {
        "owner": "semantic_owner",
        "boundary": "owner_boundary",
        "role": "what this owner/boundary contributes to the whole-system theory"
      }
    ],
    "invariantRefs": [
      "safety-invariant-id"
    ]
  },
  "modelProvenRoutes": [
    {
      "owner": "semantic_owner",
      "boundary": "owner_boundary",
      "selectedLayer": "observation",
      "livenessHolds": true,
      "evidenceArtifact": "test-output/reports/name.model.report.json",
      "ledgerRef": "theory-YYYYMMDD-...-architecture-gap"
    }
  ],
  "knownResiduals": [
    "known bounded residual or the literal none with evidence"
  ],
  "runtimeBindings": [
    {
      "path": "src/owner/file.js",
      "owner": "semantic_owner",
      "boundary": "owner_boundary",
      "transition": "runtime transition governed by this contract"
    }
  ],
  "modelBindings": [
    {
      "kind": "decision-table",
      "artifact": "docs/specs/decision-tables/name.json",
      "properties": "property checked by npm run model:decision-tables"
    }
  ],
  "metrics": [
    {
      "name": "metric or probe name",
      "probe": "npm run focused:command"
    }
  ],
  "packageRefs": [
    "work/packages/done-YYYYMMDD-package.md"
  ],
  "theoryLedgerRefs": [
    "theory-YYYYMMDD-entry"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "concrete failure mode",
        "severity": "impact and severity",
        "detectability": "how early the workflow detects this failure",
        "mitigation": "contract, model, test, or runtime control",
        "probe": "npm run focused:command"
      }
    ],
    "stpa": [
      {
        "controller": "owner or workflow controller",
        "unsafeAction": "unsafe, missing, early, late, or stopped action",
        "feedbackSignal": "signal the controller observes",
        "ownerBoundary": "owner / boundary"
      }
    ]
  }
}
-->

## Failure Classes

Name the failure classes this contract owns.

## Invariants

Record safety and liveness claims that packages must preserve.

## Runtime Bindings

Map the contract to concrete owner files and transitions.

## Model Bindings

Map the contract to TLA+, property tests, statecharts, decision tables,
structural constraints, or simulators.

## Operational Analysis

Record FMEA and STPA summaries with probes and residual bounds.
