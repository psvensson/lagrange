# Epic package construct

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "package-kinds-and-closure-grammar",
    "currentState": "Sibling leaves (e.g. 10+ `*-modularization-*` packages) close atomically but the set has no retrospective. Theory-ledger updates are ~1% of closed packages because every leaf is judged mechanical in isolation.",
    "nextAction": "Introduce an `epic` package kind that owns a set of sibling leaves under one causal question and one discriminator. Leaves cite the parent and skip theory-ledger ceremony; the epic-close step requires a retrospective answering 'what surprised us since lane-pick?'.",
    "dominantReason": "anti-fragmentation-structural-change"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/templates/epic-package.md",
      "work/templates/work-package-template.md",
      "scripts/work-tracker.js",
      "work/packages/active-20260525-epic-package-construct.md"
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
      "work/templates/epic-package.md",
      "work/templates/work-package-template.md",
      "scripts/work-tracker.js",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-epic-package-construct.md",
      "work/packages/active-20260525-epic-package-construct.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Highest-leverage sprint goal move against micro-fragmentation; required before item 8 audits become meaningful (audits that flag epic candidates are only useful once the construct exists). Anchors the workflow-leverage-rebalance frontier."
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
        "node scripts/work-tracker.js --kind epic --dry-run work/packages/todo-20260525-epic-package-construct.md",
        "npm run work:validate -- --pre-impl work/packages/todo-20260525-epic-package-construct.md",
        "git diff --check -- work/RULES.md work/templates scripts/work-tracker.js"
      ]
    }
  }
}
-->

## Scope

- In: a new `epic` package kind with one shared causal question, one shared
  discriminator, and a retrospective-required closure; leaf packages gain an
  optional `epicRef` field; validator allows leaves with `epicRef` to omit
  individual theory-ledger reasoning.
- Out: changing the meaning of `sprint`, changing existing `done-*` package
  contents, runtime code.

## Contract

1. An epic declares: shared causal question, expected leaf set (slugs may be
   added during execution), shared discriminator, stop rule.
2. Leaves under an epic cite `epicRef` and inherit the discriminator; their
   closure does not require an individual theory-ledger decision.
3. Epic closure requires a `## Retrospective` section answering:
   - What did we learn that we could not have predicted at lane-pick time?
   - Did the discriminator hold for every leaf, or did any leaf reveal a
     different cut?
   - Theory-ledger update yes/no (with rationale if no).
4. Three consecutive epics closing with "no ledger update" trigger an audit
   warning (consumed by item 8).

## Validation

1. `node scripts/work-tracker.js --kind epic --dry-run work/packages/todo-20260525-epic-package-construct.md`
2. `npm run work:validate -- --pre-impl work/packages/todo-20260525-epic-package-construct.md`
3. `git diff --check -- work/RULES.md work/templates scripts/work-tracker.js`

## Execution Evidence

- [ ] action: implementation; owner: workflow-steering; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
