# AGENTS

## LLM First Step

Before non-trivial implementation work, run:

```bash
npm run work:context
```

Use that output as the current handoff. It names the active blocker, first files
to read, proof ladder, useful commands, and dirty worktree summary.

Use `npm run work:model-ledger -- summary` as an advisory signal when choosing
model and reasoning effort for a package. Record the final package experience
with `npm run work:model-ledger -- record ...` before closure when the work
adds useful evidence. The ledger informs future choices; it does not replace
validation, review subagents, package sequencing, or closure proof.

For steering context, load the compact LLM pack first:
- `.kiro/steering/llm/README.md`
- `.kiro/steering/llm/core.md`
- one relevant domain pack under `.kiro/steering/llm/`

Use the full steering source documents only when the handoff or compact pack
requires source-level detail for the current boundary.

## Mandatory Subagent Sequencing

Real subagents are authorized and required for all sprint or work-package
implementation work by default. Before implementation starts for any new or
continued work package, run the subagents sequentially and record the result in
the package file:

1. A fresh review subagent reviews the most recently executed package on the
   same sprint or owner boundary. For the first work package in a new sprint,
   record review as `not-needed` with reason `first-package-in-sprint` instead.
2. If that review finds fixes, a fresh and separate fix subagent performs those
   fixes before implementation starts.
3. A fresh and separate implementation subagent implements the new/current
   package only after the review/fix ledger is clean.
4. Commit and push the focused package slice before the next package starts.

Parent-session notes, local/manual session labels, or arbitrary text do not
satisfy the review, fix, or implementation roles unless the user explicitly
disables subagents for that task. Do not parallelize or skip these roles by
default.

The package's Subagent Sequencing Ledger is the durable proof that the sequence
happened. Active metadata-bearing packages must carry checked entries in this
format:

1. `Agent <name> (<agent-id>) reviewed <package>; result <clean|fixes-required>`,
   or `not-needed (first-package-in-sprint)` only for the first package in a
   new sprint
2. `Agent <name> (<agent-id>) fixed <package>` when review found fixes, or
   `not-needed` only when the review result is `clean`
3. `Agent <name> (<agent-id>) implemented <package>`

Checked required ledger entries must not contain template placeholders such as
`<...>`, pending markers such as `pending-before-implementation-resumes`, or
non-real identities such as `current-session`, `parent Codex`, `manual`,
`local`, or `session`.

Packages closed under this policy must also carry a Commit And Push Ledger.
Historical closed packages that predate this proof field are not backfilled by
invention; if they are reopened, migrated, or closed again, the proof becomes
mandatory:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

Canonical steering source documents live under `.kiro/steering/`:
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
