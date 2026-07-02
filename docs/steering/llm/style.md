---
scope: style
status: compiled
always_load: false
source_of_truth: docs/steering/ (see llm-pack.config.json sources for style)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.

# Style Steering Pack

Load for coding-style and lint policy enforcement.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

> **Complete pack.** All 14 style rules are included below.

## Rules

### General Guidelines

1. [STYLE-0003] Do not introduce synonyms for an existing concept. _(see code-style.md:101)_
2. [STYLE-0004] Do not expose semantic policy through combinable booleans when one named mode constant set should exist. _(see code-style.md:109)_
3. [STYLE-0005] Do not leak raw storage or transport field shapes into runtime model names or contracts. _(see code-style.md:116)_
4. [STYLE-0009] New source-code files must be named for the semantic responsibility they own, not for their position in a split. _(see code-style.md:62)_

### Ownership & Authority Policies

5. [STYLE-0002] Do not inline domain/runtime scalars when an owner constant or explicit state variant should exist. _(see code-style.md:89)_
6. [STYLE-0010] Shared domain literals belong in their canonical owner module and must be imported from there. _(see code-style.md:84)_

### Readiness & Health Contracts

7. [STYLE-0001] Do not create new files with ordinal, segment, or grab-bag names such as part-2, segment, misc, helpers, or utils unless that term is already an established domain concept in the repository. _(see code-style.md:66)_
8. [STYLE-0012] terminalize is not a word: in NEW or newly edited identifiers, comments, commit messages, and steering prose, MUST use terminate, never terminalize (an operation/handoff terminates; the terminal state is reached by terminating). Inherited terminalize usages exist (e.g. in scripts/solve/, src/rebalancer/, and some test names); they are known debt, not license — do not imitate them, and rename them when other work already touches that line or file (no standalone mass-rename is required). _(see code-style.md:102)_
9. [STYLE-0014] When a boundary already owns a named mode vocabulary, call sites and tests should use that vocabulary directly instead of restating legacy boolean preferences. _(see code-style.md:111)_

### Testing & Harness Guidelines

10. [STYLE-0008] New or newly edited source-code files must finish within the per-scope thresholds owned by scripts/check-file-size-thresholds.js (currently src ≤ 800, test ≤ 1500 lines; run npm run audit:file-size to confirm). _(see code-style.md:58)_

### Code Style & Formatting Guidelines

11. [STYLE-0006] NEVER introduce eslint override comments. _(see code-style.md:44)_
12. [STYLE-0007] The root .eslintrc.json is the legacy-format file and is NOT read by the npm run lint scripts; do not edit it expecting effect. _(see code-style.md:151)_
13. [STYLE-0011] JavaScript-language primitives are NOT domain scalars and do not need named constants: typeof comparison strings ('function', 'string', …), the empty string, and the structural integers -1, 0, 1, 2 may be written literally. The literals audit (scripts/check-guideline-literals.js) exempts exactly these. Aliases like TYPEOF.FUNCTION, NUM.ZERO, and file-local LOCAL_NUM_ONE-style names are retired-codemod residue — do not add new ones, and inline them when other work touches the line. _(see code-style.md:91)_
14. [STYLE-0013] All code must be written with ESLint rules in mind from the start. _(see code-style.md:41)_
