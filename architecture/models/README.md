# Architecture Models

This directory contains architecture-owned executable and structured models.
These models are outside Quest state: Quests may cite them as evidence, but the
architecture tree owns their shape and drift control.

Use this directory for low-resolution models that describe core system logic,
owner boundaries, lifecycle flow, and cross-owner handoff rules that must move
with the architecture documents.

## Layout

- `statecharts/` - architecture-owned lifecycle and owner-flow statecharts
  checked by `npm run model:statecharts`.
- `decision-tables/` - architecture-owned decision tables checked by
  `npm run model:decision-tables`.
- `alloy/` - architecture-owned Alloy structural models checked by
  `npm run model:alloy`.

High-resolution protocol models may remain under `models/<domain>/` when the
tooling or runtime binding already expects that location. The architecture
contract record under `architecture/contracts/` must bind those artifacts back
to the owning architecture boundary.

## Update Rule

When `architecture/INDEX.md`, a subsystem architecture document, or
`architecture/current-owner-maps.md` changes a core owner boundary, update the
matching model and contract record in the same change. Validate with:

```sh
npm run model:contracts
```
