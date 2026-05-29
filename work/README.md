# Work Tracking

`docs/` is reserved for end-user or operator-facing documentation.

Internal execution planning, work packages, and sprint tracking live under
`work/`.

`roadmap.md` is the stable AGPL feature sequence and scope map. It does not
activate packages, record the current blocker, or prove release gates. Use the
documents under `work/` for executable state and live readiness truth.

## Directory Layout

- `work/releases/`
  - Release-level planning programs. These sit above tracks, sprints, and
    packages. They record release thesis, non-goals, release gates, and
    cross-track dependencies. They do not activate implementation work.
- `work/tracks/`
  - Durable tracks for long-lived workstreams that span multiple sprints.
    Tracks are generic: they are not tied to one release, version, feature, or
    sprint type. A track can contain development, bugfix, stabilization,
    release-gate, and maintenance sprints. Tracks record proven patterns,
    local divergences, target invariants, acceptance proof, sprint membership,
    and next package pointers. They do not replace packages or sprints.
- `work/ideas/`
  - Human ideas before they are approved for implementation work.
- `work/packages/`
  - Actionable work packages that can be executed end to end.
- `work/sprints/`
  - Optional grouping documents that collect several active work packages into
    one focused push.
- `work/templates/`
  - Templates for ideas, generic work packages, and lane-specific package
    shapes.
- `work/theory-ledger.md`
  - Evidence-linked index for current experiments, causal theories, and
    superseded hypotheses. It is advisory only: packages, current-blocker
    files, and artifacts remain canonical.

## Recommended Workflow

Use one simple path for executable work:

1. Capture the human idea.
2. Triage it.
3. Sharpen `roadmap.md` first only when feature scope, product direction, or
   broad sequence changes; otherwise create a direct work package.
4. Work the package until done.
5. Run `npm run work:close <package>` to validate, rename, refresh handoff,
   stage the focused package slice, and create the focused local close commit.
6. Push the focused close commit with `npm run work:sprint:push --
   <git-push-args>` before starting the next package.
7. When `npm run work:sprint:remaining` reports zero packages left after the
   push, run
   `npm run work:sprint:advance -- --dry-run` and then `--write` to close the
   sprint.

For release-scale stabilization, keep the layers distinct:

```text
roadmap scope/sequence
  -> release program
    -> track
      -> sprint
        -> work package
```

Executable work still flows from the package upward:

```text
work package -> sprint -> track -> release program
```

The roadmap constrains scope and sequence. The release program owns release
thesis and gates. Tracks own long-lived workstreams and cross-sprint
invariants. Sprints group active execution and can be development, bugfix,
stabilization, release-gate, or maintenance oriented. Packages remain the only
executable unit and the only place to record package proof, validation, commit,
and push ledgers.

For a compact dependency view between release tracks, sprints, and the active
package, use `work/releases/0.1-dependency-map.md`.

Use the tracker utility for current sprint/package mechanics:

1. `npm run work:current-blocker` regenerates the compact current-blocker
   handoff files from the active package metadata.
2. `npm run work:context` prints a compact human and LLM handoff with the
   current blocker, first-read files, proof ladder, useful commands, and dirty
   worktree summary. Add `-- --bootstrap` for the minimal LLM boot commands,
   first files, guardrails, and closure path.
3. `npm run work:llm-start` prints a fuller LLM startup bundle: work context,
   package doctor suggestions, dirty scope, model-ledger summary, and
   representative evidence summary for the active artifact.
4. `npm run work:dirty-scope` prints only the dirty worktree scope report,
   grouped into package-owned, tracker-generated, and unrelated entries. Add
   `-- --package work/packages/active-...md` to scope the report to a package
   other than the generated current blocker.
5. `npm run work:tracks` prints a compact table of the current tracks, their
   current status, active sprints, upcoming sprints, and each listed sprint's
   relation to the track. It reads `work/tracks/`, the 0.1 dependency map, and
   `work/sprints/current-blocker.json` when present. If the active
   current-blocker sprint is missing from the track membership or dependency
   map, repair that attachment before trusting track-level status text.
6. `npm run work:sprint:remaining` prints active and todo packages left in the
   current active sprint.
7. `npm run work:sprint:advance -- --dry-run` checks whether the current active
   sprint has no active/todo packages left. Re-run with `-- --write` to rename
   the sprint to `done-*` and update track/release references.
8. `npm run work:sprint:push -- <git-push-args>` runs `git push` with the
   provided arguments and then runs `npm run work:sprint:remaining` after a
   successful push. Use this wrapper for sprint package pushes so the remaining
   sprint work is visible immediately after the push.
9. `npm run work:model-ledger -- summary` prints recent model, reasoning
   effort, output profile, task class, package class, intended minimum model,
   scope shape, escalation, bailout, outcome, validation, correction-loop, and
   review-finding signals with an advisory recommendation to escalate,
   de-escalate, or hold effort plus a bounded recommended executor so
   escalation does not silently mean inheriting a larger parent model.
10. `npm run work:package:doctor -- work/packages/active-...md` prints a compact
   package summary plus the same validation findings used by the tracker. It is
   a local diagnostic aid only; it does not replace checked Execution Evidence
   role proof.
   Add `-- --suggest` or `-- --fix-dry-run` when validation failed and the LLM
   needs concrete schema or ledger guidance before editing the package.
11. `npm run work:package:schema` prints the shared status, lane,
   causal-outcome, scenario-classification, stop-condition, and bounded-progress
   enums used by templates and validation.
12. `npm run work:package:new -- --lane <lane> --title <title> --slug <slug>
   --owner <owner> --boundary <boundary> --dominant-reason <reason>
   --next-action <action>` scaffolds a schema-valid work package. The
   scaffolder pre-fills Model Fit and Core Logic Brief defaults from the lane
   and model-ledger summary unless explicit Model Fit flags are provided.
13. `npm run work:theory-loop -- start|next|record|fix` keeps low-ceremony
   theory-loop sprints moving with concrete 2-4 option sets, one promoted
   executable package, source/log discriminator outcomes, and theory-ledger
   updates through intent flags before hand-editing markdown. `start` and
   `next` require a concrete representative artifact, mechanism-card fields,
   and structured options containing `mechanism:`, `intervention:`,
   `modification:`, `discriminator:`, `promotion:`, and `rejection:`. A
   promoted theory-loop work package must include at least one `src/` source
   code `--write-scope`, falsifier and regression proof, result recording, and
   a successor package; evidence-only or classification-only discrimination
   stays in the sprint until it selects real source work. A theory-loop sprint
   stays active indefinitely and can close only after `## Theory Loop Success
   Evidence` records `Success condition met: yes`, `Matched success condition`
   equal to the original `Evidence Anchor` success condition, fresh
   representative evidence, and `Result: success-condition-met`.
14. `npm run work:package:route-after-rerun -- --artifact <artifact>
   --successor <active-successor>` combines the post-rerun route handoff with
   the package migration transaction when the successor already exists and is
   ready to become the active blocker. It also prints the required refresh
   sequence: update Sprint Strategy Brief, update Current Edge Card, run
   `npm run work:repair`, and run pre-implementation validation.
15. `npm run work:repair` regenerates generated current-blocker files and the
   active sprint Current Edge Card, then checks freshness. Use this instead of
   hand-editing generated tracker state.
