# Package Lifecycle Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "package-lifecycle",
  "status": "active",
  "owners": [
    {
      "owner": "workflow_tooling_owner",
      "boundary": "package_lifecycle"
    }
  ],
  "failureClasses": [
    "package state can move without the required evidence phase",
    "active done superseded churn can obscure whether a system contract was strengthened",
    "successor creation can become the implementation payload instead of evidence-driven redirection"
  ],
  "stateVariables": [
    "packageStatus",
    "lane",
    "ownerBoundary",
    "proofLadder",
    "executionEvidence",
    "closureSummary",
    "contractRef"
  ],
  "safetyInvariants": [
    {
      "id": "status-filename-is-authority",
      "statement": "Package status is represented by the package filename and metadata; no second status system is introduced."
    },
    {
      "id": "done-requires-closure-evidence",
      "statement": "A package cannot enter done without replayable closure evidence and workflow repair."
    }
  ],
  "livenessExpectations": [
    {
      "id": "non-terminal-theory-loop-redirects",
      "statement": "A non-terminal theory-loop outcome redirects to the next legal action instead of halting."
    }
  ],
  "knownResiduals": [
    "Legacy packages may lack explicit System Contract Record refs until migrated by future package work."
  ],
  "runtimeBindings": [
    {
      "path": "scripts/work-tracker.js",
      "owner": "workflow_tooling_owner",
      "boundary": "package_lifecycle",
      "transition": "entry pre-implementation closure validation and package status gate"
    },
    {
      "path": "scripts/work-close.js",
      "owner": "workflow_tooling_owner",
      "boundary": "package_lifecycle",
      "transition": "atomic closure tail"
    }
  ],
  "modelBindings": [
    {
      "kind": "statechart",
      "artifact": "docs/specs/statecharts/package-lifecycle.json",
      "properties": "legal package state transitions and forbidden reopen paths"
    },
    {
      "kind": "structural-constraint",
      "artifact": "scripts/work-contract-check.js",
      "properties": "contract records keep package refs, theory refs, runtime bindings, and model artifacts valid"
    }
  ],
  "metrics": [
    {
      "name": "package loop health",
      "probe": "npm run work:loop-health -- --owner workflow_tooling_owner --boundary package_lifecycle"
    },
    {
      "name": "contract validator",
      "probe": "npm run work:contract:check"
    }
  ],
  "packageRefs": [
    "work/packages/done-20260522-experiment-theory-ledger-foundation.md",
    "work/packages/done-20260522-experiment-theory-ledger-tooling.md",
    "work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "status churn closes packages without proving a strengthened contract",
        "severity": "medium - process appears complete while system uncertainty persists",
        "detectability": "high - statechart and loop-health expose illegal transitions and repeated same-frontier closes",
        "mitigation": "bind lifecycle transitions to statechart evidence and durable System Contract Record refs",
        "probe": "npm run model:statecharts"
      }
    ],
    "stpa": [
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "activates or closes package state before owner boundary, proof, and contract evidence are valid",
        "feedbackSignal": "work:validate phase errors, work:context dirty-scope grouping, and work:loop-health risk",
        "ownerBoundary": "workflow_tooling_owner / package_lifecycle"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers package lifecycle failures: state movement without
evidence, successor churn without learning, and package closeout that cannot
state which durable system contract changed.

## Invariants

Package status remains filename-owned. Closure requires evidence, validation,
repair, and atomic package/sprint/current-blocker updates. Superseded packages
must name the successor, migration, or architecture decision that replaced
them.

## Runtime Bindings

`scripts/work-tracker.js` owns validation phases. `scripts/work-close.js` owns
the closure tail. Any lifecycle change must keep those owners aligned with the
statechart in `docs/specs/statecharts/package-lifecycle.json`.

## Model Bindings

The statechart is the low-resolution executable model. The contract checker is
the structural constraint that keeps lifecycle docs, package refs, model refs,
and theory refs from drifting independently.

## Operational Analysis

FMEA/STPA frame the lifecycle as a control problem: the workflow controller
must not issue close, activate, or supersede actions before evidence is valid.
`work:loop-health` supplies the lower-resolution ping-pong indicator for
package churn.
