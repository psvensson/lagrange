---
scope: style
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-11-13
---

> **Canonical source.** Lint, formatting, naming. Reached from the
> [`owner router`](../steering/router.md).

# Code Style Guidelines

## Document Role

This document governs linting, formatting and local code organization. It applies
the existing ownership and proof rules to those choices; their canonical
contracts remain in the linked owners.

Use this file for:

- ESLint-oriented coding expectations
- formatting conventions
- local style conventions such as unused-parameter naming

For architectural contracts, acceptance policy, roadmap scope and current
subsystem ownership, use:

- [`rules.md`](../steering/rules.md) - the cross-cutting invariants
- [`router.md`](../steering/router.md) - the owner of any other concern
- [`test/guidelines/INDEX.md`](../../test/guidelines/INDEX.md) - testing policy
- [`architecture/INDEX.md`](../../architecture/INDEX.md) - owner maps
- [`agpl-feature-map.md`](agpl-feature-map.md) - roadmap scope

## Linting Compliance

All code must be written with ESLint rules in mind from the start. This project
uses the Google JavaScript style guide as a base with custom overrides.

NEVER introduce eslint override comments.

## Key Rules to Follow

When writing or modifying code:

1. **Indentation**: Use 2 spaces (not tabs)
2. **Quotes**: Use single quotes for strings
3. **Semicolons**: Always include semicolons at end of statements
4. **Line Length**: Maximum 100 characters per line
5. **Unused Variables**: Prefix unused function parameters with underscore (e.g., `_unused`)

## Source File Size And Naming

