---
id: developer-velocity-maintainability-and-product-readiness
roadmapRow: null
status: active
graduatesTo: developer-velocity-maintainability-and-product-readiness
---

# Developer Velocity, Maintainability, and Product Readiness

## Intent

Convert the 2026-07-12 repository audit into a sequenced improvement program.
The first objective is a short, trustworthy developer loop. The second is to
reduce complexity at existing owner boundaries. The third is to finish the
historical proof-artifact migration that remains after new large artifacts
became content addressed. Product usability, public API stability, and the
production-readiness floor follow without creating parallel runtime owners.

This program builds on, and does not reopen, the completed
[`owner-boundary-hardening-and-unification`](owner-boundary-hardening-and-unification.md)
program. In particular, Solver terminal integrity, new-artifact content
addressing, scope-pressure enforcement, Raft committed-entry safety, Helm admin
default-deny, canonical replica inventory, durable schema jobs, and
transaction-owned commit mode are already solved inputs.

External Compose, Helm, service-CLI, and getting-started implementation remains
owned by the active
[`lagrange-devops-onboarding`](lagrange-devops-onboarding.md) epic. This program
tracks that owner's exit result; it neither duplicates nor supersedes its
deployment design.

## Baseline

Measured on 2026-07-12:

- `npm run test:fast` passes, but nominal unit-lane files take up to 44.6s and
  the lane includes 14 `*.integration.test.js` files that `test:unit` excludes.
- The documented duration contract is 2s for unit tests and 30s for integration
  tests, while `run-test-files.js` enforces only a 600s process timeout.
- Cognitive-complexity debt is 182 functions above 20. Of those, 108 are in
  `src/control-plane`, `src/rebalancer`, `src/query`, and `src/bootstrap`.
- File-size debt is 25 source files above 800 lines and 21 tests above 1500.
- Duplication debt is 71 source/script clone groups (2,153 duplicated lines)
  and 836 test clone groups (32,008 duplicated lines).
- Thirty-eight test files, about 39,000 lines, are excluded from ESLint by
  `-part-`, `-tail-`, or `-segment-` filename patterns.
- The package root exposes 290 names through wildcard exports and has no
  declaration file or explicit supported-export manifest.
- The W11 proof-artifact census measured 187 payloads and 12,724,867 bytes.
  W12 migrated the duplicate payloads at the measured 32KiB threshold and made
  new large artifacts content addressed, but historical inline payloads, logs,
  reports, and legacy terminal projections remain in the main history.
- Production dependencies have zero current audit findings. The complete
  dependency tree has five moderate development-only findings.
- External usability still lacks a Compose cluster, cluster lifecycle CLI, and
  an executable getting-started tutorial. PostgreSQL password/SCRAM and TLS,
  failover and durability SLOs, and a restore drill remain open.

Every work package must remeasure its own baseline before sealing its Quest;
these numbers establish direction, not a movable closure predicate.

## Program Principles

1. A faster loop must not weaken CI. Curated developer proof is additive until
   a separately measured lane-cutover Quest proves coverage preservation.
2. Test classification has one owner. Shell globs, shard generation, duration
   policy, and public command descriptions must consume the same manifest.
3. Complexity work follows owner boundaries. It extracts normalized evidence,
   a pure decision/reducer, and side-effect application; it does not create
   generic utility layers or forwarding modules.
4. Ratchets must decrease. A green baseline is not a claim that existing debt
   is acceptable.
5. Proof-artifact cleanup preserves logical payload identity and historical
   readability. Deleting evidence or weakening audit is forbidden.
6. Public product work must use existing runtime, CLI, chart, and example
   owners. No second bootstrap, placement, query, or service lifecycle path is
   allowed.
7. Production-readiness claims remain alpha until authentication, transport
   security, recovery, and SLO evidence exist.
8. Each source-changing Quest requires independent final-diff verification and
   a Solver finding with `subagent:<id>` evidence before audit and handoff.
9. Test selection is derived by the repository, never chosen by the agent. The
   proof-cone selector fails closed: any unclassified path, unknown owner, or
   stale impact input widens the cone to a broader lane or the full suite.

## REUSED vs EXTENDED vs NEW

### Reused

- `scripts/run-test-files.js`, curated semantic subset checks,
  `test/shards/timings.json`, and `scripts/list-commands.js`.
