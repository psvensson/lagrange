# Steering Hardening For Generation Contracts

## Why

The repository already had doctrine and system-guideline rules for explicit
state and no magic literals, but the codebase still accumulated large numbers
of violations.

That means the rules were not prominent or procedural enough for LLM-driven
code generation.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Goal

Make the scalar-ownership rule and the explicit-state decision-boundary rule
high-salience, operational, and difficult for future code generation to
rationalize away.

## Invariants

1. Do not introduce a new steering framework or duplicate policy documents.
2. Use the existing high-salience files:
   `AGENTS.md`, `system guidelines.md`, `code-style.md`.
3. Phrase the rules as hard generation contracts and decision procedures.
4. Keep the wording aligned across the touched documents.

## Implementation Tasks

- [x] Add a short hard-stop generation contract to `AGENTS.md`.
- [x] Add an early high-salience scalar/state decision-boundary contract to
      `system guidelines.md`.
- [x] Rewrite the scalar rule so it no longer conflicts with file-local
      constant exceptions.
- [x] Add an explicit rule forbidding branch piles for one semantic outcome.
- [x] Mirror the contract briefly in `code-style.md`.

## Done When

1. The highest-salience repo entry point tells LLMs what to do before writing
   code.
2. The scalar rule is phrased as an ownership decision tree, not a vague ban.
3. The explicit-state rule clearly forbids bags of independent `if` statements
   for one semantic outcome.

## 2026-04-12 execution update

Implemented:
1. [AGENTS.md](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/AGENTS.md)
   now has a top-level critical generation contract for scalar ownership and
   semantic decision boundaries.
2. [system guidelines.md](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/.kiro/steering/system guidelines.md)
   now carries the same contract near the top, plus detailed rules in the code
   quality section.
3. [code-style.md](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/.kiro/steering/code-style.md)
   now mirrors the scalar/state generation contract briefly.

Validation:
1. doc-only steering change
2. no tests required
