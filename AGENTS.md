# AGENTS

## Start Here

For non-trivial implementation work, run:

```bash
npm run work:context
```

Treat that output as the current handoff. It names the active blocker, owner,
boundary, primary steering pack, secondary steering packs, task-local active
constraints, proof ladder, useful commands, allowed scope, forbidden scope, and
dirty worktree summary.

Use `npm run work:llm-start` when the compact handoff is not enough. Use
`npm run work:model-ledger -- summary` as advisory input for model, reasoning
effort, and output-profile choice. When a package adds useful evidence, record
the result before closure with `npm run work:model-ledger -- record ...`.
When spawning subagents, set the model explicitly from the package Target
executor or intended minimum model; do not inherit a stronger parent model
unless an escalation trigger fires.

## Steering Load

Load steering in this order:

1. `.kiro/steering/llm/README.md`
2. `.kiro/steering/llm/core.md`
3. the primary domain pack named by `npm run work:context`

Read secondary domain packs only when the active constraints, proof ladder, or
current blocker shows they are needed. Use full `.kiro/steering/*.md` source
documents only when the compact pack or handoff explicitly needs source-level
detail for the current boundary. Use `.kiro/steering/llm/rules.json` only for
rule IDs and source traceability.

## Workflow Tools

Use canonical workflow tools before raw JSON, raw log slicing, broad search, or
ad hoc `jq`:

- Package metadata/schema/ledger work: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`
- Representative evidence: `npm run work:evidence-summary -- <artifact>` and the focused extractor named by the handoff
- Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`
- Subagent prompts: `npm run work:subagent-prompt -- --role <role> --package <package>`
- Oversized cleanup: `npm run work:oversized-next -- --markdown`
- Generated handoff repair: `npm run work:repair`
- Validation: `npm run work:validate -- --entry|--pre-impl|--closure`

If a canonical tool is missing or insufficient, record the tool tried and the
fallback reason in the package.

## Package Ceremony

Package schema, lanes, required fields, subagent proof shape, closure rules,
and commit/push ledgers live in executable tools and templates:

- `npm run work:package:schema`
- `work/templates/`
- `npm run work:validate -- --entry|--pre-impl|--closure`
- `npm run work:package:doctor -- --suggest <package>`

Do not duplicate that ceremony in new prose. Keep package files focused on the
current owner, boundary, proof, active constraints, and validation result.

Use the lightest valid lane:

- Read/review/doc-only: answer or edit explanatory docs; no package unless
  implementation truth, roadmap status, or architecture ownership changes.
- Lightweight maintenance: use one focused package and focused proof; subagents
  are optional unless runtime ownership or shared contracts can change.
- Runtime owner-boundary and scenario/release-gate work: use the full package
  lane required by the validator, including focused proof, representative
  evidence when the scenario drove the work, and closure execution evidence.
  Agent identity is optional provenance; never invent agent IDs to satisfy
  process fields.
- For real package work, use the executor plus verifier-fixer model. One
  executor may own inspection, edits, and focused proof. A separate verifier-
  fixer must verify the last package work before closure when code, tests,
  scripts, runtime contracts, or tracker truth changed; it may fix in-scope
  problems directly and must report changed files plus validation evidence.

## Coding Constraints

- Do not write inline domain/runtime scalars in runtime code. Import canonical
  constants, define one named top-level file-private constant, define one
  suite-local test constant, or normalize raw external input at ingress.
- `null` and `undefined` must not encode domain/runtime state. Use explicit
  named variants.
- Do not implement semantic decision boundaries as piles of independent `if`
  statements. Collect evidence, normalize one snapshot, use one explicit state
  model or decision table, and emit one canonical outcome with reasons.
- Cache observes; owners decide. Callers submit intent to owners and consume
  owner outcomes; they do not reproduce owner logic locally.
- Do not weaken guardrails, scripts, allowlists, scan scope, or lint rules to
  make a package pass.

## Scope And Roadmap

Implementation work in this AGPL repository must be driven by `roadmap.md`, or
by rows mapped to `AGPL repo` in `edition-matrix.md`. `product-roadmap.md` is a
visibility board, not an implementation source. Do not implement Pro or
Enterprise features here unless the request is explicitly AGPL-scoped
preparatory work.

## Worktree Safety

The worktree may already be dirty. Do not revert or overwrite changes you did
not make. Keep edits inside the package write scope, ignore unrelated dirty
files, and stop for human direction if package-owned and unrelated changes
cannot be separated safely.
