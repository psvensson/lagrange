# Style Steering Pack

Load for coding-style and lint policy enforcement.

Generated rules: 21
Estimated tokens: 508
Domains: style

## Rules

1. [STYLE-0001] Do not inline domain/runtime scalars when an owner constant or explicit state variant should exist.
2. [STYLE-0002] Do not introduce synonyms for an existing concept.
3. [STYLE-0003] Do not expose semantic policy through combinable booleans when one named mode constant set should exist.
4. [STYLE-0004] Do not leak raw storage or transport field shapes into runtime model names or contracts.
5. [STYLE-0005] NEVER introduce eslint override comments.
6. [STYLE-0006] Shared domain literals belong in their canonical owner module and must be imported from there.
7. [STYLE-0007] All code must be written with ESLint rules in mind from the start.
8. [STYLE-0008] When a boundary already owns a named mode vocabulary, call sites and tests should use that vocabulary directly instead of restating legacy boolean preferences.
9. [STYLE-0009] Indentation: Use 2 spaces (not tabs)
10. [STYLE-0010] Quotes: Use single quotes for strings
11. [STYLE-0011] Semicolons: Always include semicolons at end of statements
12. [STYLE-0012] Line Length: Maximum 100 characters per line
13. [STYLE-0013] Unused Variables: Prefix unused function parameters with underscore (e.g., _unused)
14. [STYLE-0014] Follow the scalar/state generation contract from .kiro/steering/system guidelines.md.
15. [STYLE-0015] File-local named constants are allowed when the value is private to one file.
16. [STYLE-0016] Suite-local named test constants are allowed when the value is private to one suite.
17. [STYLE-0017] When one semantic outcome depends on multiple signals, use one normalized snapshot plus one explicit state model or decision table rather than a bag of independent if statements.
18. [STYLE-0018] When a concern has several views or caches, name them by role and keep one consumer-facing authoritative surface.
19. [STYLE-0019] Ensure all new code follows the linting rules above
20. [STYLE-0020] Break long lines appropriately to stay under 100 characters
21. [STYLE-0021] Use consistent formatting with existing codebase patterns
