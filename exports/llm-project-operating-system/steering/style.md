---
scope: style
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/style.md
last_reviewed: 2026-05-23
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

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

- [`steering/doctrine/INDEX.md`](doctrine/INDEX.md)
- [`steering/system-guidelines.md`](system-guidelines.md)
- [`steering/testing/INDEX.md`](testing/INDEX.md)
- [`../architecture/INDEX.md`](../architecture/INDEX.md)
- [`roadmap.md`](roadmap.md)

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

- New or newly edited source-code files must finish within the per-scope thresholds owned by `tooling/validators/check-file-size-thresholds.js` (currently src ≤ 800, test ≤ 1500 lines; run `npm run audit:file-size` to confirm).
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

## Constants And Naming

- Follow the scalar/state generation contract from
  [`steering/system-guidelines.md`](system-guidelines.md).
- Shared domain literals belong in their canonical owner module and must be
  imported from there.
- File-local named constants are allowed when the value is private to one file.
- Suite-local named test constants are allowed when the value is private to one
  suite.
- Do not inline domain/runtime scalars when an owner constant or explicit state
  variant should exist.
- When one semantic outcome depends on multiple signals, use one normalized
  snapshot plus one explicit state model or decision table rather than a bag of
  independent `if` statements.
- Do not introduce synonyms for an existing concept.
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
- Confirm every new or edited source-code file is within its scope threshold (see `tooling/validators/check-file-size-thresholds.js`), or
  refactor the touched file before Quest closure.

## Related Checks

After writing or modifying code, also review the adjacent steering documents for
non-style concerns:

- [`steering/doctrine/INDEX.md`](doctrine/INDEX.md)
- [`steering/system-guidelines.md`](system-guidelines.md)
- [`steering/testing/INDEX.md`](testing/INDEX.md)

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

See `.eslintrc.json` for the complete ESLint configuration.
