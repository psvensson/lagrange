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

Generated rules: 8
Estimated tokens: 280
Domains: style

## Rules

### General Guidelines

1. [STYLE-0003] Do not introduce synonyms for an existing concept.
2. [STYLE-0004] Do not expose semantic policy through combinable booleans when one named mode constant set should exist.
3. [STYLE-0005] Do not leak raw storage or transport field shapes into runtime model names or contracts.

### Ownership & Authority Policies

4. [STYLE-0009] Shared domain literals belong in their canonical owner module and must be imported from there.

### Readiness & Health Contracts

5. [STYLE-0011] When a boundary already owns a named mode vocabulary, call sites and tests should use that vocabulary directly instead of restating legacy boolean preferences.

### Testing & Harness Guidelines

6. [STYLE-0007] New or newly edited source-code files must finish within the per-scope thresholds owned by scripts/check-file-size-thresholds.js (currently src ≤ 800, test ≤ 1500 lines; run npm run audit:file-size to confirm).

### Code Style & Formatting Guidelines

7. [STYLE-0006] NEVER introduce eslint override comments.
8. [STYLE-0010] All code must be written with ESLint rules in mind from the start.
