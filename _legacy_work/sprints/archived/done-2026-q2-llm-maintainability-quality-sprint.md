# LLM Maintainability And Quality Sprint

## Goal

Make the repository easier for LLM agents to maintain by giving them smaller
semantic boundaries, trustworthy static feedback, compact steering context, and
less duplicated runtime vocabulary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

This sprint is AGPL-scoped code quality and maintainability work. It does not
implement Pro or Enterprise behavior.

## Representative Gate

Primary quality gate:

1. `npm run lint`
2. `npm run test:static`

The full static gate is allowed to remain blocked by inherited dirty-worktree
runtime failures while this sprint is being opened, but every active package
must record whether its touched boundary improved, held, or worsened the
current state.

## Completed Packages

1. [LLM maintainability static baseline and tooling](../../packages/done-20260426-llm-maintainability-static-baseline-and-tooling.md)

## Queued Packages

1. [Semantic owner module decomposition](../../packages/todo-20260426-semantic-owner-module-decomposition.md)
2. [Declarative state machine expansion](../../packages/todo-20260426-declarative-state-machine-expansion.md)
3. [Runtime vocabulary owner consolidation](../../packages/todo-20260426-runtime-vocabulary-owner-consolidation.md)
4. [Guardrail authority alignment](../../packages/todo-20260426-guardrail-authority-alignment.md)
5. [LLM steering pack hardening](../../packages/todo-20260426-llm-steering-pack-hardening.md)
6. [Stale reference and dead surface cleanup](../../packages/todo-20260426-stale-reference-and-dead-surface-cleanup.md)

## Current Gate Status

1. Green: `npm run lint`, `npm run test:deps`, `npm run test:cycles`,
   `npm run steering:llm:pack`, `npm run guard:guidelines:staged`,
   `npm run audit:guideline:literals`,
   `npm run audit:guideline:decision-boundaries`, and
   `npm run audit:runtime-grammar`.
2. Blocked: `npm run test:static` stops at `npm run test:unused`.
3. Residual: `npm run test:unused` reports 73 unused files,
   `npm run test:unused:prod` reports 16 unused production dependencies, and
   `npm run test:duplication` reports 29 clone groups / 962 duplicated lines
   against the 16 / 529 baseline.

## Seven Quality Items

1. Make the fast static baseline green before new feature work.
2. Replace mechanical `segment`/`part` splitting with semantic owner modules.
3. Promote declarative state-machine specs for multi-signal decisions.
4. Consolidate duplicate runtime vocabularies behind canonical owners.
5. Make static guardrails authoritative and scope-consistent.
6. Validate compact LLM steering packs so truncated rules cannot be generated.
7. Clean stale references, dead files, and misleading imports.

## Sprint Rules

1. Do not hide guardrail failures by widening allowlists or moving files out of
   scan scope.
2. Do not start runtime decomposition while the active package is still fixing
   the quality/tooling boundary.
3. Decomposition packages must extract semantic owner boundaries, not arbitrary
   line-count fragments.
4. Every closed package must leave the touched guardrail state no worse than
   it started.