16. `npm run work:evidence-summary -- <artifact>` prints a compact deterministic
   topology plus causal-model summary for LLM handoff before reading raw logs or
   large harness segment files.
17. `npm run work:scenario-route -- <artifact> [--owner <owner>]
   [--boundary <boundary>] [--explain <edge>]` combines representative
   evidence, causal routing, priority residuals, owner-file discovery, and a
   capped proof ladder into one handoff. Prefer this over listing multiple
   extractor commands in diagnostic classification packages.
18. `npm run analyze:owner-files -- <owner> [boundary]` prints a ranked
    owner-to-files index so agents can inspect likely owner files before broad
    text search.
19. `npm run analyze:priority-recovery-residuals -- <artifact>` extracts
    priority-recovery partition witnesses by owner and boundary and prints
    package scaffolding commands for deliberate residual splits.
20. `npm run work:subagent-prompt -- --role implementation|verification-fix
    --package work/packages/active-...md` generates bounded role prompts and
    the `## Execution Evidence` line shape to record after role execution.
    A real sub-agent may perform the role, but real-agent identity is optional
    provenance. Legacy `review` and `fix` prompts remain available for
    historical inspection only. The prompt includes the package spawn/execution
    model and tells the parent to set it explicitly instead of relying on
    inherited high-model defaults. It records `## Execution Evidence`; agent
    identity is optional provenance.
21. `npm run work:oversized-next -- --markdown` turns oversized
    owner-boundary segment files into package-ready extraction candidates so
    file-size debt stays actionable rather than a broad background concern.
22. `npm run work:validate -- --entry|--probe|--pre-impl|--closure` checks active and
   metadata-bearing packages for filename/header drift, stale open checklist
   items, and lane-required execution proof at the requested phase. The default
   phase is `--pre-impl`; `--probe` validates experiment-lane hypothesis,
   discriminator, observable prediction, proof, and no-runtime-write metadata.
   Packages with `modelFit.packageClass=compact-probe` also stay at or below
   30 markdown lines and omit the closure evidence ladder. `--closure` is strict
   for implementation evidence.
22. `npm run work:close work/packages/active-...md` is the package closure
    transaction. It validates closure, renames the package to `done-*`, updates
    sprint references, refreshes tracker handoff, stages exactly the package
    commit scope plus generated handoff files, and creates the focused local
    close commit. Push that commit with `npm run work:sprint:push -- <args>`.
    `npm run work:package:close -- --write ...` is a lower-level legacy move
    helper and should not be the default LLM closure path.
23. `npm run work:package:migrate -- --write work/packages/active-...md`
    `work/packages/active-successor.md` performs the same closure gate while
    recording a successor handoff.
24. `npm run work:package:move -- --write work/packages/todo-...md --to active`
    performs non-terminal state moves.
25. `npm run work:package:evidence-block -- <artifact>` generates a Markdown
    owner/evidence block from topology-convergence analyzer output for package
    migration or contraction notes.
26. After each completed package slice, create one focused git commit containing
    only that slice's package-owned changes and push the current branch before
    starting the next slice. Use `npm run work:sprint:push -- <git-push-args>`
    for sprint pushes so the remaining package list is printed after a
    successful push.
27. If the slice cannot be pushed because the remote or credentials are
   unavailable, record the unpushed commit SHA and reason in the package or
   sprint handoff. If package-owned and unrelated dirty changes cannot be
   separated safely, stop for human direction instead of committing a mixed
   slice.

## Experiment And Theory Ledger

Use `work/theory-ledger.md` as a compact memory of experiments and theories
that agents should consider before selecting or resuming work. The ledger is an
index, not source of truth: package metadata, generated current-blocker files,
and artifacts decide package status and routing.

Update the ledger only at package closure, representative rerun routing,
architecture gate decisions, or deliberate seed/backfill packages. Prefer
supersession over rewriting older entries. If evidence is uncertain, stale, or
not rerun after a route change, mark the entry `stale` or `needs-rerun` rather
than inventing a conclusion.

Each entry records an id, status, scenario/gate, owner/boundary, hypothesis,
probe, artifact/result, representative movement, linked packages,
supersession, and next implication. Start from
`work/templates/theory-ledger-entry.md`.

## Workflow Acceleration Rules

The tracker should spend most of its time moving representative evidence or
focused implementation, not refining administration. Use these defaults unless
the package explicitly records a heavier audit or architecture reason. Lane
names below are package metadata lane values accepted under the canonical lane
groups in `work/RULES.md`:

1. `npm run work:advance -- --check` is the fast path before more package
   editing. It prints doctor findings, the next delegated role, and entry plus
   pre-implementation validation in one pass.
2. Use packages only for durable truth changes. Read-only answers, reviews,
   recommendations, and tiny docs-only observations stay in `read-doc` unless
   they change implementation truth, roadmap scope/state, architecture ownership,
   package truth, or validation obligations.
3. Representative reruns are the progress currency for release-gate sprints.
   Classification is an inline gate by default. Create a separate
   classification package only when the rerun changes owner, boundary, required
   action, stop condition, tracker truth, or successor selection.
4. Durable proof ladders default to 3-5 commands for readability; validators
   enforce role and phase requirements, not exact command count. Use
   `npm run work:scenario-route -- <artifact>` to replace separate evidence,
   causal, residual, owner-file, and explain commands when the package is
   classifying or routing diagnostic evidence.
5. Admin-only packages, meaning packages whose write/commit scope is limited to
   `work/` tracking files and ledgers, must end the next pass by doing one of
   four things: run representative evidence, close as classification-only, open
   a concrete runtime/tooling bug package, or present a human gate.
6. Repeated sibling leaves with the same owner, boundary, write-scope prefix,
   and causal question should share an epic/frontier package. The parent owns
   the discriminator and retrospective; leaves stay mechanical and skip theory
   ledger ceremony unless they discover new durable route knowledge.
7. Architecture gates are for repeated oscillation or missing owner contracts.
   Once a gate has a selected route, future packages execute that route or
   rerun evidence; they do not open another architecture gate unless fresh
   canonical evidence contradicts the selection.
8. Use the executor plus verifier-fixer role model for real package work. One
   executor owns inspect, edit, focused proof, and changed-file reporting. One
   separate verifier-fixer then verifies the last package work, may fix any
   in-scope problem directly, reruns focused proof, and reports changed files.
   Closure proof is the package's `## Execution Evidence`. A real sub-agent may
   perform either role, but agent identity is optional provenance and must
   never be invented.
9. Use the `mechanical-maintenance` lane for docs, templates, schema text,
   package metadata, generated handoff text, and similarly mechanical edits
   that do not change runtime or test behavior. These packages should be
   Spark-safe by default.
10. Use the `test-only-proof` lane when the package only adds or tightens tests,
   fixtures, or package proof around already-selected behavior. Runtime files
   stay out of `writeScope` and `commitScope`; open a separate implementation
   package for the fix.
11. Use the `diagnostic-classification` lane when the package is driven by a
   representative artifact but edits only diagnostics, diagnostic tests, and
   work-tracker files. This lane keeps causal ledgers and representative
   evidence; use executor proof and add verifier-fixer closure proof when the
   package changes tests, scripts, tracker truth, runtime contracts, or
   scenario behavior.
