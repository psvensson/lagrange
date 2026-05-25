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

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

## Rules

### General Guidelines

1. [STYLE-0003] Do not introduce synonyms for an existing concept. _(see code-style.md:84)_
2. [STYLE-0004] Do not expose semantic policy through combinable booleans when one named mode constant set should exist. _(see code-style.md:85)_
3. [STYLE-0005] Do not leak raw storage or transport field shapes into runtime model names or contracts. _(see code-style.md:92)_

### Ownership & Authority Policies

4. [STYLE-0009] Shared domain literals belong in their canonical owner module and must be imported from there. _(see code-style.md:74)_

### Readiness & Health Contracts

5. [STYLE-0011] When a boundary already owns a named mode vocabulary, call sites and tests should use that vocabulary directly instead of restating legacy boolean preferences. _(see code-style.md:87)_

### Testing & Harness Guidelines

6. [STYLE-0007] New or newly edited source-code files must finish within the per-scope thresholds owned by scripts/check-file-size-thresholds.js (currently src ≤ 800, test ≤ 1500 lines; run npm run audit:file-size to confirm). _(see code-style.md:58)_

### Code Style & Formatting Guidelines

7. [STYLE-0006] NEVER introduce eslint override comments. _(see code-style.md:44)_
8. [STYLE-0010] All code must be written with ESLint rules in mind from the start. _(see code-style.md:41)_
