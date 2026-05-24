---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Sub-agent sequencing, LLM tool-first triage, current edge card and trap list. Index: [`INDEX.md`](INDEX.md).

# Workflow — Sub-Agents & Triage

## Sub-Agent Sequencing

Real sub-agents are used sequentially for sprint or work-package implementation
unless the user explicitly disables them.

Default sequence:

1. Review sub-agent reviews the most recently executed package on the same
   sprint or owner boundary.
2. If review finds actionable problems, a separate fix sub-agent fixes those
   findings before new implementation starts.
3. A separate implementation sub-agent handles the current package.

Review checks:

- last package closed its stated blocker
- stale status
- widened scope
- missed residual closure
- guardrail drift
- sprint snapshot mismatch with current evidence

Review command budget:

1. package doctor for the active package
2. package doctor for the direct predecessor when present
3. one canonical route or artifact command
4. pre-implementation validation after metadata-only repairs or before final
   clean handoff

Review agents do not run focused runtime tests, `npm run test:static`, broad
extractor stacks, raw report JSON, raw logs, or older handoff-file archaeology
unless the capped commands contradict package routing, scope, stale blocker
state, or metadata shape. The review may cite runtime/static proof as required
later; implementation and parent revalidation run it.

Parallel sub-agents are allowed only for independent sidecar questions with
disjoint owner or file scope. Parent-session notes, local/manual labels, and
arbitrary text without a real agent id do not satisfy review, fix, or
implementation roles at closure. Generic labels such as
`Agent Codex Implementation`, `Agent Codex Review`, and `Agent Codex Fix` are
also invalid closure identities. Before closure, an implementation environment
may record `human-waived`, `tool-unavailable`, or
`blocked-by-environment-policy` with a `reason: ...` note so unavailable
delegation is explicit instead of disguised as agent proof.

When sub-agent sequencing is required, the package's Subagent Progress Ledger
is the in-flight communication channel. Each real sub-agent appends one checked
update after every completed subtask with real agent identity, the completed
subtask, `evidence: ...`, and either `next: ...` or `blocker: ...`. The
progress ledger explains what happened inside each role; the Subagent
Sequencing Ledger remains the role-completion proof.

The Subagent Attempt Ledger records every real attempt, including stopped or
failed attempts. Each checked attempt update names the real agent, role,
`status: ...`, `last checkpoint: ...`, `parent action: ...`, `evidence: ...`,
and either `next: ...` or `blocker: ...`. Valid statuses are `started`,
`running`, `interrupted`, `partial-unvalidated`, `validated`, and
`superseded`. `interrupted` and `partial-unvalidated` attempts must be
followed by a checked superseded/discarded/revalidated line before closure.

Implementation completion is valid only after the parent session reruns the
focused package proof locally and records `parent revalidated focused proof:
yes` in the Sequencing Ledger. Worker-reported validation is handoff evidence,
not promotion authority. If a worker goes silent after a checkpoint or stops
with edited files and no validation, record the attempt as
`partial-unvalidated` or `interrupted`, discard or supersede that patch, and do
not commit subagent runtime edits until local proof passes.

The main agent remains responsible for integrating findings, deciding whether
the owner boundary changed, and keeping package status filename-first.

## LLM Tool-First Triage

This is a repo-wide package and sub-agent entry contract, not a sprint-local
note. LLM-driven work across all packages and sub-agent tasks must use canonical
workflow and artifact tools before raw JSON or log slicing: `work:llm-start`,
`work:evidence-summary`,
`work:package:doctor -- --suggest`, `work:package:schema`,
`work:package:new`, `analyze:owner-files`, focused scenario extractors such as
`analyze:priority-recovery-residuals`, `work:subagent-prompt`, and
`work:oversized-next`.

Required workflow:

1. Use `npm run work:package:doctor -- --suggest <package>` or
   `npm run work:package:doctor -- --fix-dry-run <package>` before hand-editing
   package schema, causal ledger, Model Fit, sub-agent ledger, or commit-ledger
   fields.
2. Use `npm run work:package:schema` before choosing status, lane,
   causal-outcome, scenario-classification, stop-condition, or bounded-progress
   enum values.
3. Use `npm run work:package:new -- ...` to create new package files unless the
   task is only renaming an existing package status.
4. Use `npm run work:evidence-summary -- <artifact>` before reading raw
   distributed report JSON or large harness files.
5. Use `npm run analyze:owner-files -- <owner> [boundary]` before broad owner
   file search or opening oversized segment files.
