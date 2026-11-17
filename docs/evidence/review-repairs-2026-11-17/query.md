---
audience: evidence
recorded: 2026-11-17
---

# Query scalar and budget repairs

## Assignment and instruction binding

Author: `core_args_data`. Integration and managed-lab owner: the current root
session. Base: `4b0c8ec1de59e9a074afa97ce260afb2868685c5`. Branch:
`work/review-query-fixes-20261117`. Governing rule-set revision: 5.

Loaded owners: `AGENTS.md`, `docs/steering/rules.md`, `router.md`,
`workflow-guidelines/solver-quests.md`, `architecture/query-runtime.md`,
`architecture/runtime-contracts.md`, `architecture/contracts/authority-and-recovery.md`,
`docs/development/code-style.md`, testing fixture/regression/proof-ladder guidance,
and the owner-interaction and harness-fidelity verification templates.

Root approved two bounded direct repairs under unchanged contracts. This record
precedes implementation. No source change, passing proof, review approval,
landing, publication or comparative-measurement result is asserted here.

## Writable paths

Scalar unit:

- `src/query/distributed/partial-aggregate-combiner.js`
- `src/query/query-executor-select-aggregation.js`
- `src/query/sql-scalar-functions.js` (shared stateless scalar operations)
- `src/query/distributed/distributed-select-fanout-plan.js`, only if binding the
  existing admission vocabulary to the shared implementation requires it
- `test/query/distributed-select-global-merge-correctness.test.js`
- `test/query/sql-scalar-functions.test.js`, if a focused native oracle is needed
  to cover the shared operations without duplicating a query fixture

Budget and proof-fixture unit:

- `src/query/sql-request.js`
- `src/wasm-service/query-budget-constants.js`
- `test/query/sql-request.test.js`
- `test/wasm-service/query-budget-constants.test.js`
- `test/query/execute-request.test.js`

This component record is writable. Root owns amendments to
`architecture/query-runtime.md`, `test/shards/impact-contracts.json`, generated
manifests and the integration record; proposed amendments will be sent separately.

## Scalar hypothesis, path and acceptance

The new JavaScript implementations of ROUND, SUBSTR/SUBSTRING and LENGTH diverge
from native SQLite after correct partial aggregate rows arrive. The fanout plan
admits those functions, and the SELECT partial combiner and HAVING evaluator
contain separate implementations. Correcting shared stateless operations at both
consumers should preserve the existing supported path and binding repairs.

Acceptance: the unchanged six-case native oracle witness agrees with SQLite;
the repaired functions also agree through the HAVING consumer and a nonempty
multiple-partition aggregate; Unicode, NULL and relevant argument boundaries
are covered by the native oracle; prior JOIN/root/array HAVING controls remain
valid. The query fixture must execute actual delivered SQL and parameters. The
oracle is native SQLite, not a second JavaScript expected-value implementation.

The historical `distributed-select-global-merge-correctness` Quest records earlier
nested-expression, operator and integer-division defects and same-SQL SQLite
oracle verification. Its terminal record and limitations are not rewritten.

## Budget hypothesis, path and acceptance

`createSqlRequest` merges defaults before normalization. The normalizer guesses
which uppercase fields were implicit from their values and the bag's shape,
so an explicitly supplied default-valued limit can lose to a contradictory
camelCase value. Normalize raw overrides before merging defaults and remove
the provenance guess. Preserve both supported key spellings and idempotent
validation at direct constructor and public request boundaries.

Acceptance: explicit conflicts reject, including default-valued fields;
uppercase-only, camel-only, equal aliases, omitted fields and a complete
camelCase override bag remain valid. The frozen three-case public STAGE witness
must reject the target before delivery/handler invocation. The fixture must use
the actual message fields and bounded SQLite collector. Output limits are
exercised by expanding one admitted input into two outputs, while an independent
case shows oversized input is refused. Original row/output-byte witnesses remain
valid. The budget claim concerns conflict admission and effective limit selection,
not an observed resource overrun or a bypass of PG's earlier raw validation.

## Original immutable evidence

- Candidate native job 4896: three scalar mismatches with valid controls;
  native log SHA256
  `6be3105739b5f7fb3fbe0005ac550e3cd87457a3765d87db9e71368bd9f96e6f`.
- Baseline job 4897 at `540418614772acc8c5c82be8d8cf6b0ecbe32ef3`:
  unchanged scalar witness, all six results agree; native log SHA256
  `3ca32a954e26a515f75128bcabcdd2f4c53eefbbb2fa85dceadf1c579cf82b7e`.
- Candidate native job 4899: explicit budget conflict admitted through public
  STAGE with both controls passing; native log SHA256
  `5c39a7ad5c2dcbc612f5d91c11365b0839765608f55c2bffd3dc7fe05888c831`.
- Frozen scalar witness SHA256:
  `a16611b93d912c0ebbb11913887bcfc121c6f4c77e22435a8c94da49ea49ad78`.
- Frozen budget-provenance witness SHA256:
  `18292cdb8ec5ae262dfd8fd759f374a91fa51a6e6f54e2cba825edaef7034fa5`.

