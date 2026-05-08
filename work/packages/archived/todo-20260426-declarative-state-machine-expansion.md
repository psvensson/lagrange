# Declarative State Machine Expansion

## Why

The publication recovery machine shows the maintainable target shape for
multi-signal decisions: collect evidence, normalize flags, apply one
declarative transition table, and emit one outcome.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Identify readiness, admission, retryability, phase, and lifecycle branch
   piles that should become declarative machine specs.
2. Promote one high-value runtime boundary at a time.
3. Add preflight validation that proves machine specs are declarative data.

## Out Of Scope

1. Rewriting every decision boundary in one package.
2. Adding parallel decision paths beside existing owners.

## Residual Closure Inventory

- [ ] First follow-on package names one boundary and one owner.
- [ ] Runtime and diagnostics consumers use the same machine outcome.
- [ ] Superseded local predicate tables are removed.
