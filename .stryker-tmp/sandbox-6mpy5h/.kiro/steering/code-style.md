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

- [`.kiro/steering/doctrine.md`](doctrine.md)
- [`.kiro/steering/system guidelines.md`](system%20guidelines.md)
- [`.kiro/steering/testing-guidelines.md`](testing-guidelines.md)
- [`../../architecture.md`](../../architecture.md)
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

## Constants And Naming

- Follow the scalar/state generation contract from
  [`.kiro/steering/system guidelines.md`](system%20guidelines.md).
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

## Before Completing Code Changes

- Ensure all new code follows the linting rules above
- Break long lines appropriately to stay under 100 characters
- Use consistent formatting with existing codebase patterns

## Related Checks

After writing or modifying code, also review the adjacent steering documents for
non-style concerns:

- [`.kiro/steering/doctrine.md`](doctrine.md)
- [`.kiro/steering/system guidelines.md`](system%20guidelines.md)
- [`.kiro/steering/testing-guidelines.md`](testing-guidelines.md)

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
