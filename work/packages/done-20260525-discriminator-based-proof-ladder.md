# Discriminator-based proof ladder

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "proof-contract-and-validator-shape",
    "currentState": "Proof ladders require '3–5 executable commands'; padding with `--check` repeats passes validation regardless of whether commands discriminate competing hypotheses.",
    "nextAction": "Replace the count-based proof rule with role-tagged proof: exactly one `falsifier` command, exactly one `regression` command, optional `supporting` commands. The validator enforces role presence, not count.",
    "dominantReason": "evidence-of-understanding-over-evidence-of-work"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/templates/work-package-template.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/templates/lightweight-maintenance-package.md",
      "scripts/work-tracker.js",
      "work/packages/active-20260525-discriminator-based-proof-ladder.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "test/scripts/work-tracker-package-doctor-ledger.test.js",
      "work/templates/epic-package.md",
      "scripts/work-package-schema.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/RULES.md",
      "work/templates/work-package-template.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/templates/lightweight-maintenance-package.md",
      "scripts/work-tracker.js",
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-discriminator-based-proof-ladder.md",
      "work/packages/active-20260525-discriminator-based-proof-ladder.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "test/scripts/work-tracker-package-doctor-ledger.test.js",
      "work/templates/epic-package.md",
      "scripts/work-package-schema.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Aligns the proof contract with the causal-reasoning shape introduced by sprint items 2 and 3, advancing the workflow-leverage-rebalance sprint goal of evidence-of-understanding over evidence-of-work; without this, discovery and epic retros still ship alongside theatre-proof ladders."
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
    "proof": [
      "regression: npm run work:validate -- --pre-impl work/packages/active-20260525-discriminator-based-proof-ladder.md",
      "supporting: git diff --check -- work/RULES.md work/templates scripts/work-tracker.js"
    ]
  }
}
-->

## Scope

- In: proof-ladder shape and validator enforcement; template updates so all
  package kinds use role-tagged proof; generated LLM testing/governance packs.
- Out: changing the contents of any closed package; tests on runtime files.

## Contract

1. Each package's `proof` array contains objects (or role-prefixed strings):
   - `falsifier`: a command whose failure proves the implementation theory wrong.
   - `regression`: a command that fails if existing behavior is broken.
   - zero or more `supporting`: lints, diffs, formatting checks.
2. The validator rejects a proof ladder missing either of the two required
   roles. Command count is not enforced.
3. `read-doc` and `lightweight-maintenance` lanes may use a `regression`-only
   ladder when no implementation theory is under test (recorded explicitly).

## Validation

1. `node scripts/work-tracker.js --validate-proof work/packages/active-20260525-discriminator-based-proof-ladder.md`
2. `npm run work:validate -- --pre-impl work/packages/active-20260525-discriminator-based-proof-ladder.md`
3. `git diff --check -- work/RULES.md work/templates scripts/work-tracker.js`

## Execution Evidence

- [x] action: implementation; owner: workflow-steering; files-changed: scripts/work-tracker.js, scripts/work-package-schema.js, .kiro/steering/schemas/work-package.schema.json, work/RULES.md, work/templates/work-package-template.md, work/templates/runtime-owner-package.md, work/templates/scenario-closure-package.md, work/templates/lightweight-maintenance-package.md, test/scripts/work-tracker-package-doctor-ledger.test.js; validation: npm run work:validate -- --pre-impl; parent revalidated focused proof: yes; outcome: validated.
- theory ledger: no ledger update

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/RULES.md`, `work/templates/work-package-template.md`, `work/templates/runtime-owner-package.md`, `work/templates/scenario-closure-package.md`, `work/templates/lightweight-maintenance-package.md`, `scripts/work-tracker.js`, `work/packages/active-20260525-discriminator-based-proof-ladder.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, a frozen decision must be reopened.
- Focused proof: `npm run work:validate -- --pre-impl work/packages/active-20260525-discriminator-based-proof-ladder.md`

