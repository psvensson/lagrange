---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** System-table mutation requirements and test-only code path rules. Index: [`INDEX.md`](INDEX.md).

# Testing — Fixtures & Mutation Requirements

## System-Table Mutation Test Requirements

For any change that affects writes to `services`, `nodes`, `partitions`,
`tables`, or another system table with shared ownership:

1. Add or update a unit test for the direct writer/owner path.
2. Add or update one integration test that verifies the resulting row becomes
   visible through `SystemTableCache` on the relevant node or nodes.
3. When the mutation is lifecycle-related, assert both:
   - the initial row exists with canonical identity fields
   - later transitions preserve owner boundaries and do not recreate or replace
     the row

Do not rely on a broad scenario test alone when the bug is in a narrow
system-table write path.

## No Skipped Tests Policy

Tests must never be skipped. Every test that exists must run and pass.

- **Do not use** `.skip()`, `skip:`, `xit()`, `xdescribe()`, or any skip mechanism
- **Do not comment out** tests to avoid running them
- If a test is failing, fix the code or the test - do not skip it
- If a test is no longer relevant, remove it entirely rather than skipping

## No Test-Only Code Paths in Production Code

**Production code must never contain alternate code paths, branches, or
special-case logic that exist solely to make tests pass.**

Tests must exercise the real production code paths. If a test cannot be written
against the existing code, that is a signal to improve the design — not to add
a test-specific backdoor.

It is FORBIDDEN to:

- Add `if (process.env.NODE_ENV === 'test')` or similar environment checks
  that change runtime behavior for tests.
- Introduce optional parameters, flags, or configuration that are only used by
  test harnesses to bypass real logic.
- Create alternate constructors, factory methods, or initialization paths that
  only tests call.
- Weaken validation, skip steps, or short-circuit logic to make a test
  scenario easier to set up.
- Export internal implementation details solely so tests can reach them.

If production code is hard to test, fix the design:

1. **Extract and inject** - Break the hard-to-test dependency out and inject it
   so tests can supply a controlled substitute.
2. **Narrow the interface** - If a component does too much, split it so each
   piece is independently testable through its public contract.
3. **Use the real path** - Set up the test to exercise the same code path that
   production uses, even if setup is more involved.

The test suite must prove that production code works — not that a
test-friendly fork of it works.

## System Guideline Conformance Gate for New and Existing Tests

When adding new tests or changing existing tests for production code, you must
also audit the code under test for System Guidelines violations and fix them as
part of the same change. This requirement applies equally to new test files and
edits to existing test files.

Required workflow:

1. Identify the production files touched by the new or modified test and their
   direct owner collaborators.
2. Check those files against `.kiro/steering/system-guidelines.md` with special
   focus on:
   - owner dependency routing
   - duplicate logic and fallback paths
   - single source of truth for state and row-field ownership
3. If you find a violation, add a failing regression that captures it and fix
   the production code before closing the test task.
4. Do not land a test-only change that leaves a known System Guidelines
   violation in the code path being tested.
5. In test descriptions, name the owner path being verified (for example
   "uses `storageAdmissionService.checkSplit`" or
   "refreshes via `setRebalanceCoordinator`").
6. For CDC-replicated system-table lifecycle changes, include at least one
   regression that fails when writes are keyed by non-primary predicates instead
   of canonical primary key.

