---
scope: style
status: compiled
always_load: false
source_of_truth: .kiro/steering/ (see llm-pack.config.json sources for style)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `.kiro/steering/`.

# Style Steering Pack

Load for coding-style and lint policy enforcement.

Generated rules: 10
Estimated tokens: 328
Domains: style

## Rules

### General Guidelines

1. [STYLE-0003] Do not introduce synonyms for an existing concept.
2. [STYLE-0004] Do not expose semantic policy through combinable booleans when one named mode constant set should exist.
3. [STYLE-0005] Do not leak raw storage or transport field shapes into runtime model names or contracts.
4. [STYLE-0007] New source-code files must be named for the semantic responsibility they own, not for their position in a split.

### Ownership & Authority Policies

5. [STYLE-0002] Do not inline domain/runtime scalars when an owner constant or explicit state variant should exist.
6. [STYLE-0008] Shared domain literals belong in their canonical owner module and must be imported from there.

### Readiness & Health Contracts

7. [STYLE-0001] Do not create new files with ordinal, segment, or grab-bag names such as part-2, segment, misc, helpers, or utils unless that term is already an established domain concept in the repository.
8. [STYLE-0010] When a boundary already owns a named mode vocabulary, call sites and tests should use that vocabulary directly instead of restating legacy boolean preferences.

### Code Style & Formatting Guidelines

9. [STYLE-0006] NEVER introduce eslint override comments.
10. [STYLE-0009] All code must be written with ESLint rules in mind from the start.
