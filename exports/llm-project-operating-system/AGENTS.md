# AGENTS

## LLM First Step

Before non-trivial implementation work, load this file and the relevant compact
steering pack. This export does not install the legacy work tracker as an active
workflow surface.

Archived work-package templates, the former tracker, and the former model
ledger utility live under `_legacy_work/` for reference only.

For steering context, load the compact LLM pack first:

- `steering/llm/README.md`
- `steering/llm/core.md`
- one relevant domain pack under `steering/llm/`

Use the full steering source documents only when the handoff or compact pack
requires source-level detail for the current boundary.

## Implementation Discipline

Non-trivial implementation work should be driven by the target repository's
active workflow and recorded with live validation evidence.

Default sequence:

1. Capture the intended scope and owner boundary.
2. Review related prior work before new implementation starts.
3. Fix blocking review findings before adding new behavior.
4. Implement only the current scoped concern.
5. Run the proof ladder for the changed boundary.
6. Commit only the focused slice.

## Canonical Steering Sources

Source documents live under `steering/`:

- `steering/system-guidelines.md`
- `steering/doctrine.md`
- `steering/testing-guidelines.md`
- `steering/code-style.md`
- `steering/governance.md`

## Critical Generation Contract

- Do not write inline domain scalars in runtime code.
- Every string, number, `null`, or `undefined` used as a domain/runtime value
  must have an owner.
- Shared domain values should be imported from a canonical owner.
- File-private values should be top-level named constants.
- Test-private values should be suite-local named constants.
- Raw external input should be normalized at the boundary before it enters
  runtime logic.
- `null` and `undefined` must not encode domain/runtime state. Use explicit
  named variants instead.
- Do not implement semantic decision boundaries as bags of independent `if`
  statements.
- When multiple signals determine one outcome, collect evidence, normalize one
  snapshot, use one explicit state model or decision table, and emit one
  canonical outcome with reasons.

Small local guards are allowed. Branch piles around readiness, admission,
retryability, phase, lifecycle, permission, payment, quota, or ownership are
not.
