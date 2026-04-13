# Active Gate Witness Hardening for CL-004 / CL-006

## Status

Closed on 2026-04-11 without a standalone implementation pass. Witness
hardening and CL-004/CL-006 separation were absorbed by later readiness
classification and harness work, so this package no longer needs to stay open.

## Why

Closure witnesses CL-004 and CL-006 can currently be produced from partial
conditions that are heavily influenced by transient admin reachability. That makes
diagnostics and admission less trustworthy exactly when correctness is most
needed.

## Scope Basis

In scope by roadmap:

1. `Topology workflow stabilization` (AGPL repo)
2. `Operational visibility basics` (AGPL repo)
3. `Failure simulations` (AGPL repo)

## Sprint Umbrella

[Startup Gate Admission and Witness Hardening Sprint](../sprints/done-2026-q2-startup-gate-admission-hardening.md)

## In Scope

1. Reclassify CL witness predicates with explicit, independent preconditions.
2. Ensure CL-004/CL-006 require evidence cross-checks beyond admin
   reachability/timeouts.
3. Use the shared evidence model from startup owner unification to score witness
   eligibility.
4. Preserve witness intent (operational signal) while reducing false-positive
   activation signals.
5. Document transition semantics for each closure record in one witness matrix.

## Out Of Scope

1. Closure records unrelated to startup active-gate logic.
2. Non-test runtime diagnostic formatting.
3. Adding new witness IDs without retiring legacy IDs.

## Invariants

1. CL witness emission requires a complete, auditable prerequisite set.
2. No witness should be classifiable by admin-transient evidence alone.
3. Witness classification and active projection share one evidence language.
4. Diagnostic output remains stable for valid strong-complete cases.

## Hotspots

1. `test/distributed/harness/active-gate-closure-classification.js`
2. `test/distributed/harness/cluster.js`
3. `test/distributed/harness/failure-bundle.js`

## Detection / Analysis Tasks

- [ ] Document current CL-004/CL-006 preconditions from code and tests.
- [ ] Identify every transient/admin branch feeding each witness.
- [ ] Define minimal independent proof requirements per witness.
- [ ] Map expected behavior for `diag-admin-discovery` and similar fail shapes.

## Implementation Tasks

- [ ] Introduce `canEmitClosureWitness` helper set with explicit preconditions.
- [ ] Refactor CL-004/CL-006 logic to require snapshot/publish convergence or
  equivalent explicit evidence tiers.
- [ ] Disallow weak transient admin witnessing as sole condition.
- [ ] Update failure-bundle tests for witness reasons and witnessability ranking.
- [ ] Add comments and matrix in-code to prevent heuristic drift.

## Validation

1. Unit tests for witness rules across transient/admission truth permutations.
2. Scenario tests for `diag-admin-discovery`, startup with weak admin telemetry.
3. Distributed harness run on known pressure modes (`rolling-restart`,
   `seed-restart-under-load`) with focus on witness labels.

2. Verification that CL witness output does not claim stronger state than
   active-admission proof.
