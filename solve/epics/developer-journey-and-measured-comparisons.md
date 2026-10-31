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

# One deployment path, a complete developer journey, and measured comparisons

## Decision

Lagrange must present one accurate account of its current capabilities, one
artifact ingestion/deployment/activation mechanism, a complete generated-service
developer journey, and comparisons derived exclusively from actual product runs
on GCP or registered lab machines.

The executable scope, acceptance, owner crosswalk and ordered implementation
packages live once in the [requirements](../specs/developer-journey-and-measured-comparisons/requirements.md).
This memo does not duplicate their plan or certify the product.

## Release home and authority

The post-0.4.0 amendment assigns remaining full journey/comparison acceptance to
0.5, retaining RM-0.4-wasm-public-comparison and consuming
RM-0.4-scenario-a-comparison plus the existing service owners. Bounded current
claim/guard repairs target 0.4.1 and do not wait for the measurement campaign.
The new [Hono contract](../specs/standard-http-service-api/requirements.md) owns
the HTTP application boundary; this epic keeps artifact, revision, onboarding
and measurement ownership. Existing pilot and 0.6 OCI qualification keep their
owners. Publication of 0.4.0 does not discharge unfinished acceptance.

This decision supersedes active comparison acceptance that permits modeled
product results, and deployment guidance permitting local artifact sources,
external repair or optional-store success. Historical observations and sealed
records remain intact; successor work records the correction explicitly.

## Current summary

- Governing source: 07206ba1c8bb396f4eb097a753915bb34580d824 (v0.4.0).
- Steering basis: rule-set revision 5; rules/router reviewed 2026-10-30.
- Last checked: 2026-10-31.
- Published release: GitHub v0.4.0, 2026-10-31 at 14:16:56 UTC.
- Delivered source: canonical artifact ingestion/identity-only deployment,
  required payload storage, stable binding revisions and JSON-object body repair;
  comparison renderers now expose missing measurements. Reuse this work.
- Evidence limit: the retained J1/J2 composition test builds a component but
  executes imported JavaScript under Node and simulates restart with shared
  in-process storage. Its summary does not establish a real WASM/remote journey.
- First remaining blocker: composed public runtime/remote fault evidence and
  complete original physical comparison measurements are not established by the
  inspected composition receipt; some publication/guard claims still disagree.
- Next action: refresh P0's claim inventory; preserve P1/P2 implementation and
  acquire missing J1/J2 evidence with the Hono successor; continue P4-P7 through
  the existing measurement owners. Do not restart already delivered work.
- Continuation owner: the agent assigned this epic's integration role.
- The existing acceptance Quest/receipt remains evidence of its recorded scope;
  this amendment neither rewrites its seal nor certifies stronger acceptance.

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
- 2026-10-31: Post-release source review credits the 0.4.0 artifact/revision/body
  repairs. Peter's selected Hono successor owns the future Fetch/SDK boundary;
  J1/J3 consume it, while J2 and all artifact/comparison semantics remain here.
  Full remaining acceptance is carried to 0.5; current bounded claim repairs
  target 0.4.1. Existing logs, sealed acceptance and old receipt claims are not
  rewritten or promoted to real compiled/multi-host observations.

