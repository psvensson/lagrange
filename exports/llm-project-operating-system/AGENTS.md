# AGENTS

## LLM First Step

Before non-trivial implementation work, run:

```bash
npm run work:context
```

Use that output as the current handoff. It names the active package, first
files to read, proof ladder, useful commands, and dirty worktree summary.

Use `npm run work:model-ledger -- summary` as an advisory signal when choosing
model and reasoning effort for a package. Record the final package experience
with `npm run work:model-ledger -- record ...` before closure when the work
adds useful evidence. The ledger informs future choices; it does not replace
validation, review, package sequencing, or closure proof.

For steering context, load the compact LLM pack first:

- `steering/llm/README.md`
- `steering/llm/core.md`
- one relevant domain pack under `steering/llm/`

Use the full steering source documents only when the handoff or compact pack
requires source-level detail for the current boundary.

## Work Package Discipline

Non-trivial implementation work should be driven by a package under
`work/packages/`.

Default sequence:

1. Capture or update the work package.
2. Review the most recently executed package on the same owner boundary.
3. Fix review findings before new implementation starts.
4. Implement only the current package.
5. Run the package proof ladder.
6. Commit only package-owned files and push the focused slice.
7. Rename the package to `done-...` only when closure proof is true.

If real subagents are available, use separate review, fix, and implementation
subagents for package work and record their names and ids in the package file.
If subagents are unavailable or the human disables them, record that explicit
exception in the package before implementation starts.

Checked sequencing entries must not contain placeholders such as `<...>`,
pending markers, or non-real identities such as `current-session`, `manual`,
`local`, or `session`.

Packages closed under this policy should carry a Commit And Push Ledger:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

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
