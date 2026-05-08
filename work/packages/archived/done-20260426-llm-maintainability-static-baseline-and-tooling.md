# LLM Maintainability Static Baseline And Tooling

## Why

The repository has strong LLM-facing doctrine, but the fast quality feedback
loop is not currently trustworthy enough for agents to rely on it. Lint,
duplication, unused-file, dependency, and scalar guardrails report current
failures, and the compact steering pack can emit incomplete extracted rules.

This package opened the LLM maintainability sprint by fixing the low-risk
quality/tooling seams first.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Add validation for generated LLM steering pack rules.
2. Fix stale reference paths and empty imports that mislead code search.
3. Align the cycle/graph guardrail story enough that the current mismatch is
   explicit.
4. Record the remaining static baseline failures as sprint-owned residuals.

## Out Of Scope

1. Broad runtime owner decomposition.
2. Large test harness decomposition.
3. Rewriting priority recovery or admin snapshot contracts.
4. Pro or Enterprise feature work.

## Primary Boundary

Semantic owner: quality tooling and steering generation.

Canonical contract shape: one generated compact steering pack must contain only
complete standalone rule text, and quality scripts must not disagree silently
about what they scan.

Allowed consumers: repository agents, preflight scripts, package validation,
and sprint status documents.

Prohibited reinterpretations: callers must not treat a narrower green ratchet
as proof that a broader configured static gate is green.

## Static Drift Ledger

Preflight:

- [x] `npm run lint` fails with existing worktree lint errors.
- [x] `npm run audit:guideline:literals` reports 5 new literal violations and
      6194 inherited baseline matches.
- [x] `npm run test:duplication` fails with 29 clone groups and 962 duplicated
      lines against a 16/529 baseline.
- [x] `npm run test:cycles` passes on its `src,scripts` scan scope.
- [x] `npm run test:deps` fails on a test scenario cycle.
- [x] `npm run test:unused` reports unused files, unresolved imports, and
      unlisted dependencies.

Closure:

- [x] Touched tooling tests pass.
- [x] Generated LLM steering pack rejects incomplete rule text.
- [x] Stale imports and references touched by this package are corrected.
- [x] Remaining broad failures are linked to queued packages.

## Residual Closure Inventory

- [x] Owner-path cutovers are complete for steering-pack validation.
- [x] Guardrail status is explicit and non-contradictory for the touched tools.
- [x] Superseded stale references touched by this package are deleted.
- [x] Remaining broad refactor work stays in queued sprint packages.

## Validation

1. `node --test test/scripts/generate-steering-llm-pack.test.js` passes.
2. `npm run steering:llm:pack` passes.
3. `npm run guard:guidelines:staged` passes.
4. `npm run lint` passes.
5. `npm run audit:guideline:literals` passes with 0 new violations and 6191
   inherited baseline matches.
6. `npm run audit:guideline:decision-boundaries` passes.
7. `npm run audit:runtime-grammar` passes.
8. `npm run test:deps` passes.
9. `npm run test:cycles` passes on `src`, `scripts`, and `test`.
10. `npm run test:complexity:cognitive` passes at 141/144 violations.
11. `npm run test:static` remains blocked at `npm run test:unused`.
12. `npm run test:unused` fails with 73 unused files and 3 configuration
    hints.
13. `npm run test:unused:prod` fails with 16 unused production dependencies.
14. `npm run test:duplication` fails with 29 clone groups and 962 duplicated
    lines against the 16/529 baseline.

## Executed Changes

1. Added parser coverage for generated LLM steering-pack rules with nested
   child bullets and colon-ended parent rules.
2. Made steering-pack generation import-safe for direct parser tests and
   rejected incomplete colon-ended rule text.
3. Regenerated `.kiro/steering/llm/` from the validated pack generator.
4. Corrected stale query JSDoc paths and removed empty production imports.
5. Added explicit parser dependencies used by local static tooling.
6. Expanded the cycle ratchet to include test code and broke the
   `postgres-baseline-comparison` scenario back edge by injecting the
   load-rebalancing helpers from the later load-phase owner.
7. Made the current lint baseline green by applying ESLint fixes to the
   reported files and resolving the remaining unused/undefined symbols.

## Done When

1. The compact steering pack cannot generate truncated rule entries.
2. Obvious stale references and empty imports found during preflight are gone.
3. Static guardrail scope mismatches are either fixed or explicitly queued.
4. The sprint document links the remaining quality packages.
