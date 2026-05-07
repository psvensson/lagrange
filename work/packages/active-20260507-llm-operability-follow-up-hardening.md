# LLM Operability Follow-Up Hardening

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "LLM repository orientation and maintainability tooling",
  "boundary": "LLM handoff, command discovery, generated steering, and work-context triage",
  "dominantReason": "llm_operability_review_findings",
  "currentState": "The follow-up review findings are implemented locally across LLM entrypoint guidance, command discovery, work-context first-read/triage output, dirty worktree grouping, file-scoped runtime-grammar audit discovery, and generated compact steering completeness. The package remains active because the repository already contains unrelated active runtime package changes, so this slice has not been committed or pushed separately.",
  "nextAction": "When the unrelated runtime package worktree can be separated safely, commit and push only this package-owned LLM operability slice, then rename this package to done.",
  "proof": [
    "npm run commands",
    "npm run work:context",
    "npm run work:validate",
    "npm run steering:llm:pack",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z.report.json --scenario rolling-restart",
    "npm run audit:runtime-grammar:file -- src/bootstrap/owners/bootstrap-request-owner.js",
    "npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z/rolling-restart/failure-bundle.json",
    "npm test -- test/scripts/work-context.test.js test/scripts/generate-steering-llm-pack.test.js test/scripts/list-commands.test.js",
    "git diff --check -- package-owned LLM files"
  ],
  "touchedFiles": [
    "AGENTS.md",
    "package.json",
    "scripts/work-context.js",
    "scripts/list-commands.js",
    "scripts/generate-steering-llm-pack.js",
    "test/scripts/work-context.test.js",
    "test/scripts/list-commands.test.js",
    "test/scripts/generate-steering-llm-pack.test.js",
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    "work/packages/done-20260507-llm-understandability-hardening.md",
    "work/packages/active-20260507-llm-operability-follow-up-hardening.md"
  ],
  "predecessor": "work/packages/done-20260507-llm-understandability-hardening.md"
}
-->

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope and
Phase `0.5 - External Usability` developer-workflow preparation.

## In Scope

1. Align LLM entrypoint guidance around the compact steering pack.
2. Make report and topology triage commands discoverable.
3. Make the runtime-grammar command list advertise a file-scoped npm script
   while preserving the broad audit used by static gates.
4. Make `work:context` show useful triage commands before raw artifacts,
   include relevant compact steering packs, include owner cards, include
   playback evidence paths, and classify dirty worktree state.
5. Fix generated compact steering output that loses context-dependent
   antecedents such as `docs/`.
6. Add focused tests for command discovery, steering generation, and
   work-context handoff behavior.

## Out Of Scope

1. Runtime rolling-restart blocker behavior.
2. Refactoring large runtime `segment` or `part` files.
3. Committing or pushing a mixed slice while unrelated active runtime package
   changes are dirty in the worktree.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Lovelace` (`019e01de-97cb-7171-b249-6fc37d05f942`) reviewed
      `work/packages/done-20260507-llm-understandability-hardening.md` on the
      LLM repository orientation and maintainability boundary; result
      `fixes-required` for command discovery, compact steering guidance,
      playback/report handoff, report-summary steering coverage, and prior
      sequencing proof.
- [x] Fix subagent recorded or explicitly not needed:
      `Descartes` (`019e01e0-c702-7052-b1ba-c4125e93c8e4`) performed the
      prerequisite fix pass before follow-up implementation by aligning
      `AGENTS.md` with compact steering-pack guidance, adding report/triage
      commands to `scripts/list-commands.js`, strengthening
      `test/scripts/list-commands.test.js`, and recording the predecessor
      package ledger.
- [x] Implementation subagent recorded:
      `Schrodinger` (`019e01e4-08c1-75e3-bd0e-0044914ec187`) implemented the
      follow-up package after the review/fix ledger was clean, with ownership
      limited to LLM orientation docs, command discovery, work-context tooling,
      generated steering, and focused script tests. The parent Codex session
      then tightened the playback topology command to use
      `failure-bundle.json` and added testing-pack plus playback first-read
      coverage without touching runtime blocker files.

## Residual Closure Inventory

- [x] LLM entrypoint docs prefer compact steering packs over full steering
      sources by default.
- [x] Command discovery includes report/triage commands.
- [x] Runtime-grammar command discovery points at the file-scoped npm script.
- [x] `work:context` emits compact steering, owner-card, playback evidence,
      report/triage command, and dirty-worktree grouping handoff data.
- [x] Generated compact steering keeps context for the `docs/` rule.
- [x] Focused tests cover the changed script behavior.
- [ ] Focused package commit and push are intentionally deferred until this
      package-owned slice can be separated from unrelated active runtime
      package dirty files.

## Static Drift Ledger

Preflight:

- [x] Review and fix subagent sequence completed before implementation.
- [x] Scope is limited to docs, scripts/tooling, generated steering, tests, and
      package bookkeeping.
- [x] Existing unrelated rolling-restart runtime, test, sprint, and package
      dirty files are out of scope.

Closure:

- [x] Focused script tests passed.
- [x] `npm run work:validate` passed after the package ledger was added.
- [x] `git diff --check` passed for the package-owned LLM files.
- [ ] Focused commit and push not performed because unrelated active runtime
      package changes are still dirty in the same worktree.

## Validation

1. `npm run commands`
2. `npm run work:context`
3. `npm run steering:llm:pack`
4. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z.report.json --scenario rolling-restart`
5. `npm run audit:runtime-grammar:file -- src/bootstrap/owners/bootstrap-request-owner.js`
6. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z/rolling-restart/failure-bundle.json`
7. `npm test -- test/scripts/work-context.test.js test/scripts/generate-steering-llm-pack.test.js test/scripts/list-commands.test.js`
8. `git diff --check -- AGENTS.md package.json scripts/work-context.js scripts/list-commands.js scripts/generate-steering-llm-pack.js test/scripts/work-context.test.js test/scripts/list-commands.test.js test/scripts/generate-steering-llm-pack.test.js .kiro/steering/llm/README.md .kiro/steering/llm/core.md .kiro/steering/llm/governance.md .kiro/steering/llm/manifest.json .kiro/steering/llm/rules.json work/packages/done-20260507-llm-understandability-hardening.md work/packages/active-20260507-llm-operability-follow-up-hardening.md`
