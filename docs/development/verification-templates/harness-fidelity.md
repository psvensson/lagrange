---
categories: [harness-fidelity]
---

# Verification Template: Test-harness / Fixture Fidelity

For new DT tests, fixtures, or stubs — and for verifying that a green test
binds to the live mechanism. Each item requires an evidence path.

1. **Red for the RIGHT reason.** Show the head-red assertion failing via
   the claimed mechanism (not via a missing method / fixture gap). A
   compressed-geometry fixture can let the WRONG existing machinery absorb
   the scenario (run-25: fast stubbed polls let the short first wait absorb
   a hold the live system fails on). Red-on-revert is valid only when the
   reverted run reaches the named behavioral assertion through the intended
   precondition/mechanism and that assertion fails. Import, setup, fixture,
   timeout-before-engagement, and missing-method failures are non-proofs.
   Preserve output naming the assertion and failure mechanism; exit status
   alone is insufficient.
2. **Stub honesty at the binding seam.** The stub of the seam under test
   must reproduce the live behavior the bug depends on (rejection at
   CREATE time vs probe time; `{code}` objects vs strings; transport ACK
   with noHandler). Prefer contract-suite-backed stubs
   (test/contract/); if none exists for the seam, state what the stub
   simplifies and why it cannot mask the mechanism.
3. **Time fidelity.** What does the fixture compress (poll intervals,
   budgets, hold windows)? For each compressed constant, argue the
   ORDERING of expiries is preserved (window < hold < budget), not just
   the values.
4. **Field fidelity.** Ops/rows built by hand: do they carry the fields
   the code under test branches on (createdAt for budget bounds, workflow
   steps, status enums)? A missing timestamp can flip a bounded loop into
   a degenerate-stop path.
5. **Vacuous assertions.** For each assertion, name the fixture state that
   could make it pass trivially (single-replica role flips are ignored by
   design; empty services tables admit everything) and show it is excluded.
6. **Entry-path and owner fidelity.** Name the real public or internal entry
   path, production factories, decision owners, and durable effects the fixture
   reaches. A green test of an injected helper does not prove production reaches
   it; distinguish source reachability from measured engagement.
7. **Evidence ceiling.** State which dependencies, runtime, network, hosts, and
   storage paths are real and which are substituted. Native and physical service
   claims need their own immutable run witnesses. Multiple containers on one
   host do not establish independent physical failure domains.
8. **Failure and progress fidelity.** Distinguish product, fixture, verifier,
   and execution-unavailable failures, and retain the first artifact. Show
   safety, recovery progress after finite faults clear, and bounded resources
   separately when the contract promises them. Keep a target-not-reached verdict
   separate from the outer scenario failure.
