# Rules Canon

Canonical single source of truth for repository process lanes, validator phases, proof requirements, coding constraints, and safety guidelines.

---

## Lane Definitions
<a name="lane-definitions"></a>

All implementation work must select and declare the lightest valid lane. The
canonical lane groups are the requirement buckets printed by
`npm run work:package:schema`. Package metadata may store one of the accepted
lane-specific values below, such as `lightweight-maintenance` or
`runtime-owner-boundary`; requirements are determined by the canonical lane
group those values map to.

| Canonical lane | Accepted aliases | Use when | Package requirement |
| --- | --- | --- | --- |
| `read-doc` | `read-review-doc-only` | Answering questions, reviewing, or editing explanatory docs without changing implementation truth. | No package unless implementation truth, roadmap scope/state, architecture ownership, package truth, or validation obligations change. |
| `maintenance` | `mechanical-maintenance`, `lightweight-maintenance` | Low-risk mechanical, tooling, template, generated steering, package metadata, or durable documentation cleanup. | Use one focused package and focused proof when tracker truth, package templates, workflow behavior, generated steering, or durable process docs change. Subagents are optional unless runtime ownership or shared contracts can change. |
| `proof` | `test-only-proof`, `diagnostic-classification` | Tests, validation evidence, diagnostic classification, or proof-surface changes that do not alter runtime behavior. | Use the active package validation surface, or create one focused proof package when no active package owns the proof. Closure requires the focused proof and any required representative or diagnostic evidence. |
| `experiment` | `bounded-experiment`, `fast-spike` | A bounded hypothesis, probe, or spike decides the next owner, boundary, action, or route. | Use a focused experiment/probe package with a pre-registered question, observable prediction or discriminator, proof command, and stop rule. Runtime changes are allowed only when the package explicitly owns the bounded experiment scope. |
| `runtime` | `single-file-runtime`, `runtime-owner-boundary` | Runtime behavior, owner contracts, control-plane logic, state transitions, shared metadata, diagnostics grammar, or affected consumers can change. | Full package lane required by the validator, including owner contract, Core Logic Brief, focused proof, affected-consumer proof when applicable, static guardrails, and closure validation. |
| `scenario` | `scenario-release-gate`, `causal-escalation` | Distributed, integration, load, release-gate, repeated same-frontier, causal-closure, or priority recovery work. | Full package lane with causal ledger, focused owner proof or missing-edge probe, representative rerun evidence when the scenario drove the work, and validation by a separate verifier-fixer. |
| `discovery` | `discovery` | Lateral analysis, exploratory scans, and route selection without runtime changes. | No runtime writes. The write scope is restricted to package files, sprints, and `work/theory-ledger.md` (no runtime, tests, or scripts). The output contract requires a cheap discriminator under Discovery Gate that points to the selected route. |

When the lane is not obvious, use
`npm run work:lane-picker -- --docs-only|--maintenance|--tests-only|--experiment|--runtime|--scenario|--discovery`.

---

## Validator Phases
<a name="validator-phases"></a>

Validators execute in distinct phases to ensure the integrity of the codebase and workflow:

1.  **Entry Phase (`--entry`)**: Validates the basic metadata shape, file paths, and formatting of a work package before it begins execution.
2.  **Pre-Implementation Phase (`--pre-impl`)**: Validates that the owner, boundary, write scope, do-not-edit scope, proof, and stop rules are explicit and correct *before* any implementation code is modified.
3.  **Closure Phase (`--closure`)**: Validates that all focused proofs pass, all checklist items in the execution evidence are checked off, a theory ledger section exists, and the package is atomically closed before commit/push.

---

## Proof Requirements
<a name="proof-requirements"></a>

To guarantee stability, implementation changes must compile and pass structured verification:

