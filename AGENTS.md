# AGENTS

## LLM First Step

Before non-trivial implementation work, run:

```bash
npm run work:context
```

Use that output as the current handoff. It names the active blocker, first files
to read, proof ladder, useful commands, and dirty worktree summary. Load the
steering documents below after the handoff identifies the relevant boundary.

Steering documents live under `.kiro/steering/`:
- `.kiro/steering/system guidelines.md`
- `.kiro/steering/code-style.md`
- `.kiro/steering/testing-guidelines.md`
- `.kiro/steering/doctrine.md`
- `.kiro/steering/roadmap.md`

## Critical Generation Contract

- Do not write inline domain scalars in runtime code.
  Every string, number, `null`, or `undefined` used as a domain/runtime value
  must have an owner:
  - shared domain value: import the canonical constants-owner value
  - file-private value: define one top-level named constant in that file
  - test-private value: define one suite-local named constant
  - raw external input: normalize it at the boundary before it enters runtime logic
- `null` and `undefined` must not encode domain/runtime state.
  Use explicit named variants instead.
- Do not implement semantic decision boundaries as bags of independent `if`
  statements.
  When multiple signals determine one outcome, the code must:
  - collect evidence
  - normalize one snapshot
  - use one explicit state model or decision table
  - emit one canonical outcome and reasons
- Small local guards are allowed.
  Branch piles around readiness, admission, retryability, phase, or lifecycle
  are not.

Roadmap and edition ownership documents at repo root:
- `roadmap.md` - canonical AGPL implementation roadmap; the only roadmap that may drive specs, tasks, or code in this repository
- `product-roadmap.md` - cross-edition visibility board; status-only, never an implementation source in this repository
- `edition-matrix.md` - canonical mapping from feature area to edition and implementation home
- `platform-doctrine.md` - root platform framing only; not the implementation doctrine for coding work

Implementation scope rules:
- Only items in `roadmap.md`, or rows mapped to `AGPL repo` in `edition-matrix.md`, may drive implementation work in this repository.
- Do not implement Pro or Enterprise features in this repository.
- If a feature appears only in `product-roadmap.md`, or is mapped to an external/commercial implementation home in `edition-matrix.md`, treat it as out of scope here unless the user explicitly asks for AGPL-scoped preparatory work only.
