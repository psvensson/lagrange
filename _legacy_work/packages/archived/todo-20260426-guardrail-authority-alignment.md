# Guardrail Authority Alignment

## Why

The static gates currently have overlapping but different scan scopes. A narrow
ratchet can pass while a broader configured static gate fails. LLM agents need
one authoritative explanation for which green signal proves which boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Align or clearly distinguish `test:cycles` and `test:deps` cycle coverage.
2. Make ignored lint scopes intentional and recorded.
3. Add package-level guidance for file-scoped guardrails when repo-wide checks
   are red.

## Out Of Scope

1. Weakening guardrails to make current debt disappear.
2. Moving files out of scan scope without a named owner and expiry condition.

## Residual Closure Inventory

- [ ] One command or document states the authoritative graph gate.
- [ ] Any narrower ratchet explains its scan scope in output.
- [ ] CI/static scripts do not silently contradict each other.
