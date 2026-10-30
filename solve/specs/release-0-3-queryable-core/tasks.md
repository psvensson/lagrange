# Tasks - Queryable Core completion in 0.3.2

Adopted 2026-10-30 for the [open epic](../../epics/release-0-3-queryable-core.md#current-summary).
Runtime baseline: `a43ce6a9fe3c2ffd17fcb084e596a0c709ba88c9` under rule-set 4;
adopted policy: revision 5. Seals/oracle remain unchanged. J0-J10/A1-E2 are
planning labels. [Journeys](user-journeys.md) own feature integration;
[testing policy](../../../test/guidelines/release-gate.md#major-feature-user-journeys)
owns proof, and inherited predicates remain with their owners.

## First actions

1. **Integration:** read epic/rules/router, `npm run commands` and tools index.
   Identify source/dependencies/artifact, policy and topology; use
   `npm run solve:board` and records, not an old ACTIVE heading.
2. **J1:** trace lockfile/runtime provenance through actual candidate artifacts
   and startup; separately exercise installed npm layout. Record the first
   failure. Release-labeled source fixtures do not prove installed usability.
3. **J7:** establish genuine admission/public setup before measurement; retain
   system-table-write refusal. Use graduated specs/current proof through an
   active bounded Quest or `class: fix`; the superseded epic grants no authority.
4. **J2-J6:** define successful journeys and measured red witnesses; consume
   seals/findings, reconcile C1 and preserve fail-fast locking.
5. **Integration/release:** assign one interaction writer and actual continuation
   owner/action. Classify product, fixture, verifier and unavailable execution.
   Bounded repairs may close while wider journeys/other packages stay open.

Execution stays in attempts/harnesses, never probes. Record narrow scope changes
before editing outside current authority; no blanket cache/steering allowance.

## Package ownership and pickup

This is the single package index; linked owners retain detailed predicates.

| Package | Version | Owner/pickup |
| --- | --- | --- |
| J0 rule/scope | 0.3.1 | Testing/steering/capability/roadmap owners; truthful claims and generated projections, no blanket historical gate. |
| J1 installed product | Selected 0.3.1 | [Stabilization](../release-0-2-7-stabilization/requirements.md#j1-installed-consumer-journey), Q05-Q07/Q12-Q13/Q15-Q17. |
| J2 SQL/key/read | 0.3.2; bounded repairs 0.3.1 | [Journey](user-journeys.md#j2-sql-keys-and-read-semantics); SQL/key/TX1 consume Q01-Q03/Q14. |
| J3 local/compound index | 0.3.2 | [Journey](user-journeys.md#j3-local-and-compound-indexes); IndexService/planner/partition lifecycle. |
| J4 locking | 0.3.2 | [Journey](user-journeys.md#j4-locking-reads); SQL/TX1 reservation and release. |
| J5 nonunique GSI | 0.3.2 | [Journey](user-journeys.md#j5-synchronous-nonunique-global-indexes); index/planner/partition/TX1 and C1. |
| J6 live results | 0.3.2 | [Journey](user-journeys.md#j6-live-query-results); SQL/CDC/topology/subscription. |
| J7 Scenario A | 0.3.2 core regression; 0.4 comparison | [Consumption](user-journeys.md#j7-scenario-a-consumption); graduated specs/proof retain 33 IDs, profiles, runner and qualification. |
| J8 operations | 0.3.2 core; 0.5 pilot | [Stabilization](../release-0-2-7-stabilization/requirements.md#j8-retained-history-and-recovery-journey), Q04/Q08-Q11/Q14-Q15/Q18. |
| J9 public WASI | 0.3.2 bounded; 0.4 expansion | [Consumption](user-journeys.md#j9-bounded-public-wasi-service); compiler/deployment/call owners and Q17. |
| J10 release | 0.3.1 correction; 0.3.2 full | [Stabilization](../release-0-2-7-stabilization/requirements.md#j10-integrated-candidate-and-publication), Q16/Q17 and certification. |

## Dependencies

Start J0/J1 and J7 cause-finding while J2-J6 is scoped. J2 feeds J3-J6; J3 feeds
GSI lifecycle/planning; J4/J5 share TX1. J6 coordinates producers with J2/J7 and
acknowledgement/retention/cancellation/slow-consumer obligations with J8. J8/J9
advance on unaffected installed/runtime contracts; J1 does not inherit full
J9/Q17. J10 joins applicable evidence. Initial retained-history correctness stays
0.3.2 rather than moving to pilot qualification.

Independent 0.4/0.5 work retains its version home. One writer per changing
interaction, ordered integration and one release train replace serial
implementation fences. Review/test/lab waiting is unfinished work; 0.4 expansion/
comparison does not gate 0.3.2's bounded slice.

## Existing task crosswalk

Preserve the [key Quest](../../quests/partition-key-ordering-owner-completion/quest.json)
and seal. A1's v12 is a planning label, not a new directory. A1-A4 components
landed in 0.3.0; assess remaining defects/composed proof on the actual candidate.
The journeys retain detailed behavior; this crosswalk preserves all identities.

| Existing label and planned unit | Pickup |
| --- | --- |
| A1 `partition-key-ordering-owner-completion-v12` | J2 |
| A2 `partition-key-boundary-representation` | J2 |
| A3 `declared-primary-key-resolution` | J2 |
| A4 `compound-primary-key-narrowing` | J2 |
| A5 `local-index-ddl-owner-wiring` | J3 |
| A6 `compound-index-planner-contract` | J3 |
| B1 `locking-read-wait-policy-seal` | J4 |
| B2 `locking-read-canonical-ast` | J4 |
| B3 `locking-read-participant-reservation` | J4 |
| B4 `locking-read-release-timeout-recovery` | J4 |
| B5 `locking-read-public-pg-proof` | J4 |
| C1 `global-index-maintenance-mode-seal` | C1 below / J5 |
| C2 `global-index-dataset-lifecycle` | C1 below / J5 |
| C3 `global-index-resumable-backfill` | C1 below / J5 |
| C4 `global-index-maintenance` | C1 below / J5 |
| C5 `global-index-routing-and-explain` | C1 below / J5 |
| D0 `generic-live-query-roadmap-authority` | Registration credited / J6 |
| D1 `live-query-canonical-plan-dependencies` | J6 |
| D2 `live-query-selective-partition-cdc` | J6 |
| D3 `live-query-gap-free-snapshot-frontier` | J6 |
| D4 `live-query-result-maintenance` | J6 |
| D5 `live-query-lifecycle-topology-recovery` | J6 |
| D6 `live-query-core-api-antipolling` | J6 |
| E1 `release-0-3-acceptance-matrix` | J10 / certification |
| E2 `release-0-3-exact-head-candidate` | J10 / certification |

### C1 — planned `global-index-maintenance-mode-seal` — DESIGN MAY START EARLY

This retained anchor is not a serial gate. Reconcile/seal or supersede
[R2](../global-secondary-indexes/requirements.md#r2--maintenance-consistency-decision-sealed-before-implementation)
using its [research](global-index-maintenance-research.md) before further
implementation. Adopted direction: synchronous nonunique TX1 maintenance.
Resolve participation, read visibility/completeness and measured write cost;
no second mode or repeated resolved research. Global uniqueness stays 1.0.

## Evidence pickup and completion

[Preimplementation research](preimplementation-research.md) and [boundary reconnaissance](../../epics/release-0-3-queryable-core/a2-boundary-representation-reconnaissance-2026-10-07.md)
remain source-specific preparation. Current owners, [journey evidence](user-journeys.md#evidence-and-completion),
original records and proof-selection rules govern acceptance. Only certification
updates the oracle; selected 0.3.1 corrections leave wider axes open. Follow the
epic's [completion/review horizons](../../epics/release-0-3-queryable-core.md#completion-and-next-review).