*   **Focused Verification**: Runtime, scenario, experiment, proof, and other implementation packages specify a proof ladder containing role-tagged commands: exactly one `falsifier` command (whose failure proves the implementation theory wrong), exactly one `regression` command (which fails if existing behavior is broken), and optional `supporting` commands. Prefer compact ladders of 3-5 commands for readability, but command count is not enforced.
*   **Freshness Review Gate**: Strict workflow packages (`runtime-owner-boundary`, `scenario-release-gate`, `causal-escalation`, or any package declaring `freshness: "strict"` / `gates.freshness: "strict"`) MUST start each package execution with a new real `freshness-review` subagent before implementation. The freshness reviewer independently checks current-blocker, package metadata, route evidence, owner, boundary, proof ladder, and write scope from repository state only. Implementation may start only after checked `## Execution Evidence` records `action: freshness-review`, a real `Agent <name> (<agent-id>)`, `decision: fresh`, and terminal validation. This role is per-package; freshness evidence from a predecessor or prior sprint package never carries forward.
*   **Lane Exceptions**: Maintenance lanes may use a `regression`-only ladder. Classification-only fast-path packages may use two or three canonical evidence commands while runtime, test, script, and report paths stay out of `writeScope` and `commitScope`. Compact probe packages validated with `--probe` may omit the closure evidence ladder when they stay within the probe lane contract.
*   **Evidence Collection**: Sprints owning active classification or diagnostics packages must record representative residuals and link to specific run output artifacts.
*   **Local vs. Representative Proof**: A package remains in diagnostic state until it is backed by a fresh representative rerun or canonical route-after-rerun result.

---

## Discovery Gate
<a name="discovery-gate"></a>

The Discovery Gate is a package-local pre-implementation framing step. It is
not a status, closure artifact, current-blocker replacement, or theory ledger
entry. The `discovery` lane uses this gate as its required output contract; other
lanes may also use the same gate when route ambiguity is material.

Use it when owner, boundary, route, or proof ambiguity is material, including
`modelFit.ambiguityScore >= 2`, competing owners or hypotheses, repeated
same-frontier or same-action packages, or a package whose write scope cannot
be selected until one discriminator is named. Skip it for read-doc, doc-only,
or lightweight maintenance when owner, boundary, route, and proof are already
explicit.

When used, record these fields in the package before implementation:

1. `Symptom / decision question`
2. `Current evidence`
3. `Candidate owners / boundaries`
4. `Competing hypotheses`
5. `Cheapest discriminator`
6. `Do not edit yet`
7. `Selected route`
8. `Promotion rule`

Allowed outcomes:

1. Continue the current package only after selected route, write scope,
   do-not-edit scope, and proof are explicit.
2. Open or use an `experiment`/probe package when the cheapest discriminator
   must run before implementation.
3. Update current-blocker or successor truth only when the selected route
   changes active owner, boundary, required action, stop condition, or
   successor.
4. Update `work/theory-ledger.md` only when the conclusion is durable route
   knowledge that future package selection should reuse.
5. Leave no current-blocker or theory-ledger update for transient local
   reasoning that only served the current package.

---

## Mechanism Taxonomy and Card Contract
<a name="mechanism-taxonomy-and-card-contract"></a>

To prevent repeated local patches on unchanged evidence, all non-trivial scenario, runtime, experiment, proof, or workflow-tooling packages that test or change a failure mechanism must classify their failure pathway using this domain-neutral mechanism taxonomy:

1. `observation_gap`: evidence is missing, stale, or misleading.
2. `selection_gap`: the system chooses the wrong source, candidate, route, owner, or witness.
3. `admission_gap`: valid work exists but is not admitted.
4. `transition_gap`: state is observed but no owner-owned action changes it.
5. `scheduling_gap`: an action exists but is not woken, retried, or rearmed.
6. `budget_gap`: valid work cannot complete inside the bounded attempt.
7. `concurrency_gap`: work fans out, races, starves, or consumes shared budget incorrectly.
8. `contract_gap`: producer and consumer disagree on the meaning of state or evidence.
9. `ownership_gap`: no single owner has authority for the decision.
10. `downstream_symptom`: visible failure inherits from an upstream blocker.

