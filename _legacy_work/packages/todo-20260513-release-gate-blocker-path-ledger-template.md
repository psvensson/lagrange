# Release Gate Blocker Path Ledger Template

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-13",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "release_gate_blocker_path_ledger",
    "dominantReason": "local_package_fixes_without_whole_problem_lineage",
    "currentState": "Future release-gate work needs a mandatory blocker-path ledger so packages reason from the whole causal chain instead of the newest local symptom.",
    "nextAction": "Add the reusable ledger template and package guidance, then make future release-gate sprint activation require a populated blocker-path ledger before runtime implementation packages start."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ],
    "handoffFiles": [
      "work/packages/done-20260512-scenario-causal-closure-governance.md",
      "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Future release-gate work needs a mandatory blocker-path ledger so packages reason from the whole causal chain instead of the newest local symptom."
  },
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "repo-wide-governance/blocker-path-ledger",
    "outputProfile": "medium",
    "escalationTriggers": [
      "validation requires tracker code changes",
      "the ledger must infer runtime owner decisions instead of recording package evidence"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
        "npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
        "git diff --check -- work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/README.md work/templates/work-package-template.md"
      ]
    }
  }
}
-->

## Why

Work packages were clear enough individually, but the recent release-gate path
still ping-ponged because the larger causal chain was not the first artifact.
This package creates the reusable blocker-path ledger that every future
release-gate sprint must fill before runtime implementation starts.

## Scope Basis

Approved workflow/tooling maintenance under `work/`. This package changes
release-gate planning artifacts only.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the package owns work-tracking templates and
  README guidance, not runtime behavior.
- Escalation trigger to a heavier lane: tracker validation code becomes
  necessary for closure, or the package starts interpreting runtime evidence
  instead of documenting already-extracted evidence.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: current blocker history, artifact
  names, owner boundaries, scenario causal closure metadata, and active sprint
  execution order.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, the active rolling-restart package, and the active
  rolling-restart sprint.
- Runtime architecture ideas captured as contract/backlog items: no runtime
  design is implemented here.
- Activation rule before any runtime/scenario implementation: a future runtime
  package must cite a concrete blocker-path ledger row.

## Required Ledger Shape

The ledger template must record each material blocker transition with:

1. package or sprint that observed it
2. scenario or focused probe
3. artifact or fixture
4. owner and boundary
5. first frontier and dominant reason
6. residual semantic state
7. downstream blockers that must not drive work yet
8. repeated causal edge or architecture smell
9. next required action
10. classification: workflow/tooling, analyzer/fixture, architecture contract,
    or runtime implementation
11. whether the next package is allowed to touch runtime
12. what evidence would stop or continue the same-frontier loop

## Rolling-Restart Seed Requirement

For the paused `rolling-restart` sprint, this package must not close with only
an empty ledger shape. It must seed the ledger with the recent concrete path
before runtime work resumes:

1. Publication convergence reduced to non-frontier with `PUBLISHED` and zero
   pending ACKs.
2. Rebalancer handoff retry and bounded remote handoff evidence reduced, then
   migrated back to workflow progress.
3. Rebalancer-leader operation scheduling reduced missing priority-recovery
   operation creation.
4. Workflow progress repeatedly produced `coordination_mismatch`,
   `recovering_in_flight`, serial-wait, event-driven wait, dispatch-pending,
   stale-timeout, and target-owned `PENDING` residuals.
5. Startup active-gate snapshot coverage stayed downstream until priority
   recovery operation progress closes.

The repeated causal edge to name is one missing priority-recovery
operation-progress owner path from desired action to dispatch, retry, reconcile,
timeout, completion, or terminal failure.

## Invariants

1. The ledger is about causal lineage, not status bookkeeping.
2. A release-gate sprint cannot activate a runtime architecture package until
   the relevant ledger row names the repeated causal edge being collapsed.
3. A migrated frontier does not erase downstream blockers or predecessor proof.
4. If the same owner boundary appears repeatedly, the ledger must point to an
   architecture contract rather than another local patch package.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `repo-wide-governance/blocker-path-ledger`
- Owned files: `work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`, `work/README.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`, active
  rolling-restart package/sprint files
- Frozen decisions: this package records higher-order blocker lineage only; it
  does not choose or implement runtime fixes.
- Escalation triggers: tracker validation code is required, runtime evidence
  interpretation is needed, or active scenario files must be mutated.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`, `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`, `git diff --check -- work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/README.md work/templates/work-package-template.md`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`
3. `git diff --check -- work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/README.md work/templates/work-package-template.md`
