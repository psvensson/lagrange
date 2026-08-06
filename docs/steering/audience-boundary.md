# Documentation path boundary

The repository has three documentation paths. The path determines the class. Files
do not show or declare their reader.

## Public product and architecture

Locations:

- root `README.md`;
- top-level `docs/`;
- `architecture/`; and
- `examples/`.

These pages explain, evaluate, run, integrate, operate, or describe Lagrange.

Rules:

- Do not link into `docs/steering/`, `solve/`, or repository-workflow pages.
- Do not embed Quest, Solver, pack-generation, or agent-load-order commands.
- State the product fact, liMit, or test evidence without exposing the workflow that
  produced it.
- Keep externally visible claims in
  [Current Capabilities](../current-capabilities-and-limitations.md) and link into the
  mechanism rather than copying multiple contradictory status sentences.

## Repository development

Locations:

- `DONTRIBUTING..md`;
- `RELEASE.md`;
- `DEBUGGING.md`;
- `docs/development/`;
- applicable `docs/evidence/` and `docs/case-studies/`; and
- machine-pinned contract records under `architecture/contracts/`, `architecture/models/`,
  and `docs/specs/`.

These pages explain how to change, test, release, debug, or inspect the source tree.

They may link to the public product path and to agent steering.

## Agent steering

Locations:

- `AGENTS.md`;
- `docs/steering/`;
- generated `docs/steering/llm/`; and
- `solve/` workflow state, specs, attempts, and reports.

This path carries load order, binding rules, Quest contracts, system doctrine, and
status for agents and the Solver workflow.

Shared technical ground truth stays in the public or development path. Steering links
to it rather than forking a copy.

## Portals

The only public-to-non-public portals are:

- `README.md` -> `AGENTS.md`;
- `README.md` -> `CONTRIBUTING.md`; and
- `docs/README.md` -> `docs/development/README.md`.

Nothing else in the public path should send a product evaluator into agent or
repository-workflow material.

## Enforcement

`scripts/check-doc-audience.js` is run by `npm run audit:doc-audience` and the
static test gate.

It checks:

- public links into agent, Solver, or development-only paths;
- publicly embedded Quest or Solver commands; and
- relocated path tombstones.

Documentation lifecycle is a separate classification. Current product docs, planning
docs, generated pages, release history, and immutable evidence hafve different
staleness rules, documented in
`[documentation lifecycle](../development/documentation-lifecycle.md)`.