- The versioned acceptance-manifest schema and fail-closed executor in
  `scripts/checks/acceptance-proof-manifest-runner.js`. The developer smoke
  proof is a new manifest instance, not a new manifest schema or runner.
- Complexity, duplication, dependency, file-size, architecture-slice, runtime
  grammar, and scoped-ratchet checks.
- `scripts/solve/proof-artifact-census.js`,
  `scripts/solve/change-artifact.js`, the W12 migration receipt format, and the
  content-addressed object store.
- The Docker image, Helm chart, MovieLens comparison, Admin CLI, PostgreSQL
  runtime, authentication middleware, snapshot machinery, and distributed
  harness.

### Extended

- The test-classification owner gains explicit primary/resource manifests and
  one executable scheduling policy. The acceptance-manifest owner
  gains the developer-smoke manifest instance.
- The classification owner later gains an impact-graph / proof-cone capability
  (V4): static dependency edges (generated), observed coverage edges
  (generated from periodic full runs), and semantic contract edges (explicit
  declarations on both tests and production contract owners). It selects
  tests; it never owns their primary class or their duration policy. No
  hand-maintained source-file-to-test-file table is introduced: primary class
  and contract identity stay explicit, dependency and coverage relationships
  stay generated, and timings stay measured.
- Existing owner maps and metric reports gain a program-level burndown view;
  runtime decision ownership does not move.
- The proof-artifact migration owner gains a historical migration mode and
  retention policy bound to a fresh census.
- The existing public API facade becomes explicit, documented, typed, and
  package-allowlisted.

### New

- One developer smoke manifest *instance* is new because no public short
  developer proof command exists. Its command list has one authority: the
  manifest itself. It is executed by the existing acceptance-manifest owner and
  is never copied into a curated shard.
- SLO and recovery evidence artifacts are new product contracts, not new
  runtime state owners.

## Dependency Order

Status 2026-08-07: V1a/V1b (pre-existing), **V2a, V4a, V4b, V4c are LANDED**
(commits 381193728, 4a68d3432, 5f15e3a5f, 2359c7317), plus the
content-freshness hardening Quest `proof-cone-coverage-content-freshness`
(c7d57c48d): coverage edges go stale only when a bound file's bytes change
(per-file sha256), never on unrelated-commit graph-digest churn. Quest work
now runs on the derived proof cone: a leaf diff lands on its bounded cone
(254 tests for a call-cell leaf), a docs diff on the 6-test safety floor
(`npm run test:quest-proof -- --changed <file>`), and selector/core/unknown
changes force the full suite. Every landing review manifest carries the
selection receipt (tier, per-edge-kind counts, selector version, input
digests). The building-block Quest
`quest-test-proof-cone-shadow-validation` (274d26912) then hardened the
selector into the canonical `TestImpactDecision` (mode `selected`|`full`,
never an empty-tests "probably safe" mode), gave every selected test a
machine-readable reason (`static_dependency`/`observed_coverage`/
`semantic_contract:<name>`/`changed_test`/`universal_safety`/`escalation`),
named every escalation rule, and proved conformance against a committed
25-case historical red-on-revert corpus (zero detector misses, 11 honest
full-mode escalations) — all as shadow evidence with the full audit and
landing eligibility untouched. Its selector is decomposed
(`impact-proof-cone-inputs.js`) so the scoped complexity ratchet is 0/3.
Remaining velocity work: the separate cutover Quest
(`proof-cone-landing-cutover`) that may let landing use the cone only after
accumulated shadow evidence (selector misses: 0, owner classes seen, full-suite
samples), plus V2b/V2c consumer cutover + duration enforcement, V3 fast-lane
budget, and periodic coverage-corpus growth (the committed snapshot covers 107
leaf tests; the corpus-sufficiency gate widens honestly below 5% census share).

