# Code Style Guidelines

## Linting Compliance

All code must be written with ESLint rules in mind from the start. This project uses the Google JavaScript style guide as a base with custom overrides.
NEVER introduce eslint override comments!

## Key Rules to Follow

When writing or modifying code:

1. **Indentation**: Use 2 spaces (not tabs)
2. **Quotes**: Use single quotes for strings
3. **Semicolons**: Always include semicolons at end of statements
4. **Line Length**: Maximum 100 characters per line
5. **Unused Variables**: Prefix unused function parameters with underscore (e.g., `_unused`)

There must be no legacy or fallback code. When something chnages, it changes completely. Just onde codepath for any given logic.
There must be just one way of doing something. Do not allow several ways to define a property (like m.typ and m.operation, m.foo.t, et.c.) simplify and unify logic
Collect all scalars into constants that can be imported and only defined once
Do not use strings and number directly in the code, but import them from files containing constants

## Before Completing Code Changes

- Ensure all new code follows the linting rules above
- Break long lines appropriately to stay under 100 characters
- Use consistent formatting with existing codebase patterns

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
