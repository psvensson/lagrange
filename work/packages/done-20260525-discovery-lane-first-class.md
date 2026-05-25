# Discovery lane first-class

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "closed": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "lane-taxonomy-and-pre-impl-validation",
    "currentState": "Discovery framing exists only as a package-local section (Discovery Gate). High-ambiguity runtime packages can be opened without any record of route selection.",
    "nextAction": "Add a `discovery` lane to RULES.md and the lane picker; record its no-runtime-writes write scope, discriminator-output contract, and the rule that high-ambiguity runtime packages must cite a discovery predecessor or open one.",
    "dominantReason": "structural-prerequisite-for-epic-and-discriminator-work"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/templates/probe-package.md",
      "scripts/work-tracker.js",
      "work/packages/todo-20260525-discovery-lane-first-class.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/RULES.md",
      "work/templates/probe-package.md",
      "scripts/work-tracker.js",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-discovery-lane-first-class.md",
      "work/packages/todo-20260525-discovery-lane-first-class.md",
      "work/packages/active-20260525-discovery-lane-first-class.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances the workflow-leverage-rebalance sprint goal by unblocking the epic and discriminator frontiers (items 3 and 4); without a named discovery lane, lateral framing has nowhere to live in the queue and stays hidden inside individual packages."
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:lane-picker -- --discovery (new flag returns the discovery lane)",
        "npm run work:validate -- --pre-impl work/packages/todo-20260525-discovery-lane-first-class.md",
        "git diff --check -- work/RULES.md work/templates work/sprints/active-2026-q2-workflow-leverage-rebalance.md"
      ]
    }
  }
}
-->

## Scope

- In: lane taxonomy in `work/RULES.md`, lane-picker flag, probe template
  alignment, pre-impl validator rule that gates high-ambiguity runtime
  packages on a cited discovery predecessor, generated LLM packs.
- Out: runtime code, owner contracts, scenario routing, theory-ledger
  semantics (covered by item 3), proof-ladder shape (covered by item 4).

## Contract

The `discovery` lane:

1. Forbids writes outside `work/packages/active-<slug>.md`, `work/sprints/*`,
   and `work/theory-ledger.md`.
2. Requires output: selected route, rejected routes with reasons, named
   discriminator, and the successor package slug or experiment package slug.
3. Has no runtime proof; closure requires only the discriminator artifact and
   a one-line successor decision.

The pre-impl validator additionally rejects a `runtime` package when
`modelFit.ambiguityScore >= 2` unless `intent.discoveryRef` cites a closed
discovery or experiment package.

## Validation

1. `npm run work:lane-picker -- --discovery`
2. `npm run work:validate -- --pre-impl work/packages/todo-20260525-discovery-lane-first-class.md`
3. `git diff --check -- work/RULES.md work/templates/probe-package.md scripts/work-tracker.js`

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/RULES.md`, `work/templates/probe-package.md`, `scripts/work-tracker.js`, `work/packages/active-20260525-discovery-lane-first-class.md`
- Forbidden files: `src/`, `test/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:lane-picker -- --discovery`, `npm run work:validate -- --pre-impl work/packages/active-20260525-discovery-lane-first-class.md`, `git diff --check -- work/RULES.md work/templates work/sprints/active-2026-q2-workflow-leverage-rebalance.md`
- Model ledger advisory: `escalate`

## Execution Evidence

- [x] action: implementation; owner: workflow-steering; files-changed: work/RULES.md, scripts/work-lane-picker.js, scripts/work-package-schema.js, scripts/work-tracker.js, test/scripts/work-lane-picker.test.js, test/scripts/work-tracker-package-doctor-ledger.test.js; validation: npm run work:lane-picker -- --discovery && npm test -- test/scripts/work-lane-picker.test.js && npm test -- test/scripts/work-tracker-package-doctor-ledger.test.js && npm test -- test/scripts/work-context.test.js; parent revalidated focused proof: yes; outcome: validated.