```text
Velocity lane
  V1a developer smoke command surface  [LANDED]
    -> V1b developer smoke proof  [LANDED]
    -> V2a primary test-classification manifest  [LANDED 381193728]
      -> V2b classifier consumer cutover
        -> V2c duration enforcement/remediation batches
      -> V3 fast-lane budget cutover
      -> V4a impact-graph/proof-cone owner + universal safety floor  [LANDED 4a68d3432]
        -> V4b shadow-mode validation against the full suite  [LANDED 5f15e3a5f]
        -> V4c selective Quest-landing cutover (escalation tiers)  [LANDED 2359c7317]

Maintainability lane
  M1 global owner-debt inventory
    -> M2 control-plane/rebalancer burndown
    -> M3 query/bootstrap burndown
      -> M4 lint/file-size/duplication blind-spot retirement

Artifact lane
  A1 fresh historical-artifact census
    -> A2a census-bound migration receipt v2
      -> A2b historical payload migration batches
        -> A3a retention policy cutover
        -> A3b legacy projection cleanup

Product lane
  V1 -> U0 consume lagrange-devops-onboarding exit result
  M2/M3 -> P1 explicit supported package API
  U0 -> R1 failover/durability SLO contracts
  U0 -> R2a PostgreSQL authentication
          -> R2b PostgreSQL TLS policy
  U0 -> R3 restore drill

Quality lane
  V2c -> Q1 scoped coverage + critical-owner mutation schedule
  V1 -> Q2 dependency and release-supply-chain gate
  Q1a -> V4a scoped owner coverage feeds proof-cone validity
```

V1, M1, A1, and Q2 are independent and may proceed in parallel. R1, R2, and R3
are independent after the existing onboarding owner supplies a runnable public
cluster. All source-changing burndown Quests remain serialized per owner area.

## Executable Quest Contract

Every row below creates one Quest with the stated ID and class. Unless a row
explicitly says `oracle`, its runner writes
`test-output/reports/<quest-id>-<timestamp>.report.json` and its `doneWhen` is:

```json
{
  "probe": "scenario-harness",
  "args": {
    "scenario": "<quest-id>",
    "consecutive": 3,
    "metric": "priority"
  }
}
```

Each source-changing Quest adds the standard source-change subagent-verification
constraint. The declared pathscope excludes the pre-existing untracked
`solve/report/formation-ledger-quorum-concentrated-replace-churn-60s.md`.

