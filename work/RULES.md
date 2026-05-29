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

## Vocabulary — lane, packageClass, gateMarker
<a name="vocabulary"></a>

Three orthogonal axes describe a package. They are often collapsed into
"lane" in informal speech, but the validators treat them as distinct.

| Axis | Field | What it controls | Examples |
| --- | --- | --- | --- |
| **lane** | `intent.lane` (top-level `lane` shim) | Execution lane: proof-ladder shape, freshness-review mode, validator gates. Enum: see Lane Definitions above. | `causal-escalation`, `runtime-owner-boundary`, `lightweight-maintenance` |
| **packageClass** | `modelFit.packageClass` | What kind of artifact the package produces. Drives R1–R10 exemptions, model-fit checks, and write-scope shape. | `system-theory-rederive`, `architecture-gap-analysis`, `representative-frontier-closure`, `classification-only`, `documentation-only`, `lightweight-maintenance`, `probe-only` |
| **gateMarker** | `theoryLoop.gateMarker` (optional) | Which compositional-signal pattern this package is satisfying. Enum: `same-mechanism-repeat`, `compositional-pair-alternation`, `pair-alternation-post-rederive`, `emergent-class-present`. | `pair-alternation-post-rederive` for a rederive opened after a prior rederive on the same pair |

The validators detect rederive and architecture-gap classes primarily via
`modelFit.packageClass` (canonical tokens: `system-theory-rederive`,
`system-theory-revision`, `theory-rederive`, `whole-system-theory`,
`architecture-gap*`). Lane, slug regex, and the boolean shims
`systemTheoryRevision`/`architectureGapAnalysis` remain as legacy
fallbacks but should not be relied on for new packages.

When R1–R10 doctrine says "the rederive class" or "the architecture-gap
class" it always means the packageClass axis, not the execution lane.

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

*   **Focused Verification**: Runtime, scenario, experiment, proof, and other implementation packages specify a proof ladder containing role-tagged commands: exactly one `falsifier` command (whose failure proves the implementation theory wrong), exactly one `regression` command (which fails if existing behavior is broken), and optional `supporting` commands. Prefer compact ladders of 3-5 commands for readability, but command count is not enforced. **Exception (Phase 4 coupled invariants):** packages of `packageClass` `system-theory-rederive` or any `architecture-gap*` class MAY add one additional `falsifier` command tagged with the trailing comment `# coupled-invariant` (the joint coupled-invariant probe required by R3). Equivalently, the joint command may be carried in the `theoryLoop.jointFalsifierCommand` field. Joint falsifiers tagged this way do not count toward the "exactly one `falsifier`" cardinality rule; the runtime falsifier is still required.
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
11. `coupled_invariants`: two or more whole-system invariants drift together or oppose each other; no single-mechanism fix moves the visible blocker because the blocker is the coupling itself. Use when fixing one invariant predictably degrades another, or when two invariants are observed to hold/fail in lockstep across reruns.
12. `emergent_oscillation`: the system flips between adjacent states with no owner-owned terminal action; no single transition is missing, but the chosen transitions form a non-terminating cycle. Use when consecutive packages move the frontier into a state that the loop already visited in the same boundary.
13. `protocol_mismatch`: three or more owners disagree on phase semantics, contract, or evidence meaning simultaneously. Distinct from `contract_gap` (two owners) — escalates to a protocol-level theory, not a local contract patch.
14. `feedback_amplification`: a corrective action increases the very signal it observes. Use when retry, wake, or reconcile cadence is observed to correlate positively with the metric it is meant to reduce.

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
ownership migration triggers, architecture-gap triggers, and **at least one
whole-system invariant** (legacy scalar `wholeSystemInvariant` accepted; new
packages should use the list form `wholeSystemInvariants` to record coupled
invariants explicitly). The transition table names the input signal, owner,
missing transition, expected evidence, focused falsifier, and migration trigger
for each material owner boundary.