12. Use the `experiment` lane for probe packages whose success criterion is
   information. An experiment closes green when it distinguishes competing
   hypotheses with a pre-registered observable prediction, even when no runtime
   line changes.
13. Use the `bounded-experiment` lane for same-owner or tightly scoped
   hypothesis-driven slices that inherit current owner/boundary context and
   merge only after focused proof plus canonical evidence movement. The
   executor owns the implementation pass; a separate verifier-fixer is required
   before closure when runtime behavior, tests, scripts, or tracker truth
   changed.
14. Use the `single-file-runtime` lane for a preselected one-file runtime slice
   intended for `gpt-5.4`. It still needs a Core Logic Brief, focused proof,
   and explicit do-not-edit scope, and it must split as soon as a second runtime
   file, shared contract, or owner migration is needed.
15. Once canonical owner and boundary are stable and the route is local runtime
   work, prefer a `runtime-owner-boundary` successor over another
   classification package.
16. For read/probe work, start from `work/templates/probe-package.md` and
   validate with `npm run work:validate -- --probe <package>`. A probe package
   should name one falsifiable question, one hypothesis discriminator, one
   pre-registered observable prediction, and one stop rule; it should not carry
   `## Execution Evidence`.
17. Before adding more workflow policy, run the feedback loop:
   `npm run work:audit:ceremony -- --summary --limit 10`,
   `npm run work:audit:siblings`, and `npm run work:audit:validators`. Use the
   largest owner/lane or sibling clusters to decide whether an epic/frontier
   parent, validator simplification, or no new package is the right response.

## Discovery Gate

Use a `## Discovery Gate` as package-local thinking space when an LLM needs to
compare plausible owners, boundaries, or routes before implementation scope is
safe. It is not a status system, a current-blocker replacement, or a
theory-ledger entry. The `discovery` lane is the package lane for route-selection
work whose output is this gate; runtime, scenario, and maintenance packages may
also carry the gate when ambiguity must be resolved before edits.

Use the gate when any of these are true:

1. `modelFit.ambiguityScore >= 2`
2. multiple owners, boundaries, or hypotheses could explain the same symptom
3. the package repeats a same-frontier or same-action pattern
4. write scope, do-not-edit scope, or focused proof cannot be chosen without one
   discriminator

Skip the gate when owner, boundary, route, do-not-edit scope, and proof are
already explicit, especially for read-doc, doc-only, or straightforward
maintenance packages.

Required package fields:

```md
## Discovery Gate

- Symptom / decision question:
- Current evidence:
- Candidate owners / boundaries:
- Competing hypotheses:
- Cheapest discriminator:
- Do not edit yet:
- Selected route:
- Promotion rule:
```

Promotion rules are strict:

1. If the discriminator is only needed to choose the package route, open or use
   an `experiment`/probe package before implementation.
2. If the selected route changes active owner, boundary, required action, stop
   condition, or successor, update current-blocker/successor truth through the
   normal workflow tools.
3. If the conclusion is durable route knowledge future agents should reuse,
   add or supersede a `work/theory-ledger.md` entry at closure, rerun routing,
   or an architecture gate. Do not write ledger entries for transient local
   reasoning.
4. If the gate only clarifies the current package and does not change durable
   route truth, keep it in the package and leave current-blocker and the theory
   ledger unchanged.

Relationship to existing structures:

1. The Core Logic Brief records the selected domain decision after the route is
   chosen; the Discovery Gate records why that route was selected or why a
   probe is required first.
2. The Decision Experiment Gate applies to runtime, scenario, and causal lanes
   after a route is selected. It tests the chosen implementation hypothesis;
   the Discovery Gate prevents choosing that hypothesis by momentum alone.
3. The Two-Level Theory Contract applies when the route is repeated,
   architecture-gated, owner-migration, or causal-escalation work. It separates
   whole-system causal mapping from the one executable slice.
4. Execution Evidence records implementation and verification-fix proof. Optional
   explorer, skeptic, or integrator notes are provenance only and do not replace
   required closure roles.

## Core Logic Brief

Runtime owner-boundary, scenario/release-gate, and causal-escalation packages
must include a `## Core Logic Brief` before implementation starts. The brief
records the domain decision, not just the file list:

1. `Canonical outcome`
2. `Inputs/signals`
3. `State model or invariant`
4. `Non-goals and forbidden interpretations`
5. `Proof mapping`
6. `Wrong-slice trigger`

Small read/review/doc-only and lightweight maintenance packages may omit the
brief or record `not-needed: no runtime, scenario, or shared contract decision
changes`. Subagent prompts include the brief so review and implementation check
logic and proof against the same package contract.

## Decision Experiment Gate

Active runtime owner-boundary, scenario/release-gate, and causal-escalation
packages must carry a `## Decision Experiment Gate` before implementation
starts. The gate keeps the package focused on the theory and implementation
being tested rather than on process administration.

Required fields:

1. `Decision question`
2. `Architecture review`
3. `Competing hypotheses`
4. `Pre-edit focused probe`
5. `Success metrics`
6. `Representative rerun`
7. `Kill rule`

The pre-edit focused probe and representative rerun must name executable
commands. Success metrics must name concrete metric/count/frontier movement,
owner-boundary migration, or representative green. The kill rule must stop or
escalate on unchanged same-frontier or no-reduction evidence.

When `architectureDecisionGate.status=watching` and
`trigger=frontier-oscillation`, pre-implementation validation blocks another
runtime package whose proof ladder ends in `npm test`. The next package must be
an `experiment`/probe with H1 vs H2 vs H3 observable discrimination and an
`observablePrediction` written before runtime edits resume.

Classification-only fast-path, pure classification, read/review/doc-only, and
lightweight maintenance packages do not require the gate unless implementation
scope is promoted. The package scaffolder emits the gate for strict runtime and
scenario lanes, validators enforce it before implementation, and delegated role
prompts include it so review, fix, and implementation agents test the same
decision experiment.

## Two-Level Theory Contract

Active causal-escalation, architecture-gated, owner-migration, and repeated
same-frontier packages must carry `systemTheory` and `sliceTheory` metadata
before implementation.

`systemTheory` captures the whole-system causal map: problem statement, phase
chain, owner-boundary map, stable and changed facts, competing and eliminated
theories, downstream symptoms, transition table, migration triggers,
architecture-gap triggers, and whole-system invariant.

`sliceTheory` turns that map into the one executable package contract. It cites
the system theory, names the selected theory and mechanism, source/test
contract, falsifier, expected representative movement, kill rule, theory-fit
score, and wrong-slice triggers. Theory-fit score fields use high, medium, or
low with a rationale.

The scaffolder emits both fields for scenario causal packages, current-blocker
renders both fields into handoffs, subagent prompts include them, and
pre-implementation validation blocks local runtime work when repeated frontier
evidence has no system-level selection.

## Tool-First LLM Workflow

The workflow tools are the default entry path for all future packages, not a
single-sprint convention. Before reading raw distributed JSON, large harness
segments, raw logs, or writing ad hoc `jq`, an LLM should use the applicable
canonical extractor:

1. Package metadata or package-status changes:
   `npm run work:package:doctor -- --suggest <package>`,
   `npm run work:package:doctor -- --fix-dry-run <package>`,
   `npm run work:package:schema`, and `npm run work:package:new -- ...`.
2. Representative artifacts:
   `npm run work:evidence-summary -- <artifact>` plus the focused scenario
   extractor for the failure class.