| Work | Quest ID / class | Exact evidence command | Declared implementation pathscope | Engagement and red-on-revert proof |
| --- | --- | --- | --- | --- |
| V1a | `developer-smoke-command-surface` / process | `node scripts/run-project-hardening-acceptance.js --manifest test/manifests/developer-smoke-proof-manifest.json --scenario developer-smoke-command-surface --receipt-dir test-output/acceptance/developer-smoke` | `package.json`; README; command catalog/tests; generated tools index; V1a Quest evidence | public alias and catalog resolve to the single manifest through the existing executor; removing or redirecting the package command fails |
| V1b | `developer-smoke-proof` / process | `node scripts/run-developer-smoke-proof-scenarios.js` | developer-smoke manifest; acceptance wrapper tests; V1 runner/Quest evidence | runner executes the manifest SHA through the existing acceptance executor; empty command list, missing test, skip, and timeout fail |
| V2a | `test-primary-classification-manifest` / process | `node scripts/run-test-primary-classification-manifest-scenarios.js` | one new classification manifest/schema module; generator and classifier tests; Quest evidence | filesystem census assigns every `*.test.js` one primary class; missing, duplicate, and unknown class fail |
| V2b | `test-classification-consumer-cutover` / process | `node scripts/run-test-classification-consumer-cutover-scenarios.js` | `package.json`; test runner; shard generator/files; classification tests; docs; Quest evidence | unit/fast/shard commands consume the manifest; restoring any retired shell discovery path fails the guard |
| V2c | `test-duration-contract-enforcement` / process | `node scripts/run-test-duration-contract-enforcement-scenarios.js` | runner duration policy; duration fixtures/tests; Quest evidence | exact below/equal/above literal 2s and 30s body-time cases; missing timing, invalid class, and timeout fail closed |
| V3 | `fast-test-lane-budget-cutover` / process | `node scripts/run-fast-test-lane-budget-cutover-scenarios.js` | classification manifest; timing snapshot; CI/release lane declarations; docs; Quest evidence | three timed runs meet the sealed budget; union census proves every displaced test remains assigned |
| V4a | `impact-graph-proof-cone-owner` / process | `node scripts/run-impact-graph-proof-cone-owner-scenarios.js` | classification owner impact extension; contract-declaration schema; static-edge and coverage-edge generators; escalation-tier policy; selection-rationale receipt; generator/classifier tests; Quest evidence | three edge kinds select independently; unclassified path, unknown contract, and stale coverage snapshot widen to the tier-mandated lane; hand-maintained source→test map is absent |
| V4b | `proof-cone-shadow-validation` / process | `node scripts/run-proof-cone-shadow-validation-scenarios.js` | read-only shadow runner; replay corpus; selection-miss report; Quest evidence | for every replayed historical diff with a full-suite failure, at least one regression-detecting test was inside the selected cone; any selection miss fails the Quest |
| V4c | `selective-quest-landing-cutover` / process | `node scripts/run-selective-quest-landing-cutover-scenarios.js` | Solver landing evidence command; escalation-tier wiring; selector/version pin; landing-receipt extension; docs; Quest evidence | a leaf-owner diff lands on its selected cone; selector/test-runner self-change and unknown-path diffs force the full suite; receipt records counts per edge kind, selector version, and escalation |
| M1 | `global-owner-debt-inventory` / process | `node scripts/run-global-owner-debt-inventory-scenarios.js` | new read-only inventory/analyzer and tests; generated inventory artifact; Quest evidence | independent counts match all existing checkers; deleting or double-assigning one violation fails |
| M2/M3 child | `owner-complexity-<owner>-<boundary>` / product | generated by M1 as `node scripts/run-owner-complexity-<owner>-<boundary>-scenarios.js` | one owner directory/boundary, adjacent focused tests, one generated scenario runner, Quest evidence; maximum 25 paths/256KiB/six owner areas | focused behavior/decision trace parity plus scoped strict metrics; revert restores at least one measured violation |
| M4a | `ordinal-test-lint-visibility-cutover` / process | `node scripts/run-ordinal-test-lint-visibility-cutover-scenarios.js` | ESLint config; explicit debt ledger; lint tests; Quest evidence | new ordinal files cannot hide; removing a ledger entry for still-red debt fails; blanket patterns are absent |
| M4b | `structural-audits-static-gate-cutover` / process | `node scripts/run-structural-audits-static-gate-cutover-scenarios.js` | `package.json`; acceptance manifest if required; project-hardening contract tests; Quest evidence | canonical static gate executes file-size and architecture-slice checks; injected violation makes the gate red |
| M4c child | `test-structure-burndown-<boundary>` / process | generated from M1 inventory | one test owner boundary, adjacent fixtures/tests, ratchet baseline, Quest evidence | duplicate/oversized/lint debt decreases and behavior tests remain green; no scanner exclusion is added |
| A1 | `solver-historical-artifact-census` / process | `node scripts/run-solver-historical-artifact-census-scenarios.js` | existing census extension; tests; generated census/decision artifact; Quest evidence | filesystem totals reconcile exactly and every artifact class has a decision; no writes under historical payload roots |
| A2a | `solver-historical-artifact-migration-v2` / process | `node scripts/run-solver-historical-artifact-migration-v2-scenarios.js` | migration schema/tool/tests; v2 receipt root; Quest evidence | receipt binds A1 census SHA, migration schema, exact batch inventory, pre/post logical identities; W12 receipt remains unchanged |
| A2b child | `solver-historical-artifact-batch-<n>` / process | `node scripts/run-solver-historical-artifact-batch-scenarios.js --batch <n>` | A1-approved batch whose **total Quest diff**, including payload deletion/rewrite, descriptors, objects, receipt, runner, and Quest evidence, is at most 25 paths and 256KiB | pre/post logical SHA parity, descriptor/object tamper attacks, reverse readability, batch replay, and a synthetic 26th total path fail closed before attempt recording |
| A3a | `solver-artifact-retention-policy-cutover` / process | `node scripts/run-solver-artifact-retention-policy-cutover-scenarios.js` | retention classifier/tool/tests/docs; no durable event deletion; Quest evidence | dry-run and clean-clone regeneration prove only derived reproducible artifacts are eligible; unique evidence is never selected |
| A3b child | `solver-legacy-projection-<schema>` / process | one scenario runner per legacy schema | projection/migration owner, synthetic legacy logs/tests, batch receipt, Quest evidence | migrated or explicitly legacy-labeled output cannot show terminal status beside actionable continuation; source events remain byte-identical |
| P1 | `supported-package-api-cutover` / product | `node scripts/run-supported-package-api-cutover-scenarios.js` | public facade/domain indexes; export manifest/types; package allowlist; pack/install tests/docs; Quest evidence | clean pack/install executes supported exports; undeclared wildcard export and removed supported export fail |
| R1 | `failover-durability-slo-contracts` / product | `node scripts/run-failover-durability-slo-contract-scenarios.js` | SLO model/docs/analyzer/tests/release projection; Quest evidence | safety and statistical latency remain separate; synthetic threshold breach fails without per-run convergence flake |
| R2a | `pgwire-authentication-cutover` / product | `node scripts/run-pgwire-authentication-cutover-scenarios.js` | PG auth descriptor/session owner and client compatibility tests; Quest evidence | external listener rejects trust/anonymous sessions; loopback trust remains explicit; real credential success/failure |
| R2b | `pgwire-tls-policy-cutover` / product | `node scripts/run-pgwire-tls-policy-cutover-scenarios.js` | PG wire TLS ingress/descriptor/config and real-client tests; Quest evidence | require/prefer/disable modes have one policy owner; downgrade and invalid certificate attacks fail closed |
| R3 | `cluster-restore-drill` / product | `node scripts/run-cluster-restore-drill-scenario.js` | snapshot/restore adapter, live drill, oracle, docs; Quest evidence | clean-cluster restore proves schema/data/ownership/service metadata; stale/incomplete snapshot fails |
| Q1a | `scoped-owner-coverage-cutover` / process | `node scripts/run-scoped-owner-coverage-cutover-scenarios.js` | coverage collector/threshold map/tests/package scripts; Quest evidence | changed owner code without exercised lines fails; unrelated global coverage cannot mask it; per-test execution map is reusable as V4a coverage-edge input |
| Q1b | `critical-owner-mutation-schedule` / process | `node scripts/run-critical-owner-mutation-schedule-scenarios.js` | Stryker config; critical reducer manifest; workflow/tests/docs; Quest evidence | seeded surviving mutant fails the lane; push gate remains unchanged and scheduled lane is bounded |
| Q2 | `dependency-release-supply-chain-gate` / process | `node scripts/run-dependency-release-supply-chain-gate-scenarios.js` | audit policy, workflow/release scripts, SBOM/attestation config/tests/docs; Quest evidence | production advisory, unpinned download, missing SBOM, and checksum-only fixture fail |