When `wholeSystemInvariants` is used it MUST be an array of objects with the
fields `invariant` (the invariant text), `coupledWith` (array of zero or more
other invariant names that move together with it, by exact `invariant`
substring match), and `couplingNote` (concrete explanation of the coupling, or
the literal `none` when the invariant is independent). At least one entry is
required; when more than one entry is present, at least one entry MUST declare
a non-empty `coupledWith` list, otherwise the validator rejects the package
with a `coupled-invariants-undeclared` error — coupled-invariants reasoning is
the whole point of the list form.

`sliceTheory` is the package-local executable contract. It must cite the system
theory, name the selected system theory, selected mechanism, source/test
contract, focused falsifier, expected representative movement, kill rule,
theory-fit score, and wrong-slice triggers. The theory-fit score uses concrete
high/medium/low rationale for evidence fit, owner-boundary fit, falsifiability,
representative movement, and downstream risk containment.

`modelTheory` is the optional third tier. Use it when the system theory needs
an executable specification (state model, simulator, invariant spec, or
property test) that supports source work. It must declare `modelKind`
(`state-model` | `simulator` | `invariant-spec` | `property-test`),
`executableArtifact` (a real file path under `test/`, `scripts/`, or
`docs/specs/`), `propertiesProven` (non-empty list of named properties),
`assumptions` (non-empty list, or the literal `none`), `counterExampleHandling`
(what happens if the model falsifies a property), and `linkedSystemTheoryRef`
(reference to the systemTheory whose invariant the model formalizes). The
package's falsifier proof command MUST execute the model and fail on property
violation. `modelTheory` does not exempt a theory loop package from changing
declared `src/` source code; model-only or evidence-only reasoning stays at
sprint level until it selects a source-code slice.

Evidence-only reasoning stays at sprint level. Promote a package only when
slice theory can execute one declared `src/` source/test contract, change that
source code, and verify the theory. If system theory cannot select a source
slice, do not open a theory-loop work package.

**Exception (rederive and architecture-gap classes).** Two packageClasses
are explicitly permitted as theory-loop work packages without `src/` edits,
because their durable artifact is structural rather than runtime:

* `system-theory-rederive` (and its aliases: `system-theory-revision`,
  `theory-rederive`, `whole-system-theory`): writes only sprint markdown
  and `work/theory-ledger.md`; produces a coupled-invariant revision
  enforced by R2/R3/R6.
* `architecture-gap-analysis` (and any `architecture-gap*` class):
  writes only sprint markdown, `work/theory-ledger.md`, and optionally
  architecture-doc files; produces an architecture-gap ledger entry
  enforced by R5/R7.

These two classes MUST still produce one durable structural artifact
(R6: sprint `## Joint Coupled-Invariant Probe` delta, a new
`work/theory-ledger.md` entry, or a `work/RULES.md` taxonomy
modification). Documentary-only packages on either class are rejected.
No other packageClass is exempt from the source-change requirement.

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
   discriminator, promotion trigger, rejection signal, and **`layer:`** drawn
   from the layer vocabulary `{protocol, scheduling, ownership, observation,
   topology, model}`. The set MUST contain options at **two or more distinct
   layers**; a single-layer option set is rejected by the theory-loop sprint
   shape validator because it cannot represent a holistic alternative. Options
   are not work packages.
4. `Creative Move Menu`: domain-neutral moves that force alternatives, such as
   ownership inversion, minimal trace capture, opposite intervention, boundary
   swap, or missing-object search.
5. `Discriminator First`: name or run the cheapest discriminator before code
   edits unless the active package already owns that discriminator as its first
   proof.
