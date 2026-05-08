# External LLM Guard Subagent Cutover

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "external-llm-guard-removal",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling",
  "boundary": "guideline_guard_external_llm_cutover",
  "dominantReason": "repository_validation_calls_external_llm_api",
  "currentState": "External LLM guideline guard scripts are removed from package scripts, command discovery, and live checker files; validation points at deterministic guardrails plus mandatory spawned subagent review instead.",
  "nextAction": "Review and close the focused package slice when ready.",
  "proof": [
    "node --test test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "node --test test/scripts/check-guideline-literals.test.js test/scripts/check-guideline-decision-boundaries.test.js test/scripts/check-guideline-boundary-mode-contracts.test.js test/scripts/check-guideline-constant-names.test.js",
    "node scripts/check-guideline-literals.js --include-tests scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "node scripts/check-guideline-decision-boundaries.js --include-tests scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "node scripts/check-guideline-boundary-mode-contracts.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "node scripts/check-guideline-constant-names.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "node scripts/check-runtime-grammar-contracts.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    ".env.example",
    ".vscode/settings.json",
    "README.md",
    "package.json",
    "scripts/list-commands.js",
    "scripts/guideline-check-constants.js",
    "scripts/guideline-check-shared.js",
    "scripts/check-guidelines-llm.js",
    "scripts/check-guidelines-staged.js",
    "test/scripts/check-guidelines-llm.test.js",
    "test/scripts/list-commands.test.js",
    "test/scripts/no-external-llm-guards.test.js",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/packages/done-20260508-external-llm-guard-subagent-cutover.md"
  ],
  "predecessor": "work/packages/archived/done-20260507-llm-operability-follow-up-hardening.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Repository validation must not depend on a local API key or a network-backed
LLM service. Human/agent review should happen through the existing mandatory
subagent sequencing ledger, while local commands remain deterministic.

## Scope Basis

Approved workflow-tooling maintenance: this package removes a brittle external
validation dependency and aligns the work tracker with the already-mandatory
subagent review policy.

## In Scope

1. Remove package scripts and command discovery entries that invoke the
   external LLM guideline checker.
2. Delete or retire the external LLM checker and staged wrapper.
3. Update tests, editor settings, environment examples, and workflow
   documentation so subagent sequencing is the
   review mechanism.
4. Add a deterministic guard test proving package scripts no longer call the
   removed external LLM checker.

## Out Of Scope

1. Renaming the compact local steering pack directory.
2. Rewriting historical closed or archived package evidence.
3. Runtime control-plane behavior.

## Invariants

1. No package script may call `scripts/check-guidelines-llm.js`.
2. No staged guideline guard may call a network-backed LLM service.
3. Work-package review proof remains the Subagent Sequencing Ledger.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Jason
      (`019e090f-26db-7dc2-a8d2-cc2170f04f01`) reviewed
      `work/packages/archived/done-20260507-llm-operability-follow-up-hardening.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex
      (`019e0911-91e0-7b43-a298-1daac78b19e4`) implemented
      `work/packages/done-20260508-external-llm-guard-subagent-cutover.md`.

## Static Drift Ledger

Preflight:

- [x] Review prior workflow-tooling package before implementation starts.
- [x] Run fixes if review finds them.
- [x] Record the implementation subagent before tooling edits are made.

Implementation:

- [x] External LLM guideline checker is removed from package scripts.
- [x] Command discovery, editor settings, environment examples, and public docs
      point to deterministic guardrails and subagent review.
- [x] Focused script tests prove no external LLM guard command remains.
- [x] Work validation and diff checks pass.

## Validation Evidence

- [x] `node --test test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 76 assertions, 8 suites.
- [x] `node --test test/scripts/check-guideline-literals.test.js test/scripts/check-guideline-decision-boundaries.test.js test/scripts/check-guideline-boundary-mode-contracts.test.js test/scripts/check-guideline-constant-names.test.js`
      passed: 34 assertions, 19 suites.
- [x] `node scripts/check-guideline-literals.js --include-tests scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 0 new literal-guideline violations.
- [x] `node scripts/check-guideline-decision-boundaries.js --include-tests scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 0 decision-boundary guideline violations.
- [x] `node scripts/check-guideline-boundary-mode-contracts.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 0 boundary-mode-contract hotspot violations.
- [x] `node scripts/check-guideline-constant-names.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 0 opaque constant-name violations.
- [x] `node scripts/check-runtime-grammar-contracts.js scripts/list-commands.js scripts/guideline-check-constants.js scripts/guideline-check-shared.js test/scripts/list-commands.test.js test/scripts/no-external-llm-guards.test.js`
      passed: 0 runtime-grammar-contract violations.
- [x] `npm run work:validate` passed.
- [x] `git diff --check` passed.

## Commit And Push Ledger

- Focused package commit: cb24aea6d2a4641219baed72e2b1d7f4df3548bb
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes
