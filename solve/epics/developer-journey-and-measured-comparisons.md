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
  - transaction-path-telemetry-export
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
  - src/admin
  - src/diagnostics/telemetry-histogram.js
  - src/diagnostics/transaction-telemetry-collection.js
  - src/query/distributed
  - src/query/sql-query-engine-transaction-persistence-methods.js
  - src/query/query-executor-partition-delivery.js
  - src/query/query-executor-delivery-telemetry.js
  - src/entrypoint-runtime-admin-composition.js
  - src/lagrange-runtime-startup.js
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

## Current summary (20 November 2026)

- Current candidate and correction integration are owned by
  [operation integrity](operation-integrity-and-reliable-formation.md), checked
  at `58a2080337b56b4e5f97bcb54da59f57b94e6611` under rule-set revision 5.
  This is a source checkpoint, not a clean verified measurement candidate.
  The 17 November component work below is preserved evidence to reconcile by
  content; it is not a second live candidate assignment.
- Programme item 10 first freezes and admits a small smoke profile after
  evidence/semantic/formation prerequisites, then completes both assigned 0.5
  obligations: public WASM/conventional and full Scenario A TiDB/TiKV comparisons.
  The superseded comparative-workload-efficiency-evidence epic is historical;
  consume its graduated specification and applicable observations here. Full
  Scenario B remains 2.0; other scenario obligations keep their existing owners.
- Freeze equivalent semantics, cohort, topology/failure domains, distinct load
  generator, artifact/runtime identities, retries and paired/repeated measurement
  plan before execution. Account for every offered request, including unissued,
  failed, timed-out and unresolved work. Report setup, steady state, recovery,
  cleanup and resource/cost measurements at their actual scope; preserve cold/warm
  distinctions. A valid slower result is accepted honestly. Smoke never closes
  either full comparison.
- Item 13 consumes this owner's supported installed-consumer journey and the
  measured thirty-minute onboarding gate. Existing registered artifact deployment
  and management surfaces retain authority; no node-side author-file access or
  second workflow/status store is introduced. No comparative run was submitted
  by this adoption. Root owns the next pre-gate after corrections and evidence
  admission; later billable GCP provisioning still requires its actual authority.

### Recovered comparison originals and immediate priority

The operator requires a clean, independently verified candidate before smoke or
measurement. Finish the current bounded corrections and their applicable composed
gates first. Then prioritize the Lagrange arm; recover and assess existing
external-system observations before scheduling repeats. No campaign is queued by
this evidence reconciliation, and no new provisioning or spending is authorized
by these notes.

Read-only inspection on 20 November found originals outside the current worktree
under `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/measurement-prep/`:

| Original directory and `raw-observations.ndjson` SHA-256 | Recorded source and result |
| --- | --- |
| `gcp-campaign-2026-11-15`; `85a0199647dc84e547ab5bc3e2545d16c58beed39ae44bebc457f10906efcb3e` | `bf56d842f8e3d2494edf13ae6d9e7dc0ee7ff543`; PostgreSQL and TiDB completed smoke; TiDB semantic gate incomplete. Lagrange readiness failed. |
| `gcp-campaign-2026-11-15-r2`; `b7457560c42da1a20682e646e24edf100dd5ce0581086bdc7e4c249b744e7609` | `cbe2fc0f05b488e5efe44aed5ff0156153b9d127`; PostgreSQL and TiDB each recorded 100 committed requests and a passed semantic gate; Lagrange readiness failed. |
| `gcp-campaign-2026-11-15-r3`; `7a8419c0ef0f41dcd88b15ef454aa5955536b2190a3082bf316a64027bf2162e` | `456f3d2a435926b0b3c183933f5cb71bf57e8a8c`; PostgreSQL and TiDB each recorded 100 committed measurement requests, ten warmups, reconciled final state, and nine retained semantic-case files reporting 33 passed obligations. Lagrange readiness failed with all 100 requests unissued. |

The r2/r3 original campaign summaries admit the two external arms as
`valid-observed` smoke with no capacity claim; their recorded reasons still
include `semantic-gate-incomplete`, despite the nested gate reporting passed.
Preserve that discrepancy for the admission owner to explain. Campaign exit 1
reflects Lagrange failure; it does not erase completed external measurements.
The records use one offered rate (5 requests/second), one repetition per arm,
and recorded rather than counterbalanced ordering. They are not capacity runs
or a paired comparison with a future Lagrange run. Current checked-in raw and
admitted projections omit these GCP campaigns; their older PostgreSQL-only
summary is not a complete inventory of retained observations.

The bounded search covered sibling `lagrange*/data/tidb-comparison` raw records,
comparison/campaign directories in the preserved worktrees, and the registered
comparison evidence-relocation inventories. No separate capacity campaign was
located in that surface. The registered November 1–2 bundles preserve older
smoke attempts and withdrawn evidence; their existence does not restore an
invalidated claim. This is a search result, not proof that no other archive
exists. The r4 directory has no raw observation file and empty campaign output;
its provisioning/teardown records cannot substitute for measurement.

Continuation: the comparison/evidence owner must verify the retained originals'
case bindings, raw digests, actual substrate, artifacts/runtime, cleanup and
admission-version applicability before updating projections or reusing evidence.
Retain the original files in place; use the existing custody owner for selected
artifacts, with no duplicate evidence tree or wholesale directory upload. Shared
campaign directories also contain credentials and are not evidence bundles.
A development reuse decision cannot waive the existing final contemporaneous
paired-comparison contract.

