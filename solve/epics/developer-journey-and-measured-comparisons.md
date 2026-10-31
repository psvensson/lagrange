---
id: developer-journey-and-measured-comparisons
status: open
proof: certification
roadmapRow: RM-0.4-wasm-public-comparison
graduatesTo: solve/specs/developer-journey-and-measured-comparisons/requirements.md
doneWhen:
  probe: test-receipt
  args:
    file: solve/quests/developer-journey-and-measured-comparisons-acceptance/evidence/receipt.json
quests:
  - developer-journey-and-measured-comparisons-acceptance
authorizes:
  - Dockerfile
  - README.md
  - roadmap*
  - CHANGELOG.md
  - charts
  - architecture
  - docs
  - examples
  - src/authoring
  - src/cli
  - src/service
  - src/bootstrap/shared
  - src/control-plane/owners
  - src/query/pg/postgres-wire-adapter.js
  - src/query/service-lifecycle-sql-contract.js
  - src/query/sql-query-engine-service-lifecycle-execution.js
  - src/runtime/pgwire-result-mapper.js
  - src/wasm-service
  - data/tidb-comparison
  - scripts/checks
  - scripts/check-complexity.js
  - scripts/check-current-capabilities.js
  - scripts/check-unused-exports.js
  - scripts/generate-current-capabilities-doc.js
  - scripts/check-documentation-current-state.js
  - test
  - solve/epics
  - solve/specs
  - solve/quests
  - .github/workflows
---

# 0.4: One deployment path, a complete developer journey, and measured comparisons

## Decision

Lagrange must present one accurate account of its current capabilities, one
artifact ingestion/deployment/activation mechanism, a complete generated-service
developer journey, and comparisons derived exclusively from actual product runs
on GCP or registered lab machines.

The executable scope, acceptance, owner crosswalk and ordered implementation
packages live once in the [requirements](../specs/developer-journey-and-measured-comparisons/requirements.md).
This memo does not duplicate their plan or certify the product.

## Release home and authority

Initial completion belongs to the existing 0.4 Practical and Demonstrated
Service Core milestone, using RM-0.4-wasm-public-comparison and consuming
RM-0.4-scenario-a-comparison plus the existing service owners. It is not a new
parallel track or an assertion that a package named 0.4.0 completed acceptance.
Full 0.5 pilot operations and 0.6 OCI runtime qualification keep their owners.

This decision supersedes active comparison acceptance that permits modeled
product results, and deployment guidance permitting local artifact sources,
external repair or optional-store success. Historical observations and sealed
records remain intact; successor work records the correction explicitly.

## Current summary

- Governing source: dc07efb142f33b04e457d1abbfcc4baabdf9ede0.
- Steering basis: AGENTS.md and rules/router last reviewed 2026-10-30.
- Last checked: 2026-10-31.
- Published-release observation: GitHub latest 0.3.3; main package 0.4.0.
- Work state: planning only; no implementation Quest or measurement is started.
- First demonstrated blocker: comparison generators manufacture values and
  completion; deployment has multiple artifact sources and optional-store paths.
- Next action: the integration owner begins P0 in the linked requirements, then
  seals bounded successor Quests in its stated order.
- Continuation owner: the agent assigned this epic's integration role.
- The absent planned acceptance receipt is intentional and cannot mean done.

## Decision log

- 2026-10-31: Peter accepted the developer-facing audit with two stronger
  requirements: every comparison must be an actual GCP/lab run; deployment must
  not read local artifact files. One semantic way of doing each operation remains
  binding, with no legacy, fallback or development-only bypass.
- 2026-10-31: Independent verification expanded the scope to constant-derived
  comparison generators and completion guards; original evidence admission even
  for observed labels; storeless installation/Binding bypasses; runtime external
  repair; and the missing stable-endpoint service revision transition.
- 2026-10-31: Keep ordinary source compilation and database storage I/O distinct
  from deployment artifact acquisition. Deployment consumes registered immutable
  identities and explicit configuration, never project or filesystem locations.
- 2026-10-31: Planning approval uses relevant documentation/schema/link checks and
  independent review. Runtime, comparison and release acceptance remain unproved
  until their own original evidence exists.
- 2026-10-31: Use the current executable epic schema, which requires status and
  doneWhen. The conflicting no-status prose in solve/epics/README.md is a routed
  workflow-documentation finding, not permission to fork or repair the Solver here.