6. Use scenario-specific extractors such as
   `npm run analyze:priority-recovery-residuals -- <artifact>` before ad hoc
   residual extraction.
7. Use `npm run work:subagent-prompt -- --role <role> --package <package>` to
   prepare bounded sub-agent tasks; the generated text assists the real
   sub-agent sequence but does not replace real returned agent ids. The prompt
   must carry the package Model Fit output profile so sub-agents know expected
   response verbosity separately from model or reasoning effort.
8. Use `npm run work:oversized-next -- --markdown` before inventing file-size
   cleanup packages from raw line counts.
9. Before closure, confirm every new or edited source-code file in package
   scope is at or below `1200` lines. If a touched source-code file exceeds the
   cap, refactor or extract a semantically named owner/helper/contract boundary
   in the current package before closing. `work:oversized-next` may choose the
   extraction order, but it is not a waiver for newly created or edited
   oversize.
10. Use explicit metadata scope fields for new packages: `writeScope` for files
   the package may edit, `handoffFiles` for read-only context,
   `generatedFiles` for deterministic outputs, `candidateRuntimeFiles` for
   files gated by a focused probe, and `commitScope` for focused commit
   containment. `touchedFiles` is legacy compatibility only.
11. Use validation phases deliberately: `npm run work:validate -- --entry` for
    package shape, `--pre-impl` when review/fix proof is complete and
    implementation may still be pending, and `--closure` before close/commit.

Ad hoc `jq`, raw JSON slicing, or raw-log sampling is allowed only after the
relevant canonical extractor is missing or insufficient. The package records
which extractor was tried and why the fallback was necessary.

The sprint current-blocker snapshot stays near the top of the sprint document
and names:

- latest artifact or replay directory
- representative gate or scenario
- current representative package
- primary semantic owner and boundary
- canonical blocker or dominant reason
- prior blocker that just closed or migrated
- subordinate evidence that must not drive edit scope
- next required owner proof or action

`work/sprints/current-blocker.json` is generated handoff state, but it must not
be stale. Default `work:validate` checks that the snapshot package exists,
uses an `active-...` filename, has `status: active`, and matches the discovered
active package and active sprint. If it fails, regenerate it with
`npm run work:current-blocker -- --write` before using `work:llm-start` or
continuing package work.

Long migration history belongs below the snapshot as a ledger.

## LLM Current Edge Card And Trap List

Scenario-driven packages and active sprint snapshots must include a compact
Current Edge Card that an LLM can keep in working memory without rereading the
full package history.

The card names:

1. representative artifact
2. first frontier edge
3. semantic owner and boundary
4. selected cause or dominant reason
5. allowed edits
6. forbidden edits
7. required first proof
8. allowed stop modes

Put forbidden edits before broad in-scope detail when the package is likely to
tempt widening. For LLMs, "do not edit" boundaries are higher-signal than a long
positive scope list.

Every scenario package also keeps a short LLM Trap List for sprint-specific
mistakes that have already caused churn, such as promoting subordinate evidence,
chasing a downstream consumer before the producer is satisfied, or widening
timeout budgets to mask a selected owner failure.

Current Edge Card workflow:

1. Run the canonical extractors and fill the card before runtime edits.
2. Build or identify the replayable owner-decision fixture or narrow blocker
   probe before runtime edits.
3. If the fixture/probe is missing, create the fixture/probe or stop as
   evidence-incomplete. Do not patch runtime from a representative red run
   alone.
4. Runtime edits may start only after the classification gate and
   implementation gate are both satisfied.
5. After a representative rerun, record the result as one stop mode:
   `representative-green`, `migrated`, `reduced`, `same-frontier`,
   `classification-only`, `architecture-gap`, `contradictory`, or
   `human-escalation`.

Active sprint snapshots keep a compact Frontier Transition Ledger above long
package history:

| Package | Artifact | First frontier | Metric change | Result |
| --- | --- | --- | --- | --- |

The ledger is evidence, not a second status system. It exists to help LLMs
distinguish monotonic reduction from frontier churn.

When a frontier reduces to exactly one remaining node, use the remaining-node
fast path in the Current Edge Card:

```text
Target node:
Required action:
Runtime promotion allowed:
Goal:
Forbidden edits:
```

That fast path should avoid a broad package unless canonical evidence changes
owner, boundary, or required action.

Representative artifacts must use real unique timestamps or otherwise unique
run identifiers. Do not name new representative rerun outputs with placeholder
timestamps such as `T000000Z`; placeholder names make lineage ambiguous and can
hide accidental overwrite.

