# Audience boundary — human docs vs development-process docs vs agent steering

Documentation in this repository serves three audiences. Each doc surface has
exactly one home zone; the zones MUST NOT be blended inside one document, and
cross-zone links follow the rules below. This is the audience counterpart to
[`memory-boundary.md`](memory-boundary.md) (which splits in-repo steering from
external agent memory).

## The three zones

- **Human product/operations/integration** — people who run, embed, or study
  Lagrange. Home: root `README.md`, `docs/` top level (runbooks, references,
  user guides, design specs), `architecture/`, `examples/`.
- **Development process** — people developing Lagrange itself, including
  operating the agent/Solver workflow from the outside. Home:
  [`docs/development/`](../development/README.md).
- **Agent steering** — LLM agents doing the work. Home: `AGENTS.md` (entry
  point) and `docs/steering/**`, including the generated packs under
  `docs/steering/llm/`.

## Zone assignment rules

- A document's zone is its **location**. `docs/steering/**` is agent-audience
  by location; `docs/development/**` is development-audience by location;
  everything else under `docs/`, `architecture/`, `examples/`, and the repo
  root is human-audience by default.
- Files whose location cannot change because machine consumers pin their path
  (contract records under `architecture/contracts/`, statechart/spec artifacts
  under `docs/specs/`, docs whose literal path appears in scripts or baselines)
  stay where the machinery expects them, whatever their audience. Mark the
  exception in the development index instead of exposing the file through
  human product navigation.
- Top-level `docs/*.md` and `docs/development/*.md` files declare their zone
  explicitly with an `audience: human | development | agent` frontmatter key so
  the boundary is checkable; elsewhere location alone is authoritative.

## Linking rules

- Agent docs MAY link freely into human and development docs. Shared ground
  truth (architecture, testing substrate maps) has one copy in the human tree;
  agents read it there. Never fork an agent-side copy of a human doc.
- Human-zone docs MUST NOT link into `docs/steering/**`, `solve/**`, or files
  explicitly assigned to the development or agent audience. The only
  cross-zone portals are:
  - root `README.md` -> `AGENTS.md` for agents;
  - root `README.md` -> `CONTRIBUTING.md` for contributors; and
  - `docs/README.md` -> `docs/development/README.md` for repository
    development.
  Everything agent-facing hangs off `AGENTS.md`, which owns the load order.
  Everything development-facing hangs off the contributor portals.
- Human-zone docs MUST NOT embed agent workflow mechanics (Solver command
  sequences, steering load order, pack regeneration steps). State the human
  fact ("invariants are machine-evaluated in CI") and leave the mechanics to
  the steering zone or `docs/development/`.
- Development-zone docs may reference both sides; they are the bridge audience.

## Enforcement

`scripts/check-doc-audience.js` (run via `npm run audit:doc-audience`, part of
`test:static`) checks the frontmatter requirement, all human-to-agent and
human-to-development links outside the portal allowlist (including inline,
reference-style, HTML, and autolink syntax), embedded Solver/Quest commands,
and that relocated legacy paths do not reappear.

Audience and lifecycle are separate classifications. The lifecycle contract in
[`docs/development/documentation-lifecycle.md`](../development/documentation-lifecycle.md)
keeps current documentation separate from active planning, generated surfaces,
compatibility pointers, release history, and immutable evidence.
`scripts/check-documentation-current-state.js` enforces that boundary through
`npm run audit:documentation-current`.

## Why

Humans landing in generated agent packs waste time reverse-engineering
machine-oriented rule prose; agents whose guidance is diluted across human
narrative docs re-read the whole tree to find binding rules. One home per
audience keeps both reads cheap, and single-copy ground truth (linked, not
duplicated) keeps the zones from drifting apart.
