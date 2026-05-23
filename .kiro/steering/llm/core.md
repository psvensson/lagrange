# Core Steering Pack

Manual always-load operating contract for LLM work in this repository.

Use this before domain packs. Domain packs and source steering documents provide detail; this file carries the shape that should stay active in memory.

Refer to [work/RULES.md](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md) for the single canonical source of truth on repository process lanes, validator phases, proof requirements, coding constraints, and safety guidelines.

## North Star

Preserve the highest-level owner boundary, choose the lightest process that proves the boundary was not weakened, and do not locally patch symptoms when the owner contract is porous.

## Process Weight

Refer to [work/RULES.md#lane-definitions](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#lane-definitions) for canonical details on process lanes:

*   **Read/Review/Doc-Only**: Edit docs only; no package unless implementation truth changes.
*   **Lightweight Maintenance**: Focused package/proof; subagents optional; no causal ledger.
*   **Runtime Owner-Boundary**: Requires full package lane, focused proof, and static guardrails.
*   **Scenario or Release-Gate**: Requires full package lane, causal ledger, focused owner proof, representative rerun evidence, and verifier-fixer split.

Runtime owner-boundary, scenario/release-gate, and causal-escalation packages must include a Core Logic Brief before implementation. Decision Experiment Gates are required for runtime/scenario/causal packages before implementation.

Active scenario-driven, release-gate, and causal-escalation sprints must keep a Sprint Strategy Brief near the top of the sprint file.

## Rules

Refer to [work/RULES.md](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md) for complete coding and process rules. Keep these core principles active in memory:

1.  **Workflow & Context**: Start from `npm run work:context` for non-trivial implementation work. Keep owner, boundary, proof ladder, and out-of-scope in view.
2.  **Validator Phases**: Validate at the correct phase (`--entry` for shape, `--pre-impl` before editing, and `--closure` before closing/committing). See [work/RULES.md#validator-phases](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#validator-phases).
3.  **Proof Integrity**: Keep proof ladders to 3-5 executable commands. Never weaken guardrails, lint rules, or allowlists to make a package pass. See [work/RULES.md#proof-requirements](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#proof-requirements).
4.  **Coding Constraints**:
    *   *No Inline Scalars*: Import or declare canonical constants.
    *   *No State-Nulls*: Explicit variants must encode domain/runtime state; never use raw null/undefined.
    *   *Single Path*: Use decision tables or state models instead of nested independent `if` statements.
    *   *Owner Decides*: Cache observes; owners decide. Avoid helper-local verdicts.
    *   *1200-Line Cap*: Touch/create files strictly <= 1200 lines. Refactor first if exceeded.
    *   See [work/RULES.md#coding-constraints](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#coding-constraints) for details.
5.  **Owner boundaries**: Identify semantic owner boundaries, reduce duplicate paths, and do not locally patch symptoms.
6.  **Subagents**: Assign subagents to maximize useful work per assignment (e.g. executor and verifier-fixer). Record roles in `## Execution Evidence`.
7.  **Atomicity**: Package closure is atomic (renaming, status, blocker, validation, commit/push move together).
