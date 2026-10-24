---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
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

- runtime/contract policy (see [`rules.md`](../../docs/steering/rules.md))
- Quest workflow lifecycle (see [`solver-quests.md`](../../docs/steering/workflow-guidelines/solver-quests.md))
- lint/style (see [`code-style.md`](../../docs/development/code-style.md))

## Files

| File | Topics covered |
| --- | --- |
| [`harness.md`](harness.md) | Runner stability/parallelism, test duration, timeout budget, execution strategy, output management, distributed harness, external resources. |
| [`fixtures.md`](fixtures.md) | System-table mutation requirements, no skipped tests, no test-only production paths, system-guideline conformance gate. |
| [`regression-policy.md`](regression-policy.md) | Test-first/reuse-first repair, repeated-cause reassessment, owner-path/gateway/control-loop/temporal/continuity/memory/deferred-outcome/read-side-repair regression policies, pressure, and failure disposition. |
| [`release-gate.md`](release-gate.md) | Independent repair, representative service scenario, and release acceptance; evidence ceilings; distributed validation order and handoff. |
| [`proof-ladders.md`](proof-ladders.md) | Bounded validation and review, static guardrail preflight and closure, file-size ratchet. |

Adversarial verification attack checklists, organized by change category, live
in [`verification-templates/INDEX.md`](../../docs/development/verification-templates/INDEX.md) —
use them when independently verifying an implemented change.