Before implementation, packages in that scope must expose a mechanism card containing:
*   **Failure mechanism**: classified taxonomy term.
*   **Stable facts**: invariants and evidence that remain unchanged.
*   **Changed facts**: inputs, metrics, or states that moved.
*   **Why not the alternatives**: rejected competing hypotheses.
*   **Owner who decides**: authority for the fix.
*   **Current code or workflow action**: existing active handler/policy.
*   **Missing transition or missing observation**: what must be added.
*   **Smallest falsifying probe**: simplest local test or command.
*   **Expected movement**: observable metrics or transitions.
*   **Negative result means**: failure interpretation.
*   **Escalation rule**: what to do if expected movement fails to occur.

Purely mechanical maintenance packages that only edit docs, templates, schema
text, generated steering, or package metadata and do not test or change a
failure mechanism may record `not-needed: mechanical maintenance, no failure
mechanism` or omit the card when validation does not require it.

---

## Two-Level Theory Contract
<a name="two-level-theory-contract"></a>

Repeated frontiers, architecture-gated packages, owner-boundary migrations, and
`causal-escalation` work must separate whole-system theory from executable slice
theory before implementation.

Do not treat those packages as pre-implementation ready unless they record both
`systemTheory` and `sliceTheory` with the fields below.

`systemTheory` is the whole-system causal map. It must record the problem
statement, phase chain, owner-boundary map, stable facts, changed facts,
competing theories, eliminated theories, downstream symptoms, transition table,
ownership migration triggers, architecture-gap triggers, and one whole-system
invariant. The transition table names the input signal, owner, missing
transition, expected evidence, focused falsifier, and migration trigger for each
material owner boundary.

`sliceTheory` is the package-local executable contract. It must cite the system
theory, name the selected system theory, selected mechanism, source/test
contract, focused falsifier, expected representative movement, kill rule,
theory-fit score, and wrong-slice triggers. The theory-fit score uses concrete
high/medium/low rationale for evidence fit, owner-boundary fit, falsifiability,
representative movement, and downstream risk containment.

Evidence-only reasoning stays at sprint level. Promote a package only when
slice theory can execute one declared source/test contract, migrate ownership,
or close as architecture-gap. If system theory cannot select a slice, do not
open another local runtime patch.

---

## Theory Loop Sprint Shape
<a name="theory-loop-sprint-shape"></a>

A theory loop sprint is a small generative decision loop, not a backlog of
prewritten fixes. Use this shape when the next correct package depends on
learning why the current problem persists across evidence, owners, boundaries,
or mechanism classifications.

Before starting or rewriting a theory loop sprint, record these concrete
sections:

1. `Evidence Anchor`: current problem, representative artifact, success
   condition, stable facts, changed facts, and current unknowns. The success
   condition must be the original representative or release success metric, not
   an alternate stop such as architecture-gap, owner-boundary-migration,
   classification, or route selection.
2. `Mechanism Card`: the mechanism taxonomy term, rejected alternatives,
   deciding owner, missing transition or observation, smallest falsifier,
   expected movement, negative result meaning, and escalation rule.
3. `Theory Option Set`: 2-4 competing options. Each option names a mechanism,
   intervention style, `src/` source-code modification, cheapest
   discriminator, promotion trigger, and rejection signal. Options are not work
   packages.
4. `Creative Move Menu`: domain-neutral moves that force alternatives, such as
   ownership inversion, minimal trace capture, opposite intervention, boundary
   swap, or missing-object search.
5. `Discriminator First`: name or run the cheapest discriminator before code
   edits unless the active package already owns that discriminator as its first
   proof.
6. `Real Package Rule`: a theory loop work package exists only for a promoted
   theory that will change `src/` source code inside declared write scope,
   verify the theory with a falsifying proof command, record the result, and
   create or link the successor package. Classification-only, evidence-only
   inspection, route comparison, or source/log reading without source-code
   modification stays as sprint-level discrimination; do not promote it to a
   work package.