3. Owner discovery:
   `npm run analyze:owner-files -- <owner> [boundary]`.
4. Delegated role prompts:
   `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file reduction:
   `npm run work:oversized-next -- --markdown`.

Raw JSON slicing, raw-log sampling, or ad hoc `jq` is allowed only after the
relevant canonical extractor is missing or insufficient. Record the extractor
that was tried and the fallback reason in the package.

Use `npm run work:model-ledger -- record` to append explicit package experience
to `work/model-ledger.jsonl` when a package adds useful model-fit evidence:

```bash
npm run work:model-ledger -- record \
  --package work/packages/active-YYYYMMDD-slug.md \
  --model gpt-5-codex \
  --reasoning-effort medium \
  --output-profile medium \
  --task-class workflow-tooling \
  --package-class bounded-implementation \
  --intended-minimum-model gpt-5.3-codex-spark \
  --scope-shape leaf-slice \
  --escalated false \
  --bailout-reason none \
  --outcome success \
  --validation-status passed \
  --correction-loops 0 \
  --review-findings 0 \
  --notes "short package-specific note"
```

The ledger is advisory. It helps future agents choose a model, reasoning
effort, and output profile, but it never replaces `npm run work:validate`, lane
selection, focused validation, package closure, or commit discipline.

## Execution Evidence By Lane

Choose the lightest workflow lane that still proves the owner boundary was not
weakened. Record the lane in package metadata as `lane`.

Real sub-agents are not required by default. Closure is role-based: record an
`implementation` role, then a `verification-fix` role when the package changes
code, tests, scripts, runtime contracts, tracker truth, or generated handoff
state. `read-review-doc-only`, `lightweight-maintenance`,
`mechanical-maintenance`, `test-only-proof`, `diagnostic-classification`,
`bounded-experiment`, and `single-file-runtime` packages may execute those
roles in the parent session unless the package or human explicitly requests
delegation. These lanes should prefer direct implementation and focused proof.

For `runtime-owner-boundary`, `scenario-release-gate`, and
`causal-escalation` packages, use the lightest valid path that preserves the
owner boundary. Package metadata, route selection, scope declaration, proof
planning, and stop-rule setup may happen before `--pre-impl`; implementation
code changes must wait until `npm run work:validate -- --pre-impl <package>`
passes. Closure remains strict.

**packageClass → freshness-review mode matrix.** Which packages require a
real `freshness-review` sub-agent (vs parent-executed review) is driven by
`modelFit.packageClass`, with lane as a legacy fallback:

| packageClass (or lane fallback) | Mode | Required pre-impl review |
| --- | --- | --- |
| `system-theory-rederive` (and aliases) | strict | real `freshness-review` sub-agent. |
| `architecture-gap-analysis` (`architecture-gap*`) | strict | real `freshness-review` sub-agent. |
| `representative-frontier-closure` on runtime/scenario/causal lane | strict | real `freshness-review` sub-agent. |
| `classification-only`, `documentation-only`, `lightweight-maintenance`, `probe-only` (and `read-doc` / `*-maintenance` lanes) | lite | parent-executed review acceptable; record the five freshness fields inline in the package ledger. |

The matrix is canonical in
[`.kiro/steering/workflow-guidelines/subagents.md`](../.kiro/steering/workflow-guidelines/subagents.md);
the runtime surface in [`.kiro/steering/llm/boot.md`](../.kiro/steering/llm/boot.md)
links here.

The preferred package proof for new packages is structured execution metadata:

1. `execution.implementation.parentRevalidatedFocusedProof: true`
2. `execution.implementation.filesChanged: [...]`
3. `execution.verificationFix.parentRevalidatedFocusedProof: true` when
   verifier-fixer proof is required.
4. `execution.repair.validationCommand: "npm run work:repair"` when tracker
   handoff was refreshed.
5. `execution.theoryLedger: "no-ledger-update"` or real
   `execution.theoryLedgerRefs`.

Legacy and reopened packages may still use `## Execution Evidence`:

1. Implementation: `- [x] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: verification.`
2. Verification-fix: `- [x] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.`

`verification-fix` is mandatory before closing packages that change code, tests,
scripts, runtime contracts, package/tracker truth, or generated handoff state.
Pure Q&A and tiny docs-only changes may skip packages and verifier-fixer
entirely. Agent identity may be appended as `agent: Agent <name> (<agent-id>);`
when a real sub-agent was used and recovery would benefit from that provenance.
It is not required for implementation truth and must not be invented. When
delegation is unavailable or intentionally waived, record `human-waived`,
`tool-unavailable`, or `blocked-by-environment-policy` with a `reason: ...`
instead of a fake agent identity.

Worker-reported validation is handoff evidence only. The parent session must
rerun focused proof locally before committing runtime edits or marking package
closure complete. If an executor or verifier-fixer stops with edited files and
no validation, record `status: partial-unvalidated` with a `blocker:` or add a
later checked superseded/revalidated evidence item before closure.

Historical subagent ledger sections are provenance only. If a package with
those sections is reopened or closed again, migrate the current proof to
`## Execution Evidence`.

`npm run work:validate -- --entry` validates package shape and contracts.
`--pre-impl` is required before implementation code changes. When
implementation scope is bounded, `--pre-impl` does not block solely on legacy
process-ledger sections. `--closure` is strict: implementation evidence must be
checked, terminal, focused-proof-backed, and parent-revalidated before package
closure.

Legacy active metadata packages without `lane` remain strict. Historical
`done-...` packages without `## Execution Evidence` remain valid. Legacy
subagent ledgers are no longer closure gates, but doctor output reminds
maintainers to migrate them at the next closure. In `## Execution Evidence`,
agent identity is optional, but template placeholders such as `<...>` and
pending markers such as `pending-before-implementation-resumes` remain closure
validation failures. Historical closed-package proof is not backfilled by
invention.

## Commit And Push Ledger

Packages closed under the current tracker workflow must identify the focused
package slice commit and the remote branch it must be pushed to. The package
file must include:

