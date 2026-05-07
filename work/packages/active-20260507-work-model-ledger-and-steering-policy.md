# Work Model Ledger And Steering Policy

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "LLM repository orientation and maintainability tooling",
  "boundary": "work package model-ledger workflow, LLM ergonomics continuation, command discovery, and steering policy",
  "dominantReason": "missing_pragmatic_model_effort_feedback_loop",
  "currentState": "Strict real-subagent workflow hardening is implemented after fresh review subagent McClintock found fixes required, fresh fix subagent Avicenna corrected package bookkeeping only, and fresh implementation subagent Sagan recorded this continuation after review/fix proof. Boole's follow-up review found strict identity scanning and work-context readiness gaps; fresh fix subagent Popper corrected both without runtime or rolling-restart edits. The seven requested LLM ergonomics surfaces are implemented as diagnostics/tooling/docs/tests without runtime blocker edits; focused script tests, command checks, guideline literal and decision-boundary checks, package-scoped work validation, and broad work validation pass. Focused commit/push proof remains open.",
  "nextAction": "Commit and push the focused model-ledger/LLM-ergonomics workflow-tooling slice after final closure validation; existing package-owned dirty or untracked files are not closure proof.",
  "proof": [
    "npm test -- test/scripts/analyze-topology-convergence.test.js test/scripts/list-commands.test.js test/scripts/work-context.test.js test/scripts/check-file-size-thresholds.test.js",
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js test/scripts/model-ledger.test.js test/scripts/list-commands.test.js",
    "npm test -- test/scripts/model-ledger.test.js test/scripts/list-commands.test.js",
    "npm run commands",
    "npm run analyze:owner-decisions",
    "npm run analyze:owner-glossary",
    "npm run analyze:owner-explain -- test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.fixture.json priority",
    "npm run work:package:evidence-block -- test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.fixture.json",
    "npm run work:dirty-scope -- --package work/packages/active-20260507-work-model-ledger-and-steering-policy.md",
    "npm run audit:owner-boundary-segments -- scripts/analyze-topology-convergence.js",
    "npm run work:model-ledger -- summary",
    "node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js scripts/check-file-size-thresholds.js scripts/work-context.js scripts/list-commands.js",
    "node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js scripts/check-file-size-thresholds.js scripts/work-context.js scripts/list-commands.js",
    "npm run steering:llm:pack",
    "npm run work:validate -- work/packages/active-20260507-work-model-ledger-and-steering-policy.md",
    "npm run work:validate"
  ],
  "touchedFiles": [
    "AGENTS.md",
    "package.json",
    "scripts/model-ledger.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/check-file-size-thresholds.js",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/list-commands.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/check-file-size-thresholds.test.js",
    "test/scripts/model-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/list-commands.test.js",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/model-ledger.jsonl",
    ".kiro/steering/system guidelines.md",
    ".kiro/steering/doctrine.md",
    ".kiro/steering/roadmap.md",
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md",
    "work/packages/active-20260507-work-model-ledger-and-steering-policy.md"
  ],
  "predecessor": "work/packages/done-20260507-llm-operability-follow-up-hardening.md"
}
-->

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope and
Phase `0.5 - External Usability` developer-workflow preparation. This package
adds repository-orientation tooling only; it does not implement product,
runtime, Pro, or Enterprise behavior.

## In Scope

1. Add `npm run work:model-ledger` with `record` and `summary` commands.
2. Store model-ledger records in a clear `work/` path.
3. Capture package, model, reasoning effort, task class, outcome, validation
   status, correction loops, review findings, and notes.
4. Print aggregate summary signals with pragmatic escalate, de-escalate, or
   hold recommendations based on recent entries.
5. Add focused tests and command-discovery coverage.
6. Keep the requested LLM ergonomics continuation explicit: generated
   frontier/evidence tooling, golden frontier fixtures, dirty-scope tooling,
   owner-decision glossary/explain commands, command discovery, and generated
   package migration/evidence blocks.
7. Wire the workflow into LLM entrypoint, work docs, work-package template, and
   steering source, then regenerate compact LLM steering packs if needed.
8. Correct metadata-only work-package checklist drift when it blocks
   repository-level validation and does not touch runtime source or tests.
9. Update this active package's bookkeeping to acknowledge strict
   real-subagent sequencing continuation before any further implementation.
10. Enforce strict real-subagent sequencing proof in `npm run work:validate`.
11. Print required next subagent role/status from `npm run work:context`.
12. Preserve commit and push ledger enforcement as a closure prerequisite for
    packages closed under the current tracker workflow, without inventing proof
    for historical closed packages.

## Out Of Scope

1. Runtime blocker files and rolling-restart package/sprint implementation.
2. Replacing package validation, review subagents, or closure proof.
3. Model benchmarking infrastructure or provider-specific API integration.
4. Paid-edition behavior or control surfaces.
5. Runtime source or test edits during this strict workflow hardening
   continuation.

## Invariants

1. The ledger informs future model and effort choice; it never replaces
   validation, review, or package closure proof.
