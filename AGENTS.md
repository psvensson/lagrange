# AGENTS

## LLM First Step

Before non-trivial implementation work, run:

```bash
npm run work:context
```

Use that output as the current handoff. It names the active blocker, first files
to read, proof ladder, useful commands, and dirty worktree summary.

Use `npm run work:model-ledger -- summary` as an advisory signal when choosing
model, reasoning effort, and output profile for a package. Record the final
package experience with `npm run work:model-ledger -- record ...` before
closure when the work adds useful evidence, including package class, intended
minimum canonical OpenAI model id, scope shape, output profile, escalation
result, and bailout reason. The ledger informs future choices; it does not
replace validation, review subagents, package sequencing, or closure proof.

For steering context, load the compact LLM pack first:
- `.kiro/steering/llm/README.md`
- `.kiro/steering/llm/core.md`
- one relevant domain pack under `.kiro/steering/llm/`

Use the full steering source documents only when the handoff or compact pack
requires source-level detail for the current boundary.

## LLM Tool-First Workflow

For implementation, handoff repair, package migration, representative evidence
triage, or subagent preparation, use canonical workflow tools before raw JSON,
log slicing, or ad hoc `jq`:

1. Start with `npm run work:llm-start` when the task needs more than the compact
   `work:context` handoff.
2. Use `npm run work:package:doctor -- --suggest <package>` or
   `npm run work:package:doctor -- --fix-dry-run <package>` before
   hand-editing package metadata, causal ledgers, Model Fit, subagent ledgers,
   or commit ledgers.
3. Use `npm run work:package:schema` and `npm run work:package:new -- ...`
   instead of inventing package schema, lane, status, or enum values by hand.
4. Use `npm run work:evidence-summary -- <artifact>`, focused scenario
   extractors such as `npm run analyze:priority-recovery-residuals -- <artifact>`,
   and `npm run analyze:owner-files -- <owner> [boundary]` before raw report
   JSON, broad file search, oversized segment files, or container logs.
5. Use `npm run work:subagent-prompt -- --role <role> --package <package>` for
   bounded subagent prompts and ledger-line guidance.
6. Use `npm run work:oversized-next -- --markdown` before creating broad
   file-size cleanup packages.

Raw `jq`, raw JSON slicing, or raw-log sampling is a fallback only when the
canonical extractor is missing or insufficient. Record the tried extractor and
fallback reason in the package.

## Subagent Sequencing By Lane

Use the lightest valid workflow lane from `.kiro/steering/workflow-guidelines.md`.

Subagents are not required for read/review/doc-only work or lightweight
maintenance unless the package explicitly declares that requirement or the user
asks for it.

Real subagents are authorized and required for runtime owner-boundary packages
and scenario/release-gate packages by default. Before implementation starts for
those packages, run the subagents sequentially and record the result in the
package file:

1. A fresh review subagent reviews the most recently executed package on the
   same sprint or owner boundary. For the first work package in a new sprint,
   record review as `not-needed` with reason `first-package-in-sprint` instead.
2. If that review finds fixes, a fresh and separate fix subagent performs those
   fixes before implementation starts.
3. A fresh and separate implementation subagent implements the new/current
   package only after the review/fix ledger is clean.
4. Commit and push the focused package slice before the next package starts.

Parent-session notes, local/manual session labels, or arbitrary text do not
satisfy the review, fix, or implementation roles when subagent sequencing is
required for closure. Before closure, if the host cannot expose delegation or
a human explicitly waives a role, record `human-waived`, `tool-unavailable`, or
`blocked-by-environment-policy` with a `reason: ...` note instead of inventing
agent proof. Do not parallelize or skip required roles by default.

The package's Subagent Sequencing Ledger is the durable proof that the sequence
happened. Runtime owner-boundary and scenario/release-gate packages must carry
checked entries in this format:

1. `Agent <name> (<agent-id>) reviewed <package>; result <clean|fixes-required>`,
   or `not-needed (first-package-in-sprint)` only for the first package in a
   new sprint
2. `Agent <name> (<agent-id>) fixed <package>` when review found fixes, or
   `not-needed` only when the review result is `clean`
3. `Agent <name> (<agent-id>) implemented <package>`

Checked required ledger entries must not contain template placeholders such as
`<...>`, pending markers such as `pending-before-implementation-resumes`, or
non-real identities such as `current-session`, `parent Codex`, `manual`,
`local`, or `session` at closure.

Use validation phases deliberately:

1. `npm run work:validate -- --entry` for package shape before role proof exists
2. `npm run work:validate -- --pre-impl` when review/fix proof is clean and the
   next required role may still be implementation
3. `npm run work:validate -- --closure` before closing, committing, or pushing

New package metadata must keep scope fields distinct: `writeScope` for files
the package may edit, `handoffFiles` for read-only context, `generatedFiles`
for deterministic outputs, `candidateRuntimeFiles` for files gated by a focused
probe, and `commitScope` for focused commit containment. `touchedFiles` is
legacy compatibility only.

Packages closed under this policy must also carry a Commit And Push Ledger.
Historical closed packages that predate this proof field are not backfilled by
invention; if they are reopened, migrated, or closed again, the proof becomes
mandatory:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

## Model Fit Contract

Active metadata-bearing packages must carry a `## Model Fit` section. The
section records the package class, intended minimum canonical OpenAI model id,
scope shape, output profile, owned files, forbidden files, frozen decisions,
escalation triggers, and focused proof when the package is meant to be runnable
by `gpt-5.3-codex-spark`.

`Output profile` records expected final-response and handoff verbosity, not
reasoning depth. Use `medium` by default for runtime, scenario, and causal
packages; reserve `high` and `extra-high` for explicit audit, architecture, or
retrospective artifacts.

Packages whose intended minimum model is `gpt-5.3-codex-spark` must be bounded
leaf slices. They must not contain open-ended frontier language, and a
representative run may classify the result only as closed, reduced, migrated,
or same-frontier. It must not expand implementation scope inside the package.

Canonical steering source documents live under `.kiro/steering/`:
- `.kiro/steering/system guidelines.md`
- `.kiro/steering/runtime-contracts.md`
- `.kiro/steering/workflow-guidelines.md`
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