1. `Focused package commit: <sha>`
2. `Push target: <remote>/<branch>` (legacy alias `Pushed to:` accepted)
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`
4. `Pushed: no` (flipped to `yes <ISO-timestamp>` by `npm run work:sprint:push` after a successful push; optional for pre-F7 packages)

`npm run work:validate` rejects closed metadata-bearing packages marked by the
tracker as requiring this proof when the ledger is missing, leaves
placeholders, omits the push target, or does not affirm that the commit
contains only package-owned files plus package-status or allowed sprint handoff
updates. Historical closed packages without truthful commit/push proof are not
backfilled by invention; if they are reopened, migrated, or closed again, the
proof is required.

`npm run work:close` creates the local close commit and populates the focused
commit SHA, `Push target`, and `Pushed: no` when the ledger section is
present. The actual push is the next required step and should use
`npm run work:sprint:push -- <git-push-args>`; on success it flips
`Pushed: no` → `Pushed: yes <ISO-timestamp>`. If push is blocked by remote,
credential, or policy state, record the unpushed commit SHA and reason in the
package or sprint handoff; do not invent pushed proof.

## Triage Rule

An idea must become or update a `roadmap.md` item first when it does any of
these:

1. Adds a new feature area.
2. Changes product scope or user-facing direction.
3. Commits the repository to a new multi-step implementation track.
4. Is too broad to execute safely as one bounded package.

An idea may become a direct work package when it is already within approved
scope and is one of:

1. Bug fixing.
2. Refactoring or simplification.
3. Reliability or performance work.
4. Test harness stabilization.
5. Architecture cleanup within an already-approved roadmap area.

Direct work packages must still cite the roadmap row, existing subsystem, or
already-approved maintenance/refactor scope they belong to. Do not use roadmap
state as evidence that a release gate is green; cite the release, track,
sprint, or package proof instead.

## Filename State Model

Keep the filename state model intentionally small:

1. `idea-YYYYMMDD-slug.md`
2. `todo-YYYYMMDD-slug.md`
3. `active-YYYYMMDD-slug.md`
4. `done-YYYYMMDD-slug.md`
5. `superseded-YYYYMMDD-slug.md`

Use rename, not copy, when state changes.
Package metadata status mirrors the package filename and uses the same
executable states: `todo`, `active`, `done`, or `superseded`. There is no
`failed-*` package filename state; aborted or displaced work stays active with
an explicit blocker, moves back to `todo-*`, or becomes `superseded-*` with a
successor link.

Examples:

- `idea-20260409-control-plane-simplification.md`
- `todo-20260409-control-plane-simplification.md`
- `active-20260409-control-plane-simplification.md`
- `done-20260409-control-plane-simplification.md`
- `superseded-20260409-control-plane-simplification.md`

Do not create parallel status systems in both directory names and filenames.
The filename is the status. Metadata and generated current-blocker status fields
are mirrors that must match the filename; they are present for validators and
handoff tools, not as an independent source of truth.

## Package Rules

Create packages with `npm run work:package:new -- --write ...` whenever
possible. That command owns the current metadata shape and validates the package
before writing it. It emits a lane-appropriate body: light lanes get a minimal
package; heavy lanes additionally carry mechanism, theory, representative-delta,
and rerun sections. Do not hand-copy validator-unenforced steering doctrine
(tool-first, workflow acceleration, drift-ledger checklists, shared-boundary
contracts, residual inventories) into packages — that guidance is the
always-loaded contract and the closure validator rejects it on active packages
(see RULES.md §Package Economy). Every active package should start with a
machine-readable `work-package-v2` metadata comment shaped like this minimal
example:

```md
<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "YYYY-MM-DD",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "canonical_owner",
    "boundary": "focused_boundary",
    "dominantReason": "current_dominant_reason",
    "currentState": "one-line current state",
    "nextAction": "next proof or implementation action"
  },
  "scope": {
    "writeScope": [
      "path/to/file"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "path/to/file",
      "work/packages/active-YYYYMMDD-package.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why this package is the right next action"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "regression: focused command"
      ]
    }
  }
}
-->
```

Use `npm run work:package:schema` for the full status, lane, outcome, and
evidence enums. Scenario, runtime, experiment, and causal packages add the
lane-required metadata described below; do not copy stale examples from old
packages.

The header exists to make handoff and automation reliable. The prose package
must keep these scope fields distinct:

1. `writeScope`: files the package or implementation role may edit.
2. `handoffFiles`: files or artifacts to read for context only.
3. `generatedFiles`: outputs produced by tracker, steering-pack, or other
   deterministic generators.
4. `candidateRuntimeFiles`: possible runtime/test files that require a focused
   probe before they become write scope.
5. `commitScope`: files allowed in the focused package commit. When omitted,
   tooling falls back to `writeScope` for new packages and to legacy
   `touchedFiles` for older packages.

`writeScope` and `candidateRuntimeFiles` MUST NOT overlap. `writeScope` is
what this iteration will modify; `candidateRuntimeFiles` is the proposal
surface for the *next* package. Promote candidates into `writeScope` only
after the focused owner-file proof named below.

**packageClass write-scope fit (R11).** The validator
`validatePackageClassWriteScopeFit` (`scripts/work-tracker.js`,
errors `rederive-writescope-contains-src` and
`runtime-writescope-no-src`) enforces:

* packages whose `modelFit.packageClass` is `system-theory-rederive` (or
  alias) or any `architecture-gap*` class MUST NOT list any `src/` path in
  `writeScope` (those classes write sprint markdown, `work/theory-ledger.md`,
  and optionally architecture docs; their runtime targets belong in
  `candidateRuntimeFiles`); and
* packages on the `runtime-owner-boundary` lane whose
  `modelFit.packageClass` is `representative-frontier-closure` (the default
  runtime class) MUST list at least one `src/` path in `writeScope` — a
  warning is emitted otherwise so the Real Package Rule is honoured.

`touchedFiles` is legacy metadata. New packages should use the explicit scope
fields so read lists, write ownership, generated outputs, runtime candidates,
and commit containment do not drift together.

`representativeResidual` is required when the active package is workflow,
diagnostics, or classification work whose own `scenario` does not describe the
live release-gate blocker. `current-blocker` renders it separately from the
active package status so focused-green, coverage-only, workflow-complete, and
representative-green cannot collapse into one signal.

Queued runtime, scenario, and causal packages must carry an activation contract
before implementation starts. At minimum, activation must:

1. run `npm run work:package:doctor -- --fix-dry-run <package>`
2. keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope
   fields concrete before pre-implementation validation
3. promote exact files from `candidateRuntimeFiles` into `writeScope` and
   `commitScope` only after focused owner-file proof such as
   `npm run analyze:owner-files -- <owner> [boundary] --markdown`
4. remove stale legacy review/fix placeholders before pre-implementation
   validation; record checked implementation and, when scope requires it,
   verifier-fixer proof before closure validation
5. keep the package artifact path explicit and classify fresh evidence as
   `representative-green`, `reduced`, `same-frontier`, `migrated`, or
   `classification-only`
6. record static guardrails and final deep-dive proof in the validation ladder

body remains the source for reasoning, context, and the checklist.

Every work package should answer:

1. Why this work exists.
2. Which roadmap row or approved scope it belongs to.
3. What is in scope.
4. What is out of scope.
5. What invariants must not regress.
6. What files or subsystems are expected hotspots.
7. What tests and validation are required.
8. What counts as done.
9. If it adds or reshapes a shared runtime boundary:
   - who owns the boundary
   - what the canonical contract shape or vocabulary is
   - which consumers may use it
   - which reinterpretations are forbidden
10. What residual closure remains after the hot-path fix:
   - owner-path cutovers
   - tail consumers
   - diagnostics, admin, or report surfaces
   - superseded paths or vocabulary to delete
11. If the package is driven by a failing scenario:
   - what the current dominant blocker is
   - what probe or scenario will confirm the next-order blocker after each fix
   - where blocker migration will be recorded if the failure moves
   - how the current blocker fits the whole scenario phase chain
   - which downstream blockers are known but not first frontier
   - which missing causal edge still needs a focused probe
   - which probe command and artifact path prove the missing causal edge
   - what observable transition, maximum progress bound, and same-frontier
     fallback govern retryable or backpressure states
12. If the package touches lifecycle, readiness, admission, recovery, or
    convergence behavior:
   - what the shared progress grammar is
   - what blocked, deferred, retryable, terminal, and ready mean
   - which surfaces are allowed to expose that grammar directly
13. If the package touches runtime, control-plane, harness, diagnostics, admin,
    shared test infrastructure, or broad refactor boundaries:
   - which static guardrails apply
   - what the preflight baseline is
   - what inherited write-scope debt is in or out of scope
   - what after-state proves no drift increased
14. If the package has accumulated repeated blocker migrations:
    - which single current blocker remains active
    - which historical migrations are evidence only
    - whether the next step is a contraction package instead of another broad
      patch
    - what replayable owner-decision fixture or blocker probe represents the
      current blocker
15. If the representative scenario remains red after repeated local fixes or
     classification-only reductions:
    - whether the next package must be causal-analysis infrastructure instead
      of another tactical runtime patch
    - what end-to-end phase model the scenario follows
    - which cross-entity waits and causal edges explain the current blocker
    - which budgets, retry windows, and deadlines bound each phase
    - which invariants and failure classes are canonical
    - what stop conditions decide local fix, owner-boundary migration, broader
      architecture work, or human escalation

## Causal Governance Gate

Scenario-driven active packages must keep systemic reasoning in front of local
bugfixing. `npm run work:validate` requires metadata `causalGovernance` for
active packages with a real scenario.

Required fields:

1. `hypothesis`: the causal hypothesis for this owner-boundary package.
2. `stopConditionCheck`: the causal-model command or artifact check, citing
   `npm run analyze:causal-model`.
3. `expectedCausalModelChange`: the predicted edge/class change that makes the
   runtime patch meaningful.
4. `representativeOutcome`: exactly one of `pending-before-rerun`,
   `representative-green`, `reduced`, `same-frontier`, `migrated`,
   `classification-only`, `architecture-gap`, or `contradictory`. Closed
   packages must not leave it pending.
5. `causalDebt`: residual causal work tracked separately from local closure.
6. `crossBoundaryReview`: whether a periodic cross-boundary review is due now,
   not due, or required before the next runtime package.

The closure rule is: no runtime patch lands merely because it improves a local
symptom. The package must prove the causal model changed in the predicted way,
or classify the result as same-frontier or contradictory and stop broadening.

Use cross-boundary reviews after every two to three scenario-driven packages, or
immediately when a blocker crosses owner boundaries such as active-gate,
publication ACK convergence, operation workflow, and rebalancer ownership.

## Scenario Causal Closure Gate

Scenario-driven active packages must also carry metadata
`scenarioCausalClosure`. First-frontier migration is not enough: the package
must preserve whole-scenario causal understanding so successor work does not
forget the phase chain or known downstream blockers.

Required fields:

1. `referenceScenarioOrProbe`: the named scenario or focused blocker probe.
2. `phaseChain`: a non-empty ordered array of scenario phases already known.
3. `currentFirstFrontier`: the current owner, boundary, and reason at the first
   frontier.
4. `knownDownstreamBlockers`: a non-empty array of blockers known to be
   downstream rather than first frontier.
5. `missingCausalEdge`: the unproven causal edge that prevents closure.
6. `missingCausalEdgeProbe`: the focused command that proves or disproves the
   missing edge.
7. `boundedProgressProof`: the focused proof for retryable or backpressure
   states. It must name a concrete mechanism such as wake, retry, timeout,
   reconcile, drain, dispatch, delivery, timer, advance, or bounded progress.
8. `boundedProgressProofArtifact`: the path to the proof artifact, focused
   test, report, or diagnostic output that carries the bounded-progress proof.
9. `expectedObservableTransition`: the before/after transition expected in the
   focused probe or report.
10. `maxProgressBound`: the maximum retry, timeout, dispatch, timer, or
    owner-cycle bound before the package must stop and classify the result.
11. `sameFrontierFallback`: the explicit same-frontier action when the probe
    does not reduce or migrate the boundary.
12. `expectedNextFrontier`: the owner boundary expected after this package
   reduces, classifies, or migrates the current edge.
13. `resultClassification`: one of `pending-before-probe`,
   `representative-green`, `reduced`, `same-frontier`, `migrated`,
   `classification-only`, `architecture-gap`, or `contradictory`.
14. `stopCondition`: one of `continue-local-fix`, `bounded-non-frontier`,
   `migrate-owner-boundary`, `classification-only-stop`,
   `architecture-gap-stop`, `representative-green`, or `human-escalation`.

## Observable Prediction

`experiment` packages and watching frontier-oscillation routes must carry
metadata `observablePrediction`. Runtime/scenario packages should use the same
field when representative movement is predicted.

Required fields:

1. `metric`: the numeric/state signal being predicted.
2. `predicted`: the expected observable transition written before the run.
3. `observed`: the actual transition, filled at closure.
4. `accuracy`: one of `pending-before-observation`, `matched`, `partial`,
   `missed`, or `contradicted`.
5. `evidence`: the focused command or artifact supporting the observation.
6. `metricDelta`: optional numeric representative metric points moved when the
   movement can be measured.

Closure validation compares `predicted` and `observed` when accuracy is
`matched`; mismatches must be recorded as `partial`, `missed`, or
`contradicted`. `npm run work:package:cost` aggregates movement-classified
package ratios, numeric representative points moved where present, and
prediction accuracy across closed packages.

## Experiment Outcome

At closure, `experiment` packages must record `experimentOutcome`. The outcome
records what the probe learned, not whether a runtime metric moved:

1. `distinguishedHypothesis`: `H1`, `H2`, `H3`, etc., or
   `evidence-incomplete`.
2. `decision`: one of `open-runtime-owner-boundary`,
   `open-architecture-contract`, `owner-boundary-migration`,
   `human-escalation`, or `evidence-incomplete`.
3. `nextOwner` and `nextBoundary`: required when the decision opens runtime or
   owner-boundary migration work.
4. `evidence`: focused command or artifact that supports the outcome.

Representative reruns can confirm a causal edge, but they do not replace the
focused probe for a missing wake, retry, timeout, reconcile, drain, dispatch,
delivery, timer, advance, or bounded-progress mechanism.
Retryable or backpressure first frontiers cannot be classified as bounded or
non-frontier with prose alone: the package must name the probe command, proof
artifact path, observable transition, maximum progress bound, and
same-frontier fallback.

## Model Fit

Active metadata-bearing packages must include a `## Model Fit` section. The
section records the minimum model the package is designed for and the exact
conditions that require escalation before scope expands silently.

