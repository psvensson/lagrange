# Runtime Vocabulary Owner Consolidation

## Why

Admin snapshot and priority recovery code duplicate status, field, and reason
vocabulary. Duplicate local constants reduce the value of the scalar-owner
contract because an LLM can update one copy while consumers keep using another.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Consolidate priority recovery, admin snapshot, and publication diagnostics
   vocabulary behind canonical owner modules.
2. Replace duplicated local literals with owner imports.
3. Keep file-private constants only when they are truly private to one file.

## Out Of Scope

1. Blind promotion of every private helper scalar into shared constants.
2. Test fixture literal churn unrelated to shared runtime vocabulary.

## Residual Closure Inventory

- [ ] Shared status and field vocabularies have one owner.
- [ ] Consumers import the owner vocabulary.
- [ ] Literal guardrail count does not increase.
