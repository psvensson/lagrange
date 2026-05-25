---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/architecture.md
last_reviewed: 2026-05-23
---

> **Canonical source — index.** This is the navigation index for the Lagrange Engineering Doctrine. Rule content lives in the sub-files; the LLM pack generator reads them via `llm-pack.config.json`.

# Lagrange Engineering Doctrine

## Document Role

This document tree governs the short-form implementation doctrine for all coding work in this repository.

Use this tree for:

- the durable architectural intent behind code changes
- the rule that one concern has one owner
- the rule that one semantic decision uses one path

Do not use this tree for:

- current concrete component owner maps (see [`../../architecture/INDEX.md`](../../../architecture/INDEX.md))
- workstream-local testing procedure (see [`../testing-guidelines.md`](../testing-guidelines.md))
- style and lint details (see [`../code-style.md`](../code-style.md))
- roadmap scope decisions (see [`../roadmap.md`](../roadmap.md))

Read together with [`../system-guidelines.md`](../system-guidelines.md),
[`../testing-guidelines.md`](../testing-guidelines.md), and the canonical
[`../../architecture/INDEX.md`](../../../architecture/INDEX.md). Root
[`../../architecture.md`](../../../architecture.md) is a compatibility pointer
for older links only.

## Doctrine Summary

1. one semantic owner per concern
2. one write ingress per plane
3. one read ingress per semantic decision
4. one dissemination path for shared metadata
5. slower under pressure, never less correct
6. shrink porous boundaries when bugs cluster
7. sharpen work before changing code
8. keep sprint execution on one current owner boundary
9. escalate repeated scenario failures into causal analysis

## Files

| File | Topics covered |
| --- | --- |
| [`owner-boundaries.md`](owner-boundaries.md) | §1 One Semantic Owner · §6 Shrink Boundary When Bugs Cluster · §14 Shared Surfaces Name Consumers · §17 Sprint Execution Has One Current Boundary |
| [`single-path.md`](single-path.md) | §2 One Ingress · §3 One Dissemination Path · §11b One Contract Shape Per Concern · §12 Normalize Boundary Impedance · §13 Named Modes Over Combinable Flags |
| [`state-encoding.md`](state-encoding.md) | §4 Phase Code Must Hand Off · §5 Slower Under Pressure · §7 Resource Lifetime Bounded · §10 Normalize Evidence · §15 One Progress Grammar |
| [`decision-experiments.md`](decision-experiments.md) | §8 Architectural Direction for Repeated Control-Plane Problems · §9 Escalate Repeated Scenario Failures · §11a Sharpen Work Before Changing Code · §16 Failure Migration As Boundary Evidence |
