# Lagrange Package And CLI Naming Alignment

## Why

The public roadmap and docs use `Lagrange` and future `lagrange ...` commands,
while package metadata and CLI docs still expose legacy
`distributed-database-system` and `ddb-admin` names. That split is tolerable
for internal work but will hurt Phase 0.5 usability.

## Scope Basis

Roadmap Phase `0.5 - External Usability` under `Cluster Deployment Experience`
and `Developer Workflow`.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/archived/done-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

## In Scope

1. Choose the canonical npm package name and binary migration path.
2. Add or update package metadata so public installation points at Lagrange.
3. Provide a compatibility story for existing `ddb-admin` usage if retained.
4. Update CLI docs, help text, runbooks, tests, and packaging expectations.
5. Keep Phase 0.5 command names aligned with:
   `lagrange cluster init`, `lagrange node start`, and
   `lagrange cluster join`.

## Out Of Scope

1. Implementing all Phase 0.5 cluster subcommands in this package unless split
   into dedicated follow-ons.
2. Breaking existing admin workflows without a documented compatibility path.
3. Rebranding internal test fixture comments that are not user-visible.

## Invariants

1. Public docs and package metadata must not disagree on the installed command.
2. Existing tests must reflect the intended compatibility path.
3. Naming work must not change runtime cluster semantics.

## Hotspots

1. `package.json`
2. `package-lock.json`
3. `src/constants/entrypoint.js`
4. `src/cli/README.md`
5. `src/cli/COMMAND_REFERENCE.md`
6. `src/cli/USER_GUIDE.md`
7. `src/cli/cli-constants.js`
8. `src/cli/bin/`
9. `scripts/build-sea.js`
10. `test/packaging/`
11. `docs/adaptive-timing-resource-diagnostics-runbook.md`

## Static Drift Ledger

Preflight:

- [ ] Record all public `distributed-database-system`, `distributed-db`,
      `ddb-admin`, and `DDB_*` occurrences.
- [ ] Decide which legacy names remain as compatibility aliases.
- [ ] Record CLI and packaging tests before edits.

Closure:

- [ ] Public docs point at one canonical install/command path.
- [ ] Compatibility aliases are tested or documented.
- [ ] Packaging tests assert the canonical name.

## Validation

1. `npm run test:cli`
2. Packaging tests touching CLI/SEA naming.
3. `rg` proof for remaining legacy names with allowed compatibility reasons.

## Done When

1. Users see `Lagrange` and `lagrange` as the primary public surface.
2. Any remaining `ddb-admin` or `distributed-database-system` names are explicit
   compatibility aliases, not accidental drift.
