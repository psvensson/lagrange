---
scope: style
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/style.md
last_reviewed: 2026-07-25
---

> **Canonical source.** Lint, formatting, naming. Regenerate the style pack with `npm run steering:llm:pack`.

# Code Style Guidelines

## Document Role

This document governs linting, formatting, and local coding-style rules.

Use this file for:

- ESLint-oriented coding expectations
- formatting conventions
- local style conventions such as unused-parameter naming

Do not use this file for:

- architecture ownership rules
- testing policy
- roadmap scope decisions
- current subsystem owner maps

For those concerns, use:

- [`docs/steering/doctrine/INDEX.md`](doctrine/INDEX.md)
- [`docs/steering/system-guidelines.md`](system-guidelines.md)
- [`docs/steering/testing-guidelines/INDEX.md`](testing-guidelines/INDEX.md)
- [`../../architecture/INDEX.md`](../../architecture/INDEX.md)
- [`../../roadmap.md`](../../roadmap.md)

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

- New or newly edited source-code files must finish within the per-scope thresholds owned by `scripts/check-file-size-thresholds.js` (currently src ≤ 800, test ≤ 1500 lines; run `npm run audit:file-size` to confirm).
- If an edit would leave a touched source-code file over its scope threshold, extract
  a smaller semantic owner, helper, contract, state model, or consumer boundary
  before Quest closure.
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

## Constants And Naming

- Follow the scalar/state generation contract from
  [`docs/steering/system-guidelines.md`](system-guidelines.md).
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

## Before Completing Code Changes

- Ensure all new code follows the linting rules above
- Break long lines appropriately to stay under 100 characters
- Use consistent formatting with existing codebase patterns
- Confirm every new or edited source-code file is within its scope threshold (see `scripts/check-file-size-thresholds.js`), or
  refactor the touched file before Quest closure.

## Related Checks

After writing or modifying code, also review the adjacent steering documents for
non-style concerns:

- [`docs/steering/doctrine/INDEX.md`](doctrine/INDEX.md)
- [`docs/steering/system-guidelines.md`](system-guidelines.md)
- [`docs/steering/testing-guidelines/INDEX.md`](testing-guidelines/INDEX.md)

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
