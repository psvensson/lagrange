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

## Coding Constraints
<a name="coding-constraints"></a>

All runtime code must strictly adhere to the following rules:

*   **No Inline Domain Scalars**: Do not write inline domain/runtime scalars in runtime code. Import canonical constants, define one named top-level file-private constant, define one suite-local test constant, or normalize raw external input at ingress.
*   **Explicit State Encoding**: `null` and `undefined` must not encode domain/runtime state. Use explicit named variants (e.g., `MembershipState.INACTIVE`).
*   **Single Normalization Path**: Do not implement semantic decision boundaries as piles of independent `if` statements. Collect evidence, normalize one snapshot, use one explicit state model or decision table, and emit one canonical outcome with reasons.
*   **Cache Observes, Owners Decide**: Callers submit intent to owners and consume owner outcomes; they do not reproduce owner logic locally. Cache visibility, elapsed time, and incidental rows do not prove owner-managed phase completion.
*   **No Weakening of Guardrails**: Do not weaken scripts, allowlists, scan scope, or lint rules to make a package pass.
*   **File Size Limit**: New or newly edited source-code files must finish at or below `1200` lines. If a touched source-code file exceeds the cap, refactor or extract a semantically named owner/helper/contract boundary before closure.

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