Required fields for every active metadata-bearing package:

1. `Package class`
2. `Intended minimum model`
3. `Scope shape`
4. `Output profile`

`Output profile` controls final-response and handoff verbosity, not reasoning
depth. Valid values are `small`, `medium`, `high`, and `extra-high`. Default to
`medium` for runtime, scenario, and causal packages; use `high` or
`extra-high` only when the package explicitly asks for an audit, architecture
review, or retrospective artifact.

Packages whose intended minimum model is `gpt-5.3-codex-spark` are linted as
bounded leaf slices. They must also name:

1. `Owned files`
2. `Do-not-edit scope`
3. `Frozen decisions`
4. `Escalation triggers`
5. `Focused proof`

Packages intended for `gpt-5.3-codex-spark` must use
`Scope shape: leaf-slice` and must not contain open-ended frontier language. If
a package must chase a new owner boundary, broaden write scope, or reopen
frozen decisions, mark it as escalated in the model ledger instead.

Before creating or assigning executable packages, do a model-fit split:

1. Keep route selection, owner/boundary choice, representative evidence
   interpretation, and architecture decisions in a stronger planning package.
2. Split mechanical edits into `mechanical-maintenance` packages intended for
   `gpt-5.3-codex-spark`.
3. Split tests and fixtures into `test-only-proof` packages intended for
   `gpt-5.3-codex-spark`.
