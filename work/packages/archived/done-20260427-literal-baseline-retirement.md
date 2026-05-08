# Literal Baseline Retirement

## Why

The scalar/literal guideline audit currently passes by matching an inherited
baseline. The requested outcome is stronger: remove every runtime/script
literal-guideline violation, inherited or not, so the baseline no longer hides
known debt.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` guardrail and refactoring scope under:

1. `Production guarantees`
2. `Failure simulations`
3. `Topology workflow stabilization`

## In Scope

1. Remove all current `npm run audit:guideline:literals` violations across the
   audit's runtime and script scan roots.
2. Preserve canonical constants-owner behavior while moving file-private values
   into named file-local owners.
3. Retire the inherited literal baseline once the raw audit count reaches zero.
4. Run focused static proof for the changed guardrail surface.

## Out Of Scope

1. Changing runtime semantics while hoisting literals.
2. Reinterpreting test-only one-off fixture literals outside the default audit
   contract.
3. Pro or Enterprise feature implementation.

## Boundary Contract

Semantic owner: the scalar/literal guideline audit remains the authoritative
guardrail.

Canonical contract shape:

1. runtime/script scalars appear through named owners
2. constants-owner modules may define canonical shared literals
3. regular runtime/script modules may define private top-level constants for
   file-private values

Prohibited reinterpretations:

1. do not weaken or bypass the literal audit
2. do not keep a non-zero inherited baseline after raw violations are removed
3. do not use timeout, readiness, admission, or lifecycle behavior changes as
   cleanup side effects

## Residual Closure Inventory

1. Owner paths: `scripts/check-guideline-literals.js`,
   `scripts/guideline-check-shared.js`, and every audited `src` or `scripts`
   JavaScript file with inherited literal debt.
2. Tail consumers: `npm run audit:guideline:literals`, static quality checks,
   and package/sprint status references.
3. Superseded paths: inherited baseline entries in
   `scripts/check-guideline-literals-baseline.json`.
4. Required proof: raw literal audit shows zero violations, baseline has zero
   entries, syntax/lint-sensitive touched files remain parseable, and
   `git diff --check` passes.

## Done When

1. `npm run audit:guideline:literals` reports zero new and zero inherited
   literal-guideline violations.
2. `scripts/check-guideline-literals-baseline.json` records a zero raw baseline.
3. Static whitespace and parse checks pass after the mechanical rewrite.
4. This package records closure evidence and is renamed to `done-...`.

## Closure Evidence

Closed on April 27, 2026.

Implementation:

1. Hoisted all inherited runtime/script string and number literal findings into
   named file-local scalar owners.
2. Retired `scripts/check-guideline-literals-baseline.json` to
   `rawViolationCount: 0` with an empty `violations` list.
3. Updated `roadmap.md` so the literal-owner guardrail records zero inherited
   baseline entries.

Validation:

1. `npm run audit:guideline:literals`: passed with `0` new and `0` inherited
   literal-guideline violations.
2. `node --check` over changed `src` and `scripts` JavaScript files: passed for
   `444` files.
3. `npm run audit:guideline:decision-boundaries`: passed with `0` violations.
4. `npm run audit:runtime-grammar`: passed, including state-machine pressure
   preflight.
5. `npm run test:metadata-gateway:audit`: passed.
6. `npm test -- test/control-plane/publication-recovery-gate.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/bootstrap/node-joining-service.test.js`:
   passed with `303/303`.
7. `git diff --check`: passed.

Additional diagnostic:

1. `npm run lint` was run after the scalar hoist. Generated identifier names
   were shortened to reduce max-length fallout, but repo lint still reports
   unrelated/non-literal style debt, primarily `max-len`, plus a small number of
   indentation and unused/prefer-const findings. This package closes the
   literal-guideline baseline only; it does not claim repo-wide lint closure.
