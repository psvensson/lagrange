# Structured validator front-matter

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "closure-evidence-grammar",
    "currentState": "Closure validation requires literal phrases such as `parent revalidated focused proof: yes` and `theory ledger: no ledger update`. Rewording the surrounding prose can break closure even when reasoning is sound.",
    "nextAction": "Add a parsed front-matter `execution` block (YAML/JSON) carrying the same fields the validator reads today; keep the human-readable Execution Evidence section but treat it as documentation, not as a grep target.",
    "dominantReason": "ceremony-reduction-without-weakening-guardrails"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "scripts/work-tracker.js",
      "work/templates/work-package-template.md",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/templates/doc-only-package.md",
      "work/templates/probe-package.md",
      "work/packages/todo-20260525-structured-validator-front-matter.md"
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
      "scripts/work-tracker.js",
      "work/templates/work-package-template.md",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/templates/doc-only-package.md",
      "work/templates/probe-package.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-structured-validator-front-matter.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Sprint goal item: removes a class of false-negative closures and is a prerequisite for the work:close automation (sprint item 7) reading structure instead of grepping prose; advances the workflow-leverage-rebalance frontier without weakening gates."
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
        "node scripts/work-tracker.js --validate-execution work/packages/todo-20260525-structured-validator-front-matter.md",
        "npm run work:validate -- --closure (dry-run against a fixture package)",
        "git diff --check -- work/RULES.md scripts/work-tracker.js work/templates"
      ]
    }
  }
}
-->

## Scope

- In: a structured `execution` block parsed by `scripts/work-tracker.js`
  alongside the existing `work-package` block; closure validator reads
  structured fields; templates emit both blocks.
- Out: changing already-closed packages (the grep grammar continues to work
  for historical packages until a separate migration package retires it).

## Contract

The closure validator accepts EITHER:

1. The existing literal-phrase Execution Evidence (legacy compat), OR
2. An `execution` front-matter block of the shape:
   ```
   {
     "implementation": { "parentRevalidatedFocusedProof": true, "filesChanged": [...] },
     "verificationFix": { "parentRevalidatedFocusedProof": true },
     "repair": { "validationCommand": "npm run work:repair" },
     "theoryLedger": "no-ledger-update" | "theory-YYYYMMDD-slug"
   }
   ```

When both are present, the structured block wins. A follow-up package may
retire the legacy grammar once all open `todo-*` and `active-*` packages have
adopted the structured block.

## Validation

1. `node scripts/work-tracker.js --validate-execution work/packages/todo-20260525-structured-validator-front-matter.md`
2. `npm run work:validate -- --closure` against a fixture package using the
   structured block; expect `Work tracker validation OK`.
3. `git diff --check -- work/RULES.md scripts/work-tracker.js work/templates`

## Execution Evidence

- [ ] action: implementation; owner: workflow-steering; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