M1 must generate the exact M2/M3/M4c child list and A1 must generate the exact
A2b/A3b child list. A generated list is reviewed and committed before its first
child Quest; it may not be expanded silently mid-batch.

## Work Packages and Sealed Results

### V1 — Developer Smoke Proof

Sealed result: one public `npm run test:smoke` command executes
`test/manifests/developer-smoke-proof-manifest.json` through the existing
acceptance-manifest schema and executor. The manifest is the only authoritative
smoke test list and is not copied into `test/shards/`. It fails closed on
empty/skipped/missing tests, exercises the existing acceptance executor and test
runner, the three Raft safety closures, owner-boundary contracts, public API,
transaction mode, and content-addressed proof contracts, completes under the
manifest's 60s hard timeout, and leaves `test:fast` and every CI command
unchanged. The measured candidate set completed in 3.38s on the 2026-07-12
development host; closure requires three fresh receipts with environment and
duration identity, not an undefined machine label.

Proof: acceptance-manifest validation attacks; red-on-empty,
red-on-deleted-entry, skip, and timeout cases; three timed smoke executions;
command catalog and README checks.

The V1 manifest's single `focused-contracts` command must initially contain
exactly these paths; after the manifest lands, it is the authority and this list
is retained only as the V1 design record:

```text
test/scripts/run-test-files.test.js
test/scripts/acceptance-proof-manifest-runner.test.js
test/release/public-api-side-effect-boundary.test.js
test/release/project-hardening-contracts.test.js
test/admin/admin-websocket-external-bind-policy.test.js
test/runtime/pgwire-protocol-ordering.test.js
test/compatibility/pgwire-client-compat.test.js
test/closure/CL-040.repro.test.js
test/closure/CL-041.repro.test.js
test/closure/CL-042.repro.test.js
test/convergence/dt6-publication-quorum-failback-network.test.js
test/convergence/dt6-publication-failback-pct-search.test.js
test/convergence/dt6-fine-drive-midchurn-safety.test.js
test/control-plane/owner-outcome-contract.test.js
test/rebalancer/in-flight-aware-drain-phase-replace-credit.test.js
test/query/transaction-owned-commit-mode-guard.test.js
test/solve/content-addressed-change-artifact.test.js
```