7. `Promotion Rule`: only the option selected by fresh evidence or a
   discriminator becomes one executable package with explicit owner, boundary,
   write scope, proof, and stop rule.
8. `Learning Rule`: after the discriminator or fix, record whether each option
   is supported, avoided, falsified, fixed, migrated, representative-green,
   architecture-gap, or needs-rerun, then revise the option set before another
   local patch.

Queue discipline is part of the shape: keep one active executable package and
do not create speculative successor packages. A successor package is created
only after the active package produces fresh route evidence or a discriminator
selects a different option.

Closure discipline is stricter: a theory loop sprint continues indefinitely
until the original `Evidence Anchor` success condition is met. It must not
close as `done` for same-frontier, classification-only, needs-rerun, pending,
unknown, architecture-gap, owner-boundary-migration, route-selection, or other
alternate outcomes unless that exact outcome was the success condition recorded
when the sprint started. To close it, add `## Theory Loop Success Evidence`
with `Success condition met: yes`, `Matched success condition: <the exact
Evidence Anchor success condition>`, a fresh representative evidence command
or artifact, `Result: success-condition-met`, and the concrete reason
continuation stops. Two-level theory may navigate through migrations,
architecture gaps, and rejected theories as package learning, but those are not
sprint success metrics by themselves.

---

## Coding Constraints
<a name="coding-constraints"></a>

All runtime code must strictly adhere to the following rules:

*   **No Inline Domain Scalars**: Do not write inline domain/runtime scalars in runtime code. Import canonical constants, define one named top-level file-private constant, define one suite-local test constant, or normalize raw external input at ingress.
*   **Explicit State Encoding**: `null` and `undefined` must not encode domain/runtime state. Use explicit named variants (e.g., `MembershipState.INACTIVE`).
*   **Single Normalization Path**: Do not implement semantic decision boundaries as piles of independent `if` statements. Collect evidence, normalize one snapshot, use one explicit state model or decision table, and emit one canonical outcome with reasons.
*   **Cache Observes, Owners Decide**: Callers submit intent to owners and consume owner outcomes; they do not reproduce owner logic locally. Cache visibility, elapsed time, and incidental rows do not prove owner-managed phase completion.
*   **No Weakening of Guardrails**: Do not weaken scripts, allowlists, scan scope, or lint rules to make a package pass.
*   **Progress Contract**: Every owner-boundary progress contract must explicitly declare the canonical 10-field progress contract shape (`owner`, `boundary`, `state`, `reason`, `nextAction`, `wakeSource`, `retryAfterMs`, `terminalState`, `evidencePath`, `blockingDependency`) using local constants rather than inline strings. All packages that touch or modify control-plane progression or owner boundaries must document their active progress contract shape under the `progressContract` metadata in their front matter.
*   **File Size Limit**: The authoritative thresholds are owned by `scripts/check-file-size-thresholds.js`, not by this doc. As of writing the script enforces **source ≤ 800 lines** and **test ≤ 1500 lines** (run `npm run audit:file-size` to read the current values). If a touched file exceeds the cap for its scope, refactor or extract a semantically named owner/helper/contract boundary before closure. If this paragraph ever disagrees with the script, the script wins.

---

## Scope and Roadmap
<a name="scope-and-roadmap"></a>

*   All implementation work in this AGPL repository must stay within the feature scope and broad sequence defined by `roadmap.md`, and within rows mapped to `AGPL repo` in `edition-matrix.md`.
*   `roadmap.md` is not an executable work queue or release-gate status board. Active implementation is authorized by work packages; live blocker and release truth live under `work/`.
*   `product-roadmap.md` is a visibility board, not an implementation source. Do not implement Pro or Enterprise features here unless the request is explicitly AGPL-scoped preparatory work.

---

## Worktree Safety
<a name="worktree-safety"></a>