For the lab smoke, use the registered comparison runner. The identifier
`comparative-smoke-setup` is a placement receipt key. The command below
previews the existing smoke profile and host roles.

```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs \
  --execution-target lab --targets lagrange --profile smoke --dry-run
```

On 21 November the live preview from `d6f624497` returned
`refused_insufficient_host_topology`. The three formation hosts were
reachable. Of the other two registered harness hosts, `carinas-windows`
timed out on SSH and `lenovo-laptop` had no route. The runner reports
zero when it cannot assemble the complete four-role assignment. The lab
owner rechecks live inventory for an eligible fourth load generator
before smoke. This preview acquired no campaign resources or measurements.
The [comparison runbook](../../docs/benchmarks/cloud-reproduction-guide.md)
owns image preparation and the live command.

The existing runner accepts `--targets lagrange --profile smoke`:
`comparative-smoke-v2`, one run at 5 requests/second, a 60-minute campaign budget,
and `comparable: false`. It requires the verified candidate, pinned image and
harness, three data hosts and a separate load generator, frozen semantic/workload
inputs, and the existing placement, thermal, lifetime and cleanup owners.
`--targets lagrange --profile capacity` is refused by the existing paired-sweep
owner, which requires at least two systems. The current capacity profile uses
rates 5 and 10 with balanced repetitions and a 240-minute campaign budget.
A separate Lagrange-only capacity characterization requires an explicit bounded
design under this owner; do not bypass that guard or relabel old smoke cells.
Full assigned comparisons remain open and retain their original acceptance.

## Retained summary (17 November 2026)

- The operator assigned the current ChatGPT root session to repair the verified
  latest candidate errors and continue this existing GCP comparative campaign.
  The candidate baseline is
  `4b0c8ec1de59e9a074afa97ce260afb2868685c5`, with continuation isolated on
  `work/review-fixes-gcp-prep-20261117` under rule-set revision 5.
- Native review established four bounded blockers in scalar SQL evaluation,
  budget conflict validation, Phase B target-slot observation consumption and
  probe deadline preservation. Their scope, authors and original evidence are
  retained in the [repair review record](../../docs/evidence/review-repairs-2026-11-17/README.md).
  Repair acceptance and this epic's comparative acceptance remain separate.
- Reconcile current campaign capability through read-only managed-lab and GCP
  observations. The retained Class A shakedown used project
  `something-2e584`, zone `us-central1-a`, `e2-standard-4` VMs and a distinct
  client; it does not establish that those instances still exist or grant new
  spending authority. Current topology and budget must be resolved before
  billable provisioning.
- Next: independently verify and integrate the repairs, execute the existing
  small physical-lab pre-gate, then advance through the canonical real-product
  GCP runner. Retain Lagrange/TiDB/PostgreSQL semantic parity, separate load
  generation, exact image/source identity and original result admission.
- Component review is complete: native query job 4918 passed 1,299 assertions
  and all frozen diagnostics, target-slot job 4910 passed, and HTTP jobs
  4908/4915 established the repair and final static correction. Root is
  composing generated metadata and exact-candidate proof before the physical
  pre-gate. A separate optional create-time GCP expiry proposal is unverified
  preparation; it has created no resources or measurement result.
- No comparative run is queued by this takeover yet. Root owns observation
  and continuation. Existing source, sealed quests and historical observations
  below retain exactly their recorded acceptance ceilings.

## Retained summary (10 November 2026)

- Reviewed implementation source: `947fbe658ebb2efe993900b672ded51d5610dbcb`.
  Published v0.4.0 remains the earlier release baseline, not acceptance of this
  candidate.
- Steering basis: rule-set revision 5; rules/router reviewed 2026-10-30.
- Last checked: 2026-11-10, source/planning review only; no new product run.
- Published release: GitHub v0.4.0, 2026-10-31 at 14:16:56 UTC.
- Delivered source: canonical artifact ingestion/identity-only deployment,
  required payload storage, stable binding revisions and JSON-object body repair;
  comparison renderers now expose missing measurements. Reuse this work.
- Evidence limit: the retained J1/J2 composition test builds a component but
  executes imported JavaScript under Node and simulates restart with shared
  in-process storage. Its summary does not establish a real WASM/remote journey.
- Current comparison blockers: Lagrange reformation between semantic cases and
  before measurement conflicts with the correctly retained deployment binding;
  a supported cohort-preserving dataset reset is missing. TiDB executes only
  four canonical cases and records the rest as not-executed. Full public
  runtime/remote fault and original physical comparison evidence also remains
  unproved.
- Next action: P4 admits the unsealed C1/C2 Quests below. Design the supported
  product reset before removing reformation, complete the native TiDB case
  set and prove actual journey-to-claim admission. Preserve P1/P2 implementation
  and acquire missing J1/J2 evidence with the Hono successor. P5 consumes the
  applicable frozen formation proof; no campaign or reviewer is queued here.
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
have one writer. Both records have historical solved entries and passing component receipts on
10 November: C1's implementation attempt is `981707bd4c4d6024665d792d57806949f288e65f`,
and C2's is `4262602338c5948250594941cdbc994d356be855`. Credit that implemented and
reviewed work; assess its source and original-execution applicability rather
than assigning it again as untouched. Component closure does not admit the
complete current comparison. The recovered GCP observations above supply later
execution to inspect through the existing evidence owner. Existing comparison
acceptance is unchanged.
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