2. Recording must be explicit and auditable rather than inferred from dirty
   worktree state.
3. Summary recommendations must stay simple enough for handoff use.

## Hotspots

1. `scripts/model-ledger.js`
2. `scripts/list-commands.js`
3. `scripts/work-context.js`
4. `scripts/work-tracker.js`
5. `test/scripts/`
6. `AGENTS.md`
7. `work/README.md`
8. `work/templates/work-package-template.md`
9. `.kiro/steering/`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Gibbs (`019e035c-4846-7ef2-bcea-880fb5ecda3d`) reviewed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Noether (`019e035e-c9c9-7ee2-9e16-06b88af5fa6f`) fixed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`.
- [x] Implementation subagent recorded:
      Agent Pauli (`019e0363-b875-7151-a570-3b1e01c0b1c1`) implemented
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`.
      Sequence proof: Agent Gibbs's fixes-required review was resolved by
      Agent Noether's package-bookkeeping fix before Pauli started.

## Static Drift Ledger

Preflight:

- [x] Review and fix subagent sequence completed before implementation.
- [x] Scope is limited to docs, scripts/tooling, generated steering, tests,
      package bookkeeping, and generated package migration/evidence blocks for
      the LLM ergonomics continuation.
- [x] Existing unrelated rolling-restart runtime, test, sprint, and package
      dirty files are out of scope.

Closure:

- [x] Focused model-ledger, work-tracker, work-context, and command-discovery
      tests passed.
- [x] Command discovery validation covers the LLM ergonomics command surface.
- [x] `npm run steering:llm:pack` rerun after steering source changed.
- [x] Package-scoped `npm run work:validate --
      work/packages/active-20260507-work-model-ledger-and-steering-policy.md`
      passed.
- [x] Prior broad `npm run work:validate` passed before strict real-subagent
      and Commit And Push Ledger enforcement was added.
- [x] Current broad `npm run work:validate` rerun passes after strict workflow
      enforcement and historical closed-package proof grandfathering.
- [x] Prior broad `npm run work:validate` blocker resolved with a
      metadata-only closed-package checklist correction:
      `work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md`
      had successor-owned closure items still marked open.
- [x] No runtime blocker files were edited by this package.
- [x] Boole's strict validator and `work:context` review findings were fixed
      by Agent Popper (`019e02d5-1398-79b3-b0e5-4d222333aef7`) within the
      workflow-tooling scope.
- [x] Closure truth preserved: focused commit and push remain required, and
      existing package-owned dirty or untracked files are not Commit And Push
      Ledger proof.

## Review Finding Fix Ledger

- [x] Agent Boole (`019e02d0-53b9-7f03-847f-eaacf90ab541`) reviewed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`;
      result `fixes-required`.
- [x] Agent Popper (`019e02d5-1398-79b3-b0e5-4d222333aef7`) fixed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`.
      Scope: strict subagent ledger identity validation and `work:context`
      next-role readiness alignment.
- [x] Agent Noether (`019e035e-c9c9-7ee2-9e16-06b88af5fa6f`) fixed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`.
      Scope: package-bookkeeping-only correction for current broad validation
      truth, LLM ergonomics continuation scope/proof, and commit/push closure
      obligation.
- [x] Agent Gibbs (`019e035c-4846-7ef2-bcea-880fb5ecda3d`) reviewed
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`;
      result `fixes-required` for stale validation truth, scope/proof drift,
      and uncommitted focused-slice closure proof risk before the LLM
      ergonomics continuation.
- [x] Agent Pauli (`019e0363-b875-7151-a570-3b1e01c0b1c1`) implemented
      `work/packages/active-20260507-work-model-ledger-and-steering-policy.md`
      after Gibbs's review and Noether's fix proof were recorded.

## LLM Ergonomics Continuation Proof

- [x] Scope covers generated frontier/evidence tooling and golden frontier
      fixtures as LLM evidence-orientation surfaces, not runtime behavior
      changes.
- [x] Golden topology-convergence fixtures assert expected frontier owner,
      boundary, dominant witness, and reasons for priority workflow progress
      and active-gate snapshot coverage.
- [x] The topology diagnostics surface exposes an explicit owner decision
      table/state-machine index and canonical owner/boundary/reason/semantic
      state glossary through analyzer commands.
- [x] `npm run analyze:owner-explain` shows evidence snapshot to decision
      outcome for priority/topology evidence without changing runtime
      behavior.
- [x] `npm run work:package:evidence-block` generates package-ready
      migration/contraction evidence blocks from analyzer output.
- [x] Scope covers dirty-scope tooling, owner-decision glossary/explain
      commands, and command discovery as repository-orientation surfaces.
- [x] `npm run work:dirty-scope -- --package <package>` exposes package-owned,
      tracker-generated, and unrelated dirty entries as a focused report.
- [x] `npm run audit:owner-boundary-segments` emits owner-boundary extraction
      guidance for oversized segment files as audit output only.
- [x] Scope covers generated package migration/evidence blocks in analyzer
      output, work docs, and package templates so migrated packages carry
      current owner, boundary, evidence, and closure-proof expectations.