*   The worktree may already be dirty. Do not revert or overwrite changes you did not make.
*   Keep edits inside the package write scope, ignore unrelated dirty files, and stop for human direction if package-owned and unrelated changes cannot be separated safely.
*   **Unrelated dirty entries** (as reported by `npm run work:context`) MUST NOT be staged in package closure commits. A *focused commit* contains only files listed in the closing package's `commitScope` plus tracker-generated handoff files (`work/sprints/current-blocker.{json,md}` and the active sprint file).

---

## Closure Evidence Grammar
<a name="closure-evidence-grammar"></a>

The closure validator (`npm run work:validate -- --closure`) accepts either
structured execution metadata or checked `## Execution Evidence`. Prefer
structured metadata for new packages so validation does not depend on prose
wording.

1. Structured packages record
   `execution.freshnessReview.decision: "fresh"` with a real
   `execution.freshnessReview.agentId` when freshness review is required,
   `execution.implementation.parentRevalidatedFocusedProof: true`,
   `execution.implementation.filesChanged: [...]`,
   `execution.verificationFix.parentRevalidatedFocusedProof: true` when
   verifier-fixer proof is required, `execution.repair.validationCommand:
   "npm run work:repair"`, and `execution.theoryLedger: "no-ledger-update"` or
   real `theoryLedgerRefs`.
2. Prose `## Execution Evidence` remains accepted for existing packages. Each
   non-`not-needed` evidence line MUST be marked `[x]` (checked), terminal, and
   replayable.
3. In prose evidence, `implementation` and `verification-fix` lines still need
   the parent revalidation assertion accepted by the validator (for example
   `parent revalidated focused proof: yes`).
4. The package MUST contain either structured no-ledger metadata, a prose
   no-ledger evidence line, or a real `theoryLedgerRefs` entry of the form
   `theory-YYYYMMDD-short-slug` that is also present in
   `work/theory-ledger.md`. The metadata value `["none"]` is invalid.
5. Closure commands MUST be replayable: do not paraphrase the validation
   command; copy it verbatim from the focused proof ladder.

---

## Closure Recipe
<a name="closure-recipe"></a>

Package closure is atomic — the following steps move as a unit.

1. Fill `## Execution Evidence` or front-matter execution metadata block per the rules above.
2. `npm run work:repair` — refresh `current-blocker.{json,md}` and the active sprint file references.
3. Run the automated close command:
   `npm run work:close work/packages/active-<slug>.md`
   This command automatically runs closure validation, renames the file to `done-`, flips the status, updates active sprint file references, renumbers the package queue, refreshes current-blocker state, stages exactly the `commitScope` files and tracker-generated handoff files, and creates the focused local close commit. The local commit MUST NOT include "unrelated dirty entries" reported by `work:context`.
4. Push the focused close commit with `npm run work:sprint:push -- <git-push-args>` before starting the next package. If push is blocked by remote, credential, or policy state, record the unpushed commit SHA and reason in the package or sprint handoff; do not invent pushed proof.

---

## Sprint Queue Maintenance
<a name="sprint-queue-maintenance"></a>

Sprint queues live in `work/sprints/active-*.md` under the `## Package Queue` heading as a numbered markdown list. Each item has four lines: a markdown link to the package file (`active-<slug>.md` while open, `done-<slug>.md` once closed), a `Lane:` line, a `Purpose:` line, and a `First-run reason:` line.

1. **Insert** a new item by editing the sprint file directly at the chosen position with the same four-line shape.
2. **Cross-link** the new item by pointing its markdown link at `../packages/active-<new-slug>.md`.
3. **Supersede or remove** an item by replacing its link target with the appropriate `superseded-<slug>.md` package and updating its purpose.
4. The queue numbering is automatically managed and renumbered sequentially by `npm run work:close`.
5. The active sprint file is part of every closing package's commit scope whenever the queue or its references change.
6. When `npm run work:sprint:remaining` reports zero active/todo packages, run
   `npm run work:sprint:advance -- --dry-run` and then
   `npm run work:sprint:advance -- --write` to rename the sprint to `done-*`
   in `work/sprints/` and update track/release references atomically.
