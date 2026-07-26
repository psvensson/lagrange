---
audience: development
---

# Development Process

Documents for people developing Lagrange itself — how work is planned,
executed, and improved, including operating the agent/Solver workflow from the
outside. Nothing here is needed to run, operate, or integrate the system
(that lives in [`docs/`](../README.md) and the root [README](../../README.md)),
and nothing here binds agents (that lives in [`AGENTS.md`](../../AGENTS.md)
and [`docs/steering/`](../steering/)). Zoning rules:
[`docs/steering/audience-boundary.md`](../steering/audience-boundary.md).

- [../../CONTRIBUTING.md](../../CONTRIBUTING.md) — contribution policy and
  contributor entry point
- [../../DEBUGGING.md](../../DEBUGGING.md) — developer debugging entry point
- [../../RELEASE.md](../../RELEASE.md) — release procedure
- [solver-runbook.md](solver-runbook.md) — example-oriented operator aid for
  the Solver Quest workflow (the repo's unit of work)
- [documentation-lifecycle.md](documentation-lifecycle.md) — current
  documentation, planning, generated-output, compatibility, history, and
  evidence boundaries
- [capabilities-documentation.md](capabilities-documentation.md) — maintaining
  the generated human capabilities and limitations page
- [product-roadmap.md](product-roadmap.md) — cross-edition planning visibility;
  not an implementation source for the AGPL repository

The human-facing product direction is in the root
[roadmap](../../roadmap.md). The detailed AGPL implementation-scope authority
is the agent-only
[feature map](../steering/agpl-feature-map.md).

Development-audience documents whose paths are pinned by machine consumers
stay outside this directory (see the audience-boundary doc): notably
[`../deterministic-directed-testing-plan.md`](../deterministic-directed-testing-plan.md)
(the deterministic testing substrate map),
[`../deterministic-repro-tier.md`](../deterministic-repro-tier.md),
[`../convergence-donewhen-metric.md`](../convergence-donewhen-metric.md),
[`../admin-test-run-landing.md`](../admin-test-run-landing.md),
[`../distributed-playback-viewer.md`](../distributed-playback-viewer.md),
[`../../architecture/current-owner-maps.md`](../../architecture/current-owner-maps.md),
the contract records under
[`../../architecture/contracts/`](../../architecture/contracts/), and the
formal-model indexes under [`../../architecture/models/`](../../architecture/models/).
They are contributor references and are intentionally absent from the human
product and architecture navigation.