- [x] Proof surface is focused script tests, `npm run commands`, steering pack
      generation, model-ledger summary, package-scoped and broad
      guideline literal and decision-boundary checks, `work:validate`, and
      `git diff --check` over package-owned LLM files.

## Implementation Tasks

- [x] Add model-ledger script and npm command.
- [x] Add JSONL ledger storage under `work/`.
- [x] Add focused script tests.
- [x] Add command discovery entry and test coverage.
- [x] Update AGENTS, work docs, package template, and steering policy.
- [x] Regenerate compact LLM steering packs after steering source updates.
- [x] Enforce real-agent-id Subagent Sequencing Ledger entries.
- [x] Enforce fix `not-needed` only when review result is `clean`.
- [x] Add Commit And Push Ledger validation for closed metadata-bearing
      packages.
- [x] Add `work:context` next subagent role/status output.
- [x] Keep generated frontier/evidence tooling, golden frontier fixtures,
      dirty-scope tooling, owner-decision glossary/explain commands, command
      discovery, and generated package migration/evidence blocks in the
      explicit package scope/proof surface.
- [x] Add topology-convergence golden fixtures with expected owner, boundary,
      frontier, and dominant witness proof.
- [x] Expose owner decision table, owner glossary, owner explain, and package
      evidence block modes from the topology analyzer.
- [x] Add dirty-scope command output using the existing work-context grouping.
- [x] Add owner-boundary segment extraction guidance to the existing file-size
      audit path.

## Model Ledger

- [x] Recorded this package with `npm run work:model-ledger -- record`.
- [x] `npm run work:model-ledger -- summary` reports recent
      `workflow-tooling` entries and an `escalate` recommendation from
      historical failed-proof and correction-loop signals. This remains
      advisory and does not replace current validation.
- [x] Final package experience recorded with `validation-status passed` after
      focused tests, command checks, and package validation completed.
- [x] Prior notes record that broad `npm run work:validate` passed after a
      metadata-only package bookkeeping correction before strict validation was
      added.
- [x] Prior model-ledger history recorded this strict workflow hardening
      continuation with validation status `failed`; current package-scoped and
      broad `work:validate` reruns now pass, so closure status must use current
      validation plus focused commit/push proof rather than the stale advisory
      history alone.

## Residual Tasks Before Implementation

- [x] Record McClintock's fresh continuation review result as
      `fixes-required`.
- [x] Record Avicenna's fresh fix subagent package-bookkeeping correction.
- [x] Record Sagan as the fresh separate implementation subagent after
      review/fix proof.
- [x] Preserve closure expectation that the model-ledger package slice is
      committed and pushed with only package-owned changes.
- [x] Record that existing package-owned untracked files are not closure proof;
      Commit And Push Ledger proof remains a closure obligation.

## Validation

1. `npm test -- test/scripts/analyze-topology-convergence.test.js test/scripts/list-commands.test.js test/scripts/work-context.test.js test/scripts/check-file-size-thresholds.test.js`
2. `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js test/scripts/model-ledger.test.js test/scripts/list-commands.test.js`
3. `npm run commands`
4. `npm run analyze:owner-decisions`
5. `npm run analyze:owner-glossary`
6. `npm run analyze:owner-explain -- test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.fixture.json priority`
7. `npm run work:package:evidence-block -- test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.fixture.json`
8. `npm run work:dirty-scope -- --package work/packages/active-20260507-work-model-ledger-and-steering-policy.md`
9. `npm run audit:owner-boundary-segments -- scripts/analyze-topology-convergence.js`
10. `npm run steering:llm:pack`
11. `node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js scripts/check-file-size-thresholds.js scripts/work-context.js scripts/list-commands.js`
12. `node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js scripts/check-file-size-thresholds.js scripts/work-context.js scripts/list-commands.js`
13. `npm run work:model-ledger -- summary`
14. `npm run work:validate -- work/packages/active-20260507-work-model-ledger-and-steering-policy.md`
15. `npm run work:validate`
16. `git diff --check -- package.json scripts/analyze-topology-convergence.js scripts/check-file-size-thresholds.js scripts/list-commands.js scripts/work-context.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js test/scripts/check-file-size-thresholds.test.js test/scripts/list-commands.test.js test/scripts/work-context.test.js work/README.md work/templates/work-package-template.md work/packages/active-20260507-work-model-ledger-and-steering-policy.md`

## Done When

1. Maintainers can record explicit model-ledger entries for a package.
2. Maintainers can summarize recent model-ledger signals and see a simple
   effort recommendation.
3. The workflow is discoverable from npm scripts, command discovery, AGENTS,
   work docs, package templates, and steering.
4. Active package validation rejects non-real subagent identities and invalid
   review/fix sequencing.
5. Closed metadata-bearing package validation requires commit and push proof.
6. Focused validations, package-scoped `work:validate`, and broad
   `work:validate` pass.
7. The package is not renamed to `done-...` until Commit And Push Ledger proof
   exists for a focused package-owned commit pushed to a recorded remote/branch.