6. `Real Package Rule`: a theory loop work package exists only for one
   promoted theory that will change a concrete `src/` source file inside
   declared write scope, verify the theory with falsifier and regression proof,
   and record the result. Classification-only, evidence-only inspection, route
   comparison, source/log reading, package-only edits, or creating the next
   package without source-code modification stays as sprint-level
   discrimination; do not promote it to a work package. A successor package may
   be linked only after the source change and proof have produced fresh
   evidence; successor creation is never the package's implementation payload.
   **Exception:** the rederive (`system-theory-rederive` and aliases) and
   architecture-gap (`architecture-gap*`) packageClasses are the only
   theory-loop work packages permitted without `src/` edits; see the
   exception block under [Two-Level Theory Contract](#two-level-theory-contract)
   for the required structural artifact (R6) and writeScope shape.
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

### Theory-Loop Phase 4 Guardrails (R1–R10)

Once a theory-loop sprint has fired a `compositional-pair-alternation` signal
(or `pair-alternation-post-rederive` after a documentary rederive), the
following ten rules apply and are enforced by `npm run work:validate` at the
`--pre-impl` and `--closure` phases. The validators are additive: legacy
packages and sprints without the relevant fields/signals are exempt.

* **R1. Alternating-Pair Mutex** — `validateAlternatingPairMutex`
  (`alternating-pair-rederive-in-progress`,
  `alternating-pair-concurrent-runtime`). When the package being activated is
  on a boundary belonging to a detected alternating pair, no other
  source-touching package on either pair boundary may be `active`/`todo`
  simultaneously. The `system-theory-rederive` and `architecture-gap-analysis`
  *package classes* are exempt as the *self* (they may run while runtime
  packages are blocked). Detection is `modelFit.packageClass` first; lane
  and slug regex are legacy fallbacks.
* **R2. Coupled Invariants on Rederive** — `validateRederiveCoupledInvariants`
  (`rederive-coupled-invariants-missing`). A `system-theory-rederive` package
  triggered by a pair-alternation/emergent signal must declare
  `systemTheory.wholeSystemInvariants` as a list with ≥2 entries, at least
  one entry with non-empty `coupledWith`, and the two pair boundary names
  must appear in the `invariant`/`couplingNote` text.
* **R3. Joint Falsifier on Rederive** — `validateRederiveJointFalsifier`
  (`rederive-joint-falsifier-missing`,
  `rederive-joint-falsifier-not-replayable`,
  `rederive-joint-falsifier-boundaries-missing`,
  `sprint-joint-coupled-invariant-probe-missing`). The rederive package must
  declare a joint falsifier — either a proof `falsifier:` command tagged
  `# coupled-invariant`, or the field
  `theoryLoop.jointFalsifierCommand`. The command must be a single replayable
  command (no `&&`/`||`/`;`) and must mention both pair boundary names. The
  active sprint must record the same command in its `## Joint
  Coupled-Invariant Probe` section.
* **R4. Sticky Theory Ledger** — `validateStickyTheoryLedger`
  (`sticky-theory-ledger-empty`, `sticky-theory-ledger-missing-rederive-ref`).
  When the same owner/boundary has appeared in the last three closed
  packages, the new package must populate
  `metadata.execution.theoryLedgerRefs` with at least one real ledger entry
  slug; if a rederive closed on that boundary within 14 days produced a
  ledger slug, that slug must be among the refs.
* **R5. Outcome-Based Loop Kill-Rule** — `validateLoopExhaustionEscalation`
  (`loop-exhausted-architecture-gap-required`,
  `loop-exhausted-missing-architecture-ledger-entry`,
  `theory-loop-outcome-missing` at closure). A new
  `theoryLoop.outcome` enum (`theory-confirmed | theory-falsified |
  inconclusive | migrated`) is required at closure for theory-loop packages.
  When the last three closed packages on the alternating pair all carry a
  non-confirmed outcome, the next runtime package on the pair is rejected;
  only an `architecture-gap-analysis` *package-class* package, plus a fresh
  `theory-YYYYMMDD-…-architecture-gap` ledger entry, can unblock the pair.
* **R6. Modeltheory-Exemption Tightening (Structural Artifact)** —
  `validateRederiveStructuralArtifact`
  (`rederive-no-structural-artifact`). A rederive package that uses the
  `modelTheory` write-scope exemption must still produce one durable
  structural artifact: a sprint `## Joint Coupled-Invariant Probe` delta,
  a new `work/theory-ledger.md` entry, or a `work/RULES.md` taxonomy
  modification. Documentary-only rederive packages are rejected.
* **R7. Repeat-Rederive Escalator** — `detectCompositionalSignals` emits the
  `pair-alternation-post-rederive` pattern when alternation recurs after a
  closed rederive on the pair. `validateCompositionalAutoPromoteGate` then
  permits only `architecture-gap-analysis` *package-class* packages on the pair
  (`pair-alternation-post-rederive-requires-architecture-gap`).
* **R8. Sprint-Level Coupled-Invariant Probe Section** —
  `validateSprintJointCoupledInvariantProbe`
  (`sprint-joint-probe-section-missing`, `sprint-joint-probe-residual-stuck`).
  Once a sprint has `systemTheoryRederivedAt`, its markdown must contain a
  `## Joint Coupled-Invariant Probe` section with the labelled bullets
  `Command:`, `Last run:`, `Last residual count:`, `Residual trend:`
  (`decreasing|flat|increasing|unknown`), `Boundaries covered:`. Two
  consecutive `flat`/`increasing` readings block the next runtime package on
  the pair until the residual decreases or an architecture-gap is recorded.
* **R9. Active-Package Pair Limit** — `validateAlternatingPairActiveLimit`
  (`alternating-pair-active-limit-exceeded`). At most one
  source-touching active/todo package per alternating pair, regardless of
  lane. Pre-impl-time complement of R1.
* **R10. Frontier-History Self-Report** — `computeLoopMetrics` in
  `scripts/work-frontier-history.js` surfaces `loopMetrics`:
  `lastRederiveDateOnPair`, `closuresSinceLastRederive`,
  `pairAlternationCyclesSinceRederive`, `loopHealth`
  (`healthy|rederive-in-progress|exhausted`), and `continuationRequired`
  (`true` whenever `loopHealth` is non-`healthy`; see R12). Visible in both the
  JSON and text output of `npm run work:frontier-history` and surfaced through
  `npm run work:context`.
* **R11. packageClass Write-Scope Fit** — `validatePackageClassWriteScopeFit`
  (`rederive-writescope-contains-src`, `runtime-writescope-no-src`).
  Rederive and architecture-gap classes MUST NOT list `src/` paths in
  `writeScope`; runtime targets belong in `candidateRuntimeFiles`.
  `representative-frontier-closure` packages on `runtime-owner-boundary`
  MUST list at least one `src/` path in `writeScope` (Real Package Rule).
  Wired into the pre-impl orchestrator alongside R1–R9.
* **R12. Non-Halting Continuation Invariant** —
  `validateTheoryLoopContinuation`
  (`theory-loop-halted-without-termination`,
  `theory-loop-termination-reason-invalid`,
  `theory-loop-blocked-cannot-be-done`). A theory-loop sprint may only stop
  active execution for a reason in the closed **Termination Conditions** set;
  every other outcome is non-terminal and obliges an autonomous redirect (see
  the *Non-Halting Continuation Invariant* section below). Enforced at the
  `--pre-impl` and `--closure` phases; additive for legacy sprints that lack a
  `## Theory Loop Termination` section.

### Compositional Auto-Promote Rule

The frontier-history tool (`npm run work:frontier-history`) emits a
`compositionalSignals` block when a single owner/boundary has three or more
consecutive closed packages whose selected mechanisms match any of the
saturation patterns:

* same mechanism repeated three times in a row,
* any pair from `{transition_gap+scheduling_gap, contract_gap+ownership_gap,
  concurrency_gap+budget_gap}` alternating,
* any occurrence of an emergent-class term (`coupled_invariants`,
  `emergent_oscillation`, `protocol_mismatch`, `feedback_amplification`).

When a compositional signal fires, the `--pre-impl` validator
(`validateCompositionalAutoPromoteGate` in `scripts/work-tracker.js`) refuses
to promote another local slice on the same owner/boundary unless the next
package is a `systemTheory` revision. A package counts as a revision when
its `modelFit.packageClass` is one of `system-theory-rederive`,
`system-theory-revision`, `theory-rederive`, or `whole-system-theory`
(detected primarily via packageClass); legacy fallbacks include
`lane: system-theory-rederive` (and the same aliases), the metadata
boolean `systemTheoryRevision: true`, and slugs containing
`system-theory-rederive` / `system-theory-revision` /
`system-theory-rev` / `whole-system-theory`. The blocker error is
`compositional-gate-blocked` and references the saturated mechanism. The
companion command `npm run work:system-theory:rederive -- --owner <owner>
--boundary <boundary>` produces the structured `proposedSystemTheoryRevision`
scaffold and stamps `systemTheoryRederivedAt` on the active sprint.

### Periodic Re-derivation Checkpoint

Active sprints record `systemTheoryRederivedAt` (ISO date) on a single header
line. The gating command
`npm run work:system-theory:rederive -- --check-due --sprint <active-sprint.md>`
first counts sprint-linked `done-*` packages after the latest closed
systemTheory rederive checkpoint when the sprint queue exposes one; otherwise
it falls back to counting `done-*` packages whose date prefix is ≥ that stamp.
When the count meets or exceeds `--threshold` (default 5), the command exits
non-zero and the next package activation MUST be a systemTheory revision package
(detected via `modelFit.packageClass` of `system-theory-rederive` or an
alias, with `lane: system-theory-rederive` and slug match as legacy
fallbacks). Sprints without `systemTheoryRederivedAt` have the gate
inactive (the command exits zero with `gate inactive`), so this is fully
additive for legacy sprints.

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

### Non-Halting Continuation Invariant (R12)

A theory loop is a *non-halting* process. Once started, it must keep producing
autonomous next actions until one of a small, closed set of termination
conditions is met. It is never correct to silently stop, end the turn awaiting
human acknowledgement, or close the sprint on a non-terminal outcome.

**Termination Conditions (closed set).** Active execution of a theory-loop
sprint may stop only for one of exactly these reasons:

* `success-condition-met` — the original `Evidence Anchor` success condition is
  satisfied by fresh representative evidence. This is the only reason that
  closes the sprint as `done`.
* `blocked-frozen-decision` — a frozen-decision / safety Level-1 human gate
  applies (the single legitimate human halt; see `core.md`). Requires a
  recorded human override reference. The sprint stays open (handoff), not
  `done`.
* `blocked-external-dependency` — progress is impossible until an external
  dependency outside the repository resolves (e.g. an upstream release, an
  unavailable credential). The sprint stays open (handoff), not `done`.

**Stop Semantics — `terminate` vs `redirect`.** Reclassify every "stop",
"escalate", or "halt" instruction in steering as one of two acts:

* `terminate(reason)` — permitted only when `reason` is in the Termination
  Conditions set above.
* `redirect(next-action)` — the default for *all* other situations. A
  non-terminal outcome (same-frontier, classification-only, needs-rerun,
  migrated, architecture-gap, owner-boundary-migration, route-selection,
  loop-exhausted, residual-flat, compositional-signal-active) MUST be followed
  immediately by the next autonomous action: the next theory option, a
  successor package, a `system-theory-rederive`, an `architecture-gap-analysis`
  experiment, or a re-run — never an end-of-turn or a request for confirmation.
  The frontier-history self-report exposes `continuationRequired: true`
  whenever `loopHealth` is non-`healthy`; treat it as a standing obligation to
  `redirect`, not as a stopping point.

**Recording a stop.** When a sprint legitimately terminates (or a blocked
handoff applies), add a `## Theory Loop Termination` section with:

* `Loop status:` — `running` or `terminated`.
* `Termination reason:` — one value from the closed set above.
* `Evidence:` — a concrete command, artifact, or override citation proving the
  reason holds.
* `Human override ref:` — required only for `blocked-frozen-decision`.

`validateTheoryLoopContinuation` enforces that any recorded stop uses a
closed-enum reason with concrete evidence, that `blocked-frozen-decision`
carries a human override reference, and that a `done` theory-loop sprint never
terminates on a blocked reason (a blocked stop is a handoff that keeps the
sprint open).

**Redirect rule (the field the agent reads).** The Sprint Strategy Brief field
that used to be called `Stop or escalate rule` is renamed **`Redirect rule`**
(the legacy label is still accepted). It must name the *next autonomous action*
a non-terminal outcome triggers — open a successor package, run fresh route
evidence, rederive, or open an architecture/causal experiment — and it must
never instruct the agent to end the turn, await a human, or pause work. For a
*running* theory-loop sprint, `validateTheoryLoopContinuation` rejects a
`Redirect rule` that contains bare-halt phrasing or that fails to name a
redirect action (`theory-loop-redirect-rule-not-actionable`). The same
redirect-not-stop framing applies to the Decision Experiment `Redirect rule`
(legacy name `Kill rule`, still accepted) and the Systemic Insight Gate
redirect rule: a redirect rule may `redirect` to an architecture/causal
experiment or `terminate` on a closed reason, but never license a bare stop on
a non-terminal outcome.

Static validation cannot observe an agent that simply ends its turn after
reading well-formed steering; that residual case is governed by this invariant
as doctrine, the `Redirect rule` always naming the next action, and the
`continuationRequired` self-report surfaced through `npm run work:context`.

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

## Package Economy
<a name="package-economy"></a>

Packages are sized to their lane and never restate doctrine that already lives
in steering or in structured metadata.

1. **Single source of truth.** Structured JSON metadata in the package header is
   canonical. Prose sections MUST NOT restate values already carried by
   `execution.*`, `mechanismCard`, `modelFit`, or `rerunDecision`. Prefer
   structured metadata; let prose carry only what has no structured field.
2. **No copied steering doctrine.** Do not paste tool-first, workflow
   acceleration, drift-ledger checklists, shared-boundary contracts, or residual
   closure inventories into packages. That guidance is the always-loaded
   contract (`.kiro/steering/llm/core.md`, this file) and is not
   validator-enforced per package; copying it is pure red tape.
3. **Right-size by lane.** Light lanes (`read-review-doc-only`,
   `mechanical-maintenance`, `lightweight-maintenance`, `test-only-proof`,
   `diagnostic-classification`) get a minimal body: Why, Scope, Core Logic Brief
   (status `not-needed` is valid), Execution Evidence, Validation. Heavy lanes
   (`single-file-runtime`, `runtime-owner-boundary`, `scenario-release-gate`,
   `causal-escalation`) additionally carry mechanism, theory, representative
   delta, and rerun sections. `npm run work:package:new` emits the
   lane-appropriate body; do not re-add removed boilerplate by hand.

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
   This command automatically runs closure validation, **regenerates and verifies the compiled steering packs (`steering:check`) so a close cannot ship stale `.kiro/steering/llm` packs**, renames the file to `done-`, flips the status, updates active sprint file references, renumbers the package queue, refreshes current-blocker state, stages exactly the `commitScope` files and tracker-generated handoff files, and creates the focused local close commit. The local commit MUST NOT include "unrelated dirty entries" reported by `work:context`.
4. Push the focused close commit with `npm run work:sprint:push -- <git-push-args>` before starting the next package. If push is blocked by remote, credential, or policy state, record the unpushed commit SHA and reason in the package or sprint handoff; do not invent pushed proof.

---

## Workflow Efficiency Tooling
<a name="workflow-efficiency-tooling"></a>

Use these helpers instead of ad-hoc shell loops; they keep proof fast and
non-flaky:

*   **`npm run work:test`** — run the work-tooling test slice (`test/scripts/*.test.js`) serially and stream output. Use it for fast iteration on tracker/steering changes.
*   **`npm run work:test:regression`** — run the same slice and fail **only** on failures that are not recorded in `work/test-baseline.json`. This replaces the manual "stash, run, compare, pop" dance when proving a change adds zero new test failures. Regenerate the baseline from a clean tree with `npm run work:test:regression -- --update`. The slice runs with `--test-concurrency=1` so the failing set is deterministic.
*   **`npm run work:theory-loop -- lint-redirect --redirect "<text>"`** — dry-run a candidate redirect-rule string against the running-theory-loop continuation checks (bare-halt phrasing and missing redirect action) before writing it into a sprint or package. Exits non-zero with the `theory-loop-redirect-rule-not-actionable` findings.
*   **`npm run steering:check`** — regenerate the compiled packs and fail if `.kiro/steering/llm` still differs; `work:close` runs this automatically as a closure guard.

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
