# Quest Lifecycle Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "quest-lifecycle",
  "status": "active",
  "owners": [
    {
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle"
    }
  ],
  "failureClasses": [
    "Quest goalposts move after declaration",
    "attempts are described in chat or commits without Solver event evidence",
    "findings are lost because durable memory is not recorded in the Quest log",
    "terminal state is claimed without live doneWhen evidence",
    "a stalled frontier keeps receiving local patches without selected Quest theory",
    "archived sprint/package theory state is treated as active implementation authority"
  ],
  "stateVariables": [
    "questStatus",
    "doneWhen",
    "frontierStatus",
    "rungIndex",
    "pendingStep",
    "attemptEvents",
    "findingEvents",
    "theoryEvents",
    "selectedFrontierTheory",
    "activeSystemTheory",
    "terminalEvidence"
  ],
  "safetyInvariants": [
    {
      "id": "sealed-goalposts-immutable",
      "statement": "A Quest's doneWhen predicate and frontier metric definitions remain byte-identical to the sealed declaration event."
    },
    {
      "id": "attempts-require-diff-evidence",
      "statement": "An attempt can receive progress credit only when metric evidence and a resolvable diff changeRef both exist."
    },
    {
      "id": "terminal-comes-from-solver",
      "statement": "SOLVED and EXHAUSTED are produced only by Solver state projection, not worker self-report."
    },
    {
      "id": "widen-scope-requires-frontier-theory",
      "statement": "The widen-scope and later rungs must have a selected non-archive frontier theory before another supervised or autonomous attempt begins."
    },
    {
      "id": "model-rung-requires-system-theory-and-model-evidence",
      "statement": "The model rung must have selected frontier theory, active system theory, and modelRef or modelNotApplicable evidence before commit."
    },
    {
      "id": "archive-theory-is-not-selectable",
      "statement": "Imported legacy theory-ledger entries are archive memory and cannot be selected for implementation without fresh Quest theory evidence."
    }
  ],
  "livenessExpectations": [
    {
      "id": "stalled-frontier-climbs-finite-ladder",
      "statement": "A stalled frontier climbs local-fix, widen-scope, model, change-approach, then park so the loop cannot patch the same surface indefinitely."
    },
    {
      "id": "failed-theory-attempt-still-records-learning",
      "statement": "A measured attempt linked to theory records supported, falsified, or needs-rerun learning so the next step does not rediscover the same path."
    }
  ],
  "knownResiduals": [
    "Archived legacy workflow files remain historical evidence only; active execution must select and update a Quest.",
    "The legacy theory ledger remains queryable archive memory while new durable memory is recorded as Quest findings."
  ],
  "runtimeBindings": [
    {
      "path": "scripts/solve.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "Quest CLI dispatch for new, step, finding, status, probe, run, and report"
    },
    {
      "path": "scripts/solve/step.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "supervised attempt begin, pending baseline, commit, and abort"
    },
    {
      "path": "scripts/solve/loop.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "sealed goal validation, autonomous theory preflight, attempt finalization, ladder movement, and terminal state recording"
    },
    {
      "path": "scripts/solve/store.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "append-only Quest event log and derived state projection"
    },
    {
      "path": "scripts/solve/theory.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "Quest-native system theory, frontier theory, selection, result, supersede, and archive import events"
    },
    {
      "path": "scripts/solve/health.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "loop-health projection for theory-required, model-required, and live-probe divergence signals"
    },
    {
      "path": "scripts/solve/mechanism-card.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "evidence artifact summarization into Quest-native mechanism cards"
    }
  ],
  "modelBindings": [
    {
      "kind": "statechart",
      "artifact": "docs/specs/statecharts/quest-lifecycle.json",
      "properties": "legal Quest state transitions, theory-required gates, terminal states, and forbidden goalpost or closure shortcuts"
    },
    {
      "kind": "structural-constraint",
      "artifact": "scripts/check-system-contracts.js",
      "properties": "contract records keep Quest refs, runtime bindings, model artifacts, and theory refs valid"
    }
  ],
  "metrics": [
    {
      "name": "Quest context",
      "probe": "npm run quest:context -- --id rolling-restart-core-stability"
    },
    {
      "name": "Solver report",
      "probe": "npm run solve:report -- --id rolling-restart-core-stability"
    },
    {
      "name": "Quest theory list",
      "probe": "npm run solve:theory -- list --id rolling-restart-core-stability"
    },
    {
      "name": "Quest health",
      "probe": "npm run solve:health -- --id rolling-restart-core-stability"
    },
    {
      "name": "contract validator",
      "probe": "npm run model:contract-records"
    }
  ],
  "questRefs": [
    "solve/quests/rolling-restart-core-stability.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "Quest attempts happen outside the Solver log",
        "severity": "medium - work appears complete while future agents cannot replay what moved the metric",
        "detectability": "high - Quest status shows attempts and findings counts directly",
        "mitigation": "drive active orientation through quest-context and require solve step/finding events for durable work history",
        "probe": "npm run quest:context -- --id rolling-restart-core-stability"
      },
      {
        "failureMode": "same-frontier work widens or models without theory evidence",
        "severity": "medium - the Quest can return to local patch loops after the first stall",
        "detectability": "high - solve health emits theory-required and model-required signals",
        "mitigation": "step begin/commit and run preflight enforce selected frontier theory and model rung evidence",
        "probe": "npm run solve:health -- --id rolling-restart-core-stability"
      }
    ],
    "stpa": [
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "declares a Quest solved before the doneWhen probe is true or after changing the sealed goal",
        "feedbackSignal": "solve status, solve report, quest-context latest probe, and honesty violations",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      },
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "allows a stalled frontier to continue past widen-scope or model without selected Quest theory",
        "feedbackSignal": "solve health theory-required signals, selected theory projection, and theory result events",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers Quest lifecycle failures: goalpost drift, unrecorded
attempts, chat-only memory, and premature closure claims.

## Invariants

Quest goalposts are sealed by the first declaration event. Attempts require
probe evidence plus a resolvable `diff:<path>` change reference. Terminal state
comes from the Solver report projection.

## Runtime Bindings

`scripts/solve.js` owns the CLI. `scripts/solve/step.js` owns supervised
attempt bracketing. `scripts/solve/loop.js` owns autonomous theory preflight,
honesty checks, ladder movement, and terminal recording. `scripts/solve/store.js`
owns the append-only event log and derived state.

## Model Bindings

The statechart is the executable lifecycle model. The contract checker is the
structural constraint that keeps Quest refs, runtime paths, model refs, and
archived theory refs from drifting independently.

## Operational Analysis

FMEA/STPA frame the workflow controller as a safety boundary: it must not issue
progress credit or closure without Solver evidence. `quest-context` supplies the
active handoff surface, while legacy workflow artifacts remain archive evidence
only.