### V2a — Primary Test Classification Manifest

Sealed result: one machine-readable classifier assigns every test exactly one
primary class: unit, integration, bootstrap, convergence-probe, or packaging.
Smoke is an overlapping proof view owned by its acceptance manifest, not a
primary class.

### V2b — Classification Consumer Cutover

Sealed result: `test:unit`, `test:fast`, shard generation, and duration policy
consume V2a; the retired shell discovery expressions are absent; the 14
suffix-classified integration tests no longer enter the unit lane; complete
CI/release coverage is preserved.

### V2c — Duration Enforcement and Remediation

Sealed result: unit >2s and integration >30s body time are literal hard
failures. Process-spawn overhead is reported separately and cannot hide slow
test bodies or consume their budget. Each existing slow test is fixed or moved
by a bounded child Quest only when it genuinely uses integration semantics; no
bulk reclassification is allowed.

### V3 — Fast-Lane Budget Cutover

Sealed result: the public fast developer lane has a stated wall-clock budget
and meets it in three consecutive clean runs, while every displaced slow or
integration test remains in a blocking CI, nightly, release, or statistically
correct convergence lane with an existence/completeness guard.

Proof: before/after lane manifest and timing receipt; no test disappears from
the union of blocking and declared statistical lanes; three timed runs.

### V4a — Impact Graph / Proof-Cone Owner

Sealed result: the classification owner gains impact edges of exactly three
kinds, with generated edges supplementing but never replacing explicit
declarations:

1. **Static dependency edges (generated).** Reverse module-import closure
   from the dependency graph already maintained for dependency-cruiser. A
   test is affected by every production module reachable through its import
   closure.
2. **Observed coverage edges (generated).** From periodic full-suite runs,
   record which production files each test file executes. This catches
   dynamic registration, dependency injection, factories, plugin lookup,
   message handlers, and late-bound runtime owners that static imports
   cannot see. The snapshot carries a freshness bound; a stale snapshot
   widens selection rather than silently narrowing it.
3. **Semantic contract edges (explicit).** Tests declare the contracts they
   exercise (`call-cell-routing`, `partition-topology`,
   `runtime-service-placement`, WIT interface, message envelope, system-table
   schema, replica-operation state, SQL grammar, routing/owner decision
   tables, bootstrap contract, ...); production files declare the contracts
   they own. Changing a contract selects every test claiming it. Unknown or
   undeclared contracts fail closed.

The selection algorithm is deterministic: aggregate Quest diff → changed
owners/contracts → reverse dependency closure → union of static-dependent,
coverage-dependent, and contract-dependent tests → plus changed/new tests
themselves, relevant architecture/owner guards, and the universal safety
floor. Q1a scoped owner coverage is a validity input: if the selected set
executes no changed owner code, the proof cone itself is invalid. The agent
never chooses the tests; the repository derives them. Every selection stores
its rationale in a versioned landing-receipt extension (changed files,
affected owners, per-edge-kind counts, unique-selected/total, escalation,
selector version SHA, source fingerprint).

The universal safety floor runs on every Quest landing regardless of impact
analysis: the curated `test:safety-pregate`, classification integrity,
owner-boundary structural checks, changed-path lint/static checks, and the
Quest's own `doneWhen` proof. The floor targets well under a minute.

Escalation tiers are policy owned by the selector, not per-Quest judgement:

| Change class | Required proof |
| --- | --- |
| Documentation only | documentation/static audits |
| Leaf implementation | dependent unit tests + owner tests + safety floor |
| Owner implementation | owner unit + owner integration + reverse dependents |
| Owner boundary / public contract | whole architecture slice + dependent integrations |
| WIT/protocol/schema/system-table shape | every consumer slice |
| Raft/common routing/bootstrap/core metadata | broad safety lanes, possibly full |
| Test runner/classifier/selector itself | full suite mandatory |
| Unknown/unclassified file | full suite mandatory |

### V4b — Proof-Cone Shadow Validation

