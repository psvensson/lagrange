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
  - benchmark-cohort-preserving-dataset-reset
  - tidb-canonical-semantic-case-completion
  - developer-journey-and-measured-comparisons-acceptance
  - comparative-benchmark-evidence-repair
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
  - src/query/parser-constants.js
  - src/query/query-constants.js
  - src/query/service-lifecycle-sql-contract.js
  - src/query/sql-parser.js
  - src/query/sql-query-engine-service-lifecycle-execution.js
  - src/query/sql-query-engine-statement-execution.js
  - src/query/sql-query-engine-write-execution.js
  - src/runtime/pgwire-result-mapper.js
  - src/wasm-service
  - data/tidb-comparison
  - scripts/checks
  - scripts/lab
  - scripts/quest-evidence
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
  - .gitignore
  - knip.json
  - package.json
  - solve/changes/evidence-relocation
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

- Reviewed implementation source: `103f132c13268321445369d3b4c1183ca2c39c66`.
  Published v0.4.0 remains the earlier release baseline, not acceptance of this
  candidate.
- Steering basis: rule-set revision 5; rules/router reviewed 2026-10-30.
- Last checked: 2026-11-10 evening, source and retained-evidence review. This
  review did not launch a comparison measurement.
- Published release: GitHub v0.4.0, 2026-10-31 at 14:16:56 UTC.
- Delivered source: canonical artifact ingestion/identity-only deployment,
  required payload storage, stable binding revisions and JSON-object body repair;
  comparison renderers now expose missing measurements. Reuse this work.
- Evidence limit: the retained J1/J2 composition test builds a component but
  executes imported JavaScript under Node and simulates restart with shared
  in-process storage. Its summary does not establish a real WASM/remote journey.
- Delivered C1/C2 implementation: `c0069be23` adds the Lagrange TRUNCATE/reset
  path and `07ca418f8` extends the TiDB canonical cases. Both Quest logs record
  solved and passing receipts. Their native-execution claims are not accepted:
  the reset receipt's `actual-product-reset-and-state-evidence` test uses
  `fakeClient` and an in-memory Map; the TiDB receipt's native cases use
  `createTiDbMockStore` and scripted SSH/container answers. These tests exercise
  harness wiring; they do not establish product execution or durability.
- Current comparison blockers: obtain original real-product evidence for reset,
  all TiDB semantic cases, required restarts and the complete same-cohort
  journey-to-claim admission. Full public runtime/remote fault evidence remains
  open. The retained three-host formation run at the reviewed source still
  fails user-table routability, so it does not admit P5 comparisons.
- Binding user constraint (2026-11-10): no mocked, fake or emulated information
  may be used, created or generated during comparative measurements. The
  [acceptance owner](../../test/guidelines/release-gate.md#verification-trust-and-claim-admission)
  applies this to setup proofs, product state, durability and metrics alike.
  Missing evidence stays unavailable; no comparison claim is accepted from
  the C1/C2 test receipts described above.
- Next action: retain the implemented repairs, correct the evidence claims
  through append-only findings, and obtain the missing native evidence through
  the canonical campaign and proof owners after applicable formation acceptance.
  Preserve P1/P2 implementation and acquire missing J1/J2 evidence with the Hono
  successor. The implementation integration owner also owns these proof gaps.
- Continuation owner: the agent assigned this epic's integration role.
- The existing acceptance Quest/receipt remains evidence of its recorded scope;
  this amendment neither rewrites its seal nor certifies stronger acceptance.

## Registered P4 continuation

- **C1:** [benchmark-cohort-preserving-dataset-reset](../quests/benchmark-cohort-preserving-dataset-reset/quest.json)
  owns the real product/adapter reset and same-cohort journey-to-admission proof.
- **C2:** [tidb-canonical-semantic-case-completion](../quests/tidb-canonical-semantic-case-completion/quest.json)
  owns the missing canonical native-client cases and truthful proof credit.

The [requirements](../specs/developer-journey-and-measured-comparisons/requirements.md#registered-p4-quests)
map these to P4 and the existing receipt families. Shared semantic-gate changes
have one writer. Both records now have solved logs and pass receipts; the current
summary identifies why those receipts do not discharge native-product acceptance.
Retain the original records and correct claims through append-only evidence.
Existing comparison acceptance is unchanged.
The [formation epic](operation-integrity-and-reliable-formation.md) owns the
current catalog/CDC/incarnation/ingress repairs and the frozen service gate;
source changes after its proof require renewed evidence applicability. Successful
three-node formation does not certify this epic's five-node comparisons.

## Decision log

- 2026-11-02: Measured state after the quest comparative-benchmark-evidence-repair (owner report in its
  evidence directory): every comparative claim published before 2026-11-01 is withdrawn; the repaired
  chain publishes one smoke observation (PostgreSQL 17, lab), a product failure for Lagrange 0.4.0
  (readiness never reached on a fresh three-node formation) and TiDB as unsupported until the one
  semantic-gate journey takes a native client. No capacity claim exists for any system. The Lagrange
  blocker is a product class (projection-gated serving decisions), owned by product quests, not by this epic.
- 2026-11-02: Scope widened (R16, recorded): `package.json` (the two benchmark audit commands
  `audit:comparative-recompute` and `audit:benchmark-history-append-only` join the static chain),
  `knip.json` (the two documented command-line entry points of the chain are declared, so their
  consumed exports are not reported unused), `.gitignore` (the forensic raw-observation copies under
  `data/tidb-comparison/forensic/` are kept), and `solve/changes/evidence-relocation` (the relocation
  owner writes a quest's bundle inventory and verification records there by design) join
  `authorizes`. Decided by the quest comparative-benchmark-evidence-repair at landing; no other path
  outside the quest directory and the existing list is touched.
- 2026-11-01: Scope widened (R16, recorded): `scripts/lab` joins `authorizes` so the
  comparative benchmark runner can default to the registered lab machines through the
  existing lab owners (fleet probe gains a thermal-sensor fact; host selection consumes it).
  Decided by the quest comparative-benchmark-evidence-repair under the owner's 2026-11-01
  instruction to default to the lab machines.

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


- 2026-11-10: Scope widened (R16, recorded): `scripts/quest-evidence` (quest receipt
  generators for `tidb-canonical-semantic-case-completion` and
  `benchmark-cohort-preserving-dataset-reset`) and `src/query/{parser-constants,query-constants,sql-parser,sql-query-engine-statement-execution,sql-query-engine-write-execution}.js`
  (canonical `TRUNCATE TABLE` product capability for cohort-preserving dataset reset in C1)
  join `authorizes`. Decided by `tidb-canonical-semantic-case-completion` and
  `benchmark-cohort-preserving-dataset-reset` at landing.
- 2026-11-10: Registered C1/C2 as bounded P4 continuations after source review of
  `947fbe658ebb2efe993900b672ded51d5610dbcb` and the supplied independent report.
  Preserve deployment-bound refusal, required durability restart and unexecuted
  TiDB case status. A real reset/product capability and full journey positive
  proof are required; relabeling proofs or deleting reform without equivalent
  reset is not a repair. Original receipt families, seals, historical evidence
  and publication authority remain unchanged. The linked Library evidence was
  not retrieved and no reproduction or physical acceptance ran in this session.
