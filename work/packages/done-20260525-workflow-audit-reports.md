# Workflow audit reports

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
    "boundary": "workflow-feedback-loop",
    "currentState": "No measurement of ceremony cost vs. learning yield. Validator literals, audit-worthy sibling clusters, and ledger-rate are not surfaced; the workflow has no feedback signal to detect regression toward ceremony.",
    "nextAction": "Add three audit commands suitable for monthly review: (a) packages with no theory-ledger ref and no runtime files changed; (b) sibling packages sharing >=80% writeScope path prefix (epic candidates); (c) validator phrases/fields that have never produced a useful rejection.",
    "dominantReason": "measure-or-drift"
  },
  "scope": {
    "writeScope": [
      "scripts/work-audit-ceremony.js",
      "scripts/work-audit-siblings.js",
      "scripts/work-audit-validator-coverage.js",
      "package.json",
      "work/RULES.md",
      "work/packages/done-20260525-workflow-audit-reports.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-audit-ceremony.js",
      "scripts/work-audit-siblings.js",
      "scripts/work-audit-validator-coverage.js",
      "package.json",
      "work/RULES.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-workflow-audit-reports.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Closes the feedback loop for sprint items 3 and 5 and advances the workflow-leverage-rebalance sprint goal of measurable ceremony-vs-learning yield; without measurement the workflow drifts back toward ceremony past the sprint frontier."
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
        "node scripts/work-audit-ceremony.js --since 2026-05-01",
        "node scripts/work-audit-siblings.js --threshold 0.8",
        "node scripts/work-audit-validator-coverage.js",
        "git diff --check -- scripts/work-audit-*.js package.json work/RULES.md"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "scripts/work-audit-ceremony.js",
        "scripts/work-audit-siblings.js",
        "scripts/work-audit-validator-coverage.js",
        "package.json",
        "work/RULES.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "theoryLedger": "no-ledger-update"
  }
}
-->

## Scope

- In: three audit scripts, npm aliases (`work:audit:ceremony`,
  `work:audit:siblings`, `work:audit:validators`), short RULES.md note on
  expected cadence (monthly) and how to action findings.
- Out: enforcing audit results in CI; auto-superseding packages from audit
  output (that requires a separate package that owns the supersede grammar).

## Contract

1. `work:audit:ceremony` lists closed packages in a date window that have
   `theoryLedgerRefs: []` AND no files under `src/` in `writeScope`. Output:
   slug, owner, lane, link.
2. `work:audit:siblings` clusters closed packages whose `writeScope` shares
   a path prefix above a configurable threshold (default 0.8). Output:
   cluster slug suggestion and member slugs. These are epic-merge candidates
   for retrospective consolidation.
3. `work:audit:validators` scans the validator source and a sample of closed
   packages for literal phrases/fields. Output: which gates have ever caused
   a rejection in the audit window (best-effort via git history of package
   diffs) and which have not.

Each command exits 0 with a human-readable report; CI use is out of scope.

## Validation

1. `node scripts/work-audit-ceremony.js --since 2026-05-01`
2. `node scripts/work-audit-siblings.js --threshold 0.8`
3. `node scripts/work-audit-validator-coverage.js`
4. `git diff --check -- scripts/work-audit-*.js package.json work/RULES.md`

## Execution Evidence

- [ ] action: implementation; owner: workflow-steering; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