4. Split one inherited-owner hypothesis into a `bounded-experiment` package
   intended for `gpt-5.3-codex-spark`.
5. Split one preselected runtime file into `single-file-runtime` intended for
   `gpt-5.4`.
6. Keep cross-owner runtime integration, shared contract changes, and
   architecture route decisions on `runtime-owner-boundary`,
   `scenario-release-gate`, or `causal-escalation` packages.

When optionally spawning real sub-agents, use the package's `Target executor` or
intended minimum model explicitly. Do not let the parent session's stronger
model become the default for mechanical, test-only, bounded experiment, or
single-file runtime packages.

Package closure also requires one final deep dive across the affected area:

1. read the write-scope files and their direct owner collaborators as one boundary
2. look for mistakes, irregularities, and doctrine/system-guideline violations
3. fix any discovered issue that falls inside the affected area before renaming
   the package to `done-...`
4. if the package was driven by a failing scenario, rerun the reference
   scenario or blocker probe and record any blocker migration before closure
5. rerun the same static guardrails recorded in the package preflight and
   confirm no relevant count increased

If the work package cannot answer those clearly, it is still an idea, not a
package.

When a scenario-driven package crosses two material blocker migrations, prefer
splitting a new contraction package over continuing to edit the historical
package. The contraction package should carry only the current owner,
boundary, fixture or probe, write scope, and proof ladder. The older package
may stay queued as history or later re-entry work.

Use the topology convergence analyzer to keep that handoff mechanical:

1. `npm run analyze:topology-convergence -- <artifact>` prints the frontier and
   dominant witness.
2. `npm run analyze:owner-explain -- <artifact> <edge-or-alias>` explains the
   evidence snapshot to owner decision outcome.
3. `npm run analyze:owner-decisions` prints the explicit owner decision
   table/state-machine index.
4. `npm run analyze:owner-glossary` prints the canonical owner, boundary,
   reason, and semantic-state glossary.
5. `npm run work:package:evidence-block -- <artifact>` prints a package-ready
   evidence block using the same analyzer output.

Shared-boundary work is not done when only the implementation changes land.
The package should update the relevant architecture record and any bounded
static guardrail in the same work cycle when the boundary contract is durable.

## Package Commit And Push

A completed package slice is not ready for the next package until its
package-owned changes are in a focused local close commit and that commit has
been pushed.

The canonical package section is `## Commit And Push Ledger`. The legacy
heading `## Closure Commit Proof` is accepted only as a compatibility alias;
new and migrated packages should use the canonical heading. Open `todo` and
`active` packages may keep pending ledger values. `done` and `superseded`
packages must carry a real focused commit SHA and push target when closed under
the current policy, and the push must happen before the next package starts.
Historical closed packages opened before 2026-05-14 and missing the section are
grandfathered by validation; if they are reopened, migrated, or closed again,
the canonical ledger becomes mandatory and historical proof must not be
invented.

Required workflow:

1. Finish validation, static guardrails, residual closure, and required
   verifier-fixer proof first.
2. Review the dirty worktree and separate unrelated changes.
3. Run `npm run work:close <package>` to rename or migrate the package, refresh
   handoff files, stage only package-owned scope, and create the focused local
   close commit.
4. Push the current branch before starting the next package slice. For sprint
   pushes, use `npm run work:sprint:push -- <git-push-args>` instead of raw
   `git push`; the wrapper runs `npm run work:sprint:remaining` after a
   successful push so the remaining package queue is visible.
5. If push is blocked by remote, credential, or policy state, record the
   unpushed commit SHA and reason in the package or sprint handoff; do not
   invent pushed proof.
6. If unrelated dirty changes cannot be safely separated from package-owned
   files, stop and ask for human direction before committing.

## Sprint Use

`work/sprints/` is optional.

Use a sprint file only when several active work packages must be coordinated.
The sprint file should link packages; it should not replace them.

Active scenario-driven, release-gate, and causal-escalation sprint files must
keep a `## Sprint Strategy Brief` near the top. The brief records the strategic
logic for the sprint, separate from package-level implementation detail:

1. `Goal state`
2. `Current causal thesis`
3. `Competing hypotheses`
4. `Confidence and evidence`
5. `Expected green path`
6. `Wrong direction signals`
7. `Next best package`
8. `Stop or escalate rule`

Update it whenever the selected owner or boundary changes, fresh evidence
contradicts the thesis, two or three material packages close, or frontier
oscillation appears. The Current Edge Card records the next tactical edge; the
Sprint Strategy Brief records why that edge is strategically correct.

## Classification-Only Fast Path

Use the classification-only fast path for packages that prove no implementation
edit is justified from the current evidence. The metadata must record
`classification-only` as the representative outcome, scenario result
classification, or representative residual status.

Fast-path packages keep `writeScope` and `commitScope` to work-tracking,
handoff, ledger, or documentation files. Runtime, test, script, and report paths
belong in `candidateRuntimeFiles` until fresh evidence promotes implementation.
Pre-implementation validation blocks an active package that records a
`classification-only` outcome while implementation paths remain in
`writeScope` or `commitScope`.

Fast-path proof should be two or three canonical commands: representative
evidence, one focused extractor or probe, and validation or causal-model proof.
Execution Evidence role proof and static runtime guardrails are optional until
implementation write scope is promoted.

Do not create a new classification-only package from the same unchanged
artifact unless owner/boundary, package class, or stop condition changes. Close
the package, rerun fresh evidence, or escalate instead.

## Classification Efficiency Contract

Classification is normally a gate inside the predecessor, successor, or sprint
Current Edge Card. A separate pure classification package is justified only
when it changes durable routing truth: owner, boundary, required action, stop
condition, architecture/human gate, tracker truth, or successor package choice.

Pure classification packages must carry `classificationEfficiency` metadata:

1. `defaultMode`: `inline-gate-default` or `separate-package-approved`.
2. `separatePackageReason`: one of owner/boundary/action changed, runtime
   promotion blocked, architecture/human stop, tracker-truth change, or
   successor selection.
3. `artifactBudget`: `one-artifact`.
4. `proofCommandBudget`: `two-or-three-canonical-commands`.
5. `commands`: the capped canonical commands used for the classification.
6. `decisionRecord`: where the decision is recorded so it is not repeated.
7. `successorAction`: update current package, record in predecessor/sprint,
   open runtime owner-boundary work, open tooling work, open causal escalation,
   present a human gate, or rerun representative evidence.
8. `runtimePromotionRule`: when stable owner/boundary evidence should move to
   `runtime-owner-boundary` work.

Verifier-fixer proof is optional for pure classification packages that have no
runtime, test, script, report, or tracker-truth write scope. The
executor/verifier-fixer path resumes as soon as implementation scope is
promoted.

## Post-Rerun Decision Gate

After every representative rerun, route the artifact before creating or
promoting successor work:

```bash
npm run work:package:route-after-rerun -- --artifact <artifact> ...
```

