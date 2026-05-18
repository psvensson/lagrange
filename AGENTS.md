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

## Core Logic Brief Contract

Before package implementation starts, runtime owner-boundary,
scenario/release-gate, and causal-escalation packages must carry a
`## Core Logic Brief` section. The brief proves the package author understands
the domain decision before assigning files or writing code.

Required fields:

1. `Canonical outcome`: the exact owner outcome this package changes or proves.
2. `Inputs/signals`: the evidence inputs that determine the outcome.
3. `State model or invariant`: the decision table, state model, or invariant
   that maps inputs to one outcome.
4. `Non-goals and forbidden interpretations`: meanings this package must not
   infer or implement.
5. `Proof mapping`: how tests, extractors, or scenario proof verify the stated
   logic.
6. `Wrong-slice trigger`: the condition that means this package should stop,
   split, or migrate owner boundary instead of continuing.

Read/review/doc-only and lightweight maintenance packages may omit the section
or record `not-needed: no runtime, scenario, or shared contract decision
changes`. Review and implementation subagents must check the brief against the
actual code path and proof, not just package formatting.

## Decision Experiment Gate Contract

Before implementation starts, active runtime owner-boundary,
scenario/release-gate, and causal-escalation packages must carry a
`## Decision Experiment Gate` section. The gate turns the package into a
falsifiable experiment: what theory is being tried, what implementation should
move, what would prove it wrong, and when to stop local patching.

Required fields:

1. `Decision question`: the owner-boundary decision this package is testing.
2. `Architecture review`: whether the route is local owner-boundary work,
   owner-boundary migration, architecture/contract gap, or human route.
3. `Competing hypotheses`: credible alternate explanations, including stale
   evidence or wrong-owner interpretations.
4. `Pre-edit focused probe`: the focused command that must run before runtime
   edits unless blocked by the environment.
5. `Success metrics`: the concrete metric, count, frontier movement, migration,
   or representative-green condition expected to move.
6. `Representative rerun`: the route-after-rerun or representative command that
   can classify the result after focused proof.
7. `Kill rule`: the unchanged same-frontier or no-reduction condition that
   stops local patching for architecture or human escalation.

Classification-only fast-path, pure classification, read/review/doc-only, and
lightweight maintenance packages do not require this gate unless they promote
runtime, scenario, script, report, or shared-contract implementation scope.
Subagent prompts must include the gate and review/fix/implementation agents
must test the decision question, not just the file list.

## Sprint Strategy Brief Contract

Active scenario-driven, release-gate, and causal-escalation sprints must keep a
`## Sprint Strategy Brief` near the top of the sprint file. The brief is the
holistic sprint-level decision record: it explains why the current work package
is the next best move, what would prove that direction wrong, and when the
sprint should stop local patching and escalate.

Required fields:

1. `Goal state`: the concrete scenario or release-gate success condition.
2. `Current causal thesis`: the best current explanation for why the gate is
   not green.
3. `Competing hypotheses`: credible alternate explanations that could redirect
   the sprint.
4. `Confidence and evidence`: confidence by hypothesis and the artifacts or
   probes supporting it.
5. `Expected green path`: the expected package sequence from current residual
   to success.
6. `Wrong direction signals`: evidence that the sprint is following the wrong
   owner, boundary, or package sequence.
7. `Next best package`: the next package to open or continue after the current
   package closes.
8. `Stop or escalate rule`: the concrete condition that triggers causal,
   architecture, or human escalation instead of another local runtime patch.

Update the brief when a representative rerun changes the selected owner or
boundary, after two or three material package closures, when frontier
oscillation appears, or when focused proof contradicts the current thesis. The
Current Edge Card stays tactical; the Sprint Strategy Brief stays strategic.

## Classification-Only Fast Path

When a package proves that no runtime, test, script, report, timeout, or
admission edit is justified, keep it on the classification-only fast path
instead of running the full implementation ceremony.

The fast path applies only when all are true:

1. Package metadata records `classification-only` as representative outcome,
   scenario result classification, or representative residual status.
2. `writeScope` and `commitScope` contain only package, sprint, tracker,
   ledger, or documentation handoff files.
3. Possible runtime, test, script, or report files are listed only under
   `candidateRuntimeFiles`.
