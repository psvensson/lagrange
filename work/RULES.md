# Rules Canon

Canonical single source of truth for repository process lanes, validator phases, proof requirements, coding constraints, and safety guidelines.

---

## Lane Definitions
<a name="lane-definitions"></a>

All implementation work must select and declare the lightest valid lane. The
canonical lane groups are the same groups printed by
`npm run work:package:schema`; older package files may still use the accepted
aliases below. Requirements are determined by the canonical lane group.

| Canonical lane | Accepted aliases | Use when | Package requirement |
| --- | --- | --- | --- |
| `read-doc` | `read-review-doc-only` | Answering questions, reviewing, or editing explanatory docs without changing implementation truth. | No package unless implementation truth, roadmap status, architecture ownership, package truth, or validation obligations change. |
| `maintenance` | `mechanical-maintenance`, `lightweight-maintenance` | Low-risk mechanical, tooling, template, generated steering, package metadata, or durable documentation cleanup. | Use one focused package and focused proof when tracker truth, package templates, workflow behavior, generated steering, or durable process docs change. Subagents are optional unless runtime ownership or shared contracts can change. |
| `proof` | `test-only-proof`, `diagnostic-classification` | Tests, validation evidence, diagnostic classification, or proof-surface changes that do not alter runtime behavior. | Use the active package validation surface, or create one focused proof package when no active package owns the proof. Closure requires the focused proof and any required representative or diagnostic evidence. |
| `experiment` | `bounded-experiment`, `fast-spike` | A bounded hypothesis, probe, or spike decides the next owner, boundary, action, or route. | Use a focused experiment/probe package with a pre-registered question, observable prediction or discriminator, proof command, and stop rule. Runtime changes are allowed only when the package explicitly owns the bounded experiment scope. |
| `runtime` | `single-file-runtime`, `runtime-owner-boundary` | Runtime behavior, owner contracts, control-plane logic, state transitions, shared metadata, diagnostics grammar, or affected consumers can change. | Full package lane required by the validator, including owner contract, Core Logic Brief, focused proof, affected-consumer proof when applicable, static guardrails, and closure validation. |
| `scenario` | `scenario-release-gate`, `causal-escalation` | Distributed, integration, load, release-gate, repeated same-frontier, causal-closure, or priority recovery work. | Full package lane with causal ledger, focused owner proof or missing-edge probe, representative rerun evidence when the scenario drove the work, and validation by a separate verifier-fixer. |

When the lane is not obvious, use
`npm run work:lane-picker -- --docs-only|--maintenance|--tests-only|--experiment|--runtime|--scenario`.

---

## Validator Phases
<a name="validator-phases"></a>

Validators execute in distinct phases to ensure the integrity of the codebase and workflow:

1.  **Entry Phase (`--entry`)**: Validates the basic metadata shape, file paths, and formatting of a work package before it begins execution.
2.  **Pre-Implementation Phase (`--pre-impl`)**: Validates that the owner, boundary, write scope, forbidden scope, proof, and stop rules are explicit and correct *before* any implementation code is modified.
3.  **Closure Phase (`--closure`)**: Validates that all focused proofs pass, all checklist items in the execution evidence are checked off, a theory ledger section exists, and the package is atomically closed before commit/push.

---

## Proof Requirements
<a name="proof-requirements"></a>

To guarantee stability, implementation changes must compile and pass structured verification:

*   **Focused Verification**: Every package must specify a proof ladder of 3-5 executable commands (e.g., `npm run work:advance -- --check`).
*   **Evidence Collection**: Sprints owning active classification or diagnostics packages must record representative residuals and link to specific run output artifacts.
*   **Local vs. Representative Proof**: A package remains in diagnostic state until it is backed by a fresh representative rerun or canonical route-after-rerun result.

---

## Discovery Gate
<a name="discovery-gate"></a>

The Discovery Gate is a package-local pre-implementation framing step. It is
not a lane, status, closure artifact, current-blocker replacement, or theory
ledger entry.

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
   forbidden scope, and proof are explicit.
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

## Coding Constraints
<a name="coding-constraints"></a>

All runtime code must strictly adhere to the following rules:

*   **No Inline Domain Scalars**: Do not write inline domain/runtime scalars in runtime code. Import canonical constants, define one named top-level file-private constant, define one suite-local test constant, or normalize raw external input at ingress.
*   **Explicit State Encoding**: `null` and `undefined` must not encode domain/runtime state. Use explicit named variants (e.g., `MembershipState.INACTIVE`).
*   **Single Normalization Path**: Do not implement semantic decision boundaries as piles of independent `if` statements. Collect evidence, normalize one snapshot, use one explicit state model or decision table, and emit one canonical outcome with reasons.
*   **Cache Observes, Owners Decide**: Callers submit intent to owners and consume owner outcomes; they do not reproduce owner logic locally. Cache visibility, elapsed time, and incidental rows do not prove owner-managed phase completion.
*   **No Weakening of Guardrails**: Do not weaken scripts, allowlists, scan scope, or lint rules to make a package pass.
*   **File Size Limit**: The authoritative thresholds are owned by `scripts/check-file-size-thresholds.js`, not by this doc. As of writing the script enforces **source ≤ 800 lines** and **test ≤ 1500 lines** (run `npm run audit:file-size` to read the current values). If a touched file exceeds the cap for its scope, refactor or extract a semantically named owner/helper/contract boundary before closure. If this paragraph ever disagrees with the script, the script wins.

---

## Scope and Roadmap
<a name="scope-and-roadmap"></a>

*   All implementation work in this AGPL repository must be driven by `roadmap.md` or by rows mapped to `AGPL repo` in `edition-matrix.md`.
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

The closure validator (`npm run work:validate -- --closure`) accepts an Execution Evidence section only when it contains the following literal phrases and check states. These are enforced by `scripts/work-tracker.js`; this section is the human-readable contract.

1. Each non-`not-needed` evidence line MUST be marked `[x]` (checked).
2. The `implementation` and `verification-fix` lines MUST contain the exact phrase `parent revalidated focused proof: yes`. Without that literal phrase the validator rejects closure even if every other field is filled in.
3. The `repair` line MUST cite `npm run work:repair` as its validation command.
4. The package MUST contain either a `theory ledger: no ledger update` line OR a real `theoryLedgerRefs` entry of the form `theory-YYYYMMDD-short-slug` that is also present in `work/theory-ledger.md`. The package metadata field `theoryLedgerRefs` MUST default to `[]` (empty array); the value `["none"]` is invalid.
5. Closure commands MUST be replayable: do not paraphrase the validation command; copy it verbatim from the focused proof ladder.

---

## Closure Recipe
<a name="closure-recipe"></a>

Package closure is atomic — the following steps move as a unit. Do not stop part-way.

1. Fill `## Execution Evidence` per the grammar above (check the `[x]` boxes, include `parent revalidated focused proof: yes`, add the `theory ledger: no ledger update` line if no ledger ref applies).
2. `npm run work:repair` — refresh `current-blocker.{json,md}` and the active sprint file references.
3. `npm run work:validate -- --closure` — must report `Work tracker validation OK`.
4. `mv work/packages/active-<slug>.md work/packages/done-<slug>.md`.
5. `sed -i 's/"status": "active"/"status": "done"/' work/packages/done-<slug>.md`.
6. Update sprint references with `sed -i 's|active-<slug>|done-<slug>|g' <active-sprint-file>`.
7. `git add` only the files in `commitScope` plus tracker-generated handoff files, then commit and push. The commit MUST NOT include "unrelated dirty entries" reported by `work:context`.

Step 2 is run again only if needed after the rename; after step 4 a fresh `work:repair` will warn "No active package was found" until the next `todo-` is activated — that warning is expected and does not block the commit.

---

## Sprint Queue Maintenance
<a name="sprint-queue-maintenance"></a>

Sprint queues live in `work/sprints/active-*.md` under the `## Package Queue` heading as a numbered markdown list. Each item has three lines: a markdown link to the package file (`active-<slug>.md` while open, `done-<slug>.md` once closed), a `Lane:` line, a `Purpose:` line, and a `First-run reason:` line.

1. **Insert** a new item by editing the sprint file directly at the chosen position with the same four-line shape; renumber the items below it by hand. `npm run work:repair` does not renumber.
2. **Cross-link** the new item by pointing its markdown link at `../packages/active-<new-slug>.md`. The link target is rewritten to `done-<new-slug>.md` only during the Closure Recipe (step 6, `sed -i 's|active-<slug>|done-<slug>|g' <sprint-file>`).
3. **Supersede or remove** an item by replacing its link target with the appropriate `superseded-<slug>.md` package and updating its purpose; never delete a numbered entry, because downstream sprint references and closure receipts cite the queue position.
4. The active sprint file is part of every closing package's commit scope whenever the queue or its references change.
