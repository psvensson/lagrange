# Style Steering Pack

Load for coding-style and lint policy enforcement.

Generated rules: 8
Estimated tokens: 209
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
