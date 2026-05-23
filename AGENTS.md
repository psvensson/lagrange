# AGENTS

Welcome, developer or AI agent. This repository operates under a strict, validated workflow driven by automated tools and rules.

## Core Reference Index

To align with this repository's structure, read and defer to the following canonical documents:

1.  **Steering Load Order**:
    *   Load `.kiro/steering/llm/README.md` first.
    *   Load `.kiro/steering/llm/core.md` second (manual always-load operating contract).
    *   Load the primary domain pack named by `npm run work:context`.
2.  **Workflow Rules & Coding Constraints**:
    *   Refer to [work/RULES.md](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md) for the single canon of rules.
    *   Use [architecture/INDEX.md](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/architecture/INDEX.md) as the architecture entrypoint before reading subsystem detail.
    *   [Lane Definitions](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#lane-definitions)
    *   [Validator Phases](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#validator-phases)
    *   [Proof Requirements](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#proof-requirements)
    *   [Coding Constraints](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#coding-constraints)
    *   [Scope and Roadmap](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#scope-and-roadmap)
    *   [Worktree Safety](file:///media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/work/RULES.md#worktree-safety)

## Workflow Tooling

Before using raw JSON, log slicing, or ad-hoc queries, run these canonical tools:

*   **Handoff & Context**: `npm run work:context` (names active blocker, owner, boundary, and active constraints).
*   **Command Index**: `npm run work:help` (lists diagnostic, triage, validation, and guardrail commands).
*   **Detailed Context**: `npm run work:llm-start` (outputs package doctor, model ledger, and artifact summaries).
*   **Validation**: `npm run work:validate -- --entry|--pre-impl|--closure` (validates package states).
*   **Repair**: `npm run work:repair` (heals package metadata and edge cards).
*   **Evidence Extractor**: `npm run work:evidence-summary -- <artifact>` (summarizes representative failures).
*   **Steering Pack Refresh**: `npm run steering:llm:pack` (regenerates compact steering packs after `.kiro/steering/*.md` source edits).

## Package Ceremony

Ensure your active package in `work/packages/` complies with validator rules. Use the lightest valid lane as defined in `work/RULES.md#lane-definitions` and execute closure atomically (renaming to `done-*`, updating `current-blocker`, and running validations).
