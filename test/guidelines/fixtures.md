---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
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

Tests must never be skipped. Every test selected by the relevant targeted or
suite command must run and pass; no selected test may be hidden by a skip
mechanism. This does not require the complete suite during each iteration: use
the targeted/full-suite schedule in `harness.md` "Test Execution Strategy" and
"When to Run Full Test Suite".

- **Do not use** `.skip()`, `skip:`, `xit()`, `xdescribe()`, or any skip mechanism
- **Do not comment out** tests to avoid running them
- If a test is failing, fix the code or the test - do not skip it
- If a test is no longer relevant, remove it entirely rather than skipping. "No
  longer relevant" means the behavior it covered was *intentionally removed* — a
  test that fails because behavior regressed MUST be fixed, never deleted to make
  the suite green.

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

A controlled substitute may isolate a dependency without changing the owner
contract. Cite which real entry path and production owner the fixture exercises,
what it substitutes, and the resulting evidence ceiling. A fixture-only success
cannot prove native execution or independent physical failure domains.

If production code is hard to test, choose the smallest justified design repair:

1. **Extract and inject** - Break the hard-to-test dependency out and inject it
   so tests can supply a controlled substitute.
2. **Narrow the interface** - If a component does too much, split it so each
   piece is independently testable through its public contract.
3. **Use the real path** - Set up the test to exercise the same code path that
   production uses, even if setup is more involved.

The test suite must prove that production code works — not that a
test-friendly fork of it works.

## No Flag-Coupled Tests

The "No Test-Only Code Paths" rule above forbids a flag that *only a test* reads.
This section governs the inverse: a *production* feature flag that a test couples
to. The test-only-paths rule and this flag-coupling rule together close the loop —
neither tests nor production may smuggle a flag into the proof.

- A test MUST assert the real production contract, and MUST NEVER pin an
  implementation feature flag merely to make an assertion pass. Tests may select
  an existing supported deployment configuration when that configuration is the
  claim being tested; name the envelope and prove its actual entry paths. This
  does not authorize a new product mode or test-only bypass.
- Production feature flags are within-session scaffolds only — NO flag survives
  the session that lands it (user directive 2026-06-26, re-affirmed 2026-07-02).
  By the end of the session a flag MUST be either baked in unconditionally (the
  flag deleted and the new behavior made the only path) or removed together with
  the functionality it gated; a flag MUST NOT linger as a production toggle,
  owned or otherwise — there is no enrolled multi-session regime. Flags
  inherited from before this rule are recorded debt, not license (see roadmap.md
  "Feature Flag Lifecycle" for how they are retired). Whichever way the flag
  resolves, the tests assert the real production behavior — bake the chosen
  behavior in first, then update the test to assert that unconditional behavior;
  a test never pins a flag either way.

## Contract Review For Behavior-Meaningful Tests

A new test or changed assertion about production behavior must be reviewed
against the actual owner contract. Mechanical changes such as names, imports,
formatting, or harness budgets do not by themselves require a new architecture
review; they still need the checks selected for their real effects.

1. Identify the production owner and directly affected collaborators exercised
   by the test. Use the bounded closure-review scope in
   [`proof-ladders.md`](proof-ladders.md).
2. Check owner routing, decision authority, and row-field ownership against
   [`rules.md`](../../docs/steering/rules.md). A representation or adapter is not
   a competing owner unless it independently decides runtime meaning.
3. Make the regression fail for the intended invariant through the real seam.
   Preserve first-failure output; setup, import, or missing-method errors do not
   establish a product defect.
4. Fix a contract violation that causes the defect, is introduced by the change,
   or makes its proof unsafe. Record unrelated findings with an owner and next
   action instead of making the test task an unbounded cleanup.
5. Name the owner path in test descriptions, for example
   `storageAdmissionService.checkSplit` or `setRebalanceCoordinator`.
6. For CDC-replicated system-table lifecycle changes, include a regression that
   fails when writes use non-primary predicates instead of the canonical key.
7. Keep safety assertions distinct from recovery progress and resource bounds.
   A fixture must demonstrate progress after the injected finite failure clears
   when the contract promises it; refusal alone is insufficient.

## Test Doubles Consume the Owner (One Version of Every Shape)

A test double that stands in for an owner (a consensus port, a message router,
a lifecycle manager, a participant-release protocol, a CDC subscriber, a
transport delivery outcome) must consume the owner's own builder or the one
owner-provided fixture for that shape. It never restates the owner's shape by
hand. A hand-written copy of an owner's answer is a second version of that
logic: when the owner changes, the copy keeps the old contract and the test
proves the past (R01, R03, R11).

Rules:

1. Build owner-shaped values through the owner's exported builder (for example
   a transport delivery outcome through the transport owner's builder, a CDC
   receipt through the CDC outcome owner) or through the one fixture under
   `test/test-helpers/` or the owner's `test/<area>/*-fixture.js` that wraps
   it. If neither exists, add exactly one fixture and use it everywhere; never
   a per-test copy.
2. A fake of a port or router fakes the transport or the seam the real owner
   documents for that purpose (for example a port's committed-membership
   handler), not the owner's decisions. Decisions stay with the real owner
   composed into the test.
3. When a verifier or a census finds two definitions of one shape, or a double
   that re-implements an owner's answers, that is a unification finding to
   record and fix at the owner, not a note.
4. Owner directive (2026-10-24): no legacy anywhere; exactly one version of
   any given logic in the codebase. Aliases, compatibility branches and
   parallel implementations are defects to remove at the owner.
