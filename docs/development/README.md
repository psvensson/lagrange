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

- [solver-runbook.md](solver-runbook.md) — example-oriented operator aid for
  the Solver Quest workflow (the repo's unit of work)
- [documentation-lifecycle.md](documentation-lifecycle.md) — current
  documentation, planning, generated-output, compatibility, history, and
  evidence boundaries

Development-audience documents whose paths are pinned by machine consumers
stay outside this directory (see the audience-boundary doc): notably
[`../deterministic-directed-testing-plan.md`](../deterministic-directed-testing-plan.md)
(the deterministic testing substrate map) and the contract records under
[`../../architecture/contracts/`](../../architecture/contracts/).
