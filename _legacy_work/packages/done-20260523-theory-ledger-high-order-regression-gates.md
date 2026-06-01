# Theory Ledger High Order Regression Gates

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "theory_ledger_regression_gates",
  "dominantReason": "high_order_regressions_can_repeat_superseded_theories",
  "currentState": "The theory ledger is visible in context and package doctor output, but high-risk packages can still ignore related theories, cite missing theory ids, close without writing back material outcomes, and spawn successors that drop relevant theory refs.",
  "nextAction": "Formally close this package and activate the rolling-restart selected transport-closed owner recovery projection contract successor package.",
  "stabilityCredit": "instrumentation-only",
  "whyHighestLeverageNow": "This advances the current rolling-restart representative gate and active_gate_snapshot_coverage first frontier by preventing repeated high-order regression patterns before the next runtime package runs.",
  "codeQualityAdmission": {
    "reason": "prevents-regression",
    "evidence": "Recent rolling-restart packages repeatedly refined startup_active_gate_owner / snapshot_coverage while the active snapshot-watch theory stayed stale and some successors dropped explicit theory refs."
  },
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "proof": [
    "npm test -- test/scripts/work-theory-ledger.test.js test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js",
    "npm run work:theory-ledger -- validate",
    "npm run work:validate -- --closure work/packages/done-20260523-theory-ledger-high-order-regression-gates.md",
    "git diff --check -- scripts/work-theory-ledger.js scripts/work-tracker.js scripts/work-context.js scripts/work-package-new.js scripts/work-advance.js scripts/work-llm-start.js test/scripts/work-theory-ledger.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js work/packages/done-20260523-theory-ledger-high-order-regression-gates.md work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md work/sprints/current-blocker.md work/sprints/current-blocker.json"
  ],
  "writeScope": [
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-new.js",
    "scripts/work-advance.js",
    "scripts/work-llm-start.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-package-new.test.js",
    "test/scripts/work-advance.test.js",
    "work/packages/done-20260523-theory-ledger-high-order-regression-gates.md",
    "work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md"
  ],
  "handoffFiles": [
    "work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-new.js",
    "scripts/work-advance.js",
    "scripts/work-llm-start.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-package-new.test.js",
    "test/scripts/work-advance.test.js",
    "work/packages/done-20260523-theory-ledger-high-order-regression-gates.md",
    "work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "runtime ownership changes",
      "representative scenario evidence changes",
      "validation gates become mandatory for read-review-doc-only packages"
    ]
  }
}
-->

## Why

The ledger should prevent agents from repeating failed or superseded causal
routes, not merely provide optional context. Recent rolling-restart packages
used the snapshot-watch handoff theory as a breadcrumb, but the ledger did not
force later packages to build on, supersede, or write back what they learned.

This package makes the ledger an advisory decision gate for high-risk workflow
lanes while preserving the rule that not every package needs a theory.

## Scope Basis

Approved workflow/tooling maintenance. This package changes package creation,
validation, context, doctor, and ledger tooling only. It must not edit runtime
source or representative evidence.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the work is confined to workflow scripts, tests,
  package metadata, and generated current-blocker state.
- Escalation trigger to a heavier lane: runtime behavior, scenario routing
  truth, or release-gate evidence changes.

## Required Gates

1. Pre-implementation related-theory gate:
   high-risk lanes must acknowledge related theories or record a concrete
   not-applicable/planned-new-theory reason.
2. Superseded/falsified route guard:
   packages that match or cite `superseded`, `falsified`, `stale`, or
   `needs-rerun` theories must explain why they are not repeating that route.
3. Closure write-back gate:
   material closure outcomes must update/add a ledger entry or explicitly
   record why no ledger update is needed.
4. Successor inheritance:
   package creation and advance flow should carry forward relevant
   `theoryLedgerRefs` unless deliberately cleared.
5. Stale active-theory detection:
   active theories should warn or fail when newer related packages have
   narrowed, contradicted, or superseded them without ledger update.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared runtime contract
  decision changes.

## Model Fit

