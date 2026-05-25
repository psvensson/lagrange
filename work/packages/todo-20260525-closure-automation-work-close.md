# Closure automation work:close

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
    "boundary": "closure-recipe-automation",
    "currentState": "Closure Recipe steps 4–7 are four manual operations (mv, sed status, sed sprint link, git add of commitScope). Sprint-queue renumbering is explicitly manual; `work:repair` does not renumber.",
    "nextAction": "Add `npm run work:close` that reads the active package's structured front-matter (item 5), performs rename, status flip, sprint-link rewrite, sprint-queue renumber on insert/remove, and stages exactly the commitScope plus tracker-generated handoff files. Refuses to run if `--closure` validation has not passed.",
    "dominantReason": "manual-step-elimination"
  },
  "scope": {
    "writeScope": [
      "scripts/work-close.js",
      "scripts/work-tracker.js",
      "package.json",
      "work/RULES.md",
      "work/packages/todo-20260525-closure-automation-work-close.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-close.js",
      "scripts/work-tracker.js",
      "package.json",
      "work/RULES.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-closure-automation-work-close.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Closure is run at the end of every package, so saving four manual calls per close compounds quickly and removes the main source of stray staging at the sprint goal level; advances the workflow-leverage-rebalance frontier and depends on the structured front-matter sprint item."
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
        "node scripts/work-close.js --dry-run work/packages/active-<fixture>.md",
        "npm run work:validate -- --pre-impl work/packages/todo-20260525-closure-automation-work-close.md",
        "git diff --check -- scripts/work-close.js scripts/work-tracker.js package.json work/RULES.md"
      ]
    }
  }
}
-->

## Scope

- In: a `work:close` script and npm alias; sprint-queue renumber inside
  `work:repair` (or `work:close`) on insert/remove; RULES.md Closure Recipe
  updated to point at the script while preserving the underlying contract.
- Out: changing what evidence the validator requires; runtime code.

## Contract

`npm run work:close work/packages/active-<slug>.md`:

1. Refuses if `npm run work:validate -- --closure <path>` has not passed in
   this invocation (the script runs it itself).
2. Renames `active-<slug>.md` → `done-<slug>.md` and flips the status field
   in the structured front-matter.
3. Rewrites every `active-<slug>` reference in the active sprint file to
   `done-<slug>`.
4. Renumbers the sprint queue if the closed package was the last open item
   or if a previously removed/superseded item left a gap.
5. Stages exactly the `commitScope` paths plus
   `work/sprints/current-blocker.{json,md}` and the active sprint file.
   Refuses to stage anything else.

Dependency: this script reads structured front-matter, so item 5 must close
first (or the script must include a legacy reader marked deprecated).

## Validation

1. `node scripts/work-close.js --dry-run work/packages/active-<fixture>.md`
2. `npm run work:validate -- --pre-impl work/packages/todo-20260525-closure-automation-work-close.md`
3. `git diff --check -- scripts/work-close.js scripts/work-tracker.js package.json work/RULES.md`

## Execution Evidence

- [ ] action: implementation; owner: workflow-steering; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
