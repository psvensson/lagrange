# Rules Canon

Canonical single source of truth for repository process lanes, validator phases, proof requirements, coding constraints, and safety guidelines.

---

## Lane Definitions
<a name="lane-definitions"></a>

All implementation work must select and declare the lightest valid lane that satisfies the following criteria:

*   **Read/Review/Doc-Only**:
    *   **Scope**: Answers or edits to explanatory documentation.
    *   **Package Requirement**: No package required unless implementation truth, roadmap status, or architecture ownership changes.
*   **Lightweight Maintenance**:
    *   **Scope**: Low-risk mechanical, tooling, or documentation updates.
    *   **Package Requirement**: One focused package and focused proof. Subagents are optional unless runtime ownership or shared contracts can change.
*   **Runtime Owner-Boundary**:
    *   **Scope**: Changes impacting runtime boundaries, control plane logic, state transitions, or shared contracts.
    *   **Package Requirement**: Full package lane required by the validator, including focused proof and static guardrails.
*   **Scenario / Release-Gate**:
    *   **Scope**: High-order release gates, distributed cluster test scenarios, or priority recovery actions.
    *   **Package Requirement**: Full package lane with causal ledger, focused owner proof, representative rerun evidence when the scenario drove the work, and validation by a separate verifier-fixer.

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
