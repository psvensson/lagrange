# Quest Lifecycle Contract

> **Reading this contract.** The block immediately below is the machine-readable
> `system-contract` consumed by `npm run model:contracts` — you do not need to
> read the JSON. For the human narrative, jump to
> [Operational Analysis](#operational-analysis); the
> [Failure Classes](#failure-classes), [Invariants](#invariants),
> [Runtime Bindings](#runtime-bindings), and [Model Bindings](#model-bindings)
> sections render the same contract in prose.

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
    "archived sprint/package theory state is treated as active implementation authority",
    "latest evidence moves owner or boundary while the selected frontier theory remains unrecorded",
    "broad mixed-scope source changes accumulate without scope-pressure visibility"
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
    "selectedTheoryStale",
    "activeSystemTheory",
    "currentBlocker",
    "blockerMovement",
    "diagnosticMovement",
    "scopePressure",
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
    },
    {
      "id": "stale-theory-cannot-authorize-widened-work",
      "statement": "A selected frontier theory cannot authorize widen-scope, model, or change-approach work after latest evidence makes its owner/boundary stale unless a later theory result records the learning."
    },
    {
      "id": "scope-pressure-comes-from-quest-diffs",
      "statement": "Scope-pressure signals are computed from the Quest's own recorded diff artifacts, never from unrelated dirty worktree files."
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
    },
    {
      "id": "diagnostic-movement-narrows-next-theory",
      "statement": "Evidence that moves owner, boundary, reason, or mechanism without metric movement still records diagnostic movement so the next theory can target the new current blocker."
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
      "transition": "Quest CLI dispatch for start, note, probe, land, evidence add, and board (solve-v2)"
    },
    {
      "path": "scripts/solve/store.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "append-only Quest event log and derived state projection"
    },
    {
      "path": "scripts/solve/schema.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "quest.json, log entry and epic front-matter shapes and vocabularies (solve-v2)"
    },
    {
      "path": "scripts/solve/probes.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "every doneWhen measurement: test-receipt, scenario-harness, oracle, script"
    },
    {
      "path": "scripts/solve/guards.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "landing guards: change set, epic scope, static quality, coupled pairs, canonical import graph"
    },
    {
      "path": "scripts/solve/commands.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "start (seal against a red probe), note, probe, land (guards, npm test, commit, terminal solved), evidence add, board"
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
      "name": "Quest lifecycle statechart",
      "probe": "npm run model:statecharts"
    },
    {
      "name": "system contract registry",
      "probe": "npm run model:contract-records"
    },
    {
      "name": "Solver lifecycle regressions",
      "probe": "npm run test:file -- test/solve/step.test.js test/solve/evidence.test.js test/solve/next.test.js"
    }
  ],
  "questRefs": [
    "solve/quests/rolling-restart-core-stability/quest.json"
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
        "probe": "npm run test:file -- test/solve/step.test.js"
      },
      {
        "failureMode": "same-frontier work widens or models without theory evidence",
        "severity": "medium - the Quest can return to local patch loops after the first stall",
        "detectability": "high - solve health emits theory-required and model-required signals",
        "mitigation": "step begin/commit and run preflight enforce selected frontier theory and model rung evidence",
        "probe": "npm run test:file -- test/solve/step-theory-gates.test.js"
      },
      {
        "failureMode": "latest blocker changes while an older selected theory continues to steer widened work",
        "severity": "medium - attempts can optimize a no-longer-current owner path",
        "detectability": "high - current blocker projection and solve health emit selected-theory-stale",
        "mitigation": "record theory result movement or select a fresh owner-path theory before widened/model/change-approach attempts",
        "probe": "npm run test:file -- test/solve/evidence.test.js"
      },
      {
        "failureMode": "Quest source edits silently spread across unrelated owner areas",
        "severity": "medium - a single Quest can become hard to verify or hand off honestly",
        "detectability": "medium - scope pressure is derived from recorded diff artifacts and shown in health/report",
        "mitigation": "narrow the theory, split the Quest, or record a finding that justifies the mixed scope before more source work",
        "probe": "npm run test:file -- test/solve/scope-pressure-precommit-enforcement.test.js"
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
      },
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "uses a selected theory after latest evidence moved the current blocker to a different owner or boundary",
        "feedbackSignal": "current blocker movement, selected-theory-stale health signal, and recorded theory result outcomes",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      },
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "treats diagnostic blocker movement as scenario closure",
        "feedbackSignal": "separate scenarioOutcome, theoryOutcome, metric, and doneWhen fields in evidence, theory results, and report",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers Quest lifecycle failures: goalpost drift, unrecorded
attempts, chat-only memory, stale selected theories, broad mixed-scope diffs,
and premature closure claims.

## Invariants

Quest goalposts are sealed by the first declaration event. Attempts require
probe evidence plus a resolvable `diff:<path>` change reference. Terminal state
comes from the Solver report projection. A selected frontier theory cannot keep
authorizing widened work after latest evidence moves the current blocker unless
that movement is recorded as theory learning. Scope pressure is projected only
from the Quest's own diff artifacts, never from unrelated dirty files.

## Runtime Bindings

`scripts/solve.js` owns the CLI (solve-v2: start, note, probe, land,
evidence add, board). `scripts/solve/commands.js` owns the four commands and
the landing sequence. `scripts/solve/store.js` owns the append-only log and
derived quest state. `scripts/solve/schema.js` owns record shapes and
vocabularies. `scripts/solve/probes.js` owns every doneWhen measurement.
`scripts/solve/guards.js` owns the landing guards (change set, epic scope,
static quality, coupled pairs, canonical import graph).

## Model Bindings

The statechart is the executable lifecycle model. The contract checker is the
structural constraint that keeps Quest refs, runtime paths, model refs, and
archived theory refs from drifting independently.

## Operational Analysis

FMEA/STPA frame the workflow controller as a safety boundary: it must not issue
progress credit or closure without Solver evidence, must not keep steering from
a no-longer-current theory, and must keep mixed source scope visible before
handoff. `quest-context` supplies the active handoff surface, while legacy
workflow artifacts remain archive evidence only.