Sealed result: the selector runs in shadow mode against a substantial corpus
of actual historical Quest diffs — including existing red-on-revert proofs —
before any landing behavior changes. For each replayed diff it derives the
selected cone, and the decisive metric is **selection recall**: whenever the
full suite found (or would find, for reverted known fixes) a regression, at
least one regression-detecting test must be inside the selected cone. The
target is zero selection misses; a single miss is a selector defect that
blocks cutover, not merely a test failure. Post-cutover, any push/nightly
full-suite failure is fed back through the same question and treated as a
selector bug when the answer is no.

Proof: replay report binding diff SHAs to selection receipts and outcomes;
synthetic mutation/revert cases where a selected test turns red; stale-input
and unknown-path widening cases.

### V4c — Selective Quest-Landing Cutover

Sealed result: Solver terminal landing and approval consume the proof cone
plus the universal safety floor instead of the whole sharded test universe
for eligible change classes, while the full suite changes role rather than
disappearing: push/main runs it sharded, nightly adds the distributed
expensive gates, release runs everything, and during initial confidence
building every Nth Quest landing additionally runs the full suite. Tier
self-protection holds: any change to the test runner, classifier, or selector
itself, and any unknown or unclassified path, forces the full suite. The
landing receipt records the full selection rationale, making Quest proof
*more* auditable than "we ran everything" because it states why each selected
proof was relevant.

Proof: three consecutive landed Quests with tier-correct selections and full
receipts; forced-full-suite cases for selector self-change and unknown paths;
Nth-landing full-suite sampler receipt.

### M1 — Global Owner-Debt Inventory

Sealed result: a reproducible inventory joins cognitive complexity, file size,
duplication, import edges, owner maps, and lint exclusions; it ranks semantic
owner boundaries and emits bounded migration candidates without moving source
files or inventing runtime owners.

Proof: generated inventory reconciles exactly to each underlying checker and
assigns every violation once; independent architecture review approves the
top candidates.

### M2 — Control-Plane and Rebalancer Burndown

Sealed result: bounded owner-scoped Quests reduce control-plane/rebalancer
complexity, oversized files, and duplicate decisions without increasing any
global ratchet, adding forwarding-only modules, or changing canonical outcomes.

Initial order: the highest-complexity functions from the M1 inventory, one
owner boundary per Quest. Each Quest must have decision-table or trace parity,
focused tests, scoped strict metrics, and a lower committed global baseline.

### M3 — Query and Bootstrap Burndown

Sealed result: the same one-owner-at-a-time reduction is completed for query and
bootstrap, preserving deadline, transaction, readiness, and lifecycle owners.

### M4a/M4b/M4c — Structural Blind-Spot Retirement

M4a removes blanket ESLint ignores for ordinal test files behind an explicit
per-file debt ledger that cannot hide a new file. M4b wires file-size and
architecture-slice checks into the canonical static gate. M4c is a generated
series of one-boundary test refactors that decreases oversized-file and
duplicate-line baselines. These concerns do not share one Quest.

### A1 — Fresh Historical Artifact Census

Sealed result: a fresh census classifies every tracked Solver payload, log,
report, descriptor, object, archive, and unreferenced artifact; reconciles file
and byte totals; distinguishes required audit evidence from derived projections;
and emits a migration/retention decision for every historical class.

### A2a/A2b — Historical Payload Migration

A2a introduces a versioned migration receipt bound to the exact A1 census SHA
and batch inventory; it never repurposes or edits W12's W11-bound receipt. A2b
is a generated series of scope-bounded batches. Each batch atomically rewrites
only census-approved historical inline payloads to verified content-addressed
descriptors, preserving logical SHA-256 and readability while tampering,
missing objects, partial receipts, and replay fail closed.

### A3a/A3b — Retention and Legacy Projection Cleanup

A3a applies bounded working-tree/release-clone retention only to derived,
reproducible reports and logs; durable Quest definitions/events and unique
evidence remain. A3b migrates or labels one legacy projection schema per child
Quest so terminal status cannot appear beside actionable continuation.

This program does **not** promise Git-pack reduction from ordinary commits:
historical blobs remain reachable. Rewriting published history or moving unique
evidence to an external archive would require a separate user-authorized plan
that names the archival authority, cryptographic manifest, rollback, and clone
cutover. It is outside these Quests.

