# Title

## Why

Describe the problem being solved.

## Scope Basis

Link the roadmap row, or state the approved existing subsystem / maintenance
scope that makes this work package valid without a roadmap change.

## In Scope

1. Item
2. Item
3. Item

## Out Of Scope

1. Item
2. Item
3. Item

## Invariants

1. Correctness rule that must not regress.
2. Ownership or architecture rule that must not regress.
3. Validation rule that must not regress.

## Hotspots

1. File or subsystem
2. File or subsystem
3. File or subsystem

## Detection / Analysis Tasks

- [ ] Build the concern inventory.
- [ ] Build the semantic-question matrix.
- [ ] Detect duplicate ownership.
- [ ] Detect implicit state machines.
- [ ] Detect branch lattices.

## Implementation Tasks

- [ ] Add guardrail tests first.
- [ ] Collapse to one canonical owner path.
- [ ] Remove or wrap parallel paths.
- [ ] Tighten static guardrails.

## Validation

1. Targeted unit tests.
2. Targeted integration tests.
3. Distributed harness scenarios.
4. Complexity and dependency checks.

## Done When

1. The canonical owner/path is in place.
2. Parallel implementations are removed or downgraded.
3. Required tests pass.
4. Follow-up work, if any, is split into new idea or package files.
