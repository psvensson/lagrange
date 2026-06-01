# LLM Understandability Hardening

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "LLM repository orientation and maintainability tooling",
  "boundary": "Documentation entrypoints, owner-card navigation, command discovery, and generation guardrails",
  "dominantReason": "llm_orientation_drift",
  "currentState": "The repository has strong steering and work-tracker primitives, but agents still need to discover npm run work:context, subsystem owner boundaries, command help, and generated-rule/constant-name quality through scattered files; unrelated concurrent runtime, test, and sprint changes are outside this package.",
  "nextAction": "Make the LLM entrypoint explicit, add owner cards for major runtime directories, add command discovery, harden generated steering tests, add a focused opaque constant-name guardrail, and record only the documentation, script/tooling, package metadata, and focused test changes owned by this package.",
  "proof": [
    "npm run work:validate",
    "npm run commands",
    "npm run steering:llm:pack",
    "npm test -- test/scripts/generate-steering-llm-pack.test.js test/scripts/check-guideline-literals.test.js test/scripts/check-guideline-constant-names.test.js test/scripts/list-commands.test.js"
  ],
  "touchedFiles": [
    "AGENTS.md",
    "README.md",
    "package.json",
    "src/bootstrap/README.md",
    "src/control-plane/README.md",
    "src/partition/README.md",
    "src/query/README.md",
    "src/rebalancer/README.md",
    "src/transport/README.md",
    "src/cli/README.md",
    "scripts/check-guideline-literals.js",
    "scripts/check-guideline-constant-names.js",
    "scripts/check-scoped-ratchets.js",
    "scripts/generate-steering-llm-pack.js",
    "scripts/list-commands.js",
    "test/scripts/check-guideline-constant-names.test.js",
    "test/scripts/generate-steering-llm-pack.test.js",
    "test/scripts/list-commands.test.js"
  ],
  "predecessor": "none"
}
-->

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope and
Phase `0.5 - External Usability` developer-workflow preparation.

## In Scope

1. Make `npm run work:context` the first LLM orientation command.
2. Add owner cards for the highest-traffic runtime directories.
3. Add command discovery and `--help` handling where the prior review found
   misleading behavior.
4. Harden compact steering-pack generation against incomplete rules.
5. Add a focused guardrail for newly introduced opaque constant names.
6. Align CLI documentation with current Lagrange and AGPL public naming.
7. Record the package metadata for the documentation, script/tooling, generated
   steering, and focused test updates made by this package.

## Out Of Scope

1. Refactoring large runtime `segment` or `part` chains in this slice.
2. Changing active rebalancer blocker behavior.
3. Renaming the npm package or binary without the dedicated naming package.
4. Unrelated concurrent runtime, test, or sprint-file changes present in the
   worktree while this package was validated.

## Residual Closure Inventory

- [x] LLM entrypoint docs updated.
- [x] Runtime owner cards added for rebalancer, control-plane, bootstrap,
      query, partition, and transport.
- [x] Command discovery script and focused tests added.
- [x] Steering-pack incomplete-rule behavior has focused coverage.
- [x] Opaque constant-name guardrail has focused coverage.
- [x] CLI naming/license drift corrected at documentation level.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Lovelace` (`019e01de-97cb-7171-b249-6fc37d05f942`) performed the
      follow-up review of this completed package and found prerequisite fixes
      for LLM entrypoint steering-pack guidance, missing report/triage command
      discovery, and focused command-entry test coverage before the next LLM
      orientation package starts.
- [x] Fix subagent recorded or explicitly not needed:
      `Descartes` (`019e01e0-c702-7052-b1ba-c4125e93c8e4`) aligned
      `AGENTS.md` to load the compact LLM steering pack before full steering
      sources, added report/triage commands to `scripts/list-commands.js`, and
      strengthened `test/scripts/list-commands.test.js`.
- [x] Implementation subagent recorded:
      implementation for the follow-up boundary is recorded in
      `work/packages/active-20260507-llm-operability-follow-up-hardening.md`;
      this historical package was not reopened for runtime or feature
      implementation.

## Static Drift Ledger

Preflight:

- [x] Package scope covers documentation, script/tooling, package metadata,
      generated steering output, and focused test updates owned by this
      package.
- [x] Unrelated concurrent runtime, test, and sprint-file worktree changes are
      excluded from this package scope.
- [x] Relevant guardrails are work tracker validation, focused tests, steering
      pack generation, and command discovery.

Closure:

- [x] `npm run work:validate` passes.
- [x] Focused script tests pass.
- [x] `npm run steering:llm:pack` succeeds.
- [x] `npm run steering:llm:pack` mutates generated steering `generatedAt`
      timestamps; timestamp-only churn was restored after validation.
- [x] No unrelated dirty worktree changes are modified.

## Validation

1. `npm run work:validate`
2. `npm run commands`
3. `npm run steering:llm:pack`
4. `npm test -- test/scripts/generate-steering-llm-pack.test.js test/scripts/check-guideline-literals.test.js test/scripts/check-guideline-constant-names.test.js test/scripts/list-commands.test.js`

## Done When

1. A new LLM can identify the current blocker, owner boundaries, command set,
   and first tests without reading broad historical docs.
2. New generated steering rules and constants avoid the most confusing
   truncation and opaque-name failure modes.