### U0 — Consume the Existing DevOps Onboarding Epic

Compose, the executable tutorial, cluster/service CLI journey, Helm, and the
fresh-clone path remain sealed by `lagrange-devops-onboarding`. This program
records that epic's terminal evidence as a dependency for R1-R3; it authors no
duplicate deployment Quest. P1 may proceed independently after M2/M3.

### P1 — Explicit Supported Package API

Sealed result: the root package exports an explicit documented support surface,
has an export-contract snapshot, generated declarations or checked JSDoc, a
package file allowlist, and a pack/install smoke test. Internal names no longer
become public merely because a domain index exports them.

### R1 — Failover and Durability SLO Contracts

Sealed result: failover and durability SLOs are defined with machine-readable
metrics, the rolling-restart statistical trend remains non-flaky, and release
notes distinguish safety, eventual convergence, and bounded-time objectives.

### R2a/R2b — PostgreSQL Authentication and TLS

R2a makes externally reachable PostgreSQL require a real authenticated mode.
R2b adds the declared TLS policy after authentication has one owner.
Unsupported combinations fail closed; loopback trust remains explicit and
cannot be promoted to external exposure. Authentication and transport security
are separate Quests.

### R3 — Restore Drill

Sealed result: a versioned backup/snapshot can restore into a clean cluster and
prove schema, committed data, partition ownership, and service metadata against
an executable oracle. Paid automation scope does not remove the core recovery
proof requirement.

### Q1a/Q1b — Coverage and Mutation Signal

Q1a makes scoped/diff coverage fail closed for changed owner code. Q1b adds a
scheduled mutation lane for critical pure reducers and safety guards without
putting the entire large mutation fleet on every push. They are separate
Quests.

### Q2 — Dependency and Release Supply Chain

Sealed result: production dependency audit is a blocking gate, development
findings have an owned update/exception record, release actions and downloaded
tools have integrity pins, and release artifacts include an SBOM plus signatures
or attestations in addition to checksums.

## Program Metrics

The overview report must track:

- smoke and fast lane p50/p95/max wall time and classified test counts;
- proof-cone selected/total test counts by change class, selection recall
  (full-suite failures whose regression-detecting tests were inside the
  selected cone — target zero misses), and selector-input freshness;
- duration-policy violations and unclassified tests;
- cognitive violations by owner, oversized source/test counts, duplicate lines,
  and lint-excluded lines;
- tracked Solver payload count/bytes, unique logical bytes, object bytes,
  working-tree/release-clone bytes, and the explicitly non-goal Git pack size;
- explicit public export count and typed-export coverage;
- tutorial clean-run result, failover/durability SLO evidence, restore result;
- production and development dependency findings.

No work package may claim improvement by moving files out of a scanner, raising
a threshold, reclassifying a slow unit without integration semantics, deleting
unique proof, or narrowing CI coverage without an explicit replacement lane.

## First Implementation

Begin with V1. It is additive, reuses the existing versioned fail-closed
acceptance-manifest owner, produces immediate developer value, and establishes
the measurement surface needed by V2 and V3. In parallel, A1 may refresh the
artifact census and M1 may generate the global owner-debt inventory after V1 is
terminal or in a separate worktree.

The first V1 attempt crossed the six-owner admission bound because its command
surface and executable proof were one change artifact. V1 is therefore landed
as the bounded V1a command-surface child followed by the V1b executable proof;
the sealed behavior and dependency order are unchanged.

## Plan Verification Record

Revision 1 was rejected by `/root/plan_verification`: it overlooked the existing
acceptance-manifest owner, duplicated the active DevOps onboarding epic, lacked
executable Quest contracts, and promised Git-pack reduction without a history
rewrite/archive authority.

Revision 2 reuses the acceptance executor, delegates deployment work to its
existing epic, adds exact Quest/probe/pathscope/attack contracts and child-Quest
generation rules, binds historical migration to a new A1-specific receipt, and
removes Git-pack shrinkage from ordinary retention scope.

Revision 2 is approved by `/root/plan_verification`. The final review confirmed
literal 2s/30s body-time enforcement, total-diff A2b path/byte bounds, explicit
R2a-to-R2b sequencing, independent P1 sequencing, single acceptance-manifest
ownership, delegated DevOps ownership, and census-bound artifact migration.
V1 implementation may begin.