- New files and previously compliant touched files remain within the limits
  owned by `scripts/check-file-size-thresholds.js`: source/script files at most
  800 lines and test files at most 1500 lines. Inherited oversized files may
  remain oversized without increasing their own size against the actual proof
  base. Follow the complete [file-size policy](../../test/guidelines/proof-ladders.md#file-size-ratchet-policy)
  for comparison scope, moves, copies and required checks.
- Extract a smaller responsibility module, contract, state model or consumer
  boundary when needed to repair the defect or prevent size growth. Merely
  touching an inherited oversized file does not require full extraction.
- Extraction can preserve the existing semantic owner. A file-size limit does
  not require a new service, state store, queue, class or asynchronous handoff;
  introduce a new authority only when the concern itself requires that boundary.
- New source-code files must be named for the semantic responsibility they own,
  not for their position in a split.
- Prefer names that describe the owner boundary, decision, contract, state
  model, or consumer role.
- Do not create new files with ordinal, segment, or grab-bag names such as
  `part-2`, `segment`, `misc`, `helpers`, or `utils` unless that term is
  already an established domain concept in the repository.
- When extracting NEW method groups from an oversized class, prefer an
  explicit-context module (functions taking the owner as their first
  argument, e.g. `resolvePlacement(coordinator, …)`) over a new
  prototype-mixin `*-methods.js` fragment. Explicit-context modules keep
  `this` resolution visible, lint-provable, and unit-testable without the
  class. Existing mixin fragments are established debt, not license: keep
  them working, and migrate a fragment to explicit context when other work
  already restructures it (no standalone mass-rewrite). Preserve the existing
  entrypoint while moving each responsibility into a semantically named owner,
  contract, decision, state, or consumer module.
- An explicit-context helper is an internal organization technique. Passing
  the entire owner to another module does not establish a separate owner
  boundary or limit access to mutable state. For a real boundary, use the
  declared runtime and composition surfaces in
  [`architecture/overview.md`](../../architecture/overview.md#core-principles).
  Preserve unchanged contracts and limit consumer migration to invalidated
  contracts; keep unrelated restructuring outside the causal change.

## Constants And Naming

- Follow the scalar/state generation contract from
  [`docs/steering/rules.md`](../steering/rules.md).
- Shared domain literals belong in their canonical owner module and must be
  imported from there.
- File-local named constants are allowed when the value is private to one file.
- Suite-local named test constants are allowed when the value is private to one
  suite.
- Do not inline domain/runtime scalars when an owner constant or explicit state
  variant should exist.
- JavaScript-language primitives are NOT domain scalars and do not need named
  constants: `typeof` comparison strings (`'function'`, `'string'`, …), the
  empty string, and the structural integers `-1`, `0`, `1`, `2` may be written
  literally. The literals audit (`scripts/check-guideline-literals.js`)
  exempts exactly these. Aliases like `TYPEOF.FUNCTION`, `NUM.ZERO`, and
  file-local `LOCAL_NUM_ONE`-style names are retired-codemod residue — do not
  add new ones, and inline them when other work touches the line.
- When one semantic outcome depends on multiple signals, use one normalized
  snapshot plus one explicit state model or decision table rather than a bag of
  independent `if` statements.
- Do not introduce synonyms for an existing concept.
- `terminalize` is not a word: in NEW or newly edited identifiers, comments,
  commit messages, and steering prose, MUST use `terminate`, never `terminalize`
  (an operation/handoff `terminates`; the terminal state is reached by
  `terminating`). Inherited `terminalize` usages exist (e.g. in
  `scripts/solve/`, `src/rebalancer/`, and some test names); they are known
  debt, not license — do not imitate them, and rename them when other work
  already touches that line or file (no standalone mass-rename is required).
- Do not expose semantic policy through combinable booleans when one named mode
  constant set should exist.
- When a boundary already owns a named mode vocabulary, call sites and tests
  should use that vocabulary directly instead of restating legacy boolean
  preferences.
- When a concern has several views or caches, name them by role and keep one
  consumer-facing authoritative surface.
- Do not leak raw storage or transport field shapes into runtime model names or
  contracts.

## Navigability and fallback patterns

The patterns below identify shapes that obscure ownership or may retain a
second semantic path. Establish the site's meaning and use the replacement
form for a real violation. A legitimate default or representation conversion
needs evidence from its owner contract; renaming an alternate authority does
not remove it. A syntax scan or inventory classifies its inspected surface,
not repository-wide behavioral correctness. Correct a false positive through
the reviewed measurement change below, without adding a caller escape hatch.

- `owner_port_feature_detection`: `typeof this.x.y === 'function'` (or on a
  parameter member) to discover what an owner can do. Replace it with a named
  collaborator validated at its owned wiring point: construction or declared
  late binding. Validate each wiring; a replacement is an explicit transition
  that invalidates derived memos. Reads before wiring return typed unavailable.
- `identity_keyed_module_state`: a module-scope `new WeakMap()`, `Map()`,
  `Set()` or `WeakSet()` keyed by an owner's identity. Replace it with an
  owner-held field on the instance that owns the state.
- `prototype_copy_bags`: copying `Object.getOwnPropertyNames(X.prototype)`
  onto another class. Replace it with an explicit-context module whose
  functions take the owner as their first argument.
- `inheritance_depth_over_two`: a class whose `extends` chain is deeper than
  two. Replace it with composition: named collaborators held by one class.
- `row_field_alias_reads`: `row.x || row.y` where `x` and `y` are one field in
  two spellings. Replace it with one row decoder that maps the stored shape
  to the runtime shape once.
- `state_read_defaults`: `||` or `??` defaulting a `status`, `role`,
  `raft_role`, `workflow_step`, `phase` or `step` read. Replace it with a
  named state that the absent case decodes to explicitly.
- `value_or_promise_then_checks`: `typeof x.then === 'function'` at a call
  site. Declare the producer's outcome: always-promise for I/O; a named
  settled-or-pending answer where synchronous completion is part of the
  contract. Preserve turn ordering and declare apply mode at registration.
- `two_source_fallback_reads`: `a.x || b.y`, one fact read from two roots.
  Replace it with one authority per fact and read only that authority.
- `typeof_dual_paths`: a `typeof f === 'function'` test with a real else
  branch. Replace it with one path; delete the branch that is not the
  contract.
- `catch_returns_default`: a catch whose last statement returns a literal,
  null or nothing. Replace it with a typed refusal the caller must decide on.
- `alias_exports`: `export {x as y}`. Replace it with a direct import of the
  original name at every consumer.
- `legacy_term_identifiers`: identifiers carrying legacy, compat, fallback,
  shim, interim and similar vocabulary. Retire the legacy path and its
  vocabulary instead of carrying them forward.

`npm run audit:guideline:navigability` checks site identities by file, pattern
and enclosing function against one baseline file per pattern
(`scripts/check-guideline-navigability-baseline-<row>.json`). An unrecorded
identity or excess count fails the ordinary audit, and a count below its
baseline prints the tighten hint.
Lower a baseline with `--update-baseline --pattern <row>`; never raise one.
Inherited entries record debt, not approved patterns. Deleting a violation
elsewhere cannot pay for a new one. A move may preserve an existing debt item's
identity only with source evidence that its behavior and count are unchanged;
review the before/after sites in the existing change record. The updater
currently checks only the total before rewriting recorded identities, so its
success alone does not establish this requirement.

Checker corrections require an independently reviewed comparison of old and
new measurement on the same pinned source; keep prior records and account for
newly exposed debt. The [release-gate policy](../../test/guidelines/release-gate.md)
owns measurement changes. A changed count is not evidence of improved product
behavior, and a checker version change does not reset the obligation.

A pattern that reaches zero is promoted to an ESLint
`no-restricted-syntax` selector, at error severity, whose message carries
`navigability-rule:<row>` in `eslint.config.js`. The audit reads promotion
from ESLint's resolved configuration (the same reader as the budget script,
`scripts/checks/code-navigability-eslint-promotion.js`) and drops a promoted
pattern: ESLint is then its only gate, and it needs no baseline file.

## Before Completing Code Changes

- Ensure all new code follows the linting rules above
- Break long lines appropriately to stay under 100 characters
- Use consistent formatting with existing codebase patterns
- Confirm the [file-size ratchet](../../test/guidelines/proof-ladders.md#file-size-ratchet-policy)
  against the actual proof base: compliant/new files stay within their limits,
  inherited oversized files do not grow, and no other file funds new debt.

## Related Checks

After writing or modifying code, also review the adjacent steering documents for
non-style concerns:

- [`rules.md`](../steering/rules.md) - the cross-cutting invariants
- [`router.md`](../steering/router.md) - the owner of any other concern
- [`test/guidelines/INDEX.md`](../../test/guidelines/INDEX.md) - testing policy

## Common Patterns

```javascript
// Good: Single quotes, 2-space indent, semicolons
const example = 'value';
function process(data, _unusedCallback) {
  return data;
}

// Bad: Double quotes, missing semicolon
const example = "value"
```

## Reference

See `eslint.config.js` (ESLint 9 flat config) for the complete, live ESLint
configuration. The root `.eslintrc.json` is the legacy-format file and is NOT
read by the `npm run lint` scripts; do not edit it expecting effect.
