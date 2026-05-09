# Style Steering Pack

Load for naming, formatting, and local code hygiene.

## Rules

1. Follow the target project's formatter and linter.
2. Avoid lint-disable comments unless a human approves and documents the
   exception.
3. Prefer explicit names over abbreviations.
4. Do not introduce synonyms for existing concepts.
5. Shared domain literals belong to canonical owners.
6. File-private literals are named top-level constants.
7. Test-private literals are suite-local named constants.
8. Do not expose policy through combinable booleans.
9. Use named modes or variants for semantic choices.
10. Keep comments rare and focused on non-obvious intent.
