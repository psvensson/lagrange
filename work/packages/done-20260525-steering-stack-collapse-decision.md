# Steering stack collapse decision

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
    "boundary": "llm-steering-surface",
    "currentState": "Four steering layers (AGENTS.md, generated packs, source steering, rules.json) coexist. Humans edit source steering, LLMs read packs, and `steering:llm:pack` regeneration is a manual step — drift is possible between any two layers.",
    "nextAction": "Decide and document the canonical LLM-facing surface (packs OR source, not both for LLM reads), then add a CI check that `steering:llm:pack` produces no diff. No new layers; one layer may be removed from the load order.",
    "dominantReason": "drift-loop-closure"
  },
  "scope": {
    "writeScope": [
      "AGENTS.md",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/llm/boot.md",
      "scripts/generate-steering-llm-pack.js",
      "package.json",
      "work/packages/done-20260525-steering-stack-collapse-decision.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "AGENTS.md",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/llm/boot.md",
      "scripts/generate-steering-llm-pack.js",
      "package.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-steering-stack-collapse-decision.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Reliable LLM handoff is the stated goal of the prior steering sprint; the drift loop undermines that goal. Cheap to close once items 2–5 stabilize the contracts the packs encode."
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
    "theoryLedgerRefs": [
      "theory-20260525-steering-stack-collapse-decision"
    ],
    "proof": {
      "commands": [
        "npm run steering:llm:pack && git diff --quiet -- .kiro/steering/llm",
        "npm run work:validate -- --pre-impl work/packages/done-20260525-steering-stack-collapse-decision.md",
        "git diff --check -- AGENTS.md .kiro/steering scripts/generate-steering-llm-pack.js"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "AGENTS.md",
        "package.json",
        "work/theory-ledger.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "theoryLedger": "theory-20260525-steering-stack-collapse-decision"
  }
}
-->

## Scope

- In: the decision (packs vs. source as canonical LLM surface), AGENTS.md
  load order to reflect it, generator script invariants, and a
  `steering:check` npm script that fails CI if regeneration would produce a
  diff.
- Out: rewriting steering content; collapsing source steering folder
  structure (a separate package if needed after the decision lands).

## Decision Criteria

- Packs win if: pack size remains small enough for default LLM context budget,
  source files are rarely consulted directly, generator stability is high.
- Source wins if: humans need to read what LLMs read, generator drift has
  caused incidents, or packs grow past a per-file cap.

Record the decision and its falsifier in `work/theory-ledger.md` as a real
ledger entry (this package is one of the few that *should* produce one).

## Validation

1. `npm run steering:llm:pack && git diff --quiet -- .kiro/steering/llm`
2. `npm run work:validate -- --pre-impl work/packages/todo-20260525-steering-stack-collapse-decision.md`
3. `git diff --check -- AGENTS.md .kiro/steering scripts/generate-steering-llm-pack.js`

## Execution Evidence

- [ ] action: implementation; owner: workflow-steering; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
