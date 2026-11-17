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
