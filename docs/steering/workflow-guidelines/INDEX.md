---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
last_reviewed: 2026-06-01
---

> **Canonical source - index.** This tree governs Quest workflow policy. Rule
> content lives in the sub-files; the LLM pack generator reads them via
> `llm-pack.config.json`.

# Workflow Guidelines

## Document Role

This document tree governs the Solver workflow: Quest authoring, measured
attempts, findings, terminal reports, delegated execution, and validation
guardrails.

Use this tree for:

- creating or selecting a Quest;
- choosing supervised `step` versus autonomous `run`;
- recording attempts and findings;
- interpreting SOLVED, EXHAUSTED, and MAX_CYCLES;
- keeping Quest evidence tied to probe artifacts.

Do not use this tree for:

- runtime/contract policy (see [`../system-guidelines.md`](../system-guidelines.md)
  and [`../doctrine/INDEX.md`](../doctrine/INDEX.md));
- testing policy (see [`../testing-guidelines/INDEX.md`](../testing-guidelines/INDEX.md));
- lint/style (see [`../code-style.md`](../code-style.md)).

## Files

| File | Topics covered |
| --- | --- |
| [`solver-quests.md`](solver-quests.md) | Canonical Quest workflow, anatomy, terminal conditions, strategy ladder, findings log, and agent executor. |
| [`lifecycle.md`](lifecycle.md) | Quest lifecycle phases and first commands. |
| [`validators.md`](validators.md) | Probe-owned truth, honesty checks, goalpost immutability, and report projection. |
| [`quest-artifacts.md`](quest-artifacts.md) | Quest artifact ownership and tracked versus regenerable data. |
| [`closure.md`](closure.md) | SOLVED / EXHAUSTED closure policy and failure migration handling. |
| [`subagents.md`](subagents.md) | Delegated worker roles for Quest attempts and reviews. |
