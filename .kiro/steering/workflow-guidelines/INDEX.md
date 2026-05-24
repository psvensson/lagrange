---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
last_reviewed: 2026-05-23
---

> **Canonical source — index.** This is the navigation index for workflow/package policy. Rule content lives in the sub-files; the LLM pack generator reads them via `llm-pack.config.json`.

# Workflow Guidelines

## Document Role

This document tree governs the package lifecycle, sub-agent sequencing, validator workflow, and sprint cadence for the repository.

Use this tree for:

- selecting lanes and meeting lane requirements
- declaring package status, closure, and residual inventories
- decision and experiment gates
- sub-agent sequencing and triage
- roadmap and work-tracker truth

Do not use this tree for:

- runtime/contract policy (see [`../system-guidelines.md`](../system-guidelines.md) and [`../doctrine/INDEX.md`](../doctrine/INDEX.md))
- testing policy (see [`../testing-guidelines/INDEX.md`](../testing-guidelines/INDEX.md))
- lint/style (see [`../code-style.md`](../code-style.md))
- canonical process rules (those live in [`../../../work/RULES.md`](../../../work/RULES.md))

## Files

| File | Topics covered |
| --- | --- |
| [`lifecycle.md`](lifecycle.md) | Workflow lanes, lane requirements, sprint entry & width limits, lifecycle progress grammar. |
| [`validators.md`](validators.md) | Static drift ledger, post-rerun decision gate. |
| [`packages.md`](packages.md) | Package status & closure, residual closure inventory, affected-area deep dive, shared boundary contracts, roadmap & work-tracker truth. |
| [`closure.md`](closure.md) | Core Logic Brief, Sprint Strategy Brief, Decision Experiment Gate, Sprint Architecture Decision Gate, classification fast-path & efficiency, causal closure ledger, failure migration, frontier oscillation, causal analysis escalation. |
| [`subagents.md`](subagents.md) | Sub-agent sequencing, LLM tool-first triage, current edge card and trap list. |