- Package class: `workflow-tooling`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/work-theory-ledger.js`, `scripts/work-tracker.js`,
  `scripts/work-context.js`, `scripts/work-package-new.js`,
  `scripts/work-advance.js`, `scripts/work-llm-start.js`,
  `test/scripts/work-theory-ledger.test.js`,
  `test/scripts/work-tracker-subagent-ledger.test.js`,
  `test/scripts/work-context.test.js`, `test/scripts/work-package-new.test.js`,
  `test/scripts/work-advance.test.js`,
  `work/packages/active-20260523-theory-ledger-high-order-regression-gates.md`,
  `work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md`
- Forbidden files: `src/`
- Frozen decisions: theory ledger remains advisory for low-risk packages;
  packages, current-blocker, and artifacts remain source of truth.
- Escalation triggers: runtime ownership changes, representative scenario
  evidence changes, or validation gates become mandatory for read/review-only
  packages.
- Focused proof: `npm test -- test/scripts/work-theory-ledger.test.js test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js`, `npm run work:theory-ledger -- validate`, `npm run work:validate -- --pre-impl work/packages/active-20260523-theory-ledger-high-order-regression-gates.md`, `git diff --check -- scripts/work-theory-ledger.js scripts/work-tracker.js scripts/work-context.js scripts/work-package-new.js scripts/work-advance.js scripts/work-llm-start.js test/scripts/work-theory-ledger.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js work/packages/active-20260523-theory-ledger-high-order-regression-gates.md work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md work/sprints/current-blocker.md work/sprints/current-blocker.json`

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md`
- Evidence that may be read but not mutated:
  `test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Files explicitly forbidden by this package: `src/`, `test/distributed/`
  runtime harness implementation files, representative report files.
- Runtime architecture ideas captured as contract/backlog items: none in this
  package; the runtime successor remains parked as `todo`.
- Activation rule before any runtime/scenario implementation: close this
  package or intentionally supersede it, then reactivate the selected runtime
  package and refresh `current-blocker`.

## Higher-Order Problem Framing

- Blocker-path ledger rows this package creates, updates, or consumes:
  `work/theory-ledger.md` entries and `theoryLedgerRefs` package metadata.
- Repeated owner-boundary failure or causal edge being addressed:
  high-order repetition of stale startup active-gate snapshot coverage theories.
- Architecture contract created, updated, or required before runtime work:
  workflow validation contract for high-risk package lanes.
- Focused fixture, extractor, or probe required before representative rerun:
  workflow tests listed in Validation.
- Bounded progress mechanism and maximum bound:
  one workflow package before runtime work resumes.
- Runtime backlog item that may activate later:
  `work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md`
- Latest active scenario proof this package reconciles with:
  selected transport-closed owner-recovery package handoff and current blocker
  generated before this package activated.

## Implementation Notes

- Keep theory refs optional for low-risk/read-only packages.
- Prefer hard validation only when a package is high-risk enough to create
  high-order regression: runtime owner-boundary, scenario release-gate,
  causal-escalation, experiment, bounded-experiment, and workflow packages
  changing tracker truth.
- The package should fail on missing cited refs when ledger context is
  available.
- The package should surface related theory candidates in `work:context`,
  `work:advance`, and `work:llm-start`.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation
end to end; one separate verifier-fixer validates the last package work and may
fix in-scope problems directly.

- [x] implementation: status: validated; evidence: implemented high-order regression gates (Gate 1 related theory, Gate 2 non-active justification, Gate 3 closure ledger link, Gate 4 successor inheritance, Gate 5 stale active theory); parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: verified all unit tests pass (616/616), validated theory ledger (4 entries), and work tracker passes pre-impl validation; changed files: scripts/work-theory-ledger.js, scripts/work-tracker.js, scripts/work-context.js, scripts/work-package-new.js, scripts/work-advance.js, test/scripts/work-theory-ledger.test.js, test/scripts/work-tracker-subagent-ledger.test.js, work/theory-ledger.md; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. `npm test -- test/scripts/work-theory-ledger.test.js test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js`
2. `npm run work:theory-ledger -- validate`
3. `npm run work:validate -- --pre-impl work/packages/active-20260523-theory-ledger-high-order-regression-gates.md`
4. `git diff --check -- scripts/work-theory-ledger.js scripts/work-tracker.js scripts/work-context.js scripts/work-package-new.js scripts/work-advance.js scripts/work-llm-start.js test/scripts/work-theory-ledger.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js test/scripts/work-package-new.test.js test/scripts/work-advance.test.js work/packages/active-20260523-theory-ledger-high-order-regression-gates.md work/packages/todo-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md work/sprints/current-blocker.md work/sprints/current-blocker.json`
