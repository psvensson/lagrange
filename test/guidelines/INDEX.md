---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-07-10
---

> **Canonical source - index.** Navigation index for testing policy. Rule
> content lives in the sub-files. Reached from the
> [`owner router`](../../docs/steering/router.md).

# Testing Guidelines

## Document Role

This document tree governs the test, harness, and proof workflow for the repository.

Use this tree for:

- test-first regression policy
- harness/runner discipline
- fixtures and mutation requirements
- distributed validation and release-gate ladders
- proof-ladder and static-guardrail expectations

Do not use this tree for:

- runtime/contract policy (see [`../system-guidelines.md`](../../docs/steering/rules.md) and [`../doctrine/INDEX.md`](../../docs/steering/rules.md))
- Quest workflow lifecycle (see [`../workflow-guidelines/INDEX.md`](../../docs/steering/workflow-guidelines/solver-quests.md))
- lint/style (see [`../code-style.md`](../../docs/development/code-style.md))

## Files

| File | Topics covered |
| --- | --- |
| [`harness.md`](harness.md) | Runner stability/parallelism, test duration, timeout budget, execution strategy, output management, distributed harness, external resources. |
| [`fixtures.md`](fixtures.md) | System-table mutation requirements, no skipped tests, no test-only production paths, system-guideline conformance gate. |
| [`regression-policy.md`](regression-policy.md) | Test-first/reuse-first fix, bug-cluster escalation, owner-path/gateway/control-loop/temporal/continuity/memory/deferred-outcome/read-side-repair regression policies, availability under pressure, baseline-discovered closure. |
| [`release-gate.md`](release-gate.md) | Scenario-driven Quest failure migration, distributed validation ladder, artifact-first triage, boundary-transition scenario layer, delegated validation handoff. |
| [`proof-ladders.md`](proof-ladders.md) | Quest-driven validation, static guardrail preflight & closure, file-size ratchet. |

Adversarial verification attack checklists, organized by change category, live
in [`../verification-templates/INDEX.md`](../../docs/development/verification-templates/INDEX.md) —
use them when independently verifying an implemented change.