Successor packages must carry `rerunDecision` metadata naming the source
artifact, route owner, route boundary, route dominant reason, route causal
outcome, stop mode, next lane, expected representative delta, and required
refresh commands. The refresh commands must include route-after-rerun, Sprint
Strategy Brief update, Current Edge Card update, `npm run work:current-blocker
-- --write`, `npm run work:validate -- --entry`, and
`npm run work:validate -- --pre-impl`.

When the route owner and boundary are stable and the causal route is a local
runtime fix, `rerunDecision.nextLane` should be `runtime-owner-boundary`.

Treat local proof and representative proof as separate proof classes. Focused
owner tests or diagnostic extractors can justify a bounded local change, but
only a fresh representative rerun or route-after-rerun result can close the
representative outcome as green, reduced, migrated, same-frontier,
architecture-gap, or contradictory.

Same-frontier without concrete metric or shape reduction stops local patching.
Record an architecture decision gate or human escalation before opening another
local implementation package.

## Systemic Sprint Isolation

When a human asks for way-of-working, systemic, or architecture changes that
should help future sprints, do not silently blend that work into the active
scenario blocker package.

Default rule:

1. Create a separate sprint or package with `scenario: none` unless the package
   explicitly owns scenario-governance metadata.
2. Treat active scenario reports, packages, and sprint files as handoff context
   unless the human explicitly asks to edit that active lane.
3. Put the active runtime package, active sprint file, and runtime directories
   in `Do-not-edit scope` when the package is governance-only.
4. Record runtime architecture ideas as contracts or backlog packages first.
   Implement them later only through a separate `runtime-owner-boundary` or
   `scenario-release-gate` package with focused proof.
5. Keep current-blocker generation pointed at the active release-gate package
   unless the human intentionally switches active work.

Systemic packages may analyze the recent path of blockers. They must classify
each suggested change as one of:

1. workflow or package-policy change
2. analyzer, fixture, or tooling change
3. architecture contract or ADR
4. future runtime implementation package

Only the fourth category is allowed to touch runtime code, and only after it is
activated as its own runtime/scenario package.

Systemic release-gate sprints must also carry a higher-order execution gate:

1. **Blocker-path ledger:** the sprint records the last several material
   blockers, owner-boundary migrations, same-frontier loops, downstream
   blockers, residual semantic states, and the repeated causal edge that
   explains why local packages would otherwise ping-pong.
2. **Architecture contract:** repeated causal edges are converted into one
   owner contract before runtime scope is selected. The contract names the
   semantic owner, vocabulary, allowed consumers, prohibited reinterpretations,
   diagnostics, activation criteria, and the latest active scenario proof it
   reconciles against.
3. **Fixture-first proof:** runtime packages name a focused fixture, extractor,
   or probe before another full distributed rerun is used for confirmation.
4. **Semantic decomposition:** owner files and follow-on packages use names
   that describe the semantic owner or contract, not ordinal stage/segment
   accretion. Stage/segment cleanup is itself an experiment when the hypothesis
   is structural rather than local.
5. **Bounded progress:** retryable, backpressure, accepted, or deferred
   evidence stays active until a wake, retry, timeout, reconcile, drain,
   dispatch, delivery, timer, advance, or bounded migration mechanism and
   maximum bound are named.
6. **Runtime backlog activation:** runtime implementation starts only from a
   backlog item that cites the blocker-path ledger row, architecture contract,
   focused proof, do-not-edit scope, and active-proof reconciliation.
7. **Package cost:** periodic sprint review runs
   `npm run work:package:cost` and reports packages closed per representative
   movement point plus observable prediction accuracy. Owner/boundary rows with
   repeated non-movement packages are high-cost frontiers and should warn during
   review.

When systemic governance work intentionally pauses an active release-gate sprint,
it must also leave a resume activation brief before implementation resumes. The
brief is governance-owned, not runtime-owned, and must name:

1. The latest active artifact and the artifact used when governance started.
2. The concrete blocker-path ledger rows that explain the current frontier.
3. The runtime owner, boundary, residual state, and exact forbidden closure modes.
4. The focused fixture, analyzer, or probe that must pass before the next full
   distributed rerun.
5. The green path sequence from current residual to representative scenario
   success.
6. The stale-proof check that decides whether the brief must be refreshed before
   activation.

Scenario-driven active sprints should keep their newest compact handoff in:

1. `work/sprints/current-blocker.json`
2. `work/sprints/current-blocker.md`

These files are generated from the active package metadata by
`npm run work:current-blocker`. Keep long migration narratives in package
history or archived sprint notes; the current-blocker files are the starting
point for humans and LLM agents.

Recommended naming:

- `active-2026-q2-control-plane-stability.md`
- `done-2026-q2-control-plane-stability.md`

## Simplicity Rule

Do not let the work-tracking system become complicated.

Prefer:

1. One idea file per idea.
2. One work package per executable concern.
3. One filename status, with metadata and generated status fields treated only
   as validated mirrors.
4. One sprint file only when grouping adds real value.

Avoid:

1. Multiple backlog systems.
2. Separate status fields and filename states that can drift or compete for
   authority.
3. Large umbrella packages spanning unrelated concerns.
4. Sprint docs that contain detailed execution steps better owned by packages.

## Size Ratchet

Implementation speed depends on keeping owner files small enough to inspect.

Use `npm run audit:file-size` to keep source-file size debt from increasing.
New or newly edited source-code files must finish within the per-scope
thresholds owned by `scripts/check-file-size-thresholds.js` (currently source
files at or below `800` lines and test files at or below `1500` lines; run
`npm run audit:file-size` to confirm). If a package touches an inherited
oversized source-code file, refactor or extract the touched file until it is
within its scope threshold before closure.

New source-code files must be named for the semantic owner, contract, decision,
state model, or consumer role they contain. Avoid ordinal, segment, or grab-bag
names such as `part-2`, `segment`, `misc`, `helpers`, or `utils` unless that
term is already an established domain concept.

Use `npm run audit:file-size:strict` when a package explicitly owns file-size
cleanup and should fail on any remaining oversized file.

Use `npm run audit:owner-boundary-segments -- <files...>` when an oversized
segment file blocks LLM review. The command emits extraction guidance for
segment-shaped files without refactoring runtime behavior by itself.

## Scoped Static Ratchets

Use scoped ratchets during focused work when the repo-wide complexity output is
too large to be useful:

1. `npm run test:complexity:scoped -- <files...>` reports cyclomatic
   complexity only for the named files or directories.
2. `npm run test:complexity:cognitive:scoped -- <files...>` reports cognitive
   complexity only for the named files or directories.
3. `npm run test:metrics:scoped -- <files...>` runs both scoped complexity
   ratchets and writes compact reports under `test-output/analysis/`.
4. Add `:strict` to fail on any scoped violation, for example
   `npm run test:metrics:scoped:strict -- <files...>`.

The default scoped commands do not fail on inherited local debt; use them to
record before/after counts in the package static drift ledger. Strict scoped
commands are for cleanup packages or touched boundaries expected to be clean.

Repository validation must stay deterministic and local. Use the local
guideline audits (`audit:guideline:literals`,
`audit:guideline:decision-boundaries`,
`audit:guideline:boundary-mode-contracts`,
`guard:guideline:constant-names:file`, and
`audit:runtime-grammar:file`) plus lane-required execution evidence for review
proof; do not depend on network-backed LLM API checks.