4. Proof is limited to two or three canonical commands: representative evidence,
   one focused extractor/probe, and validation or causal-model proof.

Under this fast path, subagent sequencing and static runtime guardrails are not
required. Promotion to any runtime, test, script, or report edit immediately
returns the package to the normal implementation lane: refresh scope, run
review/fix/implementation sequencing when the lane requires it, and use the
full proof ladder.

Do not open another classification-only package from the same unchanged artifact
unless it changes package class, owner/boundary selection, or stop condition.
Close, rerun fresh evidence, or escalate instead.

## Classification Efficiency Contract

Classification is an inline gate by default. A separate pure classification
package is allowed only when it changes owner, boundary, required action, stop
condition, tracker truth, architecture/human route, or successor selection.

Pure classification packages must carry `classificationEfficiency` metadata:
default mode, separate-package reason, one-artifact budget,
two-or-three-command proof budget, capped commands, decision record, successor
action, and runtime promotion rule.

Subagent sequencing is optional for pure classification packages with no
runtime, test, script, or report write scope. If implementation paths move into
`writeScope` or `commitScope`, normal lane proof and subagent sequencing resume.

When canonical owner and boundary are stable and the route is a local runtime
fix, prefer a `runtime-owner-boundary` successor. In that case
`rerunDecision.nextLane` must be `runtime-owner-boundary`, not another
classification package.

## Post-Rerun Decision Contract

After every representative rerun, run
`npm run work:package:route-after-rerun -- --artifact <artifact> ...` before
creating or promoting another package. The successor package must record
`rerunDecision` metadata with the source artifact, route owner, route boundary,
route dominant reason, route causal outcome, stop mode, next lane, expected
representative delta, and required refresh commands.

The required refresh commands are:

1. Route-after-rerun command for the fresh artifact.
2. Update Sprint Strategy Brief.
3. Update Current Edge Card.
4. `npm run work:current-blocker -- --write`.
5. `npm run work:validate -- --pre-impl`.

Before implementation starts, the package must separate focused local proof from
representative proof. Local proof can justify a bounded patch; only a fresh
representative rerun or route-after-rerun result can classify
`representative-green`, `reduced`, `migrated`, `same-frontier`,
`architecture-gap`, or `contradictory`.

If a rerun is `same-frontier` without a concrete metric or shape reduction,
stop local patching. Record an architecture decision gate or human escalation
before opening another local implementation package.

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

The implementation entry becomes valid closure proof only after the parent
session reruns the focused package proof locally and records
`parent revalidated focused proof: yes`. Worker-reported validation is handoff
evidence, not promotion authority.

Checked required ledger entries must not contain template placeholders such as
`<...>`, pending markers such as `pending-before-implementation-resumes`, or
non-real identities such as `current-session`, `parent Codex`, `manual`,
`local`, `session`, `Agent Codex Implementation`, `Agent Codex Review`, or
`Agent Codex Fix` at closure.

The package's Subagent Progress Ledger is the in-flight communication channel.
When subagent sequencing is required, each real subagent must append one
checked progress update after every completed subtask, not only at final
handoff. Each checked update must name the real agent, the completed subtask,
`evidence: ...`, and either `next: ...` or `blocker: ...`. The progress ledger
explains what happened inside a role; it does not replace the Sequencing
Ledger's review/fix/implementation proof.

The package's Subagent Attempt Ledger records every real subagent attempt,
including stopped or failed attempts. Each checked attempt update must name the
real agent, role, `status: ...`, `last checkpoint: ...`, `parent action: ...`,
`evidence: ...`, and either `next: ...` or `blocker: ...`. Valid statuses are
`started`, `running`, `interrupted`, `partial-unvalidated`, `validated`, and
`superseded`. `interrupted` and `partial-unvalidated` attempts must be followed
by a checked superseded/discarded/revalidated line before closure. A parent
session must not commit subagent runtime edits until it reruns the focused
proof locally.

Watchdog rule: after every completed subtask, a subagent updates Progress and
Attempt ledgers before continuing. If a worker goes silent after a checkpoint
or stops with edited files and no validation, the parent records the attempt as
`partial-unvalidated` or `interrupted`, discards or supersedes that patch, and
does not promote the implementation ledger line until local proof passes.

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