Root retains original workers, native logs and diagnostic records. Earlier
evidence is not overwritten by repair runs. Native parser/planner/executor and
public STAGE fixtures do not establish physical-cluster or GCP readiness.

## First implementation attempt: native job 4911

The first frozen draft was local commit
`50c7fa25631aed8c859d6bb840b9e670b093377b`, tree
`55c941c27f82c06be0edbd033283b5b725ed7a1d`, staged as remote candidate
`aa552dae30d7aed5deb53b962b42d8b9f8ee6253`. Managed job 4911 ran on tv-dator
with Node 22.23.2. Root collected the complete 92,169-byte original native log;
SHA256 `1eea631bf3b0b25c3913f40fcafabfd8ff625ff4b987a851f4d0731ae8617bb0`.

The classified runner admitted all five selected files. SqlRequest (239 reported
assertions), budget normalization (26), and execute-request (170) passed. All
27 ROUND oracle cases passed. The scalar suite had one genuine failure:
SUBSTR of an empty input BLOB returned an empty Buffer while native SQLite
returned NULL. The revised draft preserves that input case and adds nonempty
BLOB inputs yielding empty slices, which must remain zero-byte BLOBs.

The global-merge suite had two genuine failures, the one- and two-partition
ORDER BY dept oracle cases. The scalar values agreed; native SQLite ordered
`abc` before the supplementary Unicode label, while the coordinator reversed
them. The exact ordered assertions remain unchanged. The comparison owner is
being reviewed separately; no sorted-test normalization or weaker assertion
is admitted as a repair.

Scoped ESLint, file-size, literal, decision-boundary and silent-catch checks
passed. The ambient-intrinsic command inspected zero applicable files and does
not supply a coverage claim for these changes.

The two original frozen replay scripts failed during module import because the
orchestrator placed them outside their documented `test/query` overlay location.
Their `ERR_MODULE_NOT_FOUND` results are orchestration failures, not product
observations or successful regressions. Root will replay the same bytes at the
documented location, retaining the first failures.

Independent source review also identified a draft conversion regression:
HAVING comparisons produce JS booleans, so treating `true` as numeric text
incorrectly produced zero. The revised draft preserves SQL truth values as
integer 1/0, with grouped production-expression tests, a CASE-to-integer
control, and TRUE/FALSE literal arguments. A signed-int64 text SUBSTR boundary
is recorded as an additional native-oracle hypothesis; no correction of that
hypothesis is claimed before its native observation.

## Producer-bound follow-up: native job 4915

The frozen producer diagnostic ran against the first draft candidate
`aa552dae30d7aed5deb53b962b42d8b9f8ee6253` with native SQLite 3.49.2.
Root retained the complete 20,874-byte native log, SHA256
`37ac3d1a0fa7c2b43a28711e9cb839d657bf2d53bf89cdb353564c2ee2932ccb`.
The actual parser/planner/executor and both populated partition SQL paths
engaged; all numeric controls agreed with SQLite.

Four boolean producer cases disagreed: HAVING ROUND of a comparison dropped
the valid positive group; TRUE precision rounded at zero decimal places;
TRUE substring start became position zero; TRUE substring length became zero.
The diagnostic observed the real boolean comparison values and parsed TRUE
literals. These measurements confirm the previously recorded draft regression.

The signed-int64 text-bound hypothesis also reproduced through the production
SELECT path and the direct helper. For input `abc`, start
`-9223372036854775808` and length `9223372036854775807`, SQLite returned `ab`
and the draft returned an empty string. This observation is recorded before
the corresponding repair. The bounded repair will preserve exact signed64
integer conversion and range arithmetic until the range is clamped to the
actual text/BLOB extent. It will add adjacent exact-bound and saturation
controls to the existing native oracle; it changes no wire or storage-class
representation and no scalar admission domain.
Text conversion compares the significant decimal magnitude with the signed64
bound before parsing BigInt, so oversized text never requires parsing an
unbounded integer. Leading-zero and numeric-prefix behavior remains explicit.

## Exclusions and validation ownership

No new coordinator SQLite connection, SQL execution subsystem, alternate query
path, admission-domain restriction, numeric budget-default change, new runtime
mode, or CASE/CAST redesign is authorized by these units. Unrelated lookup and
broadcast budget gaps remain recorded outside this repair. Changes needing a
different owner contract or admitted domain require a recorded scope decision
before implementation expands.

The existing partial-row boundary does not retain SQLite INTEGER versus REAL
storage-class metadata for JavaScript numbers. This repair does not claim full
numeric-to-text affinity parity from information that boundary has already lost.
Its text/represented-BLOB LENGTH and SUBSTR witnesses and numeric ROUND witnesses
are explicit about that ceiling. CASE/CAST coercion and a storage-class-carrying
expression model remain outside these unchanged-contract corrections.

All project execution, native tests, static checks and generated inventories run
on the managed lab under root coordination. Local work is source inspection,
edits and Git inspection only. Source and proof changes require independent
content-bound review before landing. Component acceptance remains separate from
the physical pre-gate and GCP comparison campaign.
