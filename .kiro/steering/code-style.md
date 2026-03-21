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

## Post-Write System Guidelines Verification

**After writing or modifying any code, verify that it conforms to the doctrine
and system guidelines before considering the work done.**

This is not optional. Every completed change must pass a self-review against
`doctrine.md` and the system guidelines (`system guidelines.md`). Specifically:

1. **Zero duplication** - Confirm no new parallel implementation, shadow state,
   or duplicated logic was introduced. Re-check the verification checklist in
   §1.5 of the system guidelines.
2. **Single owner** - Confirm every new piece of state, every row mutation, and
   every field write is routed through its canonical owner.
3. **No magic values** - Confirm all scalars are named constants imported from
   the appropriate constants file.
4. **Single naming** - Confirm no new synonyms were introduced for existing
   concepts.
5. **Communication paths** - Confirm messages go through the MessageRouter and
   data-plane traffic uses Message Group transport.
6. **Cache discipline** - Confirm no new ad-hoc caches or shadow copies of
   system data were created outside `SystemTableCache`.
7. **Error handling** - Confirm no swallowed errors or try/catch control flow.
8. **Architecture docs** - If the change affects system behavior, confirm
   `architecture.md` is updated.

If any check fails, fix the code before marking the task complete. Do not defer
guideline conformance to a follow-up.

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
